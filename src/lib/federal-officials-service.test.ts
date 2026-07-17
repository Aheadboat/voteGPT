import { readFileSync } from "node:fs";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createFederalOfficialsService,
  type FederalOfficialCacheKey,
  type FederalOfficialCacheRecord,
  type FederalOfficialCacheRepository,
  type FederalOfficialProfileResult,
  type FederalOfficialsServiceResult,
  type FederalProfileCachePayload,
  type FederalRosterReplacement,
  type FederalRosterCachePayload,
  type FederalRosterWriteResult,
} from "./federal-officials-service";
import {
  reconcileFederalOfficials,
  type CongressRosterOutcome,
  type FederalJurisdiction,
  type FederalOfficialsRoster,
  type FederalSeat,
  type HouseVacancyOutcome,
  type SourceRef,
} from "./federal-officials";

// RED: this suite must first fail because the F5 cache/service module is absent.
// The service receives normalized jurisdiction only; exact residence and identity
// data never enter this boundary.

const HOUR = 60 * 60 * 1_000;
const NOW = new Date("2026-07-16T12:00:00.000Z");
const API_KEY = "server-only-congress-key-sentinel";

const jurisdiction: FederalJurisdiction = {
  stateCode: "GA",
  district: 13,
  divisionIds: [
    "ocd-division/country:us/state:ga",
    "ocd-division/country:us/state:ga/cd:13",
  ],
};

const memberSource: SourceRef = {
  publisher: "Congress.gov",
  sourceType: "member",
  url: "https://api.congress.gov/v3/member/H000001?format=json",
  retrievedAt: NOW.toISOString(),
  recordUpdatedAt: "2026-07-15T09:30:00.000Z",
  effectiveAt: null,
};

const clerkSource: SourceRef = {
  publisher: "Office of the Clerk, U.S. House of Representatives",
  sourceType: "vacancy",
  url: "https://clerk.house.gov/Members/ViewVacancies",
  retrievedAt: NOW.toISOString(),
  recordUpdatedAt: null,
  effectiveAt: null,
};

