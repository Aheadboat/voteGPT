import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { account, authSchema, session, user, verification } from "@/db/schema";
import { deleteCurrentAccount } from "@/lib/account";
import { createAuth } from "@/lib/auth";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for the PostgreSQL contract test");
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema: authSchema });

beforeEach(async () => {
  await pool.query(
    'TRUNCATE TABLE "account", "session", "user", "verification" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("hosted PostgreSQL auth contract", () => {
  it("hashes and atomically consumes a one-use email link", async () => {
    const deliveries: Array<{ email: string; token: string; url: string }> = [];
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      database: db,
      secret: "test-secret-at-least-thirty-two-characters",
      sendMagicLink: async (delivery) => {
        deliveries.push(delivery);
      },
    });

    const sent = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        body: JSON.stringify({ email: "postgres-voter@example.com" }),
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        method: "POST",
      }),
    );

    expect(sent.status).toBe(200);
    expect(deliveries).toHaveLength(1);
    const stored = (await db.select().from(verification))[0];
    expect(stored.identifier).not.toBe(deliveries[0].token);

    const first = await auth.handler(new Request(deliveries[0].url));
    expect(first.status).toBe(302);
    expect(await db.select().from(session)).toHaveLength(1);

    const second = await auth.handler(new Request(deliveries[0].url));
    expect(second.headers.get("location")).toContain("error=INVALID_TOKEN");
    expect(await db.select().from(session)).toHaveLength(1);
  });

  it("hard-deletes auth children and only matching pending links", async () => {
    const deliveries: Array<{ email: string; token: string; url: string }> = [];
    const auth = createAuth({
      baseURL: "http://localhost:3000",
      database: db,
      secret: "test-secret-at-least-thirty-two-characters",
      sendMagicLink: async (delivery) => {
        deliveries.push(delivery);
      },
    });
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

    await requestLink("voter@example.com");
    const signedIn = await auth.handler(new Request(deliveries.at(-1)!.url));
    const cookie = signedIn.headers.get("set-cookie")!.split(";", 1)[0];
    const currentUser = (await db.select().from(user))[0];
    await db.insert(account).values({
      accountId: "postgres-google-account",
      id: "postgres-account",
      providerId: "google",
      userId: currentUser.id,
    });
    await requestLink("Voter@Example.com");
    await requestLink("other@example.com");
    await db.insert(verification).values({
      expiresAt: new Date(Date.now() + 60_000),
      id: "postgres-opaque-verification",
      identifier: "postgres-opaque-identifier",
      value: "not-json",
    });

    await deleteCurrentAccount(
      auth,
      new Headers({ cookie, origin: "http://localhost:3000" }),
    );

    expect(await db.select().from(user)).toHaveLength(0);
    expect(await db.select().from(account)).toHaveLength(0);
    expect(await db.select().from(session)).toHaveLength(0);
    expect(
      (await db.select().from(verification)).map(({ value }) => value).sort(),
    ).toEqual(["not-json", '{"email":"other@example.com"}']);
  });
});
