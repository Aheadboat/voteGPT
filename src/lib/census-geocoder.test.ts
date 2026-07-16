import { afterEach, describe, expect, it, vi } from "vitest";
import {
  censusAddressResponse,
  censusAmbiguousAddressResponse,
  censusCoordinatesResponse,
  censusEmptyAddressResponse,
  censusFixtureAddress,
  censusFixtureCoordinates,
  censusMalformedMultipleAddressResponse,
} from "../../tests/fixtures/census-geocoder";
import { lookupCensus } from "./census-geocoder";

const checkedAt = "2026-07-14T20:00:00.000Z";
const coverageNote =
  "Census coverage is partial and may omit local political divisions.";
const selectedLayers = "28,54,56,58,80,82";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lookupCensus", () => {
  it("normalizes only selected political layers from an address result", async () => {
    const { calls, fetch } = fetchOnce(censusAddressResponse);
    const controller = new AbortController();

    const outcome = await lookupCensus(
      { kind: "address", address: censusFixtureAddress },
      { checkedAt, fetch, signal: controller.signal },
    );

    expect(outcome).toEqual({
      status: "partial",
      divisions: [
        {
          type: "state",
          name: "Example State",
          id: "39",
          idScheme: "census",
        },
        {
          type: "county",
          name: "Example County",
          id: "39049",
          idScheme: "census",
        },
        {
          type: "congressional_district",
          name: "Congressional District 3",
          id: "3903",
          idScheme: "census",
        },
        {
          type: "state_upper",
          name: "State Senate District 15",
          id: "39015",
          idScheme: "census",
        },
        {
          type: "state_lower",
          name: "State House District 3",
          id: "39003",
          idScheme: "census",
        },
        {
          type: "place",
          name: "Example City",
          id: "3918000",
          idScheme: "census",
        },
      ],
      source: {
        name: "U.S. Census Geocoder",
        url: "https://geocoding.geo.census.gov/geocoder/",
        checkedAt,
        effectiveAt: null,
        benchmark: "Public_AR_Current",
        vintage: "Current_Current",
      },
      coverageNotes: [coverageNote],
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    const url = requestUrl(call.input);
    expect(url.origin + url.pathname).toBe(
      "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
    );
    expect(url.searchParams.get("address")).toBe(censusFixtureAddress);
    expect(url.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(url.searchParams.get("vintage")).toBe("Current_Current");
    expect(url.searchParams.get("layers")).toBe(selectedLayers);
    expect(url.searchParams.get("format")).toBe("json");
    expect(call.init).toMatchObject({
      cache: "no-store",
      signal: controller.signal,
    });

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toMatch(
      /SENTINEL|onelineaddress|address=|Census Tracts|Census Blocks|providerNarrative/,
    );
  });

  it("uses the coordinate endpoint and returns only partial Census geography", async () => {
    const { calls, fetch } = fetchOnce(censusCoordinatesResponse);
    const controller = new AbortController();

    const outcome = await lookupCensus(
      { kind: "coordinates", ...censusFixtureCoordinates },
      { checkedAt, fetch, signal: controller.signal },
    );

    expect(outcome).toEqual({
      status: "partial",
      divisions: [
        {
          type: "state",
          name: "Coordinate Example State",
          id: "06",
          idScheme: "census",
        },
        {
          type: "county",
          name: "Coordinate Example County",
          id: "06037",
          idScheme: "census",
        },
      ],
      source: {
        name: "U.S. Census Geocoder",
        url: "https://geocoding.geo.census.gov/geocoder/",
        checkedAt,
        effectiveAt: null,
        benchmark: "Public_AR_Current",
        vintage: "Current_Current",
      },
      coverageNotes: [coverageNote],
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    const url = requestUrl(call.input);
    expect(url.origin + url.pathname).toBe(
      "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
    );
    expect(url.searchParams.get("x")).toBe(
      String(censusFixtureCoordinates.longitude),
    );
    expect(url.searchParams.get("y")).toBe(
      String(censusFixtureCoordinates.latitude),
    );
    expect(url.searchParams.has("address")).toBe(false);
    expect(url.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(url.searchParams.get("vintage")).toBe("Current_Current");
    expect(url.searchParams.get("layers")).toBe(selectedLayers);
    expect(url.searchParams.get("format")).toBe("json");
    expect(call.init).toMatchObject({
      cache: "no-store",
      signal: controller.signal,
    });

    expect(JSON.stringify(outcome)).not.toMatch(
      /12\.345678|-98\.765432|coordinates\?|SENTINEL|Census Block Groups|providerNarrative/,
    );
  });

  it("distinguishes no match, valid ambiguity, and malformed multiple matches", async () => {
    const controller = new AbortController();
    const empty = fetchOnce(censusEmptyAddressResponse);
    const ambiguous = fetchOnce(censusAmbiguousAddressResponse);
    const malformed = fetchOnce(censusMalformedMultipleAddressResponse);

    await expect(
      lookupCensus(
        { kind: "address", address: censusFixtureAddress },
        { checkedAt, fetch: empty.fetch, signal: controller.signal },
      ),
    ).resolves.toEqual({ status: "no_match" });
    await expect(
      lookupCensus(
        { kind: "address", address: censusFixtureAddress },
        { checkedAt, fetch: ambiguous.fetch, signal: controller.signal },
      ),
    ).resolves.toEqual({ status: "ambiguous" });
    await expect(
      lookupCensus(
        { kind: "address", address: censusFixtureAddress },
        { checkedAt, fetch: malformed.fetch, signal: controller.signal },
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "malformed" });
  });

  it.each([
    [
      "AbortError",
      new DOMException("SENTINEL BODY ABORT", "AbortError"),
      false,
    ],
    ["an aborted signal", new Error("SENTINEL BODY FAILURE"), true],
  ])("maps %s while reading the response body to timeout", async (_, error, abort) => {
    const controller = new AbortController();
    if (abort) {
      controller.abort();
    }

    await expect(
      lookupCensus(
        { kind: "address", address: censusFixtureAddress },
        {
          checkedAt,
          fetch: fetchWithJsonError(error),
          signal: controller.signal,
        },
      ),
    ).resolves.toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("maps throttles, provider failures, aborts, and malformed data without logs or prose", async () => {
    const logSpies = (["log", "info", "warn", "error"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const controller = new AbortController();
    const cases = [
      {
        fetch: fetchOnce({ error: "SENTINEL THROTTLE PROSE" }, 429).fetch,
        expected: { status: "unavailable", reason: "quota" },
      },
      {
        fetch: fetchOnce({ error: "SENTINEL PROVIDER PROSE" }, 503).fetch,
        expected: { status: "unavailable", reason: "provider_error" },
      },
      {
        fetch: rejectingFetch(new DOMException("SENTINEL ABORT PROSE", "AbortError")),
        expected: { status: "unavailable", reason: "timeout" },
      },
      {
        fetch: fetchOnce("{").fetch,
        expected: { status: "unavailable", reason: "malformed" },
      },
      {
        fetch: fetchOnce({ result: { addressMatches: [{}] } }).fetch,
        expected: { status: "unavailable", reason: "malformed" },
      },
    ] as const;

    for (const testCase of cases) {
      const outcome = await lookupCensus(
        { kind: "address", address: censusFixtureAddress },
        { checkedAt, fetch: testCase.fetch, signal: controller.signal },
      );
      expect(outcome).toEqual(testCase.expected);
      expect(JSON.stringify(outcome)).not.toContain("SENTINEL");
    }

    for (const spy of logSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

function fetchOnce(body: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      {
        headers: { "content-type": "application/json" },
        status,
      },
    );
  }) as typeof globalThis.fetch;

  return { calls, fetch };
}

function rejectingFetch(error: unknown) {
  return (() => Promise.reject(error)) as typeof globalThis.fetch;
}

function fetchWithJsonError(error: unknown) {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: () => Promise.reject(error),
    }) as Response) as typeof globalThis.fetch;
}

function requestUrl(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input));
}
