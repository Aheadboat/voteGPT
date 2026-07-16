import { and, eq, lte, sql } from "drizzle-orm";

import { createDatabase } from "@/db";
import { federalOfficialCache } from "@/db/schema";

import {
  reconcileFederalOfficials,
  type FederalJurisdiction,
  type FederalOfficialsRoster,
  type FederalOfficialsView,
  type FederalSeat,
  type FetchCongressRoster,
  type FetchCurrentHouseVacancies,
  type Freshness,
  type Office,
  type Person,
  type SourceRef,
  type Term,
} from "./federal-officials";

const HOUR = 60 * 60 * 1_000;
const REFRESH_AGE = 24 * HOUR;
const STALE_AGE = 72 * HOUR;
const bioguidePattern = /^[A-Z][0-9]{6}$/;
const clerkListUrl = "https://clerk.house.gov/Members/ViewVacancies";
const supportedStateFips = new Map<string, string>([
  ["AL", "01"], ["AK", "02"], ["AZ", "04"], ["AR", "05"],
  ["CA", "06"], ["CO", "08"], ["CT", "09"], ["DE", "10"],
  ["FL", "12"], ["GA", "13"], ["HI", "15"], ["ID", "16"],
  ["IL", "17"], ["IN", "18"], ["IA", "19"], ["KS", "20"],
  ["KY", "21"], ["LA", "22"], ["ME", "23"], ["MD", "24"],
  ["MA", "25"], ["MI", "26"], ["MN", "27"], ["MS", "28"],
  ["MO", "29"], ["MT", "30"], ["NE", "31"], ["NV", "32"],
  ["NH", "33"], ["NJ", "34"], ["NM", "35"], ["NY", "36"],
  ["NC", "37"], ["ND", "38"], ["OH", "39"], ["OK", "40"],
  ["OR", "41"], ["PA", "42"], ["RI", "44"], ["SC", "45"],
  ["SD", "46"], ["TN", "47"], ["TX", "48"], ["UT", "49"],
  ["VT", "50"], ["VA", "51"], ["WA", "53"], ["WV", "54"],
  ["WI", "55"], ["WY", "56"],
]);

export type FederalOfficialCacheKey =
  | `roster:v1:${string}:${string}`
  | `profile:v2:${string}`;

export type FederalRosterCachePayload = FederalOfficialsRoster;

export type FederalProfileCachePayload = {
  person: Person;
  office: Office;
  term: Term;
  sources: readonly SourceRef[];
};

export type FederalOfficialCacheRecord = {
  cacheKey: string;
  payload: unknown;
  retrievedAt: Date;
  refreshAfter: Date;
  staleAfter: Date;
};

export type FederalRosterReplacement = Readonly<{
  roster: FederalOfficialCacheRecord;
  profiles: readonly FederalOfficialCacheRecord[];
}>;

export type FederalRosterWriteResult =
  | Readonly<{ status: "written" }>
  | Readonly<{ status: "ignored"; reason: "older_generation" }>;

export type FederalOfficialCacheRepository = Readonly<{
  read: (
    cacheKey: FederalOfficialCacheKey,
  ) => Promise<FederalOfficialCacheRecord | null>;
  replaceRoster: (
    replacement: FederalRosterReplacement,
  ) => Promise<FederalRosterWriteResult>;
}>;

export type FederalOfficialsServiceResult =
  | Readonly<{ status: "available"; view: FederalOfficialsView }>
  | Readonly<{ status: "unavailable" }>;

export type FederalOfficialProfileResult =
  | Readonly<{
      status: "available";
      profile: FederalProfileCachePayload & Readonly<{ freshness: Freshness }>;
    }>
  | Readonly<{ status: "unavailable" }>;

type Database = Awaited<ReturnType<typeof createDatabase>>;

