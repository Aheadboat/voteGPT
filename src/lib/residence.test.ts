import { createHmac, hkdfSync } from "node:crypto";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  censusAddressResponse,
  censusFixtureAddress,
} from "../../tests/fixtures/census-geocoder";
import {
  googleCivicAddress,
  googleCivicApiKey,
  googleCivicMatchedFixture,
} from "../../tests/fixtures/google-civic";
import {
  ambiguousResidenceResponse,
  forbiddenResidenceResponse,
  invalidResidenceResponse,
  matchedResidenceResponse,
  noMatchResidenceResponse,
  partialResidenceResponse,
  unauthenticatedResidenceResponse,
  unavailableResidenceResponse,
} from "../../tests/fixtures/residence-responses";
import {
  createResolutionToken,
  parseResidenceInput,
  resolveResidence,
  verifyResolutionToken,
  type ProviderOutcome,
  type ResidenceInput,
  type ResolveResidence,
  type ResolutionErrorResponse,
  type ResolutionOutcome,
  type ResolutionResponse,
} from "./residence";
import { lookupCensus } from "./census-geocoder";
import { lookupGoogleAddress } from "./google-civic";

const now = new Date("2026-07-14T20:00:00.000Z");
const secret = "test-secret-at-least-thirty-two-characters";
const userId = "user_fixture";

const resolvedResidence = {
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
} satisfies Extract<ResolutionOutcome, { status: "matched" | "partial" }>;

const censusPartialOutcome = {
  status: "partial",
  divisions: [
    {
      type: "county",
      name: "Example County",
      id: "99001",
      idScheme: "census",
    },
  ],
  source: {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/",
    checkedAt: now.toISOString(),
    effectiveAt: null,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
  },
  coverageNotes: [
    "Census coverage is partial and may omit local political divisions.",
  ],
} satisfies Extract<ProviderOutcome, { status: "matched" | "partial" }>;