describe("federal official cache service", () => {
  it("freezes method parameters, results, cache DTOs, and the narrow environment", () => {
    const cache = memoryCache();
    const { service } = serviceHarness(cache.repository);
    type ServiceOptions = Parameters<typeof createFederalOfficialsService>[0];

    expectTypeOf(service.getOfficials).parameters.toEqualTypeOf<
      [FederalJurisdiction]
    >();
    expectTypeOf(service.getOfficials).returns.toEqualTypeOf<
      Promise<FederalOfficialsServiceResult>
    >();
    expectTypeOf(service.getProfile).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(service.getProfile).returns.toEqualTypeOf<
      Promise<FederalOfficialProfileResult>
    >();
    expectTypeOf<FederalOfficialCacheRepository["read"]>().parameters.toEqualTypeOf<
      [FederalOfficialCacheKey]
    >();
    expectTypeOf<
      FederalOfficialCacheRepository["replaceRoster"]
    >().parameters.toEqualTypeOf<[FederalRosterReplacement]>();
    expectTypeOf<
      FederalOfficialCacheRepository["replaceRoster"]
    >().returns.toEqualTypeOf<Promise<FederalRosterWriteResult>>();
    expectTypeOf<FederalOfficialCacheKey>().toEqualTypeOf<
      `roster:v1:${string}:${string}` | `profile:v2:${string}`
    >();
    expectTypeOf<FederalRosterWriteResult>().toEqualTypeOf<
      | Readonly<{ status: "written" }>
      | Readonly<{ status: "ignored"; reason: "older_generation" }>
    >();
    expectTypeOf<ServiceOptions["environment"]>().toEqualTypeOf<
      Readonly<{ CONGRESS_GOV_API_KEY?: string }>
    >();
    expectTypeOf<FederalRosterCachePayload>().toEqualTypeOf<FederalOfficialsRoster>();
    expectTypeOf<FederalProfileCachePayload>().toEqualTypeOf<
      ReturnType<typeof profileFor>
    >();
  });

  it("declares one value-free server-only Congress credential", () => {
    const declarations = readFileSync(".env.example", "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("CONGRESS_GOV_API_KEY="));

    expect(declarations).toEqual(["CONGRESS_GOV_API_KEY="]);
    expect(readFileSync(".env.example", "utf8")).not.toMatch(
      /^NEXT_PUBLIC_CONGRESS_GOV_API_KEY=/mu,
    );
  });

  it.each([
    [
      {
        ...jurisdiction,
        district: 3,
        divisionIds: [
          "ocd-division/country:us/state:ga",
          "ocd-division/country:us/state:ga/cd:3",
        ],
      },
      "roster:v1:GA:03",
    ],
    [
      {
        stateCode: "AK",
        district: 0,
        divisionIds: ["02", "0200"],
      } satisfies FederalJurisdiction,
      "roster:v1:AK:AL",
    ],
  ])("uses only the canonical public roster key and serves <24h data without providers", async (selected, key) => {
    const retrievedAt = new Date(NOW.getTime() - HOUR);
    const roster = verifiedRoster(selected, "H000001", retrievedAt);
    const cache = memoryCache([
      cacheRecord(key, roster, retrievedAt),
    ]);
    const harness = serviceHarness(cache.repository);

    const result = await harness.service.getOfficials(selected);

    expect(result).toEqual({
      status: "available",
      view: {
        ...roster,
        freshness: {
          checkedAt: "2026-07-16T11:00:00.000Z",
          refreshAfter: "2026-07-17T11:00:00.000Z",
          staleAfter: "2026-07-19T11:00:00.000Z",
          state: "fresh",
        },
      },
    });
    expect(cache.reads).toEqual([key]);
    expect(cache.replacements).toEqual([]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it.each([
    [24 * HOUR - 1, "fresh", "available", 0],
    [24 * HOUR, "stale", "available", 1],
    [72 * HOUR - 1, "stale", "available", 1],
    [72 * HOUR, null, "unavailable", 1],
  ] as const)(
    "attempts one refresh at age %i and applies the 24h/72h fail-closed boundary",
    async (age, freshnessState, status, expectedRefreshes) => {
      const retrievedAt = new Date(NOW.getTime() - age);
      const cache = memoryCache([
        cacheRecord(
          "roster:v1:GA:13",
          verifiedRoster(jurisdiction, "H000001", retrievedAt),
          retrievedAt,
        ),
      ]);
      const harness = serviceHarness(cache.repository, {
        congress: { status: "unavailable", reason: "timeout" },
      });

      const result = await harness.service.getOfficials(jurisdiction);

      expect(result.status).toBe(status);
      if (result.status === "available") {
        expect(result.view.freshness.state).toBe(freshnessState);
      } else {
        expect(result).toEqual({ status: "unavailable" });
      }
      expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(
        expectedRefreshes,
      );
      expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
      expect(cache.replacements).toEqual([]);
    },
  );

  it("fills a cold cache with a fresh roster and all three verified profiles", async () => {
    const house = servingSeat("house", "H000001", 13, jurisdiction);
    const senators = [
      servingSeat("senate", "S000001", null, jurisdiction),
      servingSeat("senate", "S000002", null, jurisdiction),
    ];
    const congress = availableCongress([house], senators);
    const clerk = availableClerk();
    const roster = reconcileFederalOfficials(jurisdiction, congress, clerk);
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository, { clerk, congress });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "available",
      view: {
        ...roster,
        freshness: {
          checkedAt: NOW.toISOString(),
          refreshAfter: "2026-07-17T12:00:00.000Z",
          staleAfter: "2026-07-19T12:00:00.000Z",
          state: "fresh",
        },
      },
    });
    expect(harness.fetchCurrentHouseVacancies).toHaveBeenCalledWith(
      119,
      expect.objectContaining({
        fetch: expect.any(Function),
        now: expect.any(Function),
      }),
    );
    expect(harness.fetchCongressRoster).toHaveBeenCalledWith(
      jurisdiction,
      expect.objectContaining({ apiKey: API_KEY }),
    );
    expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(1);
    expect(harness.fetchCurrentHouseVacancies).toHaveBeenCalledTimes(1);
    expect(cache.replacements).toHaveLength(1);
    const replacement = cache.replacements[0];
    expect(replacement.roster.cacheKey).toBe("roster:v1:GA:13");
    expect(replacement.profiles.map(({ cacheKey }) => cacheKey)).toEqual([
      "profile:v2:H000001",
      "profile:v2:S000001",
      "profile:v2:S000002",
    ]);
    expect(JSON.stringify(replacement)).not.toContain(API_KEY);
    expect(JSON.stringify(replacement)).not.toMatch(
      /"(?:address|latitude|longitude|userId|session|credential|rawProviderError)"/i,
    );
  });

  it("ignores known unsupported-jurisdiction Clerk vacancies during a supported-state refresh", async () => {
    const house = servingSeat("house", "H000001", 13, jurisdiction);
    const senators = [
      servingSeat("senate", "S000001", null, jurisdiction),
      servingSeat("senate", "S000002", null, jurisdiction),
    ];
    const congress = availableCongress([house], senators);
    const clerk = availableClerk(
      (["AS", "DC", "GU", "MP", "PR", "VI"] as const).map(
        (stateCode) => ({
          stateCode,
          district: 0,
          source: {
            ...clerkSource,
            url: `https://clerk.house.gov/members/${stateCode}00/vacancy`,
          },
        }),
      ),
    );
    const expectedRoster = reconcileFederalOfficials(
      jurisdiction,
      congress,
      clerk,
    );
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository, { clerk, congress });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "available",
      view: {
        ...expectedRoster,
        freshness: {
          checkedAt: NOW.toISOString(),
          refreshAfter: "2026-07-17T12:00:00.000Z",
          staleAfter: "2026-07-19T12:00:00.000Z",
          state: "fresh",
        },
      },
    });
    expect(expectedRoster.coverage).toEqual({
      house: "verified",
      senate: "verified",
    });
    expect(cache.replacements).toHaveLength(1);
    expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(1);
    expect(harness.fetchCurrentHouseVacancies).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Clerk vacancy evidence contains an unknown jurisdiction", async () => {
    const house = servingSeat("house", "H000001", 13, jurisdiction);
    const senators = [
      servingSeat("senate", "S000001", null, jurisdiction),
      servingSeat("senate", "S000002", null, jurisdiction),
    ];
    const congress = availableCongress([house], senators);
    const clerk = availableClerk([
      {
        stateCode: "ZZ",
        district: 0,
        source: {
          ...clerkSource,
          url: "https://clerk.house.gov/members/ZZ00/vacancy",
        },
      },
    ]);
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository, { clerk, congress });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "unavailable",
    });
    expect(cache.replacements).toEqual([]);
    expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(1);
    expect(harness.fetchCurrentHouseVacancies).toHaveBeenCalledTimes(1);
  });

  it("rereads the newer roster after an older refresh loses the write race", async () => {
    const expiredAt = new Date(NOW.getTime() - 72 * HOUR);
    const newerAt = new Date(NOW.getTime() + HOUR);
    const newerRoster = verifiedRoster(jurisdiction, "N000001", newerAt);
    const newerRecord = cacheRecord(
      "roster:v1:GA:13",
      newerRoster,
      newerAt,
    );
    let stored = cacheRecord(
      "roster:v1:GA:13",
      verifiedRoster(jurisdiction, "O000001", expiredAt),
      expiredAt,
    );
    const repository: FederalOfficialCacheRepository = {
      read: vi.fn(async () => stored),
      replaceRoster: vi.fn(async () => {
        stored = newerRecord;
        return { status: "ignored", reason: "older_generation" } as const;
      }),
    };
    let initialClockRead = true;
    let postRaceClockReads = 0;
    const now = vi.fn(() => {
      if (initialClockRead) {
        initialClockRead = false;
        return new Date(NOW);
      }
      postRaceClockReads += 1;
      return new Date(NOW.getTime() + 2 * HOUR);
    });
    const harness = serviceHarness(repository, { now });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "available",
      view: {
        ...newerRoster,
        freshness: freshnessFor(newerRecord, "fresh"),
      },
    });
    expect(repository.read).toHaveBeenCalledTimes(2);
    expect(repository.replaceRoster).toHaveBeenCalledTimes(1);
    expect(postRaceClockReads).toBeGreaterThan(0);
  });

  it("reads the winning generation before capturing its validation clock", async () => {
    const expiredAt = new Date(NOW.getTime() - 72 * HOUR);
    const newerAt = new Date(NOW.getTime() + 2 * HOUR);
    const newerRoster = verifiedRoster(jurisdiction, "N000001", newerAt);
    const newerRecord = cacheRecord(
      "roster:v1:GA:13",
      newerRoster,
      newerAt,
    );
    const expiredRecord = cacheRecord(
      "roster:v1:GA:13",
      verifiedRoster(jurisdiction, "O000001", expiredAt),
      expiredAt,
    );
    let reads = 0;
    let rereadComplete = false;
    const repository: FederalOfficialCacheRepository = {
      read: vi.fn(async () => {
        reads += 1;
        if (reads === 1) {
          return expiredRecord;
        }
        rereadComplete = true;
        return newerRecord;
      }),
      replaceRoster: vi.fn(async () => ({
        status: "ignored",
        reason: "older_generation",
      }) as const),
    };
    const now = vi.fn(() =>
      rereadComplete
        ? new Date(NOW.getTime() + 3 * HOUR)
        : new Date(NOW),
    );
    const harness = serviceHarness(repository, { now });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "available",
      view: {
        ...newerRoster,
        freshness: freshnessFor(newerRecord, "fresh"),
      },
    });
    expect(repository.read).toHaveBeenCalledTimes(2);
    expect(repository.replaceRoster).toHaveBeenCalledTimes(1);
    expect(rereadComplete).toBe(true);
  });

  it("excludes a Clerk-conflicted House member from refreshed profiles", async () => {
    const retrievedAt = new Date(NOW.getTime() - 24 * HOUR);
    const oldRoster = verifiedRoster(jurisdiction, "O000001", retrievedAt);
    const cache = memoryCache([
      cacheRecord("roster:v1:GA:13", oldRoster, retrievedAt),
    ]);
    const house = servingSeat("house", "H000001", 13, jurisdiction);
    const senators = [
      servingSeat("senate", "S000001", null, jurisdiction),
      servingSeat("senate", "S000002", null, jurisdiction),
    ];
    const harness = serviceHarness(cache.repository, {
      clerk: availableClerk([
        {
          stateCode: "GA",
          district: 13,
          source: {
            ...clerkSource,
            url: "https://clerk.house.gov/members/GA13/vacancy",
          },
        },
      ]),
      congress: availableCongress([house], senators),
    });

    const result = await harness.service.getOfficials(jurisdiction);

    expect(result).toMatchObject({
      status: "available",
      view: { house: { status: "conflict" } },
    });
    const replacement = cache.replacements[0];
    expect(replacement.profiles.map(({ cacheKey }) => cacheKey).sort()).toEqual([
      "profile:v2:S000001",
      "profile:v2:S000002",
    ]);
  });

  it.each([
    ["current-Congress identity", "currentCongress"],
    ["selected House term start year", "houseStartYear"],
    ["selected Senate term start year", "senateStartYear"],
  ] as const)("rejects unsafe provider %s before cache publication", async (_label, target) => {
    type ServingSeat = Extract<FederalSeat, { status: "serving" }>;
    const unsafeInteger = 1e100;
    const withTerm = (
      seat: ServingSeat,
      term: Partial<ServingSeat["term"]>,
    ): ServingSeat => ({
      ...seat,
      term: { ...seat.term, ...term },
    });
    let currentCongress = 119;
    let clerkCurrentCongress = 119;
    let house = servingSeat("house", "H000001", 13, jurisdiction);
    let senators: [ServingSeat, ServingSeat] = [
      servingSeat("senate", "S000001", null, jurisdiction),
      servingSeat("senate", "S000002", null, jurisdiction),
    ];

    if (target === "currentCongress") {
      currentCongress = unsafeInteger;
      clerkCurrentCongress = unsafeInteger;
      house = withTerm(house, { congress: unsafeInteger });
      senators = [
        withTerm(senators[0], { congress: unsafeInteger }),
        withTerm(senators[1], { congress: unsafeInteger }),
      ];
    } else if (target === "houseStartYear") {
      house = withTerm(house, { startYear: unsafeInteger, endYear: null });
    } else {
      senators = [
        withTerm(senators[0], { startYear: unsafeInteger, endYear: null }),
        senators[1],
      ];
    }

    const cache = memoryCache();
    const harness = serviceHarness(cache.repository, {
      congress: {
        ...availableCongress([house], senators),
        currentCongress,
      },
      clerk: { ...availableClerk(), currentCongress: clerkCurrentCongress },
    });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "unavailable",
    });
    expect(cache.replacements).toEqual([]);
  });

  it.each([
    [
      "future retrieval",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        retrievedAt: new Date(NOW.getTime() + HOUR),
      }),
    ],
    [
      "non-finite time",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        retrievedAt: new Date(Number.NaN),
      }),
    ],
    [
      "inverted times",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        refreshAfter: valid.staleAfter,
        staleAfter: valid.refreshAfter,
      }),
    ],
    [
      "noncanonical freshness offsets",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        refreshAfter: new Date(valid.retrievedAt.getTime() + 23 * HOUR),
      }),
    ],
    [
      "noncanonical stale-after offset",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        staleAfter: new Date(valid.retrievedAt.getTime() + 71 * HOUR),
      }),
    ],
    [
      "wrong key version",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        cacheKey: "roster:v2:GA:13",
      }),
    ],
    [
      "key suffix",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        cacheKey: "roster:v1:GA:13:extra",
      }),
    ],
    [
      "user-keyed cache",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        cacheKey: "roster:v1:user:session-123",
      }),
    ],
    [
      "valid-format wrong binding key",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        cacheKey: "roster:v1:GA:12",
      }),
    ],
    [
      "null roster payload",
      (valid: FederalOfficialCacheRecord) => ({ ...valid, payload: null }),
    ],
    [
      "schema-invalid roster",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        payload: {
          ...rosterPayload(valid),
          jurisdiction: { ...jurisdiction, stateCode: "CA" },
        },
      }),
    ],
    [
      "deep private extra field",
      (valid: FederalOfficialCacheRecord) =>
        mutateCachedHouse(valid, (house) => ({
          ...house,
          person: { ...house.person, address: "private-address-sentinel" },
        })),
    ],
    [
      "term and person mismatch",
      (valid: FederalOfficialCacheRecord) =>
        mutateCachedHouse(valid, (house) => ({
          ...house,
          term: { ...house.term, personId: "bioguide:X000001" },
        })),
    ],
    [
      "term and office mismatch",
      (valid: FederalOfficialCacheRecord) =>
        mutateCachedHouse(valid, (house) => ({
          ...house,
          term: { ...house.term, officeId: "federal:house:GA:12" },
        })),
    ],
  ] as const)("rejects %s cache data instead of serving it", async (_label, mutate) => {
    const retrievedAt = new Date(NOW.getTime() - HOUR);
    const valid = cacheRecord(
      "roster:v1:GA:13",
      verifiedRoster(jurisdiction, "H000001", retrievedAt),
      retrievedAt,
    );
    const cache = memoryCache([valid]);
    cache.records.set("roster:v1:GA:13", mutate(valid));
    const harness = serviceHarness(cache.repository, {
      congress: { status: "unavailable", reason: "provider_error" },
    });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "unavailable",
    });
    expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(1);
    expect(cache.replacements).toEqual([]);
  });

  it.each(houseEvidenceCases(new Date(NOW.getTime() - HOUR)))(
    "rejects cached House evidence when %s",
    async (_label, roster) => {
      const cache = memoryCache([
        cacheRecord("roster:v1:GA:13", roster, new Date(NOW.getTime() - HOUR)),
      ]);
      const harness = serviceHarness(cache.repository, {
        environment: { CONGRESS_GOV_API_KEY: "" },
      });

      expect(await harness.service.getOfficials(jurisdiction)).toEqual({
        status: "unavailable",
      });
      expect(cache.reads).toEqual(["roster:v1:GA:13"]);
      expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
      expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
    },
  );

  it("rejects unsupported jurisdictions before cache or provider work", async () => {
    const unsupported: FederalJurisdiction = {
      stateCode: "DC",
      district: 0,
      divisionIds: [
        "ocd-division/country:us/state:dc",
        "ocd-division/country:us/state:dc/cd:0",
      ],
    };
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository);

    expect(await harness.service.getOfficials(unsupported)).toEqual({
      status: "unavailable",
    });
    expect(cache.reads).toEqual([]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it("does not accept 00 in place of the at-large AL cache suffix", async () => {
    const atLarge: FederalJurisdiction = {
      stateCode: "AK",
      district: 0,
      divisionIds: ["02", "0200"],
    };
    const retrievedAt = new Date(NOW.getTime() - HOUR);
    const valid = cacheRecord(
      "roster:v1:AK:AL",
      verifiedRoster(atLarge, "H000001", retrievedAt),
      retrievedAt,
    );
    const cache = memoryCache([valid]);
    cache.records.set("roster:v1:AK:AL", {
      ...valid,
      cacheKey: "roster:v1:AK:00",
    });
    const harness = serviceHarness(cache.repository, {
      environment: { CONGRESS_GOV_API_KEY: "" },
    });

    expect(await harness.service.getOfficials(atLarge)).toEqual({
      status: "unavailable",
    });
    expect(cache.reads).toEqual(["roster:v1:AK:AL"]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
  });

  it.each([
    [HOUR, "available", "fresh"],
    [24 * HOUR, "available", "stale"],
    [72 * HOUR, "unavailable", null],
  ] as const)(
    "with a blank credential serves a validated age %i cache only below expiry",
    async (age, status, freshnessState) => {
      const retrievedAt = new Date(NOW.getTime() - age);
      const cache = memoryCache([
        cacheRecord(
          "roster:v1:GA:13",
          verifiedRoster(jurisdiction, "H000001", retrievedAt),
          retrievedAt,
        ),
      ]);
      const harness = serviceHarness(cache.repository, {
        environment: { CONGRESS_GOV_API_KEY: "" },
      });

      const result = await harness.service.getOfficials(jurisdiction);

      expect(result.status).toBe(status);
      if (result.status === "available") {
        expect(result.view.freshness.state).toBe(freshnessState);
      } else {
        expect(result).toEqual({ status: "unavailable" });
      }
      expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
      expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
      expect(cache.replacements).toEqual([]);
    },
  );

  it("returns missing for an absent profile row without provider work", async () => {
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository);

    expect(await harness.service.getProfile("H000001")).toEqual({
      status: "missing",
    });
    expect(cache.reads).toEqual(["profile:v2:H000001"]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it("returns unavailable when profile cache access fails without provider work", async () => {
    const repository: FederalOfficialCacheRepository = {
      read: vi.fn(async () => {
        throw new Error("synthetic profile cache outage");
      }),
      replaceRoster: vi.fn(async () => ({ status: "written" }) as const),
    };
    const harness = serviceHarness(repository);

    expect(await harness.service.getProfile("H000001")).toEqual({
      status: "unavailable",
    });
    expect(repository.read).toHaveBeenCalledWith("profile:v2:H000001");
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it("returns unavailable for an invalid profile ID before cache or provider work", async () => {
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository);

    expect(await harness.service.getProfile("h000001")).toEqual({
      status: "unavailable",
    });
    expect(cache.reads).toEqual([]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });

  it.each([
    [HOUR, "fresh"],
    [24 * HOUR, "stale"],
    [72 * HOUR, "expired"],
    [73 * HOUR, "expired"],
  ] as const)(
    "serves a runtime-valid profile at age %i with %s freshness and zero providers",
    async (age, state) => {
      const fixture = profileFixture("H000001", age);
      const cache = memoryCache([fixture.record]);
      const harness = serviceHarness(cache.repository);

      expect(await harness.service.getProfile("H000001")).toEqual({
        status: "available",
        profile: {
          ...fixture.payload,
          freshness: freshnessFor(fixture.record, state),
        },
      });
      expect(cache.reads).toEqual(["profile:v2:H000001"]);
      expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
      expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
    },
  );

  it.each(invalidProfileCases())(
    "returns unavailable for %s profile cache data without provider work",
    async (_label, record) => {
      const cache = memoryCache();
      cache.records.set("profile:v2:H000001", record);
      const harness = serviceHarness(cache.repository);

      expect(await harness.service.getProfile("H000001")).toEqual({
        status: "unavailable",
      });
      expect(cache.reads).toEqual(["profile:v2:H000001"]);
      expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
      expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
    },
  );
});

function serviceHarness(
  repository: FederalOfficialCacheRepository,
  options: {
    congress?: CongressRosterOutcome;
    clerk?: HouseVacancyOutcome;
    environment?: Readonly<{ CONGRESS_GOV_API_KEY?: string }>;
    now?: () => Date;
  } = {},
) {
  const fetchCongressRoster = vi.fn(async () =>
    options.congress ?? availableCongress([], []),
  );
  const fetchCurrentHouseVacancies = vi.fn(async () =>
    options.clerk ?? availableClerk(),
  );
  return {
    fetchCongressRoster,
    fetchCurrentHouseVacancies,
    service: createFederalOfficialsService({
      cache: repository,
      environment: options.environment ?? { CONGRESS_GOV_API_KEY: API_KEY },
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
      fetchCongressRoster,
      fetchCurrentHouseVacancies,
      now: options.now ?? (() => new Date(NOW)),
    }),
  };
}

function memoryCache(initial: readonly FederalOfficialCacheRecord[] = []) {
  const records = new Map(initial.map((record) => [record.cacheKey, record]));
  const reads: string[] = [];
  const replacements: FederalRosterReplacement[] = [];
  const repository: FederalOfficialCacheRepository = {
    async read(cacheKey) {
      reads.push(cacheKey);
      return records.get(cacheKey) ?? null;
    },
    async replaceRoster(replacement) {
      replacements.push(replacement);
      records.set(replacement.roster.cacheKey, replacement.roster);
      for (const profile of replacement.profiles) {
        records.set(profile.cacheKey, profile);
      }
      return { status: "written" } as const;
    },
  };
  return { reads, records, replacements, repository };
}

function cacheRecord(
  cacheKey: string,
  payload: unknown,
  retrievedAt: Date,
): FederalOfficialCacheRecord {
  return {
    cacheKey,
    payload,
    retrievedAt,
    refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR),
    staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR),
  };
}

function verifiedRoster(
  selected: FederalJurisdiction,
  houseId = "H000001",
  retrievedAt = NOW,
): FederalOfficialsRoster {
  return reconcileFederalOfficials(
    selected,
    availableCongress(
      [servingSeat("house", houseId, selected.district, selected, retrievedAt)],
      [
        servingSeat("senate", "S000001", null, selected, retrievedAt),
        servingSeat("senate", "S000002", null, selected, retrievedAt),
      ],
    ),
    availableClerk([], retrievedAt),
  );
}

function houseEvidenceCases(
  retrievedAt: Date,
): ReadonlyArray<readonly [string, FederalOfficialsRoster]> {
  const senators = [
    servingSeat("senate", "S000001", null, jurisdiction, retrievedAt),
    servingSeat("senate", "S000002", null, jurisdiction, retrievedAt),
  ];
  const serving = verifiedRoster(jurisdiction, "H000001", retrievedAt);
  const vacant = reconcileFederalOfficials(
    jurisdiction,
    availableCongress([], senators),
    availableClerk(
      [
        {
          stateCode: "GA",
          district: 13,
          source: {
            ...clerkSource,
            retrievedAt: retrievedAt.toISOString(),
            url: "https://clerk.house.gov/members/GA13/vacancy",
          },
        },
      ],
      retrievedAt,
    ),
  );
  if (serving.house.status !== "serving" || vacant.house.status !== "vacant") {
    throw new Error("test fixtures require serving and vacant House seats");
  }
  const memberOnly = serving.house.sources.filter(
    ({ sourceType }) => sourceType === "member",
  );
  const clerkListOnly = vacant.house.sources.filter(
    ({ url }) => url === "https://clerk.house.gov/Members/ViewVacancies",
  );
  const districtClerkOnly = vacant.house.sources.filter(
    ({ url }) => url === "https://clerk.house.gov/members/GA13/vacancy",
  );

  return [
    [
      "a vacant seat has no Clerk evidence",
      { ...vacant, house: { ...vacant.house, sources: [] } },
    ],
    [
      "a vacant seat lacks district-specific Clerk evidence",
      { ...vacant, house: { ...vacant.house, sources: clerkListOnly } },
    ],
    [
      "a conflict has only member evidence",
      {
        ...serving,
        house: { ...serving.house, status: "conflict", sources: memberOnly },
        coverage: { ...serving.coverage, house: "partial" },
      },
    ],
    [
      "verified serving lacks the Clerk current-list source",
      { ...serving, house: { ...serving.house, sources: memberOnly } },
    ],
    [
      "a partial serving seat includes the Clerk current-list source",
      {
        ...serving,
        coverage: { ...serving.coverage, house: "partial" },
      },
    ],
    [
      "a verified serving seat includes district vacancy evidence",
      {
        ...serving,
        house: {
          ...serving.house,
          sources: [...serving.house.sources, ...districtClerkOnly],
        },
      },
    ],
    [
      "an unknown seat includes district vacancy evidence",
      {
        ...vacant,
        house: {
          status: "unknown",
          office: vacant.house.office,
          sources: districtClerkOnly,
        },
        coverage: { ...vacant.coverage, house: "unknown" },
      },
    ],
  ];
}

function servingSeat(
  chamber: "house" | "senate",
  bioguideId: string,
  district: number | null,
  selected: FederalJurisdiction,
  retrievedAt = NOW,
): Extract<FederalSeat, { status: "serving" }> {
  const officeId = `federal:${chamber}:${selected.stateCode}:${district ?? bioguideId}`;
  const personId = `bioguide:${bioguideId}` as const;
  return {
    status: "serving",
    office: {
      id: officeId,
      chamber,
      stateCode: selected.stateCode,
      district,
      title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
    },
    person: { id: personId, bioguideId, name: `Official ${bioguideId}` },
    term: {
      officeId,
      personId,
      congress: 119,
      startYear: 2025,
      endYear: 2027,
      status: "serving",
    },
    sources: [
      {
        ...memberSource,
        retrievedAt: retrievedAt.toISOString(),
        recordUpdatedAt: new Date(retrievedAt.getTime() - HOUR).toISOString(),
        url: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
      },
    ],
  };
}

function profileFor(seat: Extract<FederalSeat, { status: "serving" }>) {
  return {
    person: seat.person,
    office: seat.office,
    term: seat.term,
    sources: seat.sources,
  };
}

function profileFixture(bioguideId: string, age: number) {
  const retrievedAt = new Date(NOW.getTime() - age);
  const seat = servingSeat(
    "house",
    bioguideId,
    13,
    jurisdiction,
    retrievedAt,
  );
  const payload: FederalProfileCachePayload = profileFor(seat);
  return {
    payload,
    record: cacheRecord(
      `profile:v2:${bioguideId}`,
      payload,
      retrievedAt,
    ),
  };
}

function profileRecord(
  fixture: ReturnType<typeof profileFixture>,
  payload: unknown,
): FederalOfficialCacheRecord {
  return { ...fixture.record, payload };
}

function invalidProfileCases() {
  const fresh = profileFixture("H000001", HOUR);
  const unsupportedOffice = {
    ...fresh.payload.office,
    id: "federal:house:ZZ:13",
    stateCode: "ZZ",
  };
  return [
    [
      "private extra field",
      profileRecord(fresh, {
        ...fresh.payload,
        person: { ...fresh.payload.person, address: "private-address-sentinel" },
      }),
    ],
    ["corrupt payload", { ...fresh.record, payload: null }],
    [
      "member link mismatch",
      profileRecord(fresh, {
        ...fresh.payload,
        sources: [
          {
            ...fresh.payload.sources[0],
            url: "https://api.congress.gov/v3/member/X000001?format=json",
          },
        ],
      }),
    ],
    [
      "source contract mismatch",
      profileRecord(fresh, { ...fresh.payload, sources: [clerkSource] }),
    ],
    [
      "member plus matching district-vacancy source",
      profileRecord(fresh, {
        ...fresh.payload,
        sources: [
          fresh.payload.sources[0],
          {
            ...clerkSource,
            retrievedAt: fresh.record.retrievedAt.toISOString(),
            url: "https://clerk.house.gov/members/GA13/vacancy",
          },
        ],
      }),
    ],
    [
      "unsafe integer term congress",
      profileRecord(fresh, {
        ...fresh.payload,
        term: { ...fresh.payload.term, congress: 1e100 },
      }),
    ],
    [
      "unsafe integer term start year",
      profileRecord(fresh, {
        ...fresh.payload,
        term: { ...fresh.payload.term, startYear: 1e100, endYear: null },
      }),
    ],
    [
      "source time after cache retrieval",
      profileRecord(fresh, {
        ...fresh.payload,
        sources: [
          {
            ...fresh.payload.sources[0],
            retrievedAt: new Date(NOW.getTime() + 1).toISOString(),
          },
        ],
      }),
    ],
    [
      "lowercase profile cache key",
      { ...fresh.record, cacheKey: "profile:v2:h000001" },
    ],
    [
      "valid-format wrong key and person binding",
      { ...fresh.record, cacheKey: "profile:v2:X000001" },
    ],
    [
      "term and person mismatch",
      profileRecord(fresh, {
        ...fresh.payload,
        term: { ...fresh.payload.term, personId: "bioguide:X000001" },
      }),
    ],
    [
      "term and office mismatch",
      profileRecord(fresh, {
        ...fresh.payload,
        term: { ...fresh.payload.term, officeId: "federal:house:GA:12" },
      }),
    ],
    [
      "internally matching but unsupported state",
      profileRecord(fresh, {
        ...fresh.payload,
        office: unsupportedOffice,
        term: { ...fresh.payload.term, officeId: unsupportedOffice.id },
      }),
    ],
  ] satisfies ReadonlyArray<readonly [string, FederalOfficialCacheRecord]>;
}

function freshnessFor(
  record: FederalOfficialCacheRecord,
  state: "fresh" | "stale" | "expired",
) {
  return {
    checkedAt: record.retrievedAt.toISOString(),
    refreshAfter: record.refreshAfter.toISOString(),
    staleAfter: record.staleAfter.toISOString(),
    state,
  };
}

function mutateCachedHouse(
  record: FederalOfficialCacheRecord,
  mutate: (
    house: Extract<FederalSeat, { status: "serving" }>,
  ) => unknown,
): FederalOfficialCacheRecord {
  const roster = rosterPayload(record);
  if (roster.house.status !== "serving") {
    throw new Error("test fixture House seat must be serving");
  }
  return {
    ...record,
    payload: { ...roster, house: mutate(roster.house) },
  };
}

function rosterPayload(record: FederalOfficialCacheRecord) {
  return record.payload as FederalOfficialsRoster;
}

function availableCongress(
  house: readonly FederalSeat[],
  senate: readonly FederalSeat[],
): CongressRosterOutcome {
  return { status: "available", currentCongress: 119, house, senate };
}

function availableClerk(
  vacancies: Extract<
    HouseVacancyOutcome,
    { status: "available" }
  >["vacancies"] = [],
  retrievedAt = NOW,
): HouseVacancyOutcome {
  return {
    status: "available",
    currentCongress: 119,
    source: { ...clerkSource, retrievedAt: retrievedAt.toISOString() },
    vacancies,
  };
}