export function createFederalOfficialCacheRepository(
  database: Database,
): FederalOfficialCacheRepository {
  return {
    async read(cacheKey) {
      const [record] = await database
        .select({
          cacheKey: federalOfficialCache.cacheKey,
          payload: federalOfficialCache.payload,
          refreshAfter: federalOfficialCache.refreshAfter,
          retrievedAt: federalOfficialCache.retrievedAt,
          staleAfter: federalOfficialCache.staleAfter,
        })
        .from(federalOfficialCache)
        .where(eq(federalOfficialCache.cacheKey, cacheKey))
        .limit(1);
      return record ?? null;
    },

    async replaceRoster(replacement) {
      const validated = validateReplacement(replacement);
      if (validated === null) {
        throw new Error("Invalid federal official cache replacement");
      }

      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`lock table ${federalOfficialCache} in share row exclusive mode`,
        );
        const [existing] = await transaction
          .select({
            cacheKey: federalOfficialCache.cacheKey,
            payload: federalOfficialCache.payload,
            refreshAfter: federalOfficialCache.refreshAfter,
            retrievedAt: federalOfficialCache.retrievedAt,
            staleAfter: federalOfficialCache.staleAfter,
          })
          .from(federalOfficialCache)
          .where(eq(federalOfficialCache.cacheKey, validated.roster.cacheKey))
          .limit(1)
          .for("update");

        if (
          existing &&
          existing.retrievedAt.getTime() > validated.roster.retrievedAt.getTime()
        ) {
          return { status: "ignored", reason: "older_generation" } as const;
        }

        let previousProfileIds: readonly string[] = [];
        if (existing) {
          const prior = validateRosterRecord(
            existing,
            validated.roster.cacheKey as FederalOfficialCacheKey,
            validated.jurisdiction,
          );
          if (prior === null) {
            throw new Error("Invalid stored federal official roster");
          }
          previousProfileIds = servingProfileIds(prior.payload);
        }
        const currentProfileIds = servingProfileIds(validated.roster.payload);
        const currentSet = new Set(currentProfileIds);
        const displacedKeys = previousProfileIds
          .filter((id) => !currentSet.has(id))
          .map((id) => profileKey(id));
        const profilesByKey = new Map(
          validated.profiles.map((profile) => [profile.cacheKey, profile]),
        );
        const affectedKeys = [
          ...new Set([...displacedKeys, ...profilesByKey.keys()]),
        ].sort();
        for (const cacheKey of affectedKeys) {
          const profile = profilesByKey.get(cacheKey);
          if (profile) {
            await upsertRecord(transaction, profile);
          } else {
            await transaction
              .delete(federalOfficialCache)
              .where(
                and(
                  eq(federalOfficialCache.cacheKey, cacheKey),
                  lte(
                    federalOfficialCache.retrievedAt,
                    validated.roster.retrievedAt,
                  ),
                ),
              );
          }
        }
        await upsertRecord(transaction, validated.roster);
        return { status: "written" } as const;
      });
    },
  };
}

export function createFederalOfficialsService(options: {
  cache: FederalOfficialCacheRepository;
  environment: Readonly<{ CONGRESS_GOV_API_KEY?: string }>;
  fetch: typeof globalThis.fetch;
  fetchCongressRoster: FetchCongressRoster;
  fetchCurrentHouseVacancies: FetchCurrentHouseVacancies;
  now: () => Date;
}) {
  return {
    async getOfficials(
      jurisdiction: FederalJurisdiction,
    ): Promise<FederalOfficialsServiceResult> {
      const currentTime = finiteClock(options.now);
      if (currentTime === null || validateJurisdiction(jurisdiction) === null) {
        return unavailable();
      }
      const cacheKey = rosterKey(jurisdiction);
      const cached = await safeRead(options.cache, cacheKey);
      const validCached = cached
        ? validateRosterRecord(cached, cacheKey, jurisdiction, currentTime)
        : null;
      if (
        validCached &&
        currentTime.getTime() < validCached.record.refreshAfter.getTime()
      ) {
        return availableRoster(validCached, "fresh");
      }

      const apiKey = options.environment.CONGRESS_GOV_API_KEY?.trim() ?? "";
      if (apiKey !== "") {
        const refreshed = await refreshRoster(
          options,
          jurisdiction,
          cacheKey,
          currentTime,
          apiKey,
        );
        if (refreshed) {
          return refreshed;
        }
      }

      if (
        validCached &&
        currentTime.getTime() < validCached.record.staleAfter.getTime()
      ) {
        return availableRoster(validCached, "stale");
      }
      return unavailable();
    },

    async getProfile(
      bioguideId: string,
    ): Promise<FederalOfficialProfileResult> {
      const currentTime = finiteClock(options.now);
      if (currentTime === null || !bioguidePattern.test(bioguideId)) {
        return unavailable();
      }
      const cacheKey = profileKey(bioguideId);
      const cached = await safeRead(options.cache, cacheKey);
      if (!cached) {
        return unavailable();
      }
      const valid = validateProfileRecord(
        cached,
        cacheKey,
        bioguideId,
        currentTime,
      );
      if (
        valid === null ||
        currentTime.getTime() >= valid.record.staleAfter.getTime()
      ) {
        return unavailable();
      }
      const state =
        currentTime.getTime() < valid.record.refreshAfter.getTime()
          ? "fresh"
          : "stale";
      return {
        status: "available",
        profile: { ...valid.payload, freshness: freshness(valid.record, state) },
      };
    },
  };
}