const addressInput = {
  kind: "address",
  address: "123 Fixture Avenue, Example City, CA 90000",
} as const;
const coordinateInput = {
  kind: "coordinates",
  latitude: 38.8977,
  longitude: -77.0365,
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("residence contract", () => {
  it("keeps every response variant compatible with the shared DTO", () => {
    expectTypeOf(matchedResidenceResponse).toMatchTypeOf<ResolutionResponse>();
    expectTypeOf(partialResidenceResponse).toMatchTypeOf<ResolutionResponse>();
    expectTypeOf(noMatchResidenceResponse).toMatchTypeOf<ResolutionResponse>();
    expectTypeOf(ambiguousResidenceResponse).toMatchTypeOf<ResolutionResponse>();
    expectTypeOf(invalidResidenceResponse).toMatchTypeOf<ResolutionErrorResponse>();
    expectTypeOf(unauthenticatedResidenceResponse).toMatchTypeOf<ResolutionErrorResponse>();
    expectTypeOf(forbiddenResidenceResponse).toMatchTypeOf<ResolutionErrorResponse>();
    expectTypeOf(unavailableResidenceResponse).toMatchTypeOf<ResolutionErrorResponse>();
  });

  it("accepts only a trimmed address with the exact request shape", () => {
    expect(
      parseResidenceInput({ kind: "address", address: "  100 Main St  " }),
    ).toEqual({ kind: "address", address: "100 Main St" });
    expect(
      parseResidenceInput({ kind: "address", address: "a".repeat(300) }),
    ).toEqual({ kind: "address", address: "a".repeat(300) });

    for (const value of [
      { kind: "address", address: "" },
      { kind: "address", address: "   " },
      { kind: "address", address: "a".repeat(301) },
      { kind: "address", address: 100 },
      { kind: "address", address: "100 Main St", extra: true },
      {
        kind: "address",
        address: "100 Main St",
        latitude: 1,
        longitude: 2,
      },
    ]) {
      expect(parseResidenceInput(value)).toBeNull();
    }
  });

  it("accepts only finite in-range coordinates with the exact request shape", () => {
    expect(
      parseResidenceInput({ kind: "coordinates", latitude: -90, longitude: 180 }),
    ).toEqual({ kind: "coordinates", latitude: -90, longitude: 180 });
    expect(
      parseResidenceInput({ kind: "coordinates", latitude: 90, longitude: -180 }),
    ).toEqual({ kind: "coordinates", latitude: 90, longitude: -180 });

    for (const value of [
      null,
      [],
      { kind: "coordinates", latitude: Number.NaN, longitude: 1 },
      { kind: "coordinates", latitude: Number.POSITIVE_INFINITY, longitude: 1 },
      { kind: "coordinates", latitude: 91, longitude: 1 },
      { kind: "coordinates", latitude: 1, longitude: -181 },
      { kind: "coordinates", latitude: "1", longitude: 2 },
      { kind: "coordinates", latitude: 1, longitude: 2, extra: true },
      { kind: "unknown", latitude: 1, longitude: 2 },
    ]) {
      expect(parseResidenceInput(value)).toBeNull();
    }
  });
});

describe("resolution token", () => {
  it.each([
    [
      "query-bearing",
      "Google Civic Information API",
      "https://developers.google.com/civic-information?address=SENTINEL%20ADDRESS",
    ],
    [
      "path-bearing",
      "Google Civic Information API",
      "https://developers.google.com/civic-information/SENTINEL%20ADDRESS",
    ],
    [
      "mismatched",
      "Google Civic Information API",
      "https://geocoding.geo.census.gov/geocoder/",
    ],
  ])("refuses to sign %s source provenance", (_case, name, url) => {
    const unsafeSourceResolution = {
      ...resolvedResidence,
      source: {
        ...resolvedResidence.source,
        name,
        url,
      },
    } satisfies Extract<
      ResolutionOutcome,
      { status: "matched" | "partial" }
    >;

    expect(() =>
      createResolutionToken(
        addressInput,
        unsafeSourceResolution,
        userId,
        secret,
        now,
      ),
    ).toThrow("Cannot sign an invalid residence resolution.");
  });

  it.each([
    {
      case: "canonical provider acronym address",
      input: { kind: "address" as const, address: "API" },
    },
    {
      case: "address substring in otherwise public prose",
      input: { kind: "address" as const, address: "API" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Capitol divisions may be unavailable."],
      },
    },
    {
      case: "literal percentage prose",
      input: { kind: "address" as const, address: "Q" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Coverage is 50% complete."],
      },
    },
    {
      case: "single-character address",
      input: { kind: "address" as const, address: "Q" },
    },
    {
      case: "zero and timestamp-fragment coordinates",
      input: { kind: "coordinates" as const, latitude: 0, longitude: 20 },
    },
    {
      case: "division-ID-fragment coordinates",
      input: { kind: "coordinates" as const, latitude: 1, longitude: 2 },
    },
  ] satisfies Array<{
    case: string;
    input: ResidenceInput;
    resolution?: Extract<
      ResolutionOutcome,
      { status: "matched" | "partial" }
    >;
  }>)("signs safe $case", ({ input, resolution }) => {
    const { resolutionToken } = createResolutionToken(
      input,
      resolution ?? resolvedResidence,
      userId,
      secret,
      now,
    );

    expect(verifyResolutionToken(resolutionToken, userId, secret, now)).toEqual(
      resolution ?? resolvedResidence,
    );
  });

  it.each([
    {
      case: "raw address",
      input: addressInput,
      resolution: {
        ...resolvedResidence,
        coverageNotes: [`Resolved for ${addressInput.address}.`],
      },
    },
    {
      case: "single-character address without a bypass",
      input: { kind: "address", address: "Q" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Resolved for q."],
      },
    },
    {
      case: "percent-encoded address",
      input: addressInput,
      resolution: {
        ...resolvedResidence,
        source: {
          ...resolvedResidence.source,
          benchmark: encodeURIComponent(addressInput.address),
        },
      },
    },
    {
      case: "double-encoded address",
      input: addressInput,
      resolution: {
        ...resolvedResidence,
        source: {
          ...resolvedResidence.source,
          vintage: encodeURIComponent(encodeURIComponent(addressInput.address)),
        },
      },
    },
    {
      case: "form-encoded address",
      input: addressInput,
      resolution: {
        ...resolvedResidence,
        divisions: [
          {
            ...resolvedResidence.divisions[0],
            name: addressInput.address.replaceAll(" ", "+"),
          },
        ],
      },
    },
    {
      case: "Unicode case, whitespace, and punctuation address",
      input: addressInput,
      resolution: {
        ...resolvedResidence,
        divisions: [
          {
            ...resolvedResidence.divisions[0],
            id: "private:１２３—FIXTURE   AVENUE／EXAMPLE CITY／CA ９００００",
          },
        ],
      },
    },
    {
      case: "raw latitude",
      input: coordinateInput,
      resolution: {
        ...resolvedResidence,
        coverageNotes: [`Latitude ${coordinateInput.latitude}`],
      },
    },
    {
      case: "encoded longitude",
      input: coordinateInput,
      resolution: {
        ...resolvedResidence,
        coverageNotes: [
          `Longitude ${encodeURIComponent(String(coordinateInput.longitude))}`,
        ],
      },
    },
    {
      case: "malformed percent suffix after an encoded address",
      input: { kind: "address", address: "123 Main Street" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Resolved for 123%20Main%20Street%ZZ"],
      },
    },
    {
      case: "invalid UTF-8 suffix after an encoded address",
      input: { kind: "address", address: "123 Main Street" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Resolved for 123%20Main%20Street%C3"],
      },
    },
    {
      case: "address nested beyond the decode limit",
      input: { kind: "address", address: "123 Main Street" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: [encodeNested("123 Main Street", 5)],
      },
    },
    {
      case: "default-ignorable separated address",
      input: { kind: "address", address: "123 Main Street" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Resolved for 123\u200bMain\u200bStreet"],
      },
    },
    {
      case: "Arabic-digit address",
      input: { kind: "address", address: "123 Main Street" },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Resolved for ١٢٣ Main Street"],
      },
    },
    {
      case: "scientific-coordinate decimal equivalent",
      input: { kind: "coordinates", latitude: 1e-7, longitude: 45 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude 0.0000001"],
      },
    },
    {
      case: "encoded short coordinate with a numeric boundary",
      input: { kind: "coordinates", latitude: 1, longitude: 2 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude%3A+1"],
      },
    },
    {
      case: "labelled zero coordinate",
      input: { kind: "coordinates", latitude: 0, longitude: 20 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude: 0"],
      },
    },
    {
      case: "whole-field short coordinate",
      input: { kind: "coordinates", latitude: 1, longitude: 2 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["1"],
      },
    },
    {
      case: "decimal coordinate equivalent",
      input: { kind: "coordinates", latitude: 1, longitude: 2 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude 1.0"],
      },
    },
    {
      case: "scientific coordinate equivalent",
      input: { kind: "coordinates", latitude: 1, longitude: 2 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude 1e0"],
      },
    },
    {
      case: "Unicode coordinate equivalent",
      input: { kind: "coordinates", latitude: 1, longitude: 2 },
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["Latitude \u0661\u066b\u0660"],
      },
    },
  ] satisfies Array<{
    case: string;
    input: ResidenceInput;
    resolution: Extract<
      ResolutionOutcome,
      { status: "matched" | "partial" }
    >;
  }>)("refuses to sign $case reflected by public facts", ({ input, resolution }) => {
    expect(() =>
      createResolutionToken(input, resolution, userId, secret, now),
    ).toThrow("Cannot sign an invalid residence resolution.");
  });

  it.each([
    {
      case: "too many divisions",
      resolution: {
        ...resolvedResidence,
        divisions: Array.from({ length: 65 }, (_, index) => ({
          ...resolvedResidence.divisions[0],
          id: `ocd-division/country:us/state:ex/cd:${index}`,
        })),
      },
    },
    {
      case: "too many coverage notes",
      resolution: {
        ...resolvedResidence,
        coverageNotes: Array.from(
          { length: 65 },
          (_, index) => `Coverage note ${index}`,
        ),
      },
    },
    {
      case: "overlong public text",
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["x".repeat(2_049)],
      },
    },
  ] satisfies Array<{
    case: string;
    resolution: Extract<
      ResolutionOutcome,
      { status: "matched" | "partial" }
    >;
  }>)("refuses to sign $case", ({ resolution }) => {
    expect(() =>
      createResolutionToken(addressInput, resolution, userId, secret, now),
    ).toThrow("Cannot sign an invalid residence resolution.");
  });

  it("rejects a correctly signed token whose public resolution exceeds bounds", () => {
    const token = signResolutionPayload({
      version: "v1",
      userId,
      issuedAt: now.toISOString(),
      expiresAt: "2026-07-14T20:10:00.000Z",
      resolution: {
        ...resolvedResidence,
        coverageNotes: ["x".repeat(2_049)],
      },
    });

    expect(verifyResolutionToken(token, userId, secret, now)).toBeNull();
  });

  it.each([
    [
      "future issuance",
      "2026-07-14T20:01:00.000Z",
      "2026-07-14T20:11:00.000Z",
    ],
    [
      "overlong lifetime",
      "2026-07-14T20:00:00.000Z",
      "2026-07-14T20:20:00.000Z",
    ],
  ])("rejects a correctly signed token with %s", (_case, issuedAt, expiresAt) => {
    const token = signResolutionPayload({
      version: "v1",
      userId,
      issuedAt,
      expiresAt,
      resolution: resolvedResidence,
    });

    expect(verifyResolutionToken(token, userId, secret, now)).toBeNull();
  });

  it("creates a readable purpose-derived HMAC token with exact claims and expiry", () => {
    const unsafeResolution = {
      ...resolvedResidence,
      address: "SENTINEL ADDRESS 742 Evergreen Terrace",
      latitude: 12.345678,
      longitude: -98.765432,
      normalizedInput: "SENTINEL NORMALIZED INPUT",
      source: {
        ...resolvedResidence.source,
        requestUrl:
          "https://provider.invalid/lookup?address=SENTINEL%20ADDRESS",
      },
    } as unknown as Extract<
      ResolutionOutcome,
      { status: "matched" | "partial" }
    >;

    const { resolutionToken, expiresAt } = createResolutionToken(
      addressInput,
      unsafeResolution,
      userId,
      secret,
      now,
    );

    expect(expiresAt).toBe("2026-07-14T20:10:00.000Z");
    const [version, encodedPayload, signature] = resolutionToken.split(".");
    expect(version).toBe("v1");

    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    expect(payload).toEqual({
      version: "v1",
      userId,
      issuedAt: now.toISOString(),
      expiresAt,
      resolution: resolvedResidence,
    });
    expect(payloadJson).not.toMatch(
      /SENTINEL ADDRESS|12\.345678|-98\.765432|SENTINEL NORMALIZED INPUT|provider\.invalid/,
    );

    const signingInput = `v1.${encodedPayload}`;
    const purposeKey = Buffer.from(
      hkdfSync(
        "sha256",
        secret,
        Buffer.alloc(0),
        "voteGPT/residence-resolution/v1",
        32,
      ),
    );
    expect(signature).toBe(
      createHmac("sha256", purposeKey)
        .update(signingInput)
        .digest("base64url"),
    );
    expect(signature).not.toBe(
      createHmac("sha256", secret).update(signingInput).digest("base64url"),
    );
  });

  it("verifies only an untampered token for the same user before expiry", () => {
    const { resolutionToken } = createResolutionToken(
      addressInput,
      resolvedResidence,
      userId,
      secret,
      now,
    );

    expect(
      verifyResolutionToken(
        resolutionToken,
        userId,
        secret,
        new Date("2026-07-14T20:09:59.999Z"),
      ),
    ).toEqual(resolvedResidence);
    expect(
      verifyResolutionToken(resolutionToken, "another-user", secret, now),
    ).toBeNull();
    expect(
      verifyResolutionToken(
        resolutionToken,
        userId,
        secret,
        new Date("2026-07-14T20:10:00.000Z"),
      ),
    ).toBeNull();

    const parts = resolutionToken.split(".");
    parts[1] = `${parts[1].slice(0, -1)}${parts[1].endsWith("A") ? "B" : "A"}`;
    expect(verifyResolutionToken(parts.join("."), userId, secret, now)).toBeNull();
    expect(verifyResolutionToken("not-a-token", userId, secret, now)).toBeNull();
  });
});

