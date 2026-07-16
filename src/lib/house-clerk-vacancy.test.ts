import { readFileSync } from "node:fs";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { fetchCurrentHouseVacancies } from "./house-clerk-vacancy";
import type {
  FetchCurrentHouseVacancies,
  HouseVacancyOutcome,
} from "./federal-officials";

// RED: Clerk adapter is absent. UX-01/02/03/04/06/07/09 require deterministic
// current-seat evidence, equal treatment, no location input, and fail-closed states.

const fixture = readFileSync(
  "tests/fixtures/clerk-current-vacancies.html",
  "utf8",
);
const now = new Date("2026-07-16T12:00:00.000Z");
const listUrl = "https://clerk.house.gov/Members/ViewVacancies";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("House Clerk current-vacancy adapter", () => {
  it("fetches only the fixed current-list endpoint and returns canonical evidence", async () => {
    expectTypeOf(fetchCurrentHouseVacancies).toMatchTypeOf<FetchCurrentHouseVacancies>();
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () =>
      htmlResponse(fixture),
    );

    const available = expectAvailable(await lookup(providerFetch));

    expect(providerFetch).toHaveBeenCalledOnce();
    const [input, init] = providerFetch.mock.calls[0];
    const requestUrl = new URL(toUrl(input));
    expect(requestUrl.origin).toBe("https://clerk.house.gov");
    expect(requestUrl.pathname).toBe("/Members/ViewVacancies");
    expect(requestUrl.search).toBe("");
    expect(requestUrl.hash).toBe("");
    expect(requestUrl.username).toBe("");
    expect(requestUrl.password).toBe("");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(new Headers(init?.headers).get("Accept")).toBe("text/html");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.body).toBeUndefined();

    expect(available).toEqual({
      status: "available",
      currentCongress: 119,
      source: vacancySource(listUrl),
      vacancies: [
        {
          stateCode: "GA",
          district: 13,
          source: vacancySource(
            "https://clerk.house.gov/members/GA13/vacancy",
          ),
        },
      ],
    });
    expect(JSON.stringify(providerFetch.mock.calls)).not.toMatch(
      /address|latitude|longitude/i,
    );
  });

  it("treats filled entries as non-vacant and keeps list evidence when active list is empty", async () => {
    const noActiveLink = fixture.replace(
      '<a href="/members/GA13/vacancy">Current vacancy</a>',
      "No active vacancy link",
    );

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(noActiveLink))),
    );

    expect(available.vacancies).toEqual([]);
    expect(available.source).toEqual(vacancySource(listUrl));
  });

  it("maps canonical district 00 to at-large district zero", async () => {
    const atLarge = fixture.replaceAll("GA13", "AK00");

    const available = expectAvailable(
      await lookup(vi.fn(async () => htmlResponse(atLarge))),
    );

    expect(available.vacancies).toEqual([
      {
        stateCode: "AK",
        district: 0,
        source: vacancySource(
          "https://clerk.house.gov/members/AK00/vacancy",
        ),
      },
    ]);
  });

  it.each([
    ["missing matching heading", fixture, 120],
    [
      "duplicate matching heading",
      fixture.replace(
        "<table>",
        "<h3>Vacancies of the 119th Congress</h3><table>",
      ),
      119,
    ],
    [
      "malformed ordinal heading",
      fixture.replace("119th Congress", "119st Congress"),
      119,
    ],
    [
      "malformed heading markup",
      fixture.replace(
        "<h2>Vacancies of the 119th Congress</h2>",
        "<h2>Vacancies of the 119th Congress",
      ),
      119,
    ],
  ] as const)("fails closed on %s", async (_label, html, currentCongress) => {
    await expect(
      fetchCurrentHouseVacancies(currentCongress, {
        fetch: vi.fn(async () => htmlResponse(html)),
        now: () => now,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [
      "duplicate seat link",
      fixture.replace(
        '<a href="/members/GA13/vacancy">Current vacancy</a>',
        '<a href="/members/GA13/vacancy">Current vacancy</a><a href="/members/GA13/vacancy">Duplicate</a>',
      ),
    ],
    ["unknown jurisdiction", fixture.replaceAll("GA13", "ZZ13")],
    [
      "cross-origin link",
      fixture.replace(
        'href="/members/GA13/vacancy"',
        'href="https://example.test/members/GA13/vacancy"',
      ),
    ],
    [
      "noncanonical link query",
      fixture.replace("/members/GA13/vacancy", "/members/GA13/vacancy?old=1"),
    ],
    [
      "noncanonical link case",
      fixture.replace("/members/GA13/vacancy", "/Members/GA13/Vacancy"),
    ],
    [
      "malformed anchor markup",
      fixture.replace("Current vacancy</a>", "Current vacancy"),
    ],
  ] as const)("fails the entire outcome on %s", async (_label, html) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse(html))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [302, "provider_error"],
    [401, "auth"],
    [404, "not_found"],
    [429, "quota"],
    [500, "provider_error"],
  ] as const)("maps HTTP %s to %s", async (status, reason) => {
    await expect(
      lookup(vi.fn(async () => htmlResponse("redirect or error", status))),
    ).resolves.toEqual({ status: "unavailable", reason });
  });

  it("fails closed on redirect exceptions and wrong content type", async () => {
    await expect(
      lookup(vi.fn(async () => Promise.reject(new TypeError("redirect blocked")))),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_error" });
    await expect(
      lookup(
        vi.fn(async () =>
          new Response(fixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("fails closed when the HTML body exceeds one MiB", async () => {
    const oversized = `${fixture}${" ".repeat(1024 * 1024)}`;

    await expect(
      lookup(vi.fn(async () => htmlResponse(oversized))),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("applies the five-second timeout through the whole response body", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(fixture.slice(0, 40)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const pending = lookup(providerFetch);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(providerFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    expect(cancelled).toBe(true);
  });
});

function lookup(providerFetch: typeof globalThis.fetch) {
  return fetchCurrentHouseVacancies(119, {
    fetch: providerFetch,
    now: () => now,
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function vacancySource(url: string) {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives" as const,
    sourceType: "vacancy" as const,
    url,
    retrievedAt: now.toISOString(),
    recordUpdatedAt: null,
    effectiveAt: null,
  };
}

function expectAvailable(
  outcome: HouseVacancyOutcome,
): Extract<HouseVacancyOutcome, { status: "available" }> {
  if (outcome.status !== "available") {
    throw new Error(`Expected available Clerk outcome, got ${outcome.reason}.`);
  }
  return outcome;
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}
