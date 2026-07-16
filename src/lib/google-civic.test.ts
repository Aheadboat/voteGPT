import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import {
  googleCivicAddress,
  googleCivicApiKey,
  googleCivicEmptyFixture,
  googleCivicErrorFixtures,
  googleCivicMalformedFixture,
  googleCivicMatchedFixture,
  googleCivicModernErrorFixtures,
  googleProviderProseSentinel,
} from "../../tests/fixtures/google-civic";
import { lookupGoogleAddress } from "./google-civic";
import type { GoogleAddressLookup } from "./residence";

const checkedAt = "2026-07-14T20:00:00.000Z";
const signal = new AbortController().signal;
const consoleMethods = ["debug", "error", "info", "log", "warn"] as const;

beforeEach(() => {
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  for (const method of consoleMethods) {
    expect(console[method]).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
});

describe("Google Civic address adapter", () => {
  it("normalizes every supported OCD division type with safe provenance", async () => {
    expectTypeOf(lookupGoogleAddress).toMatchTypeOf<GoogleAddressLookup>();

    const outcome = await lookupWith(
      fetchReturning(googleCivicMatchedFixture),
    );

    expect(outcome).toEqual({
      status: "matched",
      divisions: [
        {
          type: "country",
          name: "United States",
          id: "ocd-division/country:us",
          idScheme: "ocd",
        },
        {
          type: "state",
          name: "California",
          id: "ocd-division/country:us/state:ca",
          idScheme: "ocd",
        },
        {
          type: "county",
          name: "Example County",
          id: "ocd-division/country:us/state:ca/county:example",
          idScheme: "ocd",
        },
        {
          type: "congressional_district",
          name: "California Congressional District 12",
          id: "ocd-division/country:us/state:ca/cd:12",
          idScheme: "ocd",
        },
        {
          type: "state_upper",
          name: "California State Senate District 7",
          id: "ocd-division/country:us/state:ca/sldu:7",
          idScheme: "ocd",
        },
        {
          type: "state_lower",
          name: "California State Assembly District 14",
          id: "ocd-division/country:us/state:ca/sldl:14",
          idScheme: "ocd",
        },
        {
          type: "place",
          name: "Example City",
          id: "ocd-division/country:us/state:ca/place:example_city",
          idScheme: "ocd",
        },
        {
          type: "other",
          name: "Example City Council District 2",
          id: "ocd-division/country:us/state:ca/place:example_city/council_district:2",
          idScheme: "ocd",
        },
      ],
      source: {
        name: "Google Civic Information API",
        url: "https://developers.google.com/civic-information",
        checkedAt,
        effectiveAt: null,
      },
      coverageNotes: ["Local divisions may be unavailable."],
    });
  });

  it("makes one no-store TLS request without returning precise input or its URL", async () => {
    const providerFetch = fetchReturning(googleCivicMatchedFixture);

    const outcome = await lookupWith(providerFetch);

    expect(providerFetch).toHaveBeenCalledOnce();
    const [input, init] = providerFetch.mock.calls[0];
    const requestUrl = new URL(toUrl(input));
    expect(requestUrl.origin).toBe("https://www.googleapis.com");
    expect(requestUrl.pathname).toBe("/civicinfo/v2/divisionsByAddress");
    expect([...requestUrl.searchParams.keys()].sort()).toEqual([
      "address",
      "key",
    ]);
    expect(requestUrl.searchParams.get("address")).toBe(googleCivicAddress);
    expect(requestUrl.searchParams.get("key")).toBe(googleCivicApiKey);
    expect(init).toMatchObject({ cache: "no-store", signal });
    expect(init?.body).toBeUndefined();

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain(googleCivicAddress);
    expect(serialized).not.toContain("SENTINEL GOOGLE NORMALIZED INPUT");
    expect(serialized).not.toContain(googleCivicApiKey);
    expect(serialized).not.toContain(requestUrl.toString());
  });

  it("maps documented absent or conflicting address results without provider prose", async () => {
    const cases = [
      [googleCivicErrorFixtures.parseError, 400, { status: "no_match" }],
      [googleCivicErrorFixtures.required, 400, { status: "no_match" }],
      [googleCivicErrorFixtures.invalidValue, 400, { status: "no_match" }],
      [googleCivicErrorFixtures.invalidQuery, 400, { status: "no_match" }],
      [googleCivicErrorFixtures.notFound, 404, { status: "no_match" }],
      [googleCivicEmptyFixture, 200, { status: "no_match" }],
      [googleCivicErrorFixtures.conflict, 409, { status: "ambiguous" }],
    ] as const;

    for (const [fixture, status, expected] of cases) {
      const outcome = await lookupWith(fetchReturning(fixture, status));
      expect(outcome).toEqual(expected);
      expect(JSON.stringify(outcome)).not.toContain(googleProviderProseSentinel);
    }
  });

  it("maps HTTP auth, quota, and provider failures to typed reasons", async () => {
    const cases = [
      [googleCivicErrorFixtures.unauthorized, 401, "auth"],
      [googleCivicErrorFixtures.apiKeyInvalid, 403, "auth"],
      [googleCivicErrorFixtures.limitExceeded, 403, "quota"],
      [googleCivicErrorFixtures.rateLimitExceeded, 429, "quota"],
      [googleCivicErrorFixtures.backendError, 503, "provider_error"],
      [googleCivicErrorFixtures.unknown, 418, "provider_error"],
    ] as const;

    for (const [fixture, status, reason] of cases) {
      const outcome = await lookupWith(fetchReturning(fixture, status));
      expect(outcome).toEqual({ status: "unavailable", reason });
      expect(JSON.stringify(outcome)).not.toContain(googleProviderProseSentinel);
    }
  });

  it("recognizes legacy and ErrorInfo API-key failures without provider prose", async () => {
    const outcomes = await Promise.all([
      lookupWith(fetchReturning(googleCivicErrorFixtures.keyInvalid, 400)),
      lookupWith(
        fetchReturning(googleCivicModernErrorFixtures.apiKeyInvalid, 400),
      ),
    ]);

    expect(outcomes).toEqual([
      { status: "unavailable", reason: "auth" },
      { status: "unavailable", reason: "auth" },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain(googleProviderProseSentinel);
  });

  it("recognizes legacy and ErrorInfo quota failures without provider prose", async () => {
    const outcomes = await Promise.all([
      lookupWith(
        fetchReturning(googleCivicErrorFixtures.dailyLimitExceeded, 403),
      ),
      lookupWith(
        fetchReturning(googleCivicModernErrorFixtures.rateLimitExceeded, 403),
      ),
    ]);

    expect(outcomes).toEqual([
      { status: "unavailable", reason: "quota" },
      { status: "unavailable", reason: "quota" },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain(googleProviderProseSentinel);
  });

  it("maps an aborted request to timeout and another fetch failure to provider error", async () => {
    const abortedFetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new DOMException("SENTINEL GOOGLE ABORT PROSE", "AbortError");
    });
    const failedFetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("SENTINEL GOOGLE NETWORK PROSE");
    });

    await expect(lookupWith(abortedFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    await expect(lookupWith(failedFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "provider_error",
    });
  });

  it("fails closed on invalid JSON or a malformed success body", async () => {
    const invalidJsonFetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(lookupWith(invalidJsonFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "malformed",
    });
    await expect(
      lookupWith(fetchReturning(googleCivicMalformedFixture)),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it("maps an abort while reading the response body to timeout", async () => {
    const response = new Response(JSON.stringify(googleCivicMatchedFixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.spyOn(response, "json").mockRejectedValue(
      new DOMException("SENTINEL GOOGLE BODY ABORT PROSE", "AbortError"),
    );
    const providerFetch = vi.fn<typeof globalThis.fetch>(async () => response);

    await expect(lookupWith(providerFetch)).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });
});

function lookupWith(providerFetch: typeof globalThis.fetch) {
  return lookupGoogleAddress(googleCivicAddress, {
    apiKey: googleCivicApiKey,
    checkedAt,
    fetch: providerFetch,
    signal,
  });
}

function fetchReturning(body: unknown, status = 200) {
  return vi.fn<typeof globalThis.fetch>(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function toUrl(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}
