import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

const fallbackDatabaseUrl = "pglite://.data/e2e";
const hosted =
  process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const databaseUrl =
  process.env.E2E_DATABASE_URL?.trim() ||
  (hosted ? process.env.DATABASE_URL?.trim() : undefined) ||
  fallbackDatabaseUrl;
if (process.env.CONGRESS_GOV_API_KEY?.trim()) {
  throw new Error("E2E federal fixtures require a blank Congress.gov credential.");
}
process.env.CONGRESS_GOV_API_KEY = "";
const migrationsFolder = resolve(process.cwd(), "drizzle");
const identities = [
  {
    accountId: "e2e-google-account",
    accountRowId: "e2e-account",
    email: "voter@example.invalid",
    name: "E2E Voter",
    sessionId: "e2e-session",
    sessionToken: "e2e-session-token",
    userId: "e2e-user",
  },
  {
    accountId: "e2e-secondary-google-account",
    accountRowId: "e2e-secondary-account",
    email: "secondary-voter@example.invalid",
    name: "Secondary E2E Voter",
    sessionId: "e2e-secondary-session",
    sessionToken: "e2e-secondary-session-token",
    userId: "e2e-secondary-user",
  },
];
const federalIdentities = [
  federalIdentity("no-home", "No-home"),
  federalIdentity("ga-13", "Georgia 13", "GA", 13),
  federalIdentity("ak-at-large", "Alaska At-large", "AK", 0),
  federalIdentity("ga-14-vacancy", "Georgia 14", "GA", 14),
  federalIdentity("ca-01-stale", "California 1", "CA", 1),
  federalIdentity("tx-01-expired", "Texas 1", "TX", 1),
  federalIdentity("dc-unsupported", "District of Columbia", "DC", 0),
];
const fixtureIdentities = [...identities, ...federalIdentities];

const postgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl);
const pgliteDirectory = databaseUrl.startsWith("pglite://")
  ? databaseUrl.slice("pglite://".length)
  : null;

if (pgliteDirectory === "memory") {
  throw new Error("E2E database must be shared and file-backed.");
}
if (hosted && !postgres) {
  throw new Error("Hosted E2E requires a dedicated PostgreSQL database.");
}
if (!postgres && (!pgliteDirectory || !pgliteDirectory.trim())) {
  throw new Error("E2E database must use PostgreSQL or file-backed PGlite.");
}

process.env.E2E_DATABASE_URL = databaseUrl;
process.env.DATABASE_URL = databaseUrl;

