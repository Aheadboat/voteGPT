// @vitest-environment node

import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { user } from "./schema";
import { createDatabase } from ".";

describe("local database", () => {
  it("boots the migrated auth schema in PGlite", async () => {
    const db = await createDatabase("pglite://memory");

    expect(await db.select().from(user)).toEqual([]);

    await closeDatabase(db);
  });

  it("keeps in-memory databases fresh for isolated tests", async () => {
    const first = await createDatabase("pglite://memory");
    const second = await createDatabase("pglite://memory");

    try {
      await first.insert(user).values(testUser("first"));

      expect(await first.select().from(user)).toHaveLength(1);
      expect(await second.select().from(user)).toEqual([]);
    } finally {
      await Promise.all([closeDatabase(first), closeDatabase(second)]);
    }
  });

  it("shares one process database promise for file-backed consumers", async () => {
    const root = await mkdtemp(join(tmpdir(), "votegpt-shared-db-"));
    const connectionString = pgliteConnection(join(root, "database"));
    const authDatabase = createDatabase(connectionString);
    const residenceDatabase = createDatabase(connectionString);

    expect(residenceDatabase).toBe(authDatabase);

    const db = await authDatabase;
    try {
      await db.insert(user).values(testUser("shared"));
      expect(await (await residenceDatabase).select().from(user)).toHaveLength(
        1,
      );
    } finally {
      await closeDatabase(db);
      await rm(root, { force: true, recursive: true });
    }
  });

  it(
    "evicts a failed file-backed initialization so retry can recover",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "votegpt-retry-db-"));
      const dataDirectory = join(root, "database");
      const connectionString = pgliteConnection(dataDirectory);
      await writeFile(dataDirectory, "not a database directory");

      try {
        await expect(createDatabase(connectionString)).rejects.toThrow();
        await unlink(dataDirectory);

        const recovered = await createDatabase(connectionString);
        expect(await recovered.select().from(user)).toEqual([]);
        await closeDatabase(recovered);
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
    20_000,
  );
});

function testUser(suffix: string) {
  return {
    email: `${suffix}@example.com`,
    id: `user_${suffix}`,
    name: "Test Voter",
  };
}

function pgliteConnection(path: string) {
  return `pglite://${path.replaceAll("\\", "/")}`;
}

async function closeDatabase(
  database: Awaited<ReturnType<typeof createDatabase>>,
) {
  const client = database.$client as unknown as {
    close?: () => Promise<void>;
  };
  await client.close?.();
}
