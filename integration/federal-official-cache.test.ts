import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { databaseSchema, federalOfficialCache } from "@/db/schema";
import {
  createFederalOfficialCacheRepository,
  type FederalOfficialCacheRecord,
  type FederalRosterReplacement,
} from "@/lib/federal-officials-service";
import type {
  FederalJurisdiction,
  FederalOfficialsRoster,
  FederalSeat,
  SourceRef,
} from "@/lib/federal-officials";

// RED: this suite must first fail because the F5 table and repository are absent.

const HOUR = 60 * 60 * 1_000;
const NOW = new Date("2026-07-16T12:00:00.000Z");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for the PostgreSQL contract test");
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema: databaseSchema });
const repository = createFederalOfficialCacheRepository(db);

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE "federal_official_cache"');
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL federal official cache", () => {
  it("atomically removes displaced, replaces retained/current, and preserves unrelated profiles with the roster", async () => {
    await repository.replaceRoster(
      replacement("O000001", ["S000001"], hoursBefore(25)),
    );
    const unrelatedTime = hoursBefore(2);
    const unrelatedSeat = servingSeat(
      "senate",
      "U000001",
      null,
      {
        stateCode: "CA",
        district: 12,
        divisionIds: ["06", "0612"],
      },
      unrelatedTime,
    );
    await db.insert(federalOfficialCache).values(
      cacheRecord(
        "profile:v2:U000001",
        profileFor(unrelatedSeat),
        unrelatedTime,
      ),
    );
    await repository.replaceRoster(
      replacement("H000001", ["S000001", "S000002"], NOW),
    );

    const rows = await db
      .select()
      .from(federalOfficialCache)
      .orderBy(asc(federalOfficialCache.cacheKey));

    expect(rows.map(({ cacheKey }) => cacheKey)).toEqual([
      "profile:v2:H000001",
      "profile:v2:S000001",
      "profile:v2:S000002",
      "profile:v2:U000001",
      "roster:v1:GA:13",
    ]);
    expect(rows.some(({ cacheKey }) => cacheKey === "profile:v2:O000001")).toBe(
      false,
    );
    expect(
      rows.find(({ cacheKey }) => cacheKey === "profile:v2:S000001")
        ?.retrievedAt,
    ).toEqual(NOW);
    expect(
      rows.find(({ cacheKey }) => cacheKey === "profile:v2:U000001")
        ?.retrievedAt,
    ).toEqual(unrelatedTime);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cacheKey: "roster:v1:GA:13",
          retrievedAt: NOW,
          refreshAfter: new Date(NOW.getTime() + 24 * HOUR),
          staleAfter: new Date(NOW.getTime() + 72 * HOUR),
        }),
      ]),
    );
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(
      /"(?:address|latitude|longitude|userId|session|credential|rawProviderError)"/i,
    );
    expect(rows.every(({ cacheKey }) =>
      /^(?:roster:v1:[A-Z]{2}:(?:AL|[0-9]{2})|profile:v2:[A-Z][0-9]{6})$/.test(
        cacheKey,
      ),
    )).toBe(true);
  });

  it("rolls back profile deletion and replacement when the roster write fails", async () => {
    await repository.replaceRoster(replacement("O000001", [], hoursBefore(25)));
    const before = await storedRows();

    await pool.query(`
      CREATE FUNCTION f5_reject_roster_write() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.cache_key = 'roster:v1:GA:13'
          AND NEW.retrieved_at = TIMESTAMPTZ '${NOW.toISOString()}' THEN
          IF EXISTS (
            SELECT 1 FROM federal_official_cache
            WHERE cache_key = 'profile:v2:O000001'
          ) THEN
            RAISE EXCEPTION 'displaced profile was not deleted before roster write';
          END IF;
          IF (
            SELECT count(*) FROM federal_official_cache
            WHERE cache_key IN (
              'profile:v2:H000001',
              'profile:v2:S000001',
              'profile:v2:S000002'
            )
          ) <> 3 THEN
            RAISE EXCEPTION 'current profiles were not inserted before roster write';
          END IF;
          RAISE EXCEPTION 'synthetic roster write failure after profile replacement';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER f5_reject_roster_write
      BEFORE INSERT OR UPDATE ON federal_official_cache
      FOR EACH ROW EXECUTE FUNCTION f5_reject_roster_write();
    `);

    try {
      await expect(
        repository.replaceRoster(
          replacement("H000001", ["S000001", "S000002"], NOW),
        ),
      ).rejects.toThrow(
        "synthetic roster write failure after profile replacement",
      );
    } finally {
      await pool.query(
        "DROP TRIGGER IF EXISTS f5_reject_roster_write ON federal_official_cache",
      );
      await pool.query("DROP FUNCTION IF EXISTS f5_reject_roster_write() ");
    }

    expect(await storedRows()).toEqual(before);
  });

  it("does not let an older generation overwrite a newer two-connection replacement", async () => {
    await repository.replaceRoster(replacement("O000001", [], hoursBefore(25)));
    const olderPool = new Pool({ connectionString, max: 1 });
    const newerPool = new Pool({ connectionString, max: 1 });
    const olderDatabase = drizzle(olderPool, { schema: databaseSchema });
    const newerDatabase = drizzle(newerPool, { schema: databaseSchema });
    const olderStarted = Promise.withResolvers<void>();
    const releaseOlder = Promise.withResolvers<void>();
    const olderRepository = createFederalOfficialCacheRepository(
      gateTransactions(olderDatabase, olderStarted, releaseOlder.promise),
    );
    const newerRepository = createFederalOfficialCacheRepository(newerDatabase);
    const olderWrite = olderRepository.replaceRoster(
      replacement("O000002", [], hoursBefore(1)),
    );

    try {
      await olderStarted.promise;
      await newerRepository.replaceRoster(
        replacement("H000001", ["S000001", "S000002"], NOW),
      );
      releaseOlder.resolve();
      await expect(olderWrite).resolves.toEqual({
        status: "ignored",
        reason: "older_generation",
      });

      const rows = await storedRows();
      expect(rows.map(({ cacheKey }) => cacheKey)).toEqual([
        "profile:v2:H000001",
        "profile:v2:S000001",
        "profile:v2:S000002",
        "roster:v1:GA:13",
      ]);
      expect(
        rows.find(({ cacheKey }) => cacheKey === "roster:v1:GA:13")
          ?.retrievedAt,
      ).toEqual(NOW);
    } finally {
      releaseOlder.resolve();
      await Promise.allSettled([olderWrite]);
      await Promise.all([olderPool.end(), newerPool.end()]);
    }
  }, 15_000);

  it("rejects wrong-key, private, and invalid-time snapshots before persistence", async () => {
    const valid = replacement("H000001", ["S000001", "S000002"], NOW);
    const wrongKey: FederalRosterReplacement = {
      ...valid,
      roster: { ...valid.roster, cacheKey: "roster:v1:ga:13" },
    };
    const privatePayload: FederalRosterReplacement = {
      ...valid,
      profiles: valid.profiles.map((profile, index) =>
        index === 0
          ? { ...profile, payload: { ...objectPayload(profile), address: "private" } }
          : profile,
      ),
    };
    const invalidTimes: FederalRosterReplacement = {
      ...valid,
      roster: {
        ...valid.roster,
        refreshAfter: valid.roster.staleAfter,
        staleAfter: valid.roster.refreshAfter,
      },
    };

    for (const invalid of [wrongKey, privatePayload, invalidTimes]) {
      await expect(repository.replaceRoster(invalid)).rejects.toThrow();
      expect(await storedRows()).toEqual([]);
    }
  });
});

