// @vitest-environment node

import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import {
  account,
  authSchema,
  savedResidence,
  savedResidenceDivision,
  session,
  user,
  verification,
} from "@/db/schema";
import { createAuth } from "./auth";
import { deleteCurrentAccount } from "./account";

describe("account lifecycle", () => {
  it("rejects an account deletion without typed confirmation", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const response = await DELETE(
      new Request("http://localhost:3000/api/account", {
        body: JSON.stringify({ confirmation: "delete" }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Type "DELETE" to confirm account deletion.',
    });
  });

  it("revokes logout immediately and hard-deletes the fresh account", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema: authSchema });
    const deliveries: Array<{ email: string; token: string; url: string }> = [];

    try {
      await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });

      const auth = createAuth({
        baseURL: "http://localhost:3000",
        database: db,
        secret: "test-secret-at-least-thirty-two-characters",
        sendMagicLink: async (delivery) => {
          deliveries.push(delivery);
        },
      });

      const anonymousDeletion = await auth.handler(
        new Request("http://localhost:3000/api/auth/delete-user", {
          body: "{}",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );
      expect(anonymousDeletion.status).toBe(401);

      const requestLink = (email: string) =>
        auth.handler(
          new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
            body: JSON.stringify({ email }),
            headers: {
              "content-type": "application/json",
              origin: "http://localhost:3000",
            },
            method: "POST",
          }),
        );

      const signIn = async () => {
        await requestLink("voter@example.com");
        const response = await auth.handler(
          new Request(deliveries.at(-1)!.url),
        );
        return response.headers.get("set-cookie")!.split(";", 1)[0];
      };

      const firstCookie = await signIn();
      expect(await db.select().from(session)).toHaveLength(1);

      const logoutResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-out", {
          body: "{}",
          headers: {
            "content-type": "application/json",
            cookie: firstCookie,
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );
      expect(logoutResponse.status).toBe(200);
      expect(await db.select().from(session)).toHaveLength(0);

      const freshCookie = await signIn();
      const currentUser = (await db.select().from(user))[0];
      await db.insert(account).values({
        accountId: "fixture-google-account",
        id: "fixture-account",
        providerId: "google",
        userId: currentUser.id,
      });
      const residenceNow = new Date("2026-07-16T20:00:00.000Z");
      await db.insert(savedResidence).values({
        ciphertext: "fixture-ciphertext",
        consentVersion: "saved-residence-v1",
        consentedAt: residenceNow,
        coverageNotes: [],
        createdAt: residenceNow,
        envelopeVersion: "v1",
        iv: "fixture-iv",
        keyVersion: "fixture-key",
        resolutionStatus: "matched",
        sourceCheckedAt: residenceNow,
        sourceName: "Fixture civic source",
        sourceUrl: "https://example.com/civic-source",
        tag: "fixture-tag",
        updatedAt: residenceNow,
        userId: currentUser.id,
      });
      await db.insert(savedResidenceDivision).values({
        displayOrder: 0,
        divisionId: "ocd-division/country:us/state:ex",
        idScheme: "ocd",
        name: "Example State",
        type: "state",
        userId: currentUser.id,
      });
      expect(await db.select().from(savedResidence)).toHaveLength(1);
      expect(await db.select().from(savedResidenceDivision)).toHaveLength(1);
      await requestLink("Voter@Example.com");
      await requestLink("other@example.com");
      await db.insert(verification).values({
        expiresAt: new Date(Date.now() + 60_000),
        id: "opaque-verification",
        identifier: "opaque-identifier",
        value: "not-json",
      });
      expect(await db.select().from(verification)).toHaveLength(3);

      await db
        .update(session)
        .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000) });
      await expect(
        deleteCurrentAccount(
          auth,
          new Headers({
            cookie: freshCookie,
            origin: "http://localhost:3000",
          }),
        ),
      ).rejects.toMatchObject({ body: { code: "SESSION_EXPIRED" } });
      expect(await db.select().from(user)).toHaveLength(1);
      expect(await db.select().from(savedResidence)).toHaveLength(1);
      expect(await db.select().from(savedResidenceDivision)).toHaveLength(1);

      await db.update(session).set({ createdAt: new Date() });

      const deletion = await deleteCurrentAccount(
        auth,
        new Headers({
          cookie: freshCookie,
          origin: "http://localhost:3000",
        }),
      );

      expect(deletion).toEqual({ message: "User deleted", success: true });
      expect(await db.select().from(user)).toHaveLength(0);
      expect(await db.select().from(account)).toHaveLength(0);
      expect(await db.select().from(session)).toHaveLength(0);
      expect(await db.select().from(savedResidence)).toHaveLength(0);
      expect(await db.select().from(savedResidenceDivision)).toHaveLength(0);
      const remainingVerifications = await db.select().from(verification);
      expect(remainingVerifications.map(({ value }) => value).sort()).toEqual([
        "not-json",
        '{"email":"other@example.com"}',
      ]);
    } finally {
      await client.close();
    }
  });
});
