// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import {
  account,
  authSchema,
  session,
  user,
  verification,
} from "./db/schema";
import { createAuth } from "./lib/auth";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("identity dependencies", () => {
  it("pins the minimal Better Auth PostgreSQL stack", () => {
    expect(packageJson.dependencies).toMatchObject({
      "@better-auth/drizzle-adapter": "1.6.23",
      "better-auth": "1.6.23",
      "drizzle-orm": "0.45.2",
      nodemailer: "9.0.3",
      pg: "8.22.0",
    });

    expect(packageJson.devDependencies).toMatchObject({
      "@electric-sql/pglite": "0.5.4",
      "@types/nodemailer": "8.0.1",
      "@types/pg": "8.20.0",
      "drizzle-kit": "0.31.10",
    });
  });

  it("keeps runtime credentials server-side", async () => {
    const route = await import("./app/api/auth/[...all]/route");
    const clientSource = readFileSync(
      new URL("./lib/auth-client.ts", import.meta.url),
      "utf8",
    );
    const exampleEnvironment = readFileSync(
      new URL("../.env.example", import.meta.url),
      "utf8",
    );

    expect(route.GET).toBeTypeOf("function");
    expect(route.POST).toBeTypeOf("function");
    expect(clientSource).toContain("magicLinkClient");

    for (const key of [
      "BETTER_AUTH_SECRET",
      "DATABASE_URL",
      "EMAIL_SERVER",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      expect(clientSource).not.toContain(key);
    }

    for (const line of exampleEnvironment.trim().split("\n")) {
      expect(line).toMatch(/^[A-Z_]+=$/);
    }
  });

  it("runs the auth contract against hosted PostgreSQL in CI", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson).toMatchObject({
      scripts: {
        "db:check": "drizzle-kit check --dialect=postgresql --out=drizzle",
        "db:migrate": "drizzle-kit migrate",
        "test:postgres": "vitest run --config vitest.postgres.config.mts",
      },
    });
    expect(workflow).toContain("image: postgres:17-alpine");
    expect(workflow).toContain("npm run db:migrate");
    expect(workflow).toContain("npm run test:postgres");
  });
});

describe("email identity", () => {
  it("stores a hash and consumes a magic link only once", async () => {
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

      const sendResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          body: JSON.stringify({
            callbackURL: "/dashboard",
            email: "voter@example.com",
            errorCallbackURL: "/sign-in",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );

      expect(sendResponse.status).toBe(200);
      expect(deliveries).toHaveLength(1);

      const stored = await db.select().from(verification);
      expect(stored).toHaveLength(1);
      expect(stored[0].identifier).not.toBe(deliveries[0].token);
      expect(JSON.stringify(stored)).not.toContain(deliveries[0].token);

      const firstVerification = await auth.handler(
        new Request(deliveries[0].url),
      );
      expect(firstVerification.status).toBe(302);
      expect(firstVerification.headers.get("location")).toBe(
        "http://localhost:3000/dashboard",
      );
      expect(await db.select().from(session)).toHaveLength(1);

      const secondVerification = await auth.handler(
        new Request(deliveries[0].url),
      );
      expect(secondVerification.status).toBe(302);
      expect(secondVerification.headers.get("location")).toContain(
        "error=INVALID_TOKEN",
      );
      expect(await db.select().from(session)).toHaveLength(1);

      const crossOriginResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          body: JSON.stringify({
            callbackURL: "https://example.net/collect",
            email: "voter@example.com",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );
      expect(crossOriginResponse.status).toBe(403);
      expect(deliveries).toHaveLength(1);
      expect(await db.select().from(session)).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("rejects an expired magic link without creating a session", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema: authSchema });
    const deliveries: Array<{ email: string; token: string; url: string }> = [];

    try {
      await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });

      const auth = createAuth({
        baseURL: "http://localhost:3000",
        database: db,
        magicLinkExpiresIn: -1,
        secret: "test-secret-at-least-thirty-two-characters",
        sendMagicLink: async (delivery) => {
          deliveries.push(delivery);
        },
      });

      await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          body: JSON.stringify({
            callbackURL: "/dashboard",
            email: "late-voter@example.com",
            errorCallbackURL: "/sign-in",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );

      const response = await auth.handler(new Request(deliveries[0].url));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "error=INVALID_TOKEN",
      );
      expect(await db.select().from(session)).toHaveLength(0);
    } finally {
      await client.close();
    }
  });
});

describe("Google identity", () => {
  it("links only a verified same-email profile", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema: authSchema });
    const deliveries: Array<{ email: string; token: string; url: string }> = [];
    let googleProfile = {
      email: "voter@example.com",
      emailVerified: true,
      id: "google-voter",
      name: "Voter",
    };

    try {
      await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });

      const auth = createAuth({
        baseURL: "http://localhost:3000",
        database: db,
        google: {
          clientId: "test-google-client",
          clientSecret: "test-google-secret",
          getUserInfo: async () => ({ data: googleProfile, user: googleProfile }),
          verifyIdToken: async () => true,
        },
        secret: "test-secret-at-least-thirty-two-characters",
        sendMagicLink: async (delivery) => {
          deliveries.push(delivery);
        },
      });

      await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
          body: JSON.stringify({ email: "voter@example.com" }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );
      await auth.handler(new Request(deliveries[0].url));

      const emailUser = (await db.select().from(user))[0];
      const verifiedResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/social", {
          body: JSON.stringify({
            idToken: { token: "verified-google-token" },
            provider: "google",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );

      expect(verifiedResponse.status).toBe(200);
      expect((await verifiedResponse.json()).user.id).toBe(emailUser.id);
      expect(await db.select().from(user)).toHaveLength(1);
      expect(await db.select().from(account)).toHaveLength(1);

      googleProfile = {
        email: "unverified@example.com",
        emailVerified: false,
        id: "unverified-google-voter",
        name: "Unverified voter",
      };
      const sessionsBeforeRejection = await db.select().from(session);
      const rejectedResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/social", {
          body: JSON.stringify({
            idToken: { token: "unverified-google-token" },
            provider: "google",
          }),
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          method: "POST",
        }),
      );

      expect(rejectedResponse.status).toBe(401);
      expect(await db.select().from(user)).toHaveLength(1);
      expect(await db.select().from(account)).toHaveLength(1);
      expect(await db.select().from(session)).toHaveLength(
        sessionsBeforeRejection.length,
      );
    } finally {
      await client.close();
    }
  });
});
