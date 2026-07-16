import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

await mkdir(".data", { recursive: true });

const client = new PGlite(".data/e2e");

try {
  const database = drizzle(client);
  await migrate(database, {
    migrationsFolder: resolve(process.cwd(), "drizzle"),
  });

  await client.query(
    `INSERT INTO "user" (
      "id", "name", "email", "email_verified", "created_at", "updated_at"
    ) VALUES ($1, $2, $3, true, NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "email" = EXCLUDED."email",
      "email_verified" = true,
      "updated_at" = NOW()`,
    ["e2e-user", "E2E Voter", "voter@example.invalid"],
  );

  await client.query(
    `INSERT INTO "session" (
      "id", "expires_at", "token", "created_at", "updated_at", "user_id"
    ) VALUES ($1, $2, $3, NOW(), NOW(), $4)
    ON CONFLICT ("id") DO UPDATE SET
      "expires_at" = EXCLUDED."expires_at",
      "token" = EXCLUDED."token",
      "updated_at" = NOW(),
      "user_id" = EXCLUDED."user_id"`,
    ["e2e-session", "2099-01-01T00:00:00.000Z", "e2e-session-token", "e2e-user"],
  );
} finally {
  await client.close();
}
