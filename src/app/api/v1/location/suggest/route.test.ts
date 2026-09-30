// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeAuth } from "@/lib/auth";
import { photonFixture, suggestionFixture, suggestionQuery } from "../../../../../../tests/fixtures/address-suggestions";

vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));
vi.mock("server-only", () => ({}));

const appOrigin = "https://votegpt.example.test";
const getSession = vi.fn();
const providerFetch = vi.fn<typeof fetch>();
let POST: typeof import("./route").POST;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T15:00:00Z"));
  vi.stubEnv("BETTER_AUTH_URL", appOrigin);
  vi.stubEnv("PHOTON_BASE_URL", "https://photon.example.test");
  getSession.mockResolvedValue({ user: { id: "user_suggestion_fixture" } });
  vi.mocked(getRuntimeAuth).mockResolvedValue({ api: { getSession } } as never);
  providerFetch.mockImplementation(async () => Response.json(photonFixture));
  vi.stubGlobal("fetch", providerFetch);
  for (const method of ["debug", "error", "info", "log", "warn"] as const) vi.spyOn(console, method).mockImplementation(() => undefined);
  ({ POST } = await import("./route"));
});

afterEach(() => {
  for (const method of ["debug", "error", "info", "log", "warn"] as const) expect(console[method]).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/v1/location/suggest", () => {
  it("blocks missing or foreign origins before session or provider work", async () => {
    for (const origin of [null, "null", "https://attacker.example", `${appOrigin}.attacker.example`]) {
      await expectStatus(await POST(request(validBody(), { origin })), 403, "forbidden");
    }
    vi.stubEnv("BETTER_AUTH_URL", "");
    await expectStatus(await POST(request(validBody())), 403, "forbidden");
    expect(getSession).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("requires explicit per-request consent before session or provider work", async () => {
    for (const consent of [undefined, false, null, "true", 1]) {
      await expectStatus(await POST(request({ query: suggestionQuery, consent })), 403, "forbidden");
    }
    expect(getSession).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("requires exact JSON shape, content type, and a bounded 4–300 character query", async () => {
    for (const body of [null, [], "address", {}, { consent: true }, { query: 1000, consent: true }, { ...validBody(), extra: true }, { ...validBody(), query: "abc" }, { ...validBody(), query: "    " }, { ...validBody(), query: "x".repeat(301) }, { ...validBody(), query: "101\nStreet" }, { ...validBody(), query: "101\u202eStreet" }]) {
      await expectStatus(await POST(request(body)), 400, "invalid_request");
    }
    for (const contentType of [null, "text/plain"]) {
      await expectStatus(await POST(request(validBody(), { contentType })), 400, "invalid_request");
    }
    await expectStatus(await POST(request("{", { raw: true })), 400, "invalid_request");
    await expectStatus(await POST(request(JSON.stringify(validBody()) + " ".repeat(2048), { raw: true })), 400, "invalid_request");
    expect(getSession).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("requires a fresh valid session for every request and forwards no cookies to Photon", async () => {
    for (const session of [null, {}, { user: {} }, { user: { id: "" } }, { user: { id: 1 } }]) {
      getSession.mockResolvedValueOnce(session);
      await expectStatus(await POST(request(validBody())), 401, "unauthenticated");
    }
    expect(providerFetch).not.toHaveBeenCalled();
    const first = request(validBody());
    const response = await POST(first);
    await expectStatus(response, 200, "ok", suggestionFixture);
    expect(getSession).toHaveBeenLastCalledWith({ headers: first.headers });
    await expectStatus(await POST(request(validBody())), 200, "ok", suggestionFixture);
    expect(getSession).toHaveBeenCalledTimes(7);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(providerFetch.mock.calls[0][1]?.headers).toEqual({ Accept: "application/json" });
  });

  it("fails privately when auth, configuration, or the provider is unavailable", async () => {
    getSession.mockRejectedValueOnce(new Error(`PRIVATE ${suggestionQuery}`));
    await expectStatus(await POST(request(validBody())), 503, "unavailable");
    vi.stubEnv("PHOTON_BASE_URL", "");
    await expectStatus(await POST(request(validBody())), 503, "unavailable");
    expect(providerFetch).not.toHaveBeenCalled();
    vi.stubEnv("PHOTON_BASE_URL", "https://photon.example.test");
    providerFetch.mockRejectedValueOnce(new Error(`PRIVATE ${suggestionQuery}`));
    await expectStatus(await POST(request(validBody())), 503, "unavailable");
  });

  it("allows valid boundary-length queries and returns empty results normally", async () => {
    providerFetch.mockImplementation(async () => Response.json({ features: [] }));
    for (const query of ["1234", "x".repeat(300)]) {
      await expectStatus(await POST(request({ query, consent: true })), 200, "ok", { status: "ok", suggestions: [] });
    }
  });

  it("limits a user to 30 requests a minute without provider work for throttled calls", async () => {
    for (let index = 0; index < 30; index += 1) {
      expect((await POST(request(validBody()))).status).toBe(200);
    }
    const limited = await POST(request(validBody()));
    await expectStatus(limited, 429, "rate_limited");
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(providerFetch).toHaveBeenCalledTimes(30);
    getSession.mockResolvedValueOnce({ user: { id: "another_user" } });
    expect((await POST(request(validBody()))).status).toBe(200);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await POST(request(validBody()))).status).toBe(200);
  });

  it("bounds rate-limit memory and fails closed while the active-user table is full", async () => {
    for (let index = 0; index < 1000; index += 1) {
      getSession.mockResolvedValueOnce({ user: { id: `fixture_user_${index}` } });
      expect((await POST(request(validBody()))).status).toBe(200);
    }
    getSession.mockResolvedValueOnce({ user: { id: "overflow_user" } });
    await expectStatus(await POST(request(validBody())), 429, "rate_limited");
    expect(providerFetch).toHaveBeenCalledTimes(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await POST(request(validBody()))).status).toBe(200);
  });

  it("propagates a cancelled client request without leaking private failure details", async () => {
    providerFetch.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = POST(request(validBody(), { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expectStatus(await pending, 503, "unavailable");
    expect(providerFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

function validBody() { return { query: suggestionQuery, consent: true }; }

function request(body: unknown, options: { origin?: string | null; contentType?: string | null; raw?: boolean; signal?: AbortSignal } = {}) {
  const headers = new Headers({ cookie: "session=PRIVATE_SESSION" });
  const origin = options.origin === undefined ? appOrigin : options.origin;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (origin !== null) headers.set("origin", origin);
  if (contentType !== null) headers.set("content-type", contentType);
  return new Request(`${appOrigin}/api/v1/location/suggest`, { method: "POST", headers, body: options.raw ? String(body) : JSON.stringify(body), signal: options.signal });
}

async function expectStatus(response: Response, status: number, kind: string, body?: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const actual = await response.json();
  expect(actual.status).toBe(kind);
  if (body !== undefined) expect(actual).toEqual(body);
  if (kind !== "ok") expect(typeof actual.message).toBe("string");
  for (const privateValue of [suggestionQuery, "PRIVATE", "photon.example.test", "coordinates"]) expect(JSON.stringify(actual)).not.toContain(privateValue);
}
