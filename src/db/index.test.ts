// @vitest-environment node

import { describe, expect, it } from "vitest";
import { user } from "./schema";
import { createDatabase } from ".";

describe("local database", () => {
  it("boots the migrated auth schema in PGlite", async () => {
    const db = await createDatabase("pglite://memory");

    expect(await db.select().from(user)).toEqual([]);

    const client = db.$client as unknown as { close?: () => Promise<void> };
    await client.close?.();
  });
});