async function refreshRoster(
  options: Parameters<typeof createFederalOfficialsService>[0],
  jurisdiction: FederalJurisdiction,
  cacheKey: FederalOfficialCacheKey,
  currentTime: Date,
  apiKey: string,
): Promise<FederalOfficialsServiceResult | null> {
  const stableNow = () => new Date(currentTime.getTime());
  try {
    const congress = await options.fetchCongressRoster(jurisdiction, {
      apiKey,
      fetch: options.fetch,
      now: stableNow,
    });
    const validCongress = validateCongressOutcome(
      congress,
      jurisdiction,
      currentTime,
    );
    if (validCongress === null) {
      return null;
    }
    const clerk = await options.fetchCurrentHouseVacancies(
      validCongress.currentCongress,
      { fetch: options.fetch, now: stableNow },
    );
    const validClerk = validateClerkOutcome(
      clerk,
      validCongress.currentCongress,
      currentTime,
    );
    if (validClerk === null) {
      return null;
    }
    const roster = reconcileFederalOfficials(
      jurisdiction,
      validCongress,
      validClerk,
    );
    const rosterRecord = record(cacheKey, roster, currentTime);
    const validatedRoster = validateRosterRecord(
      rosterRecord,
      cacheKey,
      jurisdiction,
      currentTime,
    );
    if (validatedRoster === null) {
      return null;
    }
    const profiles = servingProfiles(roster).map((profile) =>
      record(profileKey(profile.person.bioguideId), profile, currentTime),
    );
    const result = await options.cache.replaceRoster({
      roster: rosterRecord,
      profiles,
    });
    if (result.status === "ignored") {
      const latest = await safeRead(options.cache, cacheKey);
      const latestTime = finiteClock(options.now);
      if (latestTime === null) {
        return null;
      }
      const validLatest = latest
        ? validateRosterRecord(latest, cacheKey, jurisdiction, latestTime)
        : null;
      if (
        validLatest === null ||
        latestTime.getTime() >= validLatest.record.staleAfter.getTime()
      ) {
        return null;
      }
      return availableRoster(
        validLatest,
        latestTime.getTime() < validLatest.record.refreshAfter.getTime()
          ? "fresh"
          : "stale",
      );
    }
    return availableRoster(validatedRoster, "fresh");
  } catch {
    return null;
  }
}

async function safeRead(
  cache: FederalOfficialCacheRepository,
  cacheKey: FederalOfficialCacheKey,
) {
  try {
    return await cache.read(cacheKey);
  } catch {
    return null;
  }
}

function validateReplacement(replacement: FederalRosterReplacement) {
  if (!isExactRecord(replacement, ["roster", "profiles"])) {
    return null;
  }
  const parsedKey = parseRosterKey(replacement.roster.cacheKey);
  if (parsedKey === null || !Array.isArray(replacement.profiles)) {
    return null;
  }
  const rosterJurisdiction = validateJurisdiction(
    isRecord(replacement.roster.payload)
      ? replacement.roster.payload.jurisdiction
      : null,
  );
  if (
    rosterJurisdiction === null ||
    rosterJurisdiction.stateCode !== parsedKey.stateCode ||
    rosterJurisdiction.district !== parsedKey.district
  ) {
    return null;
  }
  const roster = validateRosterRecord(
    replacement.roster,
    replacement.roster.cacheKey as FederalOfficialCacheKey,
    rosterJurisdiction,
  );
  if (roster === null) {
    return null;
  }
  const expectedIds = servingProfileIds(roster.payload).sort();
  const validatedProfiles: FederalOfficialCacheRecord[] = [];
  for (const profile of replacement.profiles) {
    const match = /^profile:v2:([A-Z][0-9]{6})$/.exec(profile.cacheKey);
    const validated = match?.[1]
      ? validateProfileRecord(
          profile,
          profile.cacheKey as FederalOfficialCacheKey,
          match[1],
        )
      : null;
    if (validated === null || !sameTimes(profile, replacement.roster)) {
      return null;
    }
    validatedProfiles.push(profile);
  }
  const actualIds = validatedProfiles
    .map(({ cacheKey }) => cacheKey.slice("profile:v2:".length))
    .sort();
  if (
    new Set(actualIds).size !== actualIds.length ||
    !sameStrings(actualIds, expectedIds)
  ) {
    return null;
  }
  return {
    jurisdiction: rosterJurisdiction,
    roster: { ...replacement.roster, payload: roster.payload },
    profiles: validatedProfiles,
  };
}

