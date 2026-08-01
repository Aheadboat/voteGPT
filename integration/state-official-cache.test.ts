import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db";
import { databaseSchema, stateOfficialCache } from "@/db/schema";
import {
  createStateOfficialCacheRepository,
  type StateOfficialCacheRecord,
} from "@/lib/state-officials-service";
import type { StateJurisdiction, StateRosterInput } from "@/lib/state-officials";

const HOUR = 60 * 60 * 1_000;
const NOW = new Date("2026-07-31T12:00:00.000Z");
const jurisdiction: StateJurisdiction = {
  stateCode: "GA",
  stateDivisionId: "ocd-division/country:us/state:ga",
  jurisdictionId: "ocd-jurisdiction/country:us/state:ga/government",
  legislature: "bicameral",
  districts: [
    { chamber: "upper", district: "13", divisionId: "ocd-division/country:us/state:ga/sldu:13" },
    { chamber: "lower", district: "25", divisionId: "ocd-division/country:us/state:ga/sldl:25" },
  ],
};
const db = await createDatabase("pglite://memory");
const repository = createStateOfficialCacheRepository(db);

beforeEach(async () => {
  await db.execute(sql`truncate table state_official_cache`);
});

afterAll(async () => {
  const client = db.$client;
  if ("close" in client && typeof client.close === "function") await client.close();
});

describe("state official cache migration", () => {
  it("registers the cache table and enforces canonical key and time windows", async () => {
    expect(databaseSchema).toHaveProperty("stateOfficialCache", stateOfficialCache);
    const valid = record(NOW);
    await expect(repository.write(valid)).resolves.toEqual({ status: "written" });
    await expect(db.insert(stateOfficialCache).values({ ...valid, cacheKey: "private:address" })).rejects.toThrow();
    await expect(db.insert(stateOfficialCache).values({ ...valid, refreshAfter: valid.retrievedAt })).rejects.toThrow();
  });

  it("ignores older and equal generations, replacing only with a complete newer roster", async () => {
    const newest = record(NOW);
    await repository.write(newest);
    await expect(repository.write(record(hoursBefore(1)))).resolves.toEqual({ status: "ignored", reason: "older_generation" });
    await expect(repository.write(record(NOW))).resolves.toEqual({ status: "ignored", reason: "older_generation" });
    await expect(repository.write({ ...record(hoursBefore(-1)), payload: { malformed: true } })).rejects.toThrow();
    await expect(repository.read("state-roster:v1:GA:U-13:L-25")).resolves.toMatchObject({ retrievedAt: NOW, payload: newest.payload });
  });
});

function record(retrievedAt: Date): StateOfficialCacheRecord {
  return {
    cacheKey: "state-roster:v1:GA:U-13:L-25",
    payload: { jurisdiction, roster: cachedRoster(retrievedAt) },
    retrievedAt,
    refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR),
    staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR),
  };
}

function cachedRoster(retrievedAt: Date): StateRosterInput {
  const value = roster(retrievedAt);
  return {
    ...value,
    freshness: {
      checkedAt: retrievedAt.toISOString(),
      refreshAfter: new Date(retrievedAt.getTime() + 24 * HOUR).toISOString(),
      staleAfter: new Date(retrievedAt.getTime() + 72 * HOUR).toISOString(),
      state: "fresh",
    },
  };
}

function roster(retrievedAt: Date): StateRosterInput {
  const checkedAt = retrievedAt.toISOString();
  return {
    freshness: { checkedAt, refreshAfter: checkedAt, staleAfter: checkedAt, state: "fresh" },
    seats: [{ chamber: "upper", district: "13", seat: "State Senator", people: [], vacancySources: [] }],
  };
}

function hoursBefore(hours: number) {
  return new Date(NOW.getTime() - hours * HOUR);
}

const connectionString = process.env.DATABASE_URL;
const postgres = connectionString ? describe : describe.skip;

postgres("PostgreSQL state official cache", () => {
  const primaryPool = new Pool({ connectionString });
  const olderPool = new Pool({ connectionString, max: 1 });
  const newerPool = new Pool({ connectionString, max: 1 });
  const primary = createStateOfficialCacheRepository(drizzle(primaryPool, { schema: databaseSchema }));
  const older = createStateOfficialCacheRepository(drizzle(olderPool, { schema: databaseSchema }));
  const newer = createStateOfficialCacheRepository(drizzle(newerPool, { schema: databaseSchema }));

  beforeEach(async () => {
    await primaryPool.query('TRUNCATE TABLE "state_official_cache"');
  });

  afterAll(async () => {
    await Promise.all([primaryPool.end(), olderPool.end(), newerPool.end()]);
  });

  it("uses PostgreSQL strict-newer upsert across physical connections", async () => {
    const newest = record(NOW);
    await expect(newer.write(newest)).resolves.toEqual({ status: "written" });
    await expect(older.write(record(hoursBefore(1)))).resolves.toEqual({ status: "ignored", reason: "older_generation" });
    await expect(older.write(record(NOW))).resolves.toEqual({ status: "ignored", reason: "older_generation" });
    await expect(primary.read("state-roster:v1:GA:U-13:L-25")).resolves.toMatchObject({ retrievedAt: NOW, payload: newest.payload });
  });

  it("keeps newest complete generation under deterministic physical-connection contention", async () => {
    const olderRecord = record(hoursBefore(1));
    const newerRecord = record(NOW);
    for (const [holderRecord, contenderRecord, contenderPool, contender] of [
      [olderRecord, newerRecord, newerPool, newer],
      [newerRecord, olderRecord, olderPool, older],
    ] as const) {
      await primaryPool.query('TRUNCATE TABLE "state_official_cache"');
      const holder = await primaryPool.connect();
      try {
        await holder.query("BEGIN");
        await insertRecord(holder, holderRecord);
        const [{ pid }] = (await contenderPool.query<{ pid: number }>("select pg_backend_pid() as pid")).rows;
        if (!pid) throw new Error("missing contender PostgreSQL PID");
        const pending = contender.write(contenderRecord);
        await waitForInsertLock(primaryPool, pid);
        await holder.query("COMMIT");
        await expect(pending).resolves.toEqual(
          contenderRecord === newerRecord
            ? { status: "written" }
            : { status: "ignored", reason: "older_generation" },
        );
      } finally {
        await holder.query("ROLLBACK").catch(() => undefined);
        holder.release();
      }
      await expect(primary.read("state-roster:v1:GA:U-13:L-25")).resolves.toMatchObject({ retrievedAt: NOW, payload: newerRecord.payload });
    }
  });
});

async function insertRecord(client: PoolClient, value: StateOfficialCacheRecord) {
  await client.query(
    `INSERT INTO state_official_cache
      (cache_key, payload, retrieved_at, refresh_after, stale_after)
     VALUES ($1, $2::jsonb, $3, $4, $5)`,
    [value.cacheKey, JSON.stringify(value.payload), value.retrievedAt, value.refreshAfter, value.staleAfter],
  );
}

async function waitForInsertLock(pool: Pool, pid: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    const [{ waiting }] = (await pool.query<{ waiting: boolean }>(
      "select exists (select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock') as waiting",
      [pid],
    )).rows;
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("state cache contender did not wait for holder lock");
}
