import { eq, lt } from "drizzle-orm";

import { createDatabase } from "@/db";
import { stateOfficialCache } from "@/db/schema";

import {
  reconcileStateOfficials,
  stateJurisdictionFromDivisions,
  type StateJurisdiction,
  type StateOfficialsView,
  type StateRosterInput,
} from "./state-officials";
import type { FetchStateLegislators } from "./openstates";

const HOUR = 60 * 60 * 1_000;
const REFRESH_AGE = 24 * HOUR;
const STALE_AGE = 72 * HOUR;
const REFRESH_DEADLINE_MS = 5_000;

export type StateOfficialCacheKey = `state-roster:v1:${string}`;
export type StateOfficialCacheRecord = Readonly<{
  cacheKey: string;
  payload: unknown;
  retrievedAt: Date;
  refreshAfter: Date;
  staleAfter: Date;
}>;
export type StateOfficialCachePayload = Readonly<{
  jurisdiction: StateJurisdiction;
  roster: StateRosterInput;
}>;
export type StateOfficialCacheWriteResult =
  | Readonly<{ status: "written" }>
  | Readonly<{ status: "ignored"; reason: "older_generation" }>;
export type StateOfficialCacheRepository = Readonly<{
  read: (cacheKey: StateOfficialCacheKey) => Promise<StateOfficialCacheRecord | null>;
  write: (record: StateOfficialCacheRecord) => Promise<StateOfficialCacheWriteResult>;
}>;
export type StateOfficialsServiceResult =
  | Readonly<{ status: "available"; view: StateOfficialsView }>
  | Readonly<{ status: "unavailable" }>;

type Database = Awaited<ReturnType<typeof createDatabase>>;

export function createStateOfficialCacheRepository(
  database: Database,
): StateOfficialCacheRepository {
  return {
    async read(cacheKey) {
      const [record] = await database
        .select({
          cacheKey: stateOfficialCache.cacheKey,
          payload: stateOfficialCache.payload,
          retrievedAt: stateOfficialCache.retrievedAt,
          refreshAfter: stateOfficialCache.refreshAfter,
          staleAfter: stateOfficialCache.staleAfter,
        })
        .from(stateOfficialCache)
        .where(eq(stateOfficialCache.cacheKey, cacheKey))
        .limit(1);
      return record ?? null;
    },

    async write(value) {
      const record = validateCacheRecord(value);
      if (record === null) {
        throw new Error("Invalid state official cache record");
      }
      const written = await database
        .insert(stateOfficialCache)
        .values(record)
        .onConflictDoUpdate({
          target: stateOfficialCache.cacheKey,
          setWhere: lt(stateOfficialCache.retrievedAt, record.retrievedAt),
          set: {
            payload: record.payload,
            retrievedAt: record.retrievedAt,
            refreshAfter: record.refreshAfter,
            staleAfter: record.staleAfter,
          },
        })
        .returning();
      return written.length === 1
        ? { status: "written" }
        : { status: "ignored", reason: "older_generation" };
    },
  };
}

export function createStateOfficialsService(options: Readonly<{
  cache: StateOfficialCacheRepository;
  environment: Readonly<{ OPENSTATES_API_KEY?: string }>;
  fetch: typeof globalThis.fetch;
  fetchStateLegislators: FetchStateLegislators;
  now: () => Date;
}>) {
  return {
    async getOfficials(
      jurisdiction: StateJurisdiction,
    ): Promise<StateOfficialsServiceResult> {
      const canonicalJurisdiction = canonicalizeJurisdiction(jurisdiction);
      if (canonicalJurisdiction === null) return unavailable();
      const cacheKey = stateCacheKey(canonicalJurisdiction);

      const read = await readCache(options.cache, cacheKey);
      const now = readClock(options.now);
      if (read.status === "failed" || now === null) return unavailable();
      const cached = read.record;
      const validCached = cached
        ? validateCacheRecord(cached, canonicalJurisdiction, now)
        : null;
      if (validCached && now.getTime() < validCached.refreshAfter.getTime()) {
        return available(validCached, canonicalJurisdiction, now, "fresh");
      }

      const apiKey = options.environment.OPENSTATES_API_KEY?.trim() ?? "";
      if (apiKey !== "") {
        const refreshed = await refresh(options, canonicalJurisdiction, cacheKey, now, apiKey);
        if (refreshed !== null) return refreshed;
      }

      const fallbackNow = readClock(options.now);
      return validCached && fallbackNow !== null && fallbackNow.getTime() < validCached.staleAfter.getTime()
        ? available(validCached, canonicalJurisdiction, fallbackNow, "stale")
        : unavailable();
    },
  };
}