describe("resolveResidence", () => {
  it("returns a Google match immediately without sending the address to Census", async () => {
    expectTypeOf(resolveResidence).toMatchTypeOf<ResolveResidence>();
    const google = vi.fn(
      async (
        address: string,
        context: { checkedAt: string; signal: AbortSignal },
      ) => {
        expect(address).toBe(addressInput.address);
        expect(context.checkedAt).toBe(now.toISOString());
        expect(context.signal.aborted).toBe(false);
        return resolvedResidence;
      },
    );
    const census = vi.fn(async () => censusPartialOutcome);

    await expect(
      resolveResidence(addressInput, { google, census, now: () => now }),
    ).resolves.toEqual(resolvedResidence);
    expect(google).toHaveBeenCalledOnce();
    expect(census).not.toHaveBeenCalled();
  });

  it("falls back once for every approved Google non-success", async () => {
    const triggers = [
      { status: "no_match" },
      { status: "ambiguous" },
      { status: "unavailable", reason: "timeout" },
      { status: "unavailable", reason: "quota" },
      { status: "unavailable", reason: "auth" },
      { status: "unavailable", reason: "malformed" },
      { status: "unavailable", reason: "provider_error" },
    ] satisfies ProviderOutcome[];

    for (const trigger of triggers) {
      const google = vi.fn(async () => trigger);
      const census = vi.fn(
        async (
          input: ResidenceInput,
          context: { checkedAt: string; signal: AbortSignal },
        ) => {
          expect(input).toEqual(addressInput);
          expect(context.checkedAt).toBe(now.toISOString());
          expect(context.signal.aborted).toBe(false);
          return censusPartialOutcome;
        },
      );

      await expect(
        resolveResidence(addressInput, { google, census, now: () => now }),
      ).resolves.toEqual(censusPartialOutcome);
      expect(google).toHaveBeenCalledOnce();
      expect(census).toHaveBeenCalledOnce();
    }
  });

  it("applies the approved Census fallback precedence", async () => {
    const cases: Array<{
      google: ProviderOutcome;
      census: ProviderOutcome;
      expected: ResolutionOutcome;
    }> = [
      {
        google: { status: "ambiguous" },
        census: { status: "no_match" },
        expected: { status: "ambiguous" },
      },
      {
        google: { status: "no_match" },
        census: { status: "no_match" },
        expected: { status: "no_match" },
      },
      {
        google: { status: "unavailable", reason: "provider_error" },
        census: { status: "no_match" },
        expected: { status: "no_match" },
      },
      {
        google: { status: "no_match" },
        census: { status: "ambiguous" },
        expected: { status: "ambiguous" },
      },
      {
        google: { status: "ambiguous" },
        census: { status: "ambiguous" },
        expected: { status: "ambiguous" },
      },
      {
        google: { status: "no_match" },
        census: { status: "unavailable", reason: "quota" },
        expected: { status: "unavailable" },
      },
    ];

    for (const testCase of cases) {
      const google = vi.fn(async () => testCase.google);
      const census = vi.fn(async () => testCase.census);
      await expect(
        resolveResidence(addressInput, { google, census, now: () => now }),
      ).resolves.toEqual(testCase.expected);
      expect(google).toHaveBeenCalledOnce();
      expect(census).toHaveBeenCalledOnce();
    }
  });

  it("calls only Census for coordinates and maps its result directly", async () => {
    const cases: Array<[ProviderOutcome, ResolutionOutcome]> = [
      [censusPartialOutcome, censusPartialOutcome],
      [{ status: "no_match" }, { status: "no_match" }],
      [{ status: "ambiguous" }, { status: "ambiguous" }],
      [
        { status: "unavailable", reason: "provider_error" },
        { status: "unavailable" },
      ],
    ];

    for (const [providerOutcome, expected] of cases) {
      const google = vi.fn(async () => resolvedResidence);
      const census = vi.fn(async (input: ResidenceInput) => {
        expect(input).toEqual(coordinateInput);
        return providerOutcome;
      });

      await expect(
        resolveResidence(coordinateInput, { google, census, now: () => now }),
      ).resolves.toEqual(expected);
      expect(google).not.toHaveBeenCalled();
      expect(census).toHaveBeenCalledOnce();
    }
  });

  it("aborts each provider after five seconds without retrying", async () => {
    vi.useFakeTimers();
    let googleSignal: AbortSignal | undefined;
    const google = vi.fn(
      async (
        _address: string,
        { signal }: { checkedAt: string; signal: AbortSignal },
      ) => {
        googleSignal = signal;
        return await outcomeOnAbort(signal);
      },
    );
    const census = vi.fn(async () => censusPartialOutcome);

    const addressResolution = resolveResidence(addressInput, {
      google,
      census,
      now: () => now,
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(census).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(addressResolution).resolves.toEqual(censusPartialOutcome);
    expect(googleSignal?.aborted).toBe(true);
    expect(google).toHaveBeenCalledOnce();
    expect(census).toHaveBeenCalledOnce();

    let censusSignal: AbortSignal | undefined;
    const censusTimeout = vi.fn(
      async (
        _input: ResidenceInput,
        { signal }: { checkedAt: string; signal: AbortSignal },
      ) => {
        censusSignal = signal;
        return await outcomeOnAbort(signal);
      },
    );
    const coordinateResolution = resolveResidence(coordinateInput, {
      google,
      census: censusTimeout,
      now: () => now,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(coordinateResolution).resolves.toEqual({
      status: "unavailable",
    });
    expect(censusSignal?.aborted).toBe(true);
    expect(censusTimeout).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(google).toHaveBeenCalledOnce();
    expect(census).toHaveBeenCalledOnce();
    expect(censusTimeout).toHaveBeenCalledOnce();
  });

  it("settles the hard timeout before an abort callback can report success", async () => {
    const timeoutCallbacks: Array<() => void> = [];
    vi.stubGlobal(
      "setTimeout",
      ((callback: () => void, delay?: number) => {
        expect(delay).toBe(5_000);
        timeoutCallbacks.push(callback);
        return timeoutCallbacks.length;
      }) as unknown as typeof setTimeout,
    );
    const google = vi.fn(
      (
        _address: string,
        { signal }: { checkedAt: string; signal: AbortSignal },
      ) =>
        new Promise<ProviderOutcome>((resolve) => {
          signal.addEventListener("abort", () => resolve(resolvedResidence), {
            once: true,
          });
        }),
    );
    const census = vi.fn(async () => censusPartialOutcome);

    const addressResolution = resolveResidence(addressInput, {
      google,
      census,
      now: () => now,
    });
    expect(timeoutCallbacks).toHaveLength(1);
    timeoutCallbacks[0]();
    await expect(addressResolution).resolves.toEqual(censusPartialOutcome);
    expect(census).toHaveBeenCalledOnce();

    const censusSuccessOnAbort = vi.fn(
      (
        _input: ResidenceInput,
        { signal }: { checkedAt: string; signal: AbortSignal },
      ) =>
        new Promise<ProviderOutcome>((resolve) => {
          signal.addEventListener("abort", () => resolve(censusPartialOutcome), {
            once: true,
          });
        }),
    );
    const coordinateResolution = resolveResidence(coordinateInput, {
      google,
      census: censusSuccessOnAbort,
      now: () => now,
    });
    expect(timeoutCallbacks).toHaveLength(3);
    timeoutCallbacks[2]();
    await expect(coordinateResolution).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("keeps missing Google configuration inside production defaults", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("GOOGLE_CIVIC_API_KEY", "");
    const providerFetch = fixtureFetch(censusAddressResponse);
    vi.stubGlobal("fetch", providerFetch);

    const outcome = await resolveResidence({
      kind: "address",
      address: censusFixtureAddress,
    });

    expect(outcome.status).toBe("partial");
    expect(providerFetch).toHaveBeenCalledOnce();
    const requestUrl = new URL(toUrl(providerFetch.mock.calls[0][0]));
    expect(requestUrl.hostname).toBe("geocoding.geo.census.gov");
    expect(JSON.stringify(outcome)).not.toContain(censusFixtureAddress);
    if (outcome.status === "partial") {
      expect(outcome.source.checkedAt).toBe(now.toISOString());
    }
  });

  it("keeps synthetic shared-layer agreement and disagreement test-only", async () => {
    const googleOutcome = await lookupGoogleAddress(googleCivicAddress, {
      apiKey: googleCivicApiKey,
      checkedAt: now.toISOString(),
      fetch: fixtureFetch(googleCivicMatchedFixture),
      signal: new AbortController().signal,
    });
    const censusOutcome = await lookupCensus(
      { kind: "address", address: censusFixtureAddress },
      {
        checkedAt: now.toISOString(),
        fetch: fixtureFetch(censusAddressResponse),
        signal: new AbortController().signal,
      },
    );
    if (googleOutcome.status !== "matched" || censusOutcome.status !== "partial") {
      throw new Error("Provider fixtures did not produce resolved outcomes.");
    }

    const googleNames = new Map(
      googleOutcome.divisions.map((division) => [division.type, division.name]),
    );
    const agreement = {
      ...censusOutcome,
      divisions: censusOutcome.divisions.map((division) => ({
        ...division,
        name: googleNames.get(division.type) ?? division.name,
      })),
    };
    const disagreement = {
      ...agreement,
      divisions: agreement.divisions.map((division) =>
        division.type === "county"
          ? { ...division, name: "Different Synthetic County" }
          : division,
      ),
    };

    expect(sharedNamesMatch(googleOutcome, agreement)).toBe(true);
    expect(sharedNamesMatch(googleOutcome, disagreement)).toBe(false);
    for (const fallback of [agreement, disagreement]) {
      const google = vi.fn(async () => ({ status: "no_match" }) as const);
      const census = vi.fn(async () => fallback);
      await expect(
        resolveResidence(addressInput, { google, census, now: () => now }),
      ).resolves.toEqual(fallback);
    }
  });
});

function outcomeOnAbort(signal: AbortSignal) {
  return new Promise<ProviderOutcome>((resolve) => {
    signal.addEventListener(
      "abort",
      () => resolve({ status: "unavailable", reason: "timeout" }),
      { once: true },
    );
  });
}

function fixtureFetch(body: unknown) {
  return vi.fn<typeof globalThis.fetch>(async () =>
    new Response(JSON.stringify(body), {
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

function sharedNamesMatch(
  left: Extract<ProviderOutcome, { status: "matched" | "partial" }>,
  right: Extract<ProviderOutcome, { status: "matched" | "partial" }>,
) {
  const rightNames = new Map(
    right.divisions.map((division) => [division.type, division.name]),
  );
  return left.divisions
    .filter((division) => rightNames.has(division.type))
    .every((division) => rightNames.get(division.type) === division.name);
}

function encodeNested(value: string, passes: number) {
  let encoded = value;
  for (let pass = 0; pass < passes; pass += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
}

function signResolutionPayload(payload: unknown) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signingInput = `v1.${encodedPayload}`;
  const purposeKey = Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.alloc(0),
      "voteGPT/residence-resolution/v1",
      32,
    ),
  );
  const signature = createHmac("sha256", purposeKey)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}
