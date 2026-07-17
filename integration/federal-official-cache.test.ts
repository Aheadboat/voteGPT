import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { databaseSchema, federalOfficialCache } from "@/db/schema";
import {
  createFederalOfficialCacheRepository,
  type FederalOfficialCacheRecord,
  type FederalProfileCachePayload,
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
      ).rejects.toMatchObject({
        message: expect.stringMatching(/^Failed query:/),
        cause: {
          message: "synthetic roster write failure after profile replacement",
        },
      });
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

  it.each([
    {
      conflict: "Senate identity",
      expectedHouseCoverage: "verified",
      expectedHouseStatus: "serving",
      expectedKeys: [
        "profile:v2:H000013",
        "profile:v2:S000001",
        "profile:v2:S000002",
        "roster:v1:GA:13",
      ],
      expectedSenateCoverage: "verified",
      expectedSenateIds: ["S000001", "S000002"],
      first: replacementForDistrict(
        13,
        "H000013",
        ["S000001", "S000002"],
        NOW,
      ),
      losing: replacementForDistrict(
        13,
        "H000013",
        ["S000002", "S000003"],
        NOW,
      ),
    },
    {
      conflict: "Senate coverage status",
      expectedHouseCoverage: "verified",
      expectedHouseStatus: "serving",
      expectedKeys: [
        "profile:v2:H000013",
        "profile:v2:S000001",
        "roster:v1:GA:13",
      ],
      expectedSenateCoverage: "partial",
      expectedSenateIds: ["S000001"],
      first: replacementForDistrict(
        13,
        "H000013",
        ["S000001"],
        NOW,
        "partial",
      ),
      losing: replacementForDistrict(
        13,
        "H000013",
        ["S000001"],
        NOW,
        "unknown",
      ),
    },
    {
      conflict: "profile-less House status",
      expectedHouseCoverage: "unknown",
      expectedHouseStatus: "unknown",
      expectedKeys: [
        "profile:v2:S000001",
        "profile:v2:S000002",
        "roster:v1:GA:13",
      ],
      expectedSenateCoverage: "verified",
      expectedSenateIds: ["S000001", "S000002"],
      first: replacementWithUnknownHouse(
        ["S000001", "S000002"],
        NOW,
      ),
      losing: replacementForDistrict(
        13,
        "H000013",
        ["S000001", "S000002"],
        NOW,
      ),
    },
  ] as const)(
    "keeps the first same-key equal-generation publication on $conflict conflict",
    async ({
      expectedHouseCoverage,
      expectedHouseStatus,
      expectedKeys,
      expectedSenateCoverage,
      expectedSenateIds,
      first,
      losing,
    }) => {
      expect(first.roster.cacheKey).toBe(losing.roster.cacheKey);
      expect(first.roster.retrievedAt).toEqual(losing.roster.retrievedAt);
      await expect(repository.replaceRoster(first)).resolves.toEqual({
        status: "written",
      });

      const before = await storedRows();
      expect(before.map(({ cacheKey }) => cacheKey)).toEqual(expectedKeys);
      const storedRoster = before.find(
        ({ cacheKey }) => cacheKey === "roster:v1:GA:13",
      );
      if (!storedRoster) {
        throw new Error("initial equal-generation roster must be stored");
      }
      expect(storedRoster.retrievedAt).toEqual(NOW);
      expect(rosterSenateIds(storedRoster)).toEqual(expectedSenateIds);
      expect(objectPayload(storedRoster)).toMatchObject({
        coverage: {
          house: expectedHouseCoverage,
          senate: expectedSenateCoverage,
        },
        house: { status: expectedHouseStatus },
      });

      await expect(repository.replaceRoster(losing)).resolves.toEqual({
        status: "ignored",
        reason: "older_generation",
      });
      expect(await storedRows()).toEqual(before);
    },
  );

  it("keeps the maximum generation coherent when initially empty same-key publications race", async () => {
    const olderPool = new Pool({ connectionString, max: 1 });
    const newerPool = new Pool({ connectionString, max: 1 });
    const olderDatabase = drizzle(olderPool, { schema: databaseSchema });
    const newerDatabase = drizzle(newerPool, { schema: databaseSchema });

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await pool.query('TRUNCATE TABLE "federal_official_cache"');
        const olderStarted = Promise.withResolvers<void>();
        const newerStarted = Promise.withResolvers<void>();
        const releaseBoth = Promise.withResolvers<void>();
        const olderRepository = createFederalOfficialCacheRepository(
          gateTransactions(olderDatabase, olderStarted, releaseBoth.promise),
        );
        const newerRepository = createFederalOfficialCacheRepository(
          gateTransactions(newerDatabase, newerStarted, releaseBoth.promise),
        );
        const olderWrite = olderRepository.replaceRoster(
          replacement("O000002", ["S000001", "S000002"], hoursBefore(1)),
        );
        const newerWrite = newerRepository.replaceRoster(
          replacement("H000001", [], NOW),
        );

        try {
          await within(
            Promise.all([olderStarted.promise, newerStarted.promise]),
            5_000,
            `cold-race start ${attempt}`,
          );
          releaseBoth.resolve();
          await within(
            Promise.all([olderWrite, newerWrite]),
            5_000,
            `cold-race publication ${attempt}`,
          );

          const rows = await storedRows();
          expect(
            rows.map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
          ).toEqual([
            ["profile:v2:H000001", NOW],
            ["roster:v1:GA:13", NOW],
          ]);
          const roster = rows.find(
            ({ cacheKey }) => cacheKey === "roster:v1:GA:13",
          );
          expect(roster && objectPayload(roster)).toMatchObject({
            house: { person: { bioguideId: "H000001" } },
            senate: [],
          });
        } finally {
          releaseBoth.resolve();
          await Promise.allSettled([olderWrite, newerWrite]);
        }
      }
    } finally {
      await Promise.all([olderPool.end(), newerPool.end()]);
    }
  }, 30_000);

  it("keeps sibling rosters that share a Senate snapshot despite different retrieval times", async () => {
    const newerDistrict13 = orderProfiles(
      replacementForDistrict(
        13,
        "H000013",
        ["S000001", "S000002"],
        NOW,
      ),
      ["profile:v2:S000002", "profile:v2:S000001", "profile:v2:H000013"],
    );
    const olderDistrict12 = orderProfiles(
      replacementForDistrict(
        12,
        "H000012",
        ["S000001", "S000002"],
        hoursBefore(2),
      ),
      ["profile:v2:S000001", "profile:v2:S000002", "profile:v2:H000012"],
    );

    await expect(repository.replaceRoster(newerDistrict13)).resolves.toEqual({
      status: "written",
    });
    await expect(repository.replaceRoster(olderDistrict12)).resolves.toEqual({
      status: "written",
    });

    const rows = await storedRows();
    expect(rows.map(({ cacheKey }) => cacheKey)).toEqual([
      "profile:v2:H000012",
      "profile:v2:H000013",
      "profile:v2:S000001",
      "profile:v2:S000002",
      "roster:v1:GA:12",
      "roster:v1:GA:13",
    ]);
    expect(
      rows
        .filter(({ cacheKey }) => cacheKey.startsWith("roster:v1:GA:"))
        .map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
    ).toEqual([
      ["roster:v1:GA:12", hoursBefore(2)],
      ["roster:v1:GA:13", NOW],
    ]);
    const sharedProfiles = rows.filter(({ cacheKey }) =>
      ["profile:v2:S000001", "profile:v2:S000002"].includes(cacheKey),
    );
    expect(
      sharedProfiles.map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
    ).toEqual([
      ["profile:v2:S000001", NOW],
      ["profile:v2:S000002", NOW],
    ]);

    await expect(
      repository.replaceRoster(
        replacementForDistrict(
          12,
          "H000099",
          ["S000002"],
          hoursBefore(1),
        ),
      ),
    ).resolves.toEqual({
      status: "ignored",
      reason: "older_generation",
    });

    const afterIgnored = await storedRows();
    expect(afterIgnored).toEqual(rows);
    expect(
      rosterSenateIds(
        afterIgnored.find(({ cacheKey }) => cacheKey === "roster:v1:GA:12"),
      ),
    ).toEqual(["S000001", "S000002"]);
    const retainedHouse = afterIgnored.find(
      ({ cacheKey }) => cacheKey === "profile:v2:H000012",
    );
    expect(profileBioguideId(retainedHouse)).toBe("H000012");
    expect(retainedHouse?.retrievedAt).toEqual(hoursBefore(2));
    expect(
      afterIgnored
        .filter(({ cacheKey }) =>
          ["profile:v2:S000001", "profile:v2:S000002"].includes(cacheKey),
        )
        .map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
    ).toEqual([
      ["profile:v2:S000001", NOW],
      ["profile:v2:S000002", NOW],
    ]);
  }, 15_000);

  it.each([
    {
      conflict: "equal-generation identity",
      losingCoverage: "verified",
      losingIds: ["S000002", "S000003"],
      siblingCoverage: "verified",
      siblingIds: ["S000001", "S000002"],
      siblingRetrievedAt: hoursBefore(1),
    },
    {
      conflict: "newer-generation identity",
      losingCoverage: "verified",
      losingIds: ["S000002", "S000003"],
      siblingCoverage: "verified",
      siblingIds: ["S000001", "S000002"],
      siblingRetrievedAt: NOW,
    },
    {
      conflict: "equal-generation status",
      losingCoverage: "unknown",
      losingIds: ["S000001"],
      siblingCoverage: "partial",
      siblingIds: ["S000001"],
      siblingRetrievedAt: hoursBefore(1),
    },
    {
      conflict: "newer-generation status",
      losingCoverage: "unknown",
      losingIds: ["S000001"],
      siblingCoverage: "partial",
      siblingIds: ["S000001"],
      siblingRetrievedAt: NOW,
    },
  ] as const)(
    "ignores a losing state publication as a whole on $conflict conflict",
    async ({
      losingCoverage,
      losingIds,
      siblingCoverage,
      siblingIds,
      siblingRetrievedAt,
    }) => {
      const siblingIdSet = new Set<string>(siblingIds);
      await repository.replaceRoster(
        replacementForDistrict(
          13,
          "H000013",
          siblingIds,
          siblingRetrievedAt,
          siblingCoverage,
        ),
      );

      await expect(
        repository.replaceRoster(
          replacementForDistrict(
            12,
            "H000012",
            losingIds,
            hoursBefore(1),
            losingCoverage,
          ),
        ),
      ).resolves.toEqual({
        status: "ignored",
        reason: "older_generation",
      });

      const rows = await storedRows();
      expect(rows.map(({ cacheKey }) => cacheKey)).toEqual(
        [
          "profile:v2:H000013",
          ...siblingIds.map((id) => `profile:v2:${id}`),
          "roster:v1:GA:13",
        ].sort(),
      );
      expect(
        rosterSenateIds(
          rows.find(({ cacheKey }) => cacheKey === "roster:v1:GA:13"),
        ),
      ).toEqual(siblingIds);
      expect(
        rows.some(({ cacheKey }) =>
          [
            "roster:v1:GA:12",
            "profile:v2:H000012",
            ...losingIds
              .filter((id) => !siblingIdSet.has(id))
              .map((id) => `profile:v2:${id}`),
          ].includes(cacheKey),
        ),
      ).toBe(false);
    },
  );

  it("invalidates older sibling artifacts when a newer publication changes the Senate snapshot", async () => {
    await repository.replaceRoster(
      replacementForDistrict(
        12,
        "H000012",
        ["S000001", "S000002"],
        hoursBefore(2),
      ),
    );
    await repository.replaceRoster(
      replacementForDistrict(
        13,
        "H000013",
        ["S000001", "S000002"],
        hoursBefore(1),
      ),
    );

    await expect(
      repository.replaceRoster(
        replacementForDistrict(
          13,
          "H000013",
          ["S000002", "S000003"],
          NOW,
        ),
      ),
    ).resolves.toEqual({ status: "written" });

    const rows = await storedRows();
    expect(
      rows.some(({ cacheKey }) => cacheKey === "roster:v1:GA:12"),
    ).toBe(false);
    expect(
      rosterSenateIds(
        rows.find(({ cacheKey }) => cacheKey === "roster:v1:GA:13"),
      ),
    ).toEqual(["S000002", "S000003"]);
    const preservedHouse = rows.find(
      ({ cacheKey }) => cacheKey === "profile:v2:H000012",
    );
    expect(profileBioguideId(preservedHouse)).toBe("H000012");
    expect(preservedHouse?.retrievedAt).toEqual(hoursBefore(2));
    expect(
      profileBioguideId(
        rows.find(({ cacheKey }) => cacheKey === "profile:v2:S000001"),
      ),
    ).toBeNull();
    expect(
      rows
        .filter(({ cacheKey }) => cacheKey.startsWith("profile:v2:"))
        .map(profileBioguideId)
        .filter((id): id is string => id !== null)
        .sort(),
    ).toEqual(["H000012", "H000013", "S000002", "S000003"]);

    const restoredAt = new Date(NOW.getTime() + HOUR);
    await expect(
      repository.replaceRoster(
        replacementForDistrict(
          12,
          "H000099",
          ["S000002", "S000003"],
          restoredAt,
        ),
      ),
    ).resolves.toEqual({ status: "written" });

    const restoredRows = await storedRows();
    const restoredRoster = restoredRows.find(
      ({ cacheKey }) => cacheKey === "roster:v1:GA:12",
    );
    expect(
      restoredRows
        .filter(({ cacheKey }) => cacheKey.startsWith("roster:v1:GA:"))
        .map(({ cacheKey }) => cacheKey),
    ).toEqual(["roster:v1:GA:12", "roster:v1:GA:13"]);
    expect(rosterSenateIds(restoredRoster)).toEqual(["S000002", "S000003"]);
    expect(restoredRoster?.retrievedAt).toEqual(restoredAt);
    expect(
      restoredRows.find(
        ({ cacheKey }) => cacheKey === "profile:v2:H000012",
      ),
    ).toBeUndefined();
    const replacementHouse = restoredRows.find(
      ({ cacheKey }) => cacheKey === "profile:v2:H000099",
    );
    expect(profileBioguideId(replacementHouse)).toBe("H000099");
    expect(replacementHouse?.retrievedAt).toEqual(restoredAt);
    expect(
      restoredRows
        .filter(({ cacheKey }) => cacheKey.startsWith("profile:v2:"))
        .map(profileBioguideId)
        .filter((id): id is string => id !== null)
        .sort(),
    ).toEqual(["H000013", "H000099", "S000002", "S000003"]);
    expect(
      restoredRows
        .filter(({ cacheKey }) =>
          ["profile:v2:S000002", "profile:v2:S000003"].includes(cacheKey),
        )
        .map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
    ).toEqual([
      ["profile:v2:S000002", restoredAt],
      ["profile:v2:S000003", restoredAt],
    ]);
  });

  it.each([
    ["newer", hoursBefore(3)],
    ["equal", hoursBefore(2)],
  ])(
    "ignores a replacement when its detached House profile has a %s generation",
    async (_detachedGeneration, attemptedAt) => {
      await repository.replaceRoster(
        replacementForDistrict(
          12,
          "H000012",
          ["S000001", "S000002"],
          hoursBefore(2),
        ),
      );
      await repository.replaceRoster(
        replacementForDistrict(
          13,
          "H000013",
          ["S000001", "S000002"],
          hoursBefore(1),
        ),
      );
      await repository.replaceRoster(
        replacementForDistrict(
          13,
          "H000013",
          ["S000002", "S000003"],
          NOW,
        ),
      );

      const beforeAttempt = await storedRows();
      expect(
        beforeAttempt.some(
          ({ cacheKey }) => cacheKey === "roster:v1:GA:12",
        ),
      ).toBe(false);
      const detachedHouse = beforeAttempt.find(
        ({ cacheKey }) => cacheKey === "profile:v2:H000012",
      );
      expect(profileBioguideId(detachedHouse)).toBe("H000012");
      expect(detachedHouse?.retrievedAt).toEqual(hoursBefore(2));
      expect(
        rosterSenateIds(
          beforeAttempt.find(
            ({ cacheKey }) => cacheKey === "roster:v1:GA:13",
          ),
        ),
      ).toEqual(["S000002", "S000003"]);

      await expect(
        repository.replaceRoster(
          replacementForDistrict(
            12,
            "H000099",
            ["S000002", "S000003"],
            attemptedAt,
          ),
        ),
      ).resolves.toEqual({
        status: "ignored",
        reason: "older_generation",
      });

      const afterAttempt = await storedRows();
      expect(afterAttempt).toEqual(beforeAttempt);
      expect(
        afterAttempt.some(
          ({ cacheKey }) =>
            cacheKey === "roster:v1:GA:12" ||
            cacheKey === "profile:v2:H000099",
        ),
      ).toBe(false);
      expect(
        afterAttempt.find(
          ({ cacheKey }) => cacheKey === "profile:v2:H000012",
        ),
      ).toEqual(detachedHouse);
    },
  );

  it("settles concurrent reverse-order shared profile publications at the newest generation", async () => {
    const olderPool = new Pool({ connectionString, max: 1 });
    const newerPool = new Pool({ connectionString, max: 1 });
    const olderDatabase = drizzle(olderPool, { schema: databaseSchema });
    const newerDatabase = drizzle(newerPool, { schema: databaseSchema });
    const olderStarted = Promise.withResolvers<void>();
    const newerStarted = Promise.withResolvers<void>();
    const releaseBoth = Promise.withResolvers<void>();
    const olderRepository = createFederalOfficialCacheRepository(
      gateTransactions(olderDatabase, olderStarted, releaseBoth.promise),
    );
    const newerRepository = createFederalOfficialCacheRepository(
      gateTransactions(newerDatabase, newerStarted, releaseBoth.promise),
    );
    const olderWrite = olderRepository.replaceRoster(
      orderProfiles(
        replacementForDistrict(
          12,
          "H000012",
          ["S000001", "S000002"],
          hoursBefore(1),
        ),
        ["profile:v2:S000001", "profile:v2:S000002", "profile:v2:H000012"],
      ),
    );
    const newerWrite = newerRepository.replaceRoster(
      orderProfiles(
        replacementForDistrict(
          13,
          "H000013",
          ["S000001", "S000002"],
          NOW,
        ),
        ["profile:v2:S000002", "profile:v2:S000001", "profile:v2:H000013"],
      ),
    );

    try {
      await within(
        Promise.all([olderStarted.promise, newerStarted.promise]),
        5_000,
        "shared-profile race start",
      );
      releaseBoth.resolve();
      await expect(
        within(
          Promise.all([olderWrite, newerWrite]),
          5_000,
          "shared-profile reverse-order publication",
        ),
      ).resolves.toEqual([{ status: "written" }, { status: "written" }]);

      const sharedProfiles = (await storedRows()).filter(({ cacheKey }) =>
        ["profile:v2:S000001", "profile:v2:S000002"].includes(cacheKey),
      );
      expect(
        sharedProfiles.map(({ cacheKey, retrievedAt }) => [cacheKey, retrievedAt]),
      ).toEqual([
        ["profile:v2:S000001", NOW],
        ["profile:v2:S000002", NOW],
      ]);
    } finally {
      releaseBoth.resolve();
      await Promise.allSettled([olderWrite, newerWrite]);
      await Promise.all([olderPool.end(), newerPool.end()]);
    }
  }, 15_000);

  it("does not resurrect a shared senator when an older other-district publication finishes after newer displacement", async () => {
    await repository.replaceRoster(
      replacementForDistrict(
        13,
        "H000013",
        ["S000001", "S000002"],
        hoursBefore(2),
      ),
    );
    const olderPool = new Pool({ connectionString, max: 1 });
    const olderDatabase = drizzle(olderPool, { schema: databaseSchema });
    const olderStarted = Promise.withResolvers<void>();
    const releaseOlder = Promise.withResolvers<void>();
    const olderRepository = createFederalOfficialCacheRepository(
      gateTransactions(olderDatabase, olderStarted, releaseOlder.promise),
    );
    const olderWrite = olderRepository.replaceRoster(
      replacementForDistrict(
        12,
        "H000012",
        ["S000001", "S000002"],
        hoursBefore(1),
      ),
    );

    try {
      await within(olderStarted.promise, 5_000, "older district publication start");
      await repository.replaceRoster(
        replacementForDistrict(13, "H000013", ["S000002"], NOW),
      );
      releaseOlder.resolve();
      await expect(
        within(olderWrite, 5_000, "older district publication completion"),
      ).resolves.toEqual({
        status: "ignored",
        reason: "older_generation",
      });

      const afterOlderCompletion = await storedRows();
      expect(
        afterOlderCompletion.some(
          ({ cacheKey }) => cacheKey === "roster:v1:GA:12",
        ),
      ).toBe(false);
      expect(
        profileBioguideId(
          afterOlderCompletion.find(
            ({ cacheKey }) => cacheKey === "profile:v2:H000012",
          ),
        ),
      ).toBeNull();
      expect(
        profileBioguideId(
          afterOlderCompletion.find(
            ({ cacheKey }) => cacheKey === "profile:v2:S000001",
          ),
        ),
      ).toBeNull();

      const reappearedAt = new Date(NOW.getTime() + HOUR);
      await expect(
        repository.replaceRoster(
          replacementForDistrict(
            13,
            "H000013",
            ["S000001", "S000002"],
            reappearedAt,
          ),
        ),
      ).resolves.toEqual({ status: "written" });
      const afterNewerReappearance = await storedRows();
      const reappeared = afterNewerReappearance.find(
        ({ cacheKey }) => cacheKey === "profile:v2:S000001",
      );
      const reappearedRoster = afterNewerReappearance.find(
        ({ cacheKey }) => cacheKey === "roster:v1:GA:13",
      );
      expect(profileBioguideId(reappeared)).toBe("S000001");
      expect(reappeared?.retrievedAt).toEqual(reappearedAt);
      expect(rosterSenateIds(reappearedRoster)).toEqual([
        "S000001",
        "S000002",
      ]);
      expect(reappearedRoster?.retrievedAt).toEqual(reappearedAt);
    } finally {
      releaseOlder.resolve();
      await Promise.allSettled([olderWrite]);
      await olderPool.end();
    }
  }, 15_000);

  it.each(profileMismatchCases())(
    "rejects a separately valid profile whose %s differs from its serving roster seat",
    async (_label, mutate) => {
      const valid = replacement("H000001", ["S000001", "S000002"], NOW);
      const [target, ...remaining] = valid.profiles;
      if (!target) {
        throw new Error("test fixture requires a serving profile");
      }
      const invalid: FederalRosterReplacement = {
        ...valid,
        profiles: [
          { ...target, payload: mutate(profilePayload(target)) },
          ...remaining,
        ],
      };

      await expect(repository.replaceRoster(invalid)).rejects.toThrow(
        "Invalid federal official cache replacement",
      );
      expect(await storedRows()).toEqual([]);
    },
  );

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
  return replacementForDistrict(13, houseId, senateIds, retrievedAt);
}