async function storedRows() {
  return db
    .select()
    .from(federalOfficialCache)
    .orderBy(asc(federalOfficialCache.cacheKey));
}

function replacement(
  houseId: string,
  senateIds: readonly string[],
  retrievedAt: Date,
): FederalRosterReplacement {
  const jurisdiction: FederalJurisdiction = {
    stateCode: "GA",
    district: 13,
    divisionIds: [
      "ocd-division/country:us/state:ga",
      "ocd-division/country:us/state:ga/cd:13",
    ],
  };
  const house = servingSeat("house", houseId, 13, jurisdiction, retrievedAt);
  const senate = senateIds.map((id) =>
    servingSeat("senate", id, null, jurisdiction, retrievedAt),
  );
  const roster: FederalOfficialsRoster = {
    jurisdiction,
    house,
    senate,
    coverage: {
      house: "verified",
      senate: senate.length === 2 ? "verified" : "unknown",
    },
  };
  return {
    roster: cacheRecord("roster:v1:GA:13", roster, retrievedAt),
    profiles: [house, ...senate].map((seat) =>
      cacheRecord(`profile:v2:${seat.person.bioguideId}`, profileFor(seat), retrievedAt),
    ),
  };
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

function servingSeat(
  chamber: "house" | "senate",
  bioguideId: string,
  district: number | null,
  jurisdiction: FederalJurisdiction,
  retrievedAt: Date,
): Extract<FederalSeat, { status: "serving" }> {
  const officeId = `federal:${chamber}:${jurisdiction.stateCode}:${district ?? bioguideId}`;
  const personId = `bioguide:${bioguideId}` as const;
  return {
    status: "serving",
    office: {
      id: officeId,
      chamber,
      stateCode: jurisdiction.stateCode,
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
    sources: [memberSource(bioguideId, retrievedAt)],
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

function memberSource(bioguideId: string, retrievedAt: Date): SourceRef {
  return {
    publisher: "Congress.gov",
    sourceType: "member",
    url: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
    retrievedAt: retrievedAt.toISOString(),
    recordUpdatedAt: retrievedAt.toISOString(),
    effectiveAt: null,
  };
}

function objectPayload(record: FederalOfficialCacheRecord) {
  if (!record.payload || typeof record.payload !== "object") {
    throw new Error("test fixture payload must be an object");
  }
  return record.payload;
}

function hoursBefore(hours: number) {
  return new Date(NOW.getTime() - hours * HOUR);
}

function gateTransactions(
  database: typeof db,
  started: PromiseWithResolvers<void>,
  release: Promise<void>,
) {
  type Transaction = Parameters<
    Parameters<typeof database.transaction>[0]
  >[0];
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return async <T>(
          callback: (transaction: Transaction) => Promise<T>,
        ) =>
          target.transaction(async (transaction) => {
            started.resolve();
            await release;
            return callback(transaction);
          });
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
