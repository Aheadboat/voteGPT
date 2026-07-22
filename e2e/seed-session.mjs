import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import {
  readE2eDatabaseMarker,
  requireE2eDatabase,
} from "./database-guard.mjs";

const databaseUrl = await requireE2eDatabase(
  process.env,
  readE2eDatabaseMarker,
);
process.env.DATABASE_URL = databaseUrl;
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

const pgliteDirectory = databaseUrl.startsWith("pglite://")
  ? databaseUrl.slice("pglite://".length)
  : null;

if (pgliteDirectory) {
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

if (process.argv.includes("--start-server")) {
  await startApplication(databaseUrl);
}

async function seedIdentities(query) {
  await query("BEGIN");
  try {
    await query(
      `DELETE FROM "user"
       WHERE "id" = ANY($1::text[]) OR lower("email") = ANY($2::text[])`,
      [
        identities.map(({ userId }) => userId),
        identities.map(({ email }) => email.toLowerCase()),
      ],
    );

    for (const identity of identities) {
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

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

async function startApplication(validatedDatabaseUrl) {
  const child = spawn(
    process.execPath,
    [
      resolve(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: validatedDatabaseUrl },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const stop = () => child.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("close", (code) => {
      process.exitCode = code ?? 1;
      resolveExit();
    });
  });
}