function validateRosterRecord(
  recordValue: FederalOfficialCacheRecord,
  expectedKey: FederalOfficialCacheKey,
  expectedJurisdiction: FederalJurisdiction,
  now?: Date,
) {
  if (
    !validateRecord(recordValue, expectedKey, now) ||
    !isExactRecord(recordValue.payload, [
      "jurisdiction",
      "house",
      "senate",
      "coverage",
    ])
  ) {
    return null;
  }
  const jurisdiction = validateJurisdiction(recordValue.payload.jurisdiction);
  if (
    jurisdiction === null ||
    !sameJurisdiction(jurisdiction, expectedJurisdiction)
  ) {
    return null;
  }
  const maxTime = recordValue.retrievedAt.getTime();
  const house = validateSeat(recordValue.payload.house, {
    chamber: "house",
    district: jurisdiction.district,
    maxTime,
    stateCode: jurisdiction.stateCode,
  });
  if (house === null || !Array.isArray(recordValue.payload.senate)) {
    return null;
  }
  const senate: FederalSeat[] = [];
  for (const value of recordValue.payload.senate) {
    const seat = validateSeat(value, {
      chamber: "senate",
      district: null,
      maxTime,
      stateCode: jurisdiction.stateCode,
    });
    if (seat === null || seat.status !== "serving") {
      return null;
    }
    senate.push(seat);
  }
  const senateIds = senate.map((seat) =>
    seat.status === "serving" ? seat.person.bioguideId : "",
  );
  if (senate.length > 2 || new Set(senateIds).size !== senateIds.length) {
    return null;
  }
  const coverage = validateCoverage(
    recordValue.payload.coverage,
    house,
    senate.length,
  );
  if (coverage === null) {
    return null;
  }
  return {
    payload: {
      jurisdiction,
      house,
      senate,
      coverage,
    } satisfies FederalRosterCachePayload,
    record: recordValue,
  };
}

function validateProfileRecord(
  recordValue: FederalOfficialCacheRecord,
  expectedKey: FederalOfficialCacheKey,
  expectedBioguideId: string,
  now?: Date,
) {
  if (
    !bioguidePattern.test(expectedBioguideId) ||
    !validateRecord(recordValue, expectedKey, now)
  ) {
    return null;
  }
  const payload = validateProfilePayload(
    recordValue.payload,
    expectedBioguideId,
    recordValue.retrievedAt.getTime(),
  );
  return payload ? { payload, record: recordValue } : null;
}

function validateProfilePayload(
  value: unknown,
  expectedBioguideId: string,
  maxTime: number,
): FederalProfileCachePayload | null {
  if (!isExactRecord(value, ["person", "office", "term", "sources"])) {
    return null;
  }
  const person = validatePerson(value.person, expectedBioguideId);
  if (person === null) {
    return null;
  }
  const officeValue = isRecord(value.office) ? value.office : null;
  const chamber = officeValue?.chamber;
  const stateCode = officeValue?.stateCode;
  const district = officeValue?.district;
  if (
    (chamber !== "house" && chamber !== "senate") ||
    typeof stateCode !== "string" ||
    (chamber === "house" && !isDistrict(district)) ||
    (chamber === "senate" && district !== null)
  ) {
    return null;
  }
  const office = validateOffice(
    value.office,
    chamber,
    stateCode,
    district as number | null,
    expectedBioguideId,
  );
  const term = office
    ? validateTerm(value.term, office.id, person.id, "serving")
    : null;
  const sources = validateSources(
    value.sources,
    maxTime,
    expectedBioguideId,
    office,
  );
  if (
    office === null ||
    term === null ||
    sources === null ||
    !sources.some((source) => source.sourceType === "member")
  ) {
    return null;
  }
  return { person, office, term, sources };
}

function validateRecord(
  value: FederalOfficialCacheRecord,
  expectedKey: FederalOfficialCacheKey,
  now?: Date,
) {
  if (
    !isExactRecord(value, [
      "cacheKey",
      "payload",
      "retrievedAt",
      "refreshAfter",
      "staleAfter",
    ]) ||
    value.cacheKey !== expectedKey ||
    !validDate(value.retrievedAt) ||
    !validDate(value.refreshAfter) ||
    !validDate(value.staleAfter) ||
    value.refreshAfter.getTime() - value.retrievedAt.getTime() !== REFRESH_AGE ||
    value.staleAfter.getTime() - value.retrievedAt.getTime() !== STALE_AGE ||
    (now !== undefined && value.retrievedAt.getTime() > now.getTime())
  ) {
    return false;
  }
  return true;
}

