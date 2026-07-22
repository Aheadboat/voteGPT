// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { user } from "./schema";
import { createDatabase } from ".";

const migrationControl = vi.hoisted(() => ({
  calls: 0,
  failure: undefined as Error | undefined,
}));

vi.mock("drizzle-orm/pglite/migrator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("drizzle-orm/pglite/migrator")>();
  return {
    ...actual,
    migrate: async (...args: Parameters<typeof actual.migrate>) => {
      migrationControl.calls += 1;
      const failure = migrationControl.failure;
      migrationControl.failure = undefined;
      if (failure) {
        throw failure;
      }
      return actual.migrate(...args);
    },
  };
});

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
    "closes a file-backed client after migration failure so retry can recover",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "votegpt-retry-db-"));
      const dataDirectory = join(root, "database");
      const connectionString = pgliteConnection(dataDirectory);
      const migrationFailure = new Error("migration failed after client open");
      const close = vi.spyOn(PGlite.prototype, "close");
      migrationControl.calls = 0;
      migrationControl.failure = migrationFailure;
      let recovered:
        | Awaited<ReturnType<typeof createDatabase>>
        | undefined;

      try {
        await expect(createDatabase(connectionString)).rejects.toBe(
          migrationFailure,
        );
        expect(migrationControl.calls).toBe(1);
        expect(close).toHaveBeenCalled();

        recovered = await createDatabase(connectionString);
        expect(await recovered.select().from(user)).toEqual([]);
      } finally {
        migrationControl.failure = undefined;
        if (recovered) {
          await closeDatabase(recovered);
        }
        close.mockRestore();
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