function replacementWithUnknownHouse(
  senateIds: readonly string[],
  retrievedAt: Date,
): FederalRosterReplacement {
  const base = replacement("H000013", senateIds, retrievedAt);
  const roster = objectPayload(base.roster) as FederalOfficialsRoster;
  const unknownHouse: FederalSeat = {
    status: "unknown",
    office: {
      id: "federal:house:GA:13",
      chamber: "house",
      stateCode: "GA",
      district: 13,
      title: "U.S. Representative",
    },
    sources: [clerkListSource(retrievedAt)],
  };
  return {
    roster: {
      ...base.roster,
      payload: {
        ...roster,
        house: unknownHouse,
        coverage: { ...roster.coverage, house: "unknown" },
      },
    },
    profiles: base.profiles.filter(
      (profile) => profilePayload(profile).office.chamber === "senate",
    ),
  };
}

function replacementForDistrict(
  district: number,
  houseId: string,
  senateIds: readonly string[],
  retrievedAt: Date,
  senateCoverage?: "verified" | "partial" | "unknown",
): FederalRosterReplacement {
  const jurisdiction: FederalJurisdiction = {
    stateCode: "GA",
    district,
    divisionIds: [
      "ocd-division/country:us/state:ga",
      `ocd-division/country:us/state:ga/cd:${district}`,
    ],
  };
  const house = servingSeat("house", houseId, district, jurisdiction, retrievedAt);
  const senate = senateIds.map((id) =>
    servingSeat("senate", id, null, jurisdiction, retrievedAt),
  );
  const roster: FederalOfficialsRoster = {
    jurisdiction,
    house,
    senate,
    coverage: {
      house: "verified",
      senate: senateCoverage ?? (senate.length === 2 ? "verified" : "unknown"),
    },
  };
  return {
    roster: cacheRecord(
      `roster:v1:GA:${String(district).padStart(2, "0")}`,
      roster,
      retrievedAt,
    ),
    profiles: [house, ...senate].map((seat) =>
      cacheRecord(`profile:v2:${seat.person.bioguideId}`, profileFor(seat), retrievedAt),
    ),
  };
}