function validateJurisdiction(value: unknown): FederalJurisdiction | null {
  if (
    !isExactRecord(value, ["stateCode", "district", "divisionIds"]) ||
    typeof value.stateCode !== "string" ||
    !supportedStateFips.has(value.stateCode) ||
    !isDistrict(value.district) ||
    !Array.isArray(value.divisionIds) ||
    value.divisionIds.length !== 2 ||
    !value.divisionIds.every((id) => typeof id === "string")
  ) {
    return null;
  }
  const stateCode = value.stateCode;
  const district = value.district;
  const fips = supportedStateFips.get(stateCode);
  if (fips === undefined) {
    return null;
  }
  const lower = stateCode.toLowerCase();
  const ocd = [
    `ocd-division/country:us/state:${lower}`,
    `ocd-division/country:us/state:${lower}/cd:${district}`,
  ];
  const census = [fips, `${fips}${String(district).padStart(2, "0")}`];
  if (
    !sameStrings(value.divisionIds, ocd) &&
    !sameStrings(value.divisionIds, census)
  ) {
    return null;
  }
  return { stateCode, district, divisionIds: [...value.divisionIds] };
}

function validateSeat(
  value: unknown,
  expected: {
    chamber: "house" | "senate";
    stateCode: string;
    district: number | null;
    maxTime: number;
  },
): FederalSeat | null {
  if (!isRecord(value) || typeof value.status !== "string") {
    return null;
  }
  if (value.status === "serving" || value.status === "conflict") {
    if (!hasExactKeys(value, ["status", "office", "person", "term", "sources"])) {
      return null;
    }
    const person = validatePerson(value.person);
    const office = person
      ? validateOffice(
          value.office,
          expected.chamber,
          expected.stateCode,
          expected.district,
          person.bioguideId,
        )
      : null;
    const term = office && person
      ? validateTerm(value.term, office.id, person.id, "serving")
      : null;
    const sources = person
      ? validateSources(
          value.sources,
          expected.maxTime,
          person.bioguideId,
          office,
        )
      : null;
    if (
      person === null ||
      office === null ||
      term === null ||
      sources === null ||
      !sources.some((source) => source.sourceType === "member") ||
      (value.status === "serving" &&
        hasClerkDistrictEvidence(sources, office)) ||
      (value.status === "conflict" &&
        (!hasClerkListEvidence(sources) ||
          !hasClerkDistrictEvidence(sources, office)))
    ) {
      return null;
    }
    return { status: value.status, office, person, term, sources };
  }
  if (value.status === "vacant") {
    if (!hasExactKeys(value, ["status", "office", "term", "sources"])) {
      return null;
    }
    const office = validateOffice(
      value.office,
      expected.chamber,
      expected.stateCode,
      expected.district,
      null,
    );
    const term = office
      ? validateTerm(value.term, office.id, null, "vacant")
      : null;
    const sources = validateSources(
      value.sources,
      expected.maxTime,
      null,
      office,
    );
    if (
      office === null ||
      term === null ||
      sources === null ||
      !hasClerkListEvidence(sources) ||
      !hasClerkDistrictEvidence(sources, office)
    ) {
      return null;
    }
    return { status: "vacant", office, term, sources };
  }
  if (value.status === "unknown") {
    if (!hasExactKeys(value, ["status", "office", "sources"])) {
      return null;
    }
    const office = validateOffice(
      value.office,
      expected.chamber,
      expected.stateCode,
      expected.district,
      null,
    );
    const sources = validateSources(
      value.sources,
      expected.maxTime,
      null,
      office,
    );
    return office && sources && !hasClerkDistrictEvidence(sources, office)
      ? { status: "unknown", office, sources }
      : null;
  }
  return null;
}

function validatePerson(value: unknown, expectedBioguideId?: string) {
  if (
    !isExactRecord(value, ["id", "bioguideId", "name"]) ||
    typeof value.bioguideId !== "string" ||
    !bioguidePattern.test(value.bioguideId) ||
    (expectedBioguideId !== undefined &&
      value.bioguideId !== expectedBioguideId) ||
    value.id !== `bioguide:${value.bioguideId}` ||
    typeof value.name !== "string" ||
    value.name.trim() === ""
  ) {
    return null;
  }
  return value as Person;
}

