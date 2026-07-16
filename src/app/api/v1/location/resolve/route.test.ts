// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  censusCoordinatesResponse,
  censusEmptyAddressResponse,
  censusFixtureCoordinates,
} from "../../../../../../tests/fixtures/census-geocoder";
import {
  googleCivicEmptyFixture,
  googleCivicErrorFixtures,
  googleCivicMatchedFixture,
} from "../../../../../../tests/fixtures/google-civic";
import {
  ambiguousResidenceResponse,
  forbiddenResidenceResponse,
  invalidResidenceResponse,
  noMatchResidenceResponse,
  unauthenticatedResidenceResponse,
  unavailableResidenceResponse,
} from "../../../../../../tests/fixtures/residence-responses";
import { getRuntimeAuth } from "@/lib/auth";
import * as residenceModule from "@/lib/residence";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getRuntimeAuth: vi.fn() }));

const appOrigin = "http://localhost:3000";
const endpoint = `${appOrigin}/api/v1/location/resolve`;
const now = new Date("2026-07-14T20:00:00.000Z");
const secret = "route-secret-at-least-thirty-two-characters";
const userId = "user_route_fixture";
const getSession = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("BETTER_AUTH_URL", appOrigin);
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("GOOGLE_CIVIC_API_KEY", "fixture-google-civic-key");
  getSession.mockResolvedValue({
    session: { id: "session_route_fixture" },
    user: { email: "voter@example.test", id: userId },
  });
  vi.mocked(getRuntimeAuth).mockResolvedValue({
    api: { getSession },
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/v1/location/resolve", () => {
  it("rejects missing or foreign origins before auth or provider work", async () => {
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    for (const origin of [
      null,
      "null",
      "https://attacker.example",
      "http://localhost:3000.attacker.example",
    ]) {
      const response = await POST(
        resolveRequest({ kind: "address", address: "100 Main St" }, { origin }),
      );
      await expectPrivateJson(response, 403, forbiddenResidenceResponse);
    }

    expect(getRuntimeAuth).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("requires JSON, a fresh session, exact input, and server signing config", async () => {
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    for (const contentType of [null, "text/plain"]) {
      const response = await POST(
        resolveRequest(
          { kind: "address", address: "100 Main St" },
          { contentType },
        ),
      );
      await expectPrivateJson(response, 400, invalidResidenceResponse);
    }
    expect(getSession).not.toHaveBeenCalled();

    getSession.mockResolvedValueOnce(null);
    const anonymous = await POST(
      resolveRequest({ kind: "address", address: "100 Main St" }),
    );
    await expectPrivateJson(anonymous, 401, unauthenticatedResidenceResponse);

    const invalidJson = await POST(resolveRequest("{", { raw: true }));
    await expectPrivateJson(invalidJson, 400, invalidResidenceResponse);
    const extraKey = await POST(
      resolveRequest({
        kind: "address",
        address: "100 Main St",
        extra: true,
      }),
    );
    await expectPrivateJson(extraKey, 400, invalidResidenceResponse);

    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const missingSecret = await POST(
      resolveRequest({ kind: "address", address: "100 Main St" }),
    );
    await expectPrivateJson(missingSecret, 503, unavailableResidenceResponse);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns a signed Google match without reflecting precise input", async () => {
    const privateAddress =
      "742 SENTINEL ROUTE ADDRESS, Example City, CA 90000";
    const providerFetch = sequencedFetch([
      { body: googleCivicMatchedFixture },
      { body: googleCivicMatchedFixture },
    ]);
    vi.stubGlobal("fetch", providerFetch);

    const firstRequest = resolveRequest(
      { kind: "address", address: privateAddress },
      { contentType: "application/json; charset=utf-8" },
    );
    const response = await POST(firstRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      status: "matched",
      source: {
        checkedAt: now.toISOString(),
        effectiveAt: null,
        name: "Google Civic Information API",
        url: "https://developers.google.com/civic-information",
      },
      expiresAt: "2026-07-14T20:10:00.000Z",
    });
    expect(typeof body.resolutionToken).toBe("string");
    const resolution = residenceModule.verifyResolutionToken(
      String(body.resolutionToken),
      userId,
      secret,
      now,
    );
    expect(resolution).toEqual({
      status: body.status,
      divisions: body.divisions,
      source: body.source,
      coverageNotes: body.coverageNotes,
    });
    expect(decodedToken(String(body.resolutionToken))).toEqual({
      version: "v1",
      userId,
      issuedAt: now.toISOString(),
      expiresAt: "2026-07-14T20:10:00.000Z",
      resolution,
    });

    expect(providerFetch).toHaveBeenCalledTimes(1);
    const [providerInput, providerInit] = providerFetch.mock.calls[0];
    const providerUrl = new URL(toUrl(providerInput));
    expect(providerUrl.origin + providerUrl.pathname).toBe(
      "https://www.googleapis.com/civicinfo/v2/divisionsByAddress",
    );
    expect(providerUrl.searchParams.get("address")).toBe(privateAddress);
    expect(providerInit).toMatchObject({ cache: "no-store" });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledWith({ headers: firstRequest.headers });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(privateAddress);
    expect(serialized).not.toContain("SENTINEL GOOGLE NORMALIZED INPUT");
    expect(serialized).not.toContain("fixture-google-civic-key");
    expect(serialized).not.toContain(providerUrl.toString());

    const second = await POST(
      resolveRequest({ kind: "address", address: privateAddress }),
    );
    expect(second.status).toBe(200);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it("returns a signed partial coordinate result without reflecting GPS", async () => {
    const providerFetch = sequencedFetch([
      { body: censusCoordinatesResponse },
    ]);
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(
      resolveRequest({ kind: "coordinates", ...censusFixtureCoordinates }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "partial",
      source: {
        benchmark: "Public_AR_Current",
        checkedAt: now.toISOString(),
        effectiveAt: null,
        name: "U.S. Census Geocoder",
        url: "https://geocoding.geo.census.gov/geocoder/",
        vintage: "Current_Current",
      },
    });
    expect(
      residenceModule.verifyResolutionToken(
        String(body.resolutionToken),
        userId,
        secret,
        now,
      ),
    ).not.toBeNull();

    expect(providerFetch).toHaveBeenCalledOnce();
    const providerUrl = new URL(toUrl(providerFetch.mock.calls[0][0]));
    expect(providerUrl.origin + providerUrl.pathname).toBe(
      "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
    );
    expect(providerUrl.searchParams.get("x")).toBe(
      String(censusFixtureCoordinates.longitude),
    );
    expect(providerUrl.searchParams.get("y")).toBe(
      String(censusFixtureCoordinates.latitude),
    );
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(String(censusFixtureCoordinates.latitude));
    expect(serialized).not.toContain(String(censusFixtureCoordinates.longitude));
    expect(serialized).not.toContain(providerUrl.toString());
  });

  it("returns only the canonical signed result when a resolver object has extra fields", async () => {
    const privateAddress = "SENTINEL INJECTED ROUTE ADDRESS";
    const unsafeOutcome = {
      status: "matched",
      address: privateAddress,
      latitude: 12.345678,
      longitude: -98.765432,
      normalizedInput: "SENTINEL NORMALIZED INPUT",
      divisions: [
        {
          type: "county",
          name: "Safe Example County",
          id: "ocd-division/country:us/state:ex/county:safe",
          idScheme: "ocd",
          rawAddress: privateAddress,
        },
      ],
      source: {
        name: "Google Civic Information API",
        url: "https://developers.google.com/civic-information",
        checkedAt: now.toISOString(),
        effectiveAt: null,
        requestUrl:
          "https://provider.invalid/lookup?address=SENTINEL%20INJECTED%20ROUTE%20ADDRESS",
      },
      coverageNotes: ["Local divisions may be unavailable."],
    } as unknown as Awaited<ReturnType<typeof residenceModule.resolveResidence>>;
    vi.spyOn(residenceModule, "resolveResidence").mockResolvedValue(unsafeOutcome);
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(
      resolveRequest({ kind: "address", address: privateAddress }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const serializedBody = JSON.stringify(body);
    const serializedToken = JSON.stringify(
      decodedToken(String(body.resolutionToken)),
    );

    expect(serializedBody).not.toMatch(
      /SENTINEL|12\.345678|-98\.765432|provider\.invalid|rawAddress|normalizedInput/,
    );
    expect(serializedToken).not.toMatch(
      /SENTINEL|12\.345678|-98\.765432|provider\.invalid|rawAddress|normalizedInput/,
    );
    expect(body).toMatchObject({
      status: "matched",
      divisions: [
        {
          type: "county",
          name: "Safe Example County",
          id: "ocd-division/country:us/state:ex/county:safe",
          idScheme: "ocd",
        },
      ],
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("fails closed when resolver provenance embeds precise input in its path", async () => {
    const privateAddress = "SENTINEL PATH ROUTE ADDRESS";
    vi.spyOn(residenceModule, "resolveResidence").mockResolvedValue({
      status: "matched",
      divisions: [
        {
          type: "county",
          name: "Safe Example County",
          id: "ocd-division/country:us/state:ex/county:safe",
          idScheme: "ocd",
        },
      ],
      source: {
        name: "Google Civic Information API",
        url: `https://developers.google.com/civic-information/${encodeURIComponent(privateAddress)}`,
        checkedAt: now.toISOString(),
        effectiveAt: null,
      },
      coverageNotes: ["Local divisions may be unavailable."],
    });
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(
      resolveRequest({ kind: "address", address: privateAddress }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual(unavailableResidenceResponse);
    expect(JSON.stringify(body)).not.toMatch(/SENTINEL|resolutionToken/);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      case: "canonical provider acronym address",
      input: { kind: "address" as const, address: "API" },
    },
    {
      case: "zero and timestamp-fragment coordinates",
      input: { kind: "coordinates" as const, latitude: 0, longitude: 20 },
    },
    {
      case: "division-ID-fragment coordinates",
      input: { kind: "coordinates" as const, latitude: 1, longitude: 2 },
    },
  ])("returns a signed safe $case preview", async ({ input }) => {
    vi.spyOn(residenceModule, "resolveResidence").mockResolvedValue({
      status: "matched",
      divisions: [
        {
          type: "congressional_district",
          name: "Example Congressional District 1",
          id: "ocd-division/country:us/state:ex/cd:1",
          idScheme: "ocd",
        },
      ],
      source: {
        name: "Google Civic Information API",
        url: "https://developers.google.com/civic-information",
        checkedAt: now.toISOString(),
        effectiveAt: null,
      },
      coverageNotes: ["Local divisions may be unavailable."],
    });
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(resolveRequest(input));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      case: "percent-encoded address",
      input: {
        kind: "address" as const,
        address: "742 Private Route Avenue, Example City, CA 90000",
      },
      leak:
        "742%20Private%20Route%20Avenue%2C%20Example%20City%2C%20CA%2090000",
    },
    {
      case: "form-encoded and case-varied address",
      input: {
        kind: "address" as const,
        address: "742 Private Route Avenue, Example City, CA 90000",
      },
      leak: "７４２+PRIVATE+ROUTE+AVENUE／EXAMPLE+CITY／CA+９００００",
    },
    {
      case: "encoded latitude",
      input: {
        kind: "coordinates" as const,
        latitude: 38.8977,
        longitude: -77.0365,
      },
      leak: "Latitude 38%2E8977",
    },
    {
      case: "Unicode-punctuated longitude",
      input: {
        kind: "coordinates" as const,
        latitude: 38.8977,
        longitude: -77.0365,
      },
      leak: "Longitude −77／0365",
    },
    {
      case: "malformed suffix after encoded address",
      input: {
        kind: "address" as const,
        address: "123 Main Street",
      },
      leak: "Resolved for 123%20Main%20Street%ZZ",
    },
    {
      case: "address nested beyond the decode limit",
      input: {
        kind: "address" as const,
        address: "123 Main Street",
      },
      leak: encodeNested("123 Main Street", 5),
    },
    {
      case: "default-ignorable separated address",
      input: {
        kind: "address" as const,
        address: "123 Main Street",
      },
      leak: "Resolved for 123\u200bMain\u200bStreet",
    },
    {
      case: "scientific-coordinate decimal equivalent",
      input: {
        kind: "coordinates" as const,
        latitude: 1e-7,
        longitude: 45,
      },
      leak: "Latitude 0.0000001",
    },
  ])("fails closed on $case in otherwise public facts", async ({ input, leak }) => {
    vi.spyOn(residenceModule, "resolveResidence").mockResolvedValue({
      status: "matched",
      divisions: [
        {
          type: "county",
          name: "Safe Example County",
          id: "ocd-division/country:us/state:ex/county:safe",
          idScheme: "ocd",
        },
      ],
      source: {
        name: "Google Civic Information API",
        url: "https://developers.google.com/civic-information",
        checkedAt: now.toISOString(),
        effectiveAt: null,
      },
      coverageNotes: [leak],
    });
    const providerFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(resolveRequest(input));

    await expectPrivateJson(response, 503, unavailableResidenceResponse);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("maps safe no-match, ambiguity, and final-unavailable responses without tokens", async () => {
    const cases = [
      {
        replies: [
          { body: googleCivicEmptyFixture },
          { body: censusEmptyAddressResponse },
        ],
        status: 200,
        expected: noMatchResidenceResponse,
      },
      {
        replies: [
          { body: googleCivicErrorFixtures.conflict, status: 409 },
          { body: censusEmptyAddressResponse },
        ],
        status: 200,
        expected: ambiguousResidenceResponse,
      },
      {
        replies: [
          { body: googleCivicErrorFixtures.backendError, status: 503 },
          { body: { error: "SENTINEL CENSUS PROVIDER PROSE" }, status: 503 },
        ],
        status: 503,
        expected: unavailableResidenceResponse,
      },
    ];

    for (const testCase of cases) {
      const providerFetch = sequencedFetch(testCase.replies);
      vi.stubGlobal("fetch", providerFetch);
      const response = await POST(
        resolveRequest({ kind: "address", address: "100 Fixture Street" }),
      );
      await expectPrivateJson(response, testCase.status, testCase.expected);
      expect(providerFetch).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(testCase.expected)).not.toContain("SENTINEL");
      expect(testCase.expected).not.toHaveProperty("resolutionToken");
    }
  });
});

type RequestOptions = {
  contentType?: string | null;
  origin?: string | null;
  raw?: boolean;
};

function resolveRequest(body: unknown, options: RequestOptions = {}) {
  const headers = new Headers({
    cookie: "better-auth.session_token=synthetic-session",
  });
  const contentType =
    options.contentType === undefined ? "application/json" : options.contentType;
  const origin = options.origin === undefined ? appOrigin : options.origin;
  if (contentType !== null) {
    headers.set("content-type", contentType);
  }
  if (origin !== null) {
    headers.set("origin", origin);
  }

  return new Request(endpoint, {
    body: options.raw ? String(body) : JSON.stringify(body),
    headers,
    method: "POST",
  });
}

type ProviderReply = { body: unknown; status?: number };

function sequencedFetch(replies: ProviderReply[]) {
  let index = 0;
  return vi.fn<typeof globalThis.fetch>(async () => {
    expect(getSession).toHaveBeenCalled();
    const reply = replies[index++];
    if (!reply) {
      throw new Error("Unexpected provider request in route test.");
    }
    return new Response(JSON.stringify(reply.body), {
      headers: { "content-type": "application/json" },
      status: reply.status ?? 200,
    });
  });
}

async function expectPrivateJson(
  response: Response,
  status: number,
  expected: unknown,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toEqual(expected);
}

function decodedToken(token: string) {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
}

function encodeNested(value: string, passes: number) {
  let encoded = value;
  for (let pass = 0; pass < passes; pass += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}