function orderProfiles(
  replacement: FederalRosterReplacement,
  cacheKeys: readonly string[],
): FederalRosterReplacement {
  const profiles = cacheKeys.map((cacheKey) => {
    const profile = replacement.profiles.find(
      (candidate) => candidate.cacheKey === cacheKey,
    );
    if (!profile) {
      throw new Error(`missing ordered profile ${cacheKey}`);
    }
    return profile;
  });
  return { ...replacement, profiles };
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
    sources: [
      memberSource(bioguideId, retrievedAt),
      ...(chamber === "house" ? [clerkListSource(retrievedAt)] : []),
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

function profilePayload(
  record: FederalOfficialCacheRecord,
): FederalProfileCachePayload {
  return record.payload as FederalProfileCachePayload;
}

function profileMismatchCases(): ReadonlyArray<
  readonly [
    string,
    (payload: FederalProfileCachePayload) => FederalProfileCachePayload,
  ]
> {
  return [
    [
      "person name",
      (payload) => ({
        ...payload,
        person: { ...payload.person, name: "Conflicting profile name" },
      }),
    ],
    [
      "office",
      (payload) => {
        const office = {
          ...payload.office,
          id: "federal:house:CA:12",
          stateCode: "CA",
          district: 12,
        };
        return {
          ...payload,
          office,
          term: { ...payload.term, officeId: office.id },
        };
      },
    ],
    [
      "term",
      (payload) => ({
        ...payload,
        term: {
          ...payload.term,
          congress: 118,
          startYear: 2023,
          endYear: 2025,
        },
      }),
    ],
    [
      "source",
      (payload) => ({
        ...payload,
        sources: payload.sources.map((source, index) =>
          index === 0
            ? { ...source, recordUpdatedAt: hoursBefore(1).toISOString() }
            : source,
        ),
      }),
    ],
  ];
}

function profileBioguideId(
  record: FederalOfficialCacheRecord | undefined,
): string | null {
  if (!record?.payload || typeof record.payload !== "object") {
    return null;
  }
  const person = "person" in record.payload ? record.payload.person : null;
  return person && typeof person === "object" && "bioguideId" in person &&
    typeof person.bioguideId === "string"
    ? person.bioguideId
    : null;
}

function rosterSenateIds(
  record: FederalOfficialCacheRecord | undefined,
): string[] | null {
  if (!record?.payload || typeof record.payload !== "object") {
    return null;
  }
  const senate = "senate" in record.payload ? record.payload.senate : null;
  if (!Array.isArray(senate)) {
    return null;
  }
  const ids = senate.map((seat) => {
    if (!seat || typeof seat !== "object" || !("person" in seat)) {
      return null;
    }
    const person = seat.person;
    return person && typeof person === "object" && "bioguideId" in person &&
      typeof person.bioguideId === "string"
      ? person.bioguideId
      : null;
  });
  return ids.every((id): id is string => id !== null) ? ids : null;
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

function clerkListSource(retrievedAt: Date): SourceRef {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives",
    sourceType: "vacancy",
    url: "https://clerk.house.gov/Members/ViewVacancies",
    retrievedAt: retrievedAt.toISOString(),
    recordUpdatedAt: null,
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

async function within<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