function validateOffice(
  value: unknown,
  chamber: "house" | "senate",
  stateCode: string,
  district: number | null,
  bioguideId: string | null,
) {
  const expectedId = `federal:${chamber}:${stateCode}:${
    chamber === "house" ? district : (bioguideId ?? "unknown")
  }`;
  if (
    !isExactRecord(value, ["id", "chamber", "stateCode", "district", "title"]) ||
    value.id !== expectedId ||
    value.chamber !== chamber ||
    value.stateCode !== stateCode ||
    value.district !== district ||
    value.title !==
      (chamber === "house" ? "U.S. Representative" : "U.S. Senator")
  ) {
    return null;
  }
  return value as Office;
}

function validateTerm(
  value: unknown,
  officeId: string,
  personId: string | null,
  status: "serving" | "vacant",
) {
  if (
    !isExactRecord(value, [
      "officeId",
      "personId",
      "congress",
      "startYear",
      "endYear",
      "status",
    ]) ||
    value.officeId !== officeId ||
    value.personId !== personId ||
    value.status !== status ||
    !Number.isInteger(value.congress) ||
    (value.congress as number) <= 0 ||
    !nullableYear(value.startYear) ||
    !nullableYear(value.endYear) ||
    (typeof value.startYear === "number" &&
      typeof value.endYear === "number" &&
      value.endYear < value.startYear)
  ) {
    return null;
  }
  return value as Term;
}

function validateSources(
  value: unknown,
  maxTime: number,
  bioguideId: string | null,
  office: Office | null,
) {
  if (!Array.isArray(value)) {
    return null;
  }
  const sources: SourceRef[] = [];
  for (const candidate of value) {
    const source = validateSource(candidate, maxTime, bioguideId, office);
    if (source === null) {
      return null;
    }
    sources.push(source);
  }
  const identities = sources.map(({ retrievedAt, url }) => `${url}:${retrievedAt}`);
  return new Set(identities).size === identities.length ? sources : null;
}

function validateSource(
  value: unknown,
  maxTime: number,
  bioguideId: string | null,
  office: Office | null,
): SourceRef | null {
  if (
    !isExactRecord(value, [
      "publisher",
      "sourceType",
      "url",
      "retrievedAt",
      "recordUpdatedAt",
      "effectiveAt",
    ]) ||
    typeof value.url !== "string"
  ) {
    return null;
  }
  const retrievedAt = canonicalTime(value.retrievedAt);
  const recordUpdatedAt = nullableCanonicalTime(value.recordUpdatedAt);
  const effectiveAt = nullableCanonicalTime(value.effectiveAt);
  if (
    retrievedAt === null ||
    retrievedAt > maxTime ||
    recordUpdatedAt === false ||
    effectiveAt === false ||
    (typeof recordUpdatedAt === "number" && recordUpdatedAt > retrievedAt) ||
    (typeof effectiveAt === "number" && effectiveAt > retrievedAt)
  ) {
    return null;
  }
  if (value.sourceType === "member") {
    if (
      value.publisher !== "Congress.gov" ||
      bioguideId === null ||
      value.url !==
        `https://api.congress.gov/v3/member/${bioguideId}?format=json`
    ) {
      return null;
    }
  } else if (value.sourceType === "vacancy") {
    if (
      value.publisher !==
        "Office of the Clerk, U.S. House of Representatives" ||
      !validClerkUrl(value.url, office)
    ) {
      return null;
    }
  } else {
    return null;
  }
  return value as SourceRef;
}

function validateCoverage(value: unknown, house: FederalSeat, senateCount: number) {
  if (
    !isExactRecord(value, ["house", "senate"]) ||
    !["verified", "vacant", "partial", "unknown"].includes(
      String(value.house),
    ) ||
    !["verified", "partial", "unknown"].includes(String(value.senate))
  ) {
    return null;
  }
  const validHouse =
    house.status === "serving"
      ? (value.house === "partial" &&
          !hasClerkListEvidence(house.sources) &&
          !hasClerkDistrictEvidence(house.sources, house.office)) ||
        (value.house === "verified" &&
          hasClerkListEvidence(house.sources) &&
          !hasClerkDistrictEvidence(house.sources, house.office))
      : house.status === "vacant"
        ? value.house === "vacant"
        : house.status === "conflict"
          ? value.house === "partial"
          : value.house === "unknown" || value.house === "partial";
  const validSenate =
    senateCount === 2
      ? value.senate === "verified"
      : senateCount === 1
        ? value.senate === "partial" || value.senate === "unknown"
        : value.senate === "unknown";
  return validHouse && validSenate
    ? (value as FederalOfficialsRoster["coverage"])
    : null;
}

