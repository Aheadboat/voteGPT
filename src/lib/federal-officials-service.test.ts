import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createFederalOfficialsService,
  type FederalOfficialCacheRecord,
  type FederalOfficialCacheRepository,
  type FederalOfficialProfileResult,
  type FederalOfficialsServiceResult,
  type FederalProfileCachePayload,
  type FederalRosterReplacement,
  type FederalRosterCachePayload,
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
  it("freezes the roster/profile result and public cache payload DTOs", () => {
    const cache = memoryCache();
    const { service } = serviceHarness(cache.repository);

    expectTypeOf(service.getOfficials).returns.toEqualTypeOf<
      Promise<FederalOfficialsServiceResult>
    >();
    expectTypeOf(service.getProfile).returns.toEqualTypeOf<
      Promise<FederalOfficialProfileResult>
    >();
    expectTypeOf<FederalRosterCachePayload>().toEqualTypeOf<FederalOfficialsRoster>();
    expectTypeOf<FederalProfileCachePayload>().toEqualTypeOf<
      ReturnType<typeof profileFor>
    >();
  });

  it.each([
    [{ ...jurisdiction, district: 3 }, "roster:v1:GA:03"],
    [
      {
        stateCode: "AK",
        district: 0,
        divisionIds: ["02", "0200"],
      } satisfies FederalJurisdiction,
      "roster:v1:AK:AL",
    ],
  ])("uses only the canonical public roster key and serves <24h data without providers", async (selected, key) => {
    const roster = verifiedRoster(selected);
    const cache = memoryCache([
      cacheRecord(key, roster, new Date(NOW.getTime() - HOUR)),
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
      const cache = memoryCache([
        cacheRecord(
          "roster:v1:GA:13",
          verifiedRoster(jurisdiction),
          new Date(NOW.getTime() - age),
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

  it("refreshes stale data once, writes a fresh roster and only its verified current profiles", async () => {
    const oldRoster = verifiedRoster(jurisdiction, "O000001");
    const cache = memoryCache([
      cacheRecord(
        "roster:v1:GA:13",
        oldRoster,
        new Date(NOW.getTime() - 24 * HOUR),
      ),
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
      view: {
        freshness: {
          checkedAt: NOW.toISOString(),
          refreshAfter: "2026-07-17T12:00:00.000Z",
          staleAfter: "2026-07-19T12:00:00.000Z",
          state: "fresh",
        },
      },
    });
    expect(harness.fetchCongressRoster).toHaveBeenCalledTimes(1);
    expect(harness.fetchCongressRoster).toHaveBeenCalledWith(
      jurisdiction,
      expect.objectContaining({
        apiKey: API_KEY,
        fetch: expect.any(Function),
        now: expect.any(Function),
      }),
    );
    expect(harness.fetchCurrentHouseVacancies).toHaveBeenCalledTimes(1);
    expect(cache.replacements).toHaveLength(1);

    const replacement = cache.replacements[0];
    expect(replacement.roster.cacheKey).toBe("roster:v1:GA:13");
    expect(replacement.profiles.map(({ cacheKey }) => cacheKey).sort()).toEqual([
      "profile:v2:S000001",
      "profile:v2:S000002",
    ]);
    expect(replacement.profiles.map(({ payload }) => payload)).toEqual([
      profileFor(senators[0]),
      profileFor(senators[1]),
    ]);
    expect(JSON.stringify(replacement)).not.toContain(API_KEY);
    expect(JSON.stringify(replacement)).not.toMatch(
      /"(?:address|latitude|longitude|userId|session|credential|rawProviderError)"/i,
    );
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
      "wrong key",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        cacheKey: "roster:v1:GA:12",
      }),
    ],
    [
      "corrupt JSON shape",
      (valid: FederalOfficialCacheRecord) => ({ ...valid, payload: null }),
    ],
    [
      "schema-invalid roster",
      (valid: FederalOfficialCacheRecord) => ({
        ...valid,
        payload: {
          ...verifiedRoster(jurisdiction),
          jurisdiction: { ...jurisdiction, stateCode: "CA" },
        },
      }),
    ],
  ] as const)("rejects %s cache data instead of serving it", async (_label, mutate) => {
    const valid = cacheRecord(
      "roster:v1:GA:13",
      verifiedRoster(jurisdiction),
      new Date(NOW.getTime() - HOUR),
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

  it("fails closed before provider access when the server-only Congress credential is absent", async () => {
    const cache = memoryCache();
    const harness = serviceHarness(cache.repository, {
      environment: { CONGRESS_GOV_API_KEY: "" },
    });

    expect(await harness.service.getOfficials(jurisdiction)).toEqual({
      status: "unavailable",
    });
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
    expect(cache.replacements).toEqual([]);
  });

  it("reads only a verified unexpired profile key and never calls a provider", async () => {
    const house = servingSeat("house", "H000001", 13, jurisdiction);
    const validProfile = cacheRecord(
      "profile:v2:H000001",
      profileFor(house),
      new Date(NOW.getTime() - HOUR),
    );
    const expiredProfile = cacheRecord(
      "profile:v2:S000001",
      profileFor(servingSeat("senate", "S000001", null, jurisdiction)),
      new Date(NOW.getTime() - 72 * HOUR),
    );
    const mismatchedProfile = cacheRecord(
      "profile:v2:X000001",
      profileFor(house),
      new Date(NOW.getTime() - HOUR),
    );
    const cache = memoryCache([validProfile, expiredProfile, mismatchedProfile]);
    const harness = serviceHarness(cache.repository);

    expect(await harness.service.getProfile("H000001")).toEqual({
      status: "available",
      profile: {
        ...profileFor(house),
        freshness: {
          checkedAt: "2026-07-16T11:00:00.000Z",
          refreshAfter: "2026-07-17T11:00:00.000Z",
          staleAfter: "2026-07-19T11:00:00.000Z",
          state: "fresh",
        },
      },
    });
    expect(await harness.service.getProfile("S000001")).toEqual({
      status: "unavailable",
    });
    expect(await harness.service.getProfile("X000001")).toEqual({
      status: "unavailable",
    });
    expect(await harness.service.getProfile("not-a-bioguide")).toEqual({
      status: "unavailable",
    });
    expect(cache.reads).toEqual([
      "profile:v2:H000001",
      "profile:v2:S000001",
      "profile:v2:X000001",
    ]);
    expect(harness.fetchCongressRoster).not.toHaveBeenCalled();
    expect(harness.fetchCurrentHouseVacancies).not.toHaveBeenCalled();
  });
});

function serviceHarness(
  repository: FederalOfficialCacheRepository,
  options: {
    congress?: CongressRosterOutcome;
    clerk?: HouseVacancyOutcome;
    environment?: Readonly<Record<string, string | undefined>>;
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
      now: () => new Date(NOW),
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
): FederalOfficialsRoster {
  return reconcileFederalOfficials(
    selected,
    availableCongress(
      [servingSeat("house", houseId, selected.district, selected)],
      [
        servingSeat("senate", "S000001", null, selected),
        servingSeat("senate", "S000002", null, selected),
      ],
    ),
    availableClerk(),
  );
}

function servingSeat(
  chamber: "house" | "senate",
  bioguideId: string,
  district: number | null,
  selected: FederalJurisdiction,
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
): HouseVacancyOutcome {
  return {
    status: "available",
    currentCongress: 119,
    source: clerkSource,
    vacancies,
  };
}