if (pgliteDirectory) {
  await mkdir(".data", { recursive: true });
  const client = new PGlite(pgliteDirectory);

  try {
    await migrate(drizzle(client), { migrationsFolder });
    await seedIdentities((text, values) => client.query(text, values));
  } finally {
    await client.close();
  }
} else {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await migratePostgres(drizzlePostgres(pool), { migrationsFolder });
    const client = await pool.connect();
    try {
      await seedIdentities((text, values) => client.query(text, values));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function seedIdentities(query) {
  await query("BEGIN");
  try {
    const cacheRecords = federalCacheRecords();
    await query(
      `DELETE FROM "user"
       WHERE "id" = ANY($1::text[]) OR lower("email") = ANY($2::text[])`,
      [
        fixtureIdentities.map(({ userId }) => userId),
        fixtureIdentities.map(({ email }) => email.toLowerCase()),
      ],
    );
    await query(
      `DELETE FROM "federal_official_cache"
       WHERE "cache_key" = ANY($1::text[])`,
      [cacheRecords.map(({ cacheKey }) => cacheKey)],
    );

    for (const identity of fixtureIdentities) {
      await query(
        `INSERT INTO "user" (
          "id", "name", "email", "email_verified", "created_at", "updated_at"
        ) VALUES ($1, $2, $3, true, NOW(), NOW())`,
        [identity.userId, identity.name, identity.email],
      );
      await query(
        `INSERT INTO "account" (
          "id", "account_id", "provider_id", "user_id", "created_at", "updated_at"
        ) VALUES ($1, $2, 'google', $3, NOW(), NOW())`,
        [identity.accountRowId, identity.accountId, identity.userId],
      );
      await query(
        `INSERT INTO "session" (
          "id", "expires_at", "token", "created_at", "updated_at", "user_id"
        ) VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
        [
          identity.sessionId,
          "2099-01-01T00:00:00.000Z",
          identity.sessionToken,
          identity.userId,
        ],
      );
    }

    for (const identity of federalIdentities) {
      if (!identity.divisions) {
        continue;
      }
      await query(
        `INSERT INTO "saved_residence" (
          "user_id", "envelope_version", "key_version", "iv", "ciphertext",
          "tag", "resolution_status", "source_name", "source_url",
          "source_checked_at", "source_effective_at", "source_benchmark",
          "source_vintage", "coverage_notes", "consent_version",
          "consented_at", "created_at", "updated_at"
        ) VALUES (
          $1, 'v1', 'e2e-current', 'fixture-iv', 'fixture-ciphertext',
          'fixture-tag', 'matched', 'Deterministic E2E fixture',
          'https://example.invalid/federal-fixture', NOW(), NULL, NULL, NULL,
          '[]'::jsonb, 'saved-residence-v1', NOW(), NOW(), NOW()
        )`,
        [identity.userId],
      );
      for (const [displayOrder, division] of identity.divisions.entries()) {
        await query(
          `INSERT INTO "saved_residence_division" (
            "user_id", "type", "id_scheme", "division_id", "name",
            "display_order"
          ) VALUES ($1, $2, 'ocd', $3, $4, $5)`,
          [
            identity.userId,
            division.type,
            division.id,
            division.name,
            displayOrder,
          ],
        );
      }
    }

    for (const record of cacheRecords) {
      await query(
        `INSERT INTO "federal_official_cache" (
          "cache_key", "payload", "retrieved_at", "refresh_after", "stale_after"
        ) VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz, $5::timestamptz)`,
        [
          record.cacheKey,
          JSON.stringify(record.payload),
          record.retrievedAt.toISOString(),
          record.refreshAfter.toISOString(),
          record.staleAfter.toISOString(),
        ],
      );
    }

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

function federalIdentity(slug, name, stateCode, district) {
  const userId = `e2e-federal-${slug}-user`;
  return {
    accountId: `e2e-federal-${slug}-google-account`,
    accountRowId: `e2e-federal-${slug}-account`,
    email: `e2e-federal-${slug}@example.invalid`,
    name: `${name} E2E Voter`,
    sessionId: `e2e-federal-${slug}-session`,
    sessionToken: `e2e-federal-${slug}-session-token`,
    userId,
    divisions:
      stateCode === undefined || district === undefined
        ? null
        : [
            {
              type: "state",
              id: `ocd-division/country:us/state:${stateCode.toLowerCase()}`,
              name: stateCode === "DC" ? "District of Columbia" : stateCode,
            },
            {
              type: "congressional_district",
              id: `ocd-division/country:us/state:${stateCode.toLowerCase()}/cd:${district}`,
              name:
                district === 0
                  ? `${stateCode} At-large Congressional District`
                  : `${stateCode} Congressional District ${district}`,
            },
          ],
  };
}

function federalCacheRecords() {
  const now = Date.now();
  const freshAt = new Date(now - 60 * 60 * 1_000);
  const staleAt = new Date(now - 25 * 60 * 60 * 1_000);
  const expiredAt = new Date(now - 73 * 60 * 60 * 1_000);
  const gaSenators = [
    servingSeat("senate", "GA", null, "G000001", "Georgia Senator One", freshAt),
    servingSeat("senate", "GA", null, "G000002", "Georgia Senator Two", freshAt),
  ];
  const ga13 = servingRoster(
    "GA",
    13,
    servingSeat("house", "GA", 13, "H000001", "Georgia Representative", freshAt),
    gaSenators,
    freshAt,
  );
  const ak = servingRoster(
    "AK",
    0,
    servingSeat("house", "AK", 0, "A000001", "Alaska Representative", freshAt),
    [
      servingSeat("senate", "AK", null, "A000002", "Alaska Senator One", freshAt),
      servingSeat("senate", "AK", null, "A000003", "Alaska Senator Two", freshAt),
    ],
    freshAt,
  );
  const ga14 = vacancyRoster("GA", 14, gaSenators, freshAt);
  const ca = servingRoster(
    "CA",
    1,
    servingSeat("house", "CA", 1, "C000001", "California Representative", staleAt),
    [
      servingSeat("senate", "CA", null, "C000002", "California Senator One", staleAt),
      servingSeat("senate", "CA", null, "C000003", "California Senator Two", staleAt),
    ],
    staleAt,
  );
  const tx = servingRoster(
    "TX",
    1,
    servingSeat("house", "TX", 1, "T000001", "Texas Representative", expiredAt),
    [
      servingSeat("senate", "TX", null, "T000002", "Texas Senator One", expiredAt),
      servingSeat("senate", "TX", null, "T000003", "Texas Senator Two", expiredAt),
    ],
    expiredAt,
  );
  const rosters = [ga13, ak, ga14, ca, tx];
  const profiles = [ga13, ak, ca, tx].flatMap(({ payload, retrievedAt }) =>
    [payload.house, ...payload.senate].map((seat) =>
      cacheRecord(
        `profile:v2:${seat.person.bioguideId}`,
        {
          person: seat.person,
          office: seat.office,
          term: seat.term,
          sources: seat.sources,
        },
        retrievedAt,
      ),
    ),
  );
  return [...rosters, ...profiles];
}

function servingRoster(stateCode, district, house, senate, retrievedAt) {
  return cacheRecord(
    rosterKey(stateCode, district),
    {
      jurisdiction: jurisdiction(stateCode, district),
      house,
      senate,
      coverage: { house: "verified", senate: "verified" },
    },
    retrievedAt,
  );
}

function vacancyRoster(stateCode, district, senate, retrievedAt) {
  const office = officeFor("house", stateCode, district, null);
  return cacheRecord(
    rosterKey(stateCode, district),
    {
      jurisdiction: jurisdiction(stateCode, district),
      house: {
        status: "vacant",
        office,
        term: termFor(office, null, "vacant"),
        sources: [
          clerkSource("https://clerk.house.gov/Members/ViewVacancies", retrievedAt),
          clerkSource(
            `https://clerk.house.gov/members/${stateCode}${String(district).padStart(2, "0")}/vacancy`,
            retrievedAt,
          ),
        ],
      },
      senate,
      coverage: { house: "vacant", senate: "verified" },
    },
    retrievedAt,
  );
}