async function refresh(
  options: Parameters<typeof createStateOfficialsService>[0],
  jurisdiction: StateJurisdiction,
  cacheKey: StateOfficialCacheKey,
  now: Date,
  apiKey: string,
): Promise<StateOfficialsServiceResult | null> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REFRESH_DEADLINE_MS);
  try {
    const result = await options.fetchStateLegislators(jurisdiction, {
      apiKey,
      checkedAt: now.toISOString(),
      fetch: options.fetch,
      signal: controller.signal,
    });
    if (result.status !== "available") return null;
    const completedAt = readClock(options.now);
    if (completedAt === null) return null;
    const record = cacheRecord(cacheKey, jurisdiction, result.roster, now);
    const valid = validateCacheRecord(record, jurisdiction, completedAt);
    if (valid === null || completedAt.getTime() >= valid.staleAfter.getTime()) return null;
    const write = await options.cache.write(record);
    const publishedAt = readClock(options.now);
    if (publishedAt === null) return null;
    if (write.status === "written") {
      const published = validateCacheRecord(record, jurisdiction, publishedAt);
      if (published === null || publishedAt.getTime() >= published.staleAfter.getTime()) {
        return unavailable();
      }
      return available(
        published,
        jurisdiction,
        publishedAt,
        publishedAt.getTime() < published.refreshAfter.getTime() ? "fresh" : "stale",
      );
    }

    const winnerRead = await readCache(options.cache, cacheKey);
    const winnerNow = readClock(options.now);
    const validWinner = winnerRead.status === "read" && winnerRead.record
      ? validateCacheRecord(winnerRead.record, jurisdiction, winnerNow ?? undefined)
      : null;
    return validWinner && winnerNow !== null &&
      validWinner.retrievedAt.getTime() > record.retrievedAt.getTime() &&
      winnerNow.getTime() < validWinner.staleAfter.getTime()
      ? available(
          validWinner,
          jurisdiction,
          winnerNow,
          winnerNow.getTime() < validWinner.refreshAfter.getTime() ? "fresh" : "stale",
        )
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

function cacheRecord(
  cacheKey: StateOfficialCacheKey,
  jurisdiction: StateJurisdiction,
  roster: StateRosterInput,
  retrievedAt: Date,
): StateOfficialCacheRecord {
  const refreshAfter = new Date(retrievedAt.getTime() + REFRESH_AGE);
  const staleAfter = new Date(retrievedAt.getTime() + STALE_AGE);
  return {
    cacheKey,
    payload: {
      jurisdiction,
      roster: {
        ...roster,
        freshness: {
          checkedAt: retrievedAt.toISOString(),
          refreshAfter: refreshAfter.toISOString(),
          staleAfter: staleAfter.toISOString(),
          state: "fresh",
        },
      },
    },
    retrievedAt: new Date(retrievedAt),
    refreshAfter,
    staleAfter,
  };
}

function validateCacheRecord(
  value: unknown,
  requested?: StateJurisdiction,
  now?: Date,
): (StateOfficialCacheRecord & Readonly<{ payload: StateOfficialCachePayload }>) | null {
  if (!exactRecord(value, ["cacheKey", "payload", "retrievedAt", "refreshAfter", "staleAfter"])) {
    return null;
  }
  if (!validDate(value.retrievedAt) || !validDate(value.refreshAfter) || !validDate(value.staleAfter)) {
    return null;
  }
  const jurisdiction = stateJurisdictionFromCacheKey(value.cacheKey);
  if (
    typeof value.cacheKey !== "string" ||
    jurisdiction === null ||
    (requested !== undefined && !sameJurisdiction(jurisdiction, requested)) ||
    value.refreshAfter.getTime() - value.retrievedAt.getTime() !== REFRESH_AGE ||
    value.staleAfter.getTime() - value.retrievedAt.getTime() !== STALE_AGE ||
    (now !== undefined && value.retrievedAt.getTime() > now.getTime())
  ) {
    return null;
  }
  if (!exactRecord(value.payload, ["jurisdiction", "roster"]) || !sameJurisdiction(value.payload.jurisdiction, jurisdiction)) {
    return null;
  }
  const view = reconcileStateOfficials(jurisdiction, value.payload.roster);
  if (
    view === null ||
    !sourceTimesCoherent(value.payload.roster, value.retrievedAt.toISOString()) ||
    view.freshness.checkedAt !== value.retrievedAt.toISOString() ||
    view.freshness.refreshAfter !== value.refreshAfter.toISOString() ||
    view.freshness.staleAfter !== value.staleAfter.toISOString() ||
    view.freshness.state !== "fresh"
  ) {
    return null;
  }
  return {
    cacheKey: value.cacheKey,
    payload: { jurisdiction, roster: value.payload.roster as StateRosterInput },
    retrievedAt: new Date(value.retrievedAt),
    refreshAfter: new Date(value.refreshAfter),
    staleAfter: new Date(value.staleAfter),
  };
}

function available(
  record: StateOfficialCacheRecord & Readonly<{ payload: StateOfficialCachePayload }>,
  jurisdiction: StateJurisdiction,
  now: Date,
  state: "fresh" | "stale",
): StateOfficialsServiceResult {
  const view = reconcileStateOfficials(jurisdiction, {
    ...record.payload.roster,
    freshness: {
      checkedAt: record.retrievedAt.toISOString(),
      refreshAfter: record.refreshAfter.toISOString(),
      staleAfter: record.staleAfter.toISOString(),
      state,
    },
  });
  if (view === null || (state === "fresh") !== (now.getTime() < record.refreshAfter.getTime())) {
    return unavailable();
  }
  return { status: "available", view };
}

function stateCacheKey(jurisdiction: StateJurisdiction): StateOfficialCacheKey {
  return `state-roster:v1:${jurisdiction.stateCode}:${jurisdiction.districts
    .map((district) => `${district.chamber === "upper" ? "U" : "L"}-${district.district}`)
    .join(":")}`;
}

function stateJurisdictionFromCacheKey(value: unknown): StateJurisdiction | null {
  if (typeof value !== "string") return null;
  const match = /^state-roster:v1:([A-Z]{2}):U-([a-z0-9][a-z0-9-]{0,199})(?::L-([a-z0-9][a-z0-9-]{0,199}))?$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const state = match[1].toLowerCase();
  const divisions = [
    { type: "state" as const, name: "state", id: `ocd-division/country:us/state:${state}`, idScheme: "ocd" as const },
    { type: "state_upper" as const, name: "upper", id: `ocd-division/country:us/state:${state}/sldu:${match[2]}`, idScheme: "ocd" as const },
    ...(match[3] ? [{ type: "state_lower" as const, name: "lower", id: `ocd-division/country:us/state:${state}/sldl:${match[3]}`, idScheme: "ocd" as const }] : []),
  ];
  const result = stateJurisdictionFromDivisions(divisions);
  return result.status === "available" ? result.jurisdiction : null;
}

async function readCache(cache: StateOfficialCacheRepository, cacheKey: StateOfficialCacheKey) {
  try {
    return { status: "read" as const, record: await cache.read(cacheKey) };
  } catch {
    return { status: "failed" as const };
  }
}

function canonicalizeJurisdiction(value: unknown): StateJurisdiction | null {
  if (!exactRecord(value, ["stateCode", "stateDivisionId", "jurisdictionId", "legislature", "districts"]) ||
    typeof value.stateCode !== "string" ||
    typeof value.stateDivisionId !== "string" ||
    typeof value.jurisdictionId !== "string" ||
    (value.legislature !== "bicameral" && value.legislature !== "unicameral") ||
    !Array.isArray(value.districts) ||
    !value.districts.every((district) =>
      exactRecord(district, ["chamber", "district", "divisionId"]) &&
      (district.chamber === "upper" || district.chamber === "lower") &&
      typeof district.district === "string" && typeof district.divisionId === "string",
    )) return null;
  const divisions = [
    { type: "state" as const, name: "state", id: value.stateDivisionId, idScheme: "ocd" as const },
    ...value.districts.map((district) => ({
      type: district.chamber === "upper" ? "state_upper" as const : "state_lower" as const,
      name: district.chamber,
      id: district.divisionId,
      idScheme: "ocd" as const,
    })),
  ];
  const result = stateJurisdictionFromDivisions(divisions);
  return result.status === "available" && sameJurisdiction(value, result.jurisdiction)
    ? result.jurisdiction
    : null;
}

function readClock(clock: () => Date) {
  try {
    const value = clock();
    return validDate(value) ? new Date(value) : null;
  } catch {
    return null;
  }
}

function sameJurisdiction(left: unknown, right: StateJurisdiction) {
  if (!exactRecord(left, ["stateCode", "stateDivisionId", "jurisdictionId", "legislature", "districts"])) return false;
  const candidate = left as StateJurisdiction;
  return candidate.stateCode === right.stateCode &&
    candidate.stateDivisionId === right.stateDivisionId &&
    candidate.jurisdictionId === right.jurisdictionId &&
    candidate.legislature === right.legislature &&
    Array.isArray(candidate.districts) &&
    candidate.districts.length === right.districts.length &&
    candidate.districts.every((district, index) =>
      exactRecord(district, ["chamber", "district", "divisionId"]) &&
      district.chamber === right.districts[index]?.chamber &&
      district.district === right.districts[index]?.district &&
      district.divisionId === right.districts[index]?.divisionId,
    );
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function sourceTimesCoherent(roster: unknown, retrievedAt: string) {
  if (!exactRecord(roster, ["freshness", "seats"]) || !Array.isArray(roster.seats)) return false;
  return roster.seats.every((seat) => {
    if (!exactRecord(seat, ["chamber", "district", "seat", "people", "vacancySources"]) ||
      !Array.isArray(seat.people) || !Array.isArray(seat.vacancySources)) return false;
    const sources = [
      ...seat.vacancySources,
      ...seat.people.flatMap((person) =>
        exactRecord(person, ["id", "name", "role", "sources"]) && Array.isArray(person.sources)
          ? person.sources
          : [null],
      ),
    ];
    return sources.every((source) =>
      exactRecord(source, ["sourceType", "publicUrl", "retrievedAt", "effectiveAt"]) &&
      source.retrievedAt === retrievedAt &&
      (source.effectiveAt === null ||
        (typeof source.effectiveAt === "string" && Date.parse(source.effectiveAt) <= Date.parse(retrievedAt))),
    );
  });
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function unavailable(): StateOfficialsServiceResult {
  return { status: "unavailable" };
}