function validateCongressOutcome(
  value: unknown,
  jurisdiction: FederalJurisdiction,
  now: Date,
) {
  if (
    !isExactRecord(value, ["status", "currentCongress", "house", "senate"]) ||
    value.status !== "available" ||
    !Number.isInteger(value.currentCongress) ||
    (value.currentCongress as number) <= 0 ||
    !Array.isArray(value.house) ||
    !Array.isArray(value.senate)
  ) {
    return null;
  }
  const house = value.house.map((candidate) =>
    validateSeat(candidate, {
      chamber: "house",
      district: jurisdiction.district,
      maxTime: now.getTime(),
      stateCode: jurisdiction.stateCode,
    }),
  );
  const senate = value.senate.map((candidate) =>
    validateSeat(candidate, {
      chamber: "senate",
      district: null,
      maxTime: now.getTime(),
      stateCode: jurisdiction.stateCode,
    }),
  );
  const all = [...house, ...senate];
  if (
    all.some(
      (seat) =>
        seat === null ||
        seat.status !== "serving" ||
        seat.term.congress !== value.currentCongress,
    )
  ) {
    return null;
  }
  const ids = all.map((seat) =>
    seat?.status === "serving" ? seat.person.bioguideId : "",
  );
  if (new Set(ids).size !== ids.length) {
    return null;
  }
  return {
    status: "available" as const,
    currentCongress: value.currentCongress as number,
    house: house as Extract<FederalSeat, { status: "serving" }>[],
    senate: senate as Extract<FederalSeat, { status: "serving" }>[],
  };
}

function validateClerkOutcome(
  value: unknown,
  currentCongress: number,
  now: Date,
) {
  if (isExactRecord(value, ["status", "reason"]) && value.status === "unavailable") {
    return value as ReturnType<FetchCurrentHouseVacancies> extends Promise<infer T>
      ? T
      : never;
  }
  if (
    !isExactRecord(value, [
      "status",
      "currentCongress",
      "source",
      "vacancies",
    ]) ||
    value.status !== "available" ||
    value.currentCongress !== currentCongress ||
    !Array.isArray(value.vacancies)
  ) {
    return null;
  }
  const source = validateSource(value.source, now.getTime(), null, null);
  if (source === null || source.url !== clerkListUrl) {
    return null;
  }
  const vacancies: Array<{
    stateCode: string;
    district: number;
    source: SourceRef;
  }> = [];
  for (const vacancy of value.vacancies) {
    if (
      !isExactRecord(vacancy, ["stateCode", "district", "source"]) ||
      typeof vacancy.stateCode !== "string" ||
      !supportedStateFips.has(vacancy.stateCode) ||
      !isDistrict(vacancy.district)
    ) {
      return null;
    }
    const office: Office = {
      id: `federal:house:${vacancy.stateCode}:${vacancy.district}`,
      chamber: "house",
      stateCode: vacancy.stateCode,
      district: vacancy.district,
      title: "U.S. Representative",
    };
    const vacancySource = validateSource(
      vacancy.source,
      now.getTime(),
      null,
      office,
    );
    if (vacancySource === null || vacancySource.url === clerkListUrl) {
      return null;
    }
    vacancies.push({
      stateCode: vacancy.stateCode,
      district: vacancy.district,
      source: vacancySource,
    });
  }
  const seats = vacancies.map(({ district, stateCode }) => `${stateCode}:${district}`);
  if (new Set(seats).size !== seats.length) {
    return null;
  }
  return {
    status: "available" as const,
    currentCongress,
    source,
    vacancies,
  };
}

function validClerkUrl(url: string, office: Office | null) {
  if (url === clerkListUrl) {
    return true;
  }
  if (!office || office.chamber !== "house" || office.district === null) {
    return false;
  }
  const district = String(office.district).padStart(2, "0");
  return url ===
    `https://clerk.house.gov/members/${office.stateCode}${district}/vacancy`;
}

function hasClerkListEvidence(sources: readonly SourceRef[]) {
  return sources.some(
    ({ sourceType, url }) =>
      sourceType === "vacancy" && url === clerkListUrl,
  );
}