function servingSeat(chamber, stateCode, district, bioguideId, name, retrievedAt) {
  const person = {
    id: `bioguide:${bioguideId}`,
    bioguideId,
    name,
  };
  const office = officeFor(chamber, stateCode, district, bioguideId);
  return {
    status: "serving",
    office,
    person,
    term: termFor(office, person.id, "serving"),
    sources: [
      memberSource(bioguideId, retrievedAt),
      ...(chamber === "house"
        ? [clerkSource("https://clerk.house.gov/Members/ViewVacancies", retrievedAt)]
        : []),
    ],
  };
}

function officeFor(chamber, stateCode, district, bioguideId) {
  return {
    id: `federal:${chamber}:${stateCode}:${chamber === "house" ? district : bioguideId}`,
    chamber,
    stateCode,
    district,
    title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
  };
}

function termFor(office, personId, status) {
  return {
    officeId: office.id,
    personId,
    congress: 119,
    startYear: status === "vacant" ? null : 2025,
    endYear: status === "vacant" ? null : 2027,
    status,
  };
}

function memberSource(bioguideId, retrievedAt) {
  return {
    publisher: "Congress.gov",
    sourceType: "member",
    url: `https://api.congress.gov/v3/member/${bioguideId}?format=json`,
    retrievedAt: retrievedAt.toISOString(),
    recordUpdatedAt: retrievedAt.toISOString(),
    effectiveAt: null,
  };
}

function clerkSource(url, retrievedAt) {
  return {
    publisher: "Office of the Clerk, U.S. House of Representatives",
    sourceType: "vacancy",
    url,
    retrievedAt: retrievedAt.toISOString(),
    recordUpdatedAt: null,
    effectiveAt: null,
  };
}

function jurisdiction(stateCode, district) {
  const lower = stateCode.toLowerCase();
  return {
    stateCode,
    district,
    divisionIds: [
      `ocd-division/country:us/state:${lower}`,
      `ocd-division/country:us/state:${lower}/cd:${district}`,
    ],
  };
}

function rosterKey(stateCode, district) {
  return `roster:v1:${stateCode}:${district === 0 ? "AL" : String(district).padStart(2, "0")}`;
}

function cacheRecord(cacheKey, payload, retrievedAt) {
  return {
    cacheKey,
    payload,
    retrievedAt,
    refreshAfter: new Date(retrievedAt.getTime() + 24 * 60 * 60 * 1_000),
    staleAfter: new Date(retrievedAt.getTime() + 72 * 60 * 60 * 1_000),
  };
}