function hasClerkDistrictEvidence(
  sources: readonly SourceRef[],
  office: Office,
) {
  return sources.some(
    ({ sourceType, url }) =>
      sourceType === "vacancy" &&
      url !== clerkListUrl &&
      validClerkUrl(url, office),
  );
}

function servingProfiles(roster: FederalOfficialsRoster) {
  return [roster.house, ...roster.senate].flatMap((seat) =>
    seat.status === "serving"
      ? [
          {
            person: seat.person,
            office: seat.office,
            term: seat.term,
            sources: seat.sources,
          } satisfies FederalProfileCachePayload,
        ]
      : [],
  );
}

function servingProfileIds(roster: FederalOfficialsRoster) {
  return servingProfiles(roster).map(({ person }) => person.bioguideId);
}

function record(
  cacheKey: FederalOfficialCacheKey,
  payload: unknown,
  retrievedAt: Date,
): FederalOfficialCacheRecord {
  return {
    cacheKey,
    payload,
    retrievedAt: new Date(retrievedAt),
    refreshAfter: new Date(retrievedAt.getTime() + REFRESH_AGE),
    staleAfter: new Date(retrievedAt.getTime() + STALE_AGE),
  };
}

function availableRoster(
  validated: NonNullable<ReturnType<typeof validateRosterRecord>>,
  state: "fresh" | "stale",
): FederalOfficialsServiceResult {
  return {
    status: "available",
    view: {
      ...validated.payload,
      freshness: freshness(validated.record, state),
    },
  };
}

function freshness(
  cacheRecord: FederalOfficialCacheRecord,
  state: "fresh" | "stale",
): Freshness {
  return {
    checkedAt: cacheRecord.retrievedAt.toISOString(),
    refreshAfter: cacheRecord.refreshAfter.toISOString(),
    staleAfter: cacheRecord.staleAfter.toISOString(),
    state,
  };
}

function rosterKey(jurisdiction: FederalJurisdiction): FederalOfficialCacheKey {
  const district =
    jurisdiction.district === 0
      ? "AL"
      : String(jurisdiction.district).padStart(2, "0");
  return `roster:v1:${jurisdiction.stateCode}:${district}`;
}

function profileKey(bioguideId: string): FederalOfficialCacheKey {
  return `profile:v2:${bioguideId}`;
}

function parseRosterKey(value: string) {
  const match = /^roster:v1:([A-Z]{2}):(AL|[0-9]{2})$/.exec(value);
  if (!match?.[1] || !match[2] || !supportedStateFips.has(match[1])) {
    return null;
  }
  const district = match[2] === "AL" ? 0 : Number(match[2]);
  if (!isDistrict(district) || (district === 0) !== (match[2] === "AL")) {
    return null;
  }
  return { stateCode: match[1], district };
}

function sameTimes(
  first: FederalOfficialCacheRecord,
  second: FederalOfficialCacheRecord,
) {
  return (
    first.retrievedAt.getTime() === second.retrievedAt.getTime() &&
    first.refreshAfter.getTime() === second.refreshAfter.getTime() &&
    first.staleAfter.getTime() === second.staleAfter.getTime()
  );
}

function sameJurisdiction(
  first: FederalJurisdiction,
  second: FederalJurisdiction,
) {
  return (
    first.stateCode === second.stateCode &&
    first.district === second.district &&
    sameStrings(first.divisionIds, second.divisionIds)
  );
}

function sameStrings(first: readonly string[], second: readonly string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function finiteClock(clock: () => Date) {
  try {
    const value = clock();
    return validDate(value) ? new Date(value) : null;
  } catch {
    return null;
  }
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function canonicalTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value
    ? time
    : null;
}

function nullableCanonicalTime(value: unknown): number | null | false {
  return value === null ? null : (canonicalTime(value) ?? false);
}

function isDistrict(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 99;
}

function nullableYear(value: unknown) {
  return value === null || (Number.isInteger(value) && (value as number) > 1700);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function unavailable() {
  return { status: "unavailable" as const };
}

async function upsertRecord(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  cacheRecord: FederalOfficialCacheRecord,
) {
  await transaction
    .insert(federalOfficialCache)
    .values(cacheRecord)
    .onConflictDoUpdate({
      target: federalOfficialCache.cacheKey,
      setWhere: lte(
        federalOfficialCache.retrievedAt,
        cacheRecord.retrievedAt,
      ),
      set: {
        payload: cacheRecord.payload,
        refreshAfter: cacheRecord.refreshAfter,
        retrievedAt: cacheRecord.retrievedAt,
        staleAfter: cacheRecord.staleAfter,
      },
    });
}
