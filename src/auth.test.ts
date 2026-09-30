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

    for (const line of exampleEnvironment.trim().split(/\r?\n/)) {
      expect(line).toMatch(/^[A-Z_][A-Z0-9_]*=$/);
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

function responseCookies(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

async function withGoogleRedirect(
  check: (fixture: {
    auth: ReturnType<typeof createAuth>;
    db: ReturnType<typeof drizzle<typeof authSchema>>;
    deliveries: Array<{ email: string; token: string; url: string }>;
    exchanges: URLSearchParams[];
    start: () => Promise<{ response: Response; url: URL; cookie: string }>;
    callback: (state?: string, cookie?: string, error?: string) => Promise<Response>;
  }) => Promise<void>,
  options: { verified?: boolean; tokenError?: boolean } = {},
) {
  const client = new PGlite();
  const db = drizzle(client, { schema: authSchema });
  const deliveries: Array<{ email: string; token: string; url: string }> = [];
  const exchanges: URLSearchParams[] = [];
  const baseURL = "http://localhost:3000";
  const originalFetch = globalThis.fetch;
  // Only the external token exchange is replaced. OAuth state, PKCE, cookies,
  // callback handling, profile mapping, account linking and sessions are real.
  globalThis.fetch = async (input, init) => {
    expect(String(input)).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    exchanges.push(new URLSearchParams(String(init?.body)));
    if (options.tokenError) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const payload = Buffer.from(JSON.stringify({
      sub: "google-redirect-voter",
      email: "redirect-voter@example.com",
      email_verified: options.verified !== false,
    })).toString("base64url");
    return Response.json({
      access_token: "fixture-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture-signature`,
    });
  };

  try {
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    const auth = createAuth({
      baseURL,
      database: db,
      google: { clientId: "test-google-client", clientSecret: "test-google-secret" },
      secret: "test-secret-at-least-thirty-two-characters",
      sendMagicLink: async (delivery) => { deliveries.push(delivery); },
    });
    await check({
      auth,
      db,
      deliveries,
      exchanges,
      start: async () => {
        const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL },
          body: JSON.stringify({ provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/sign-in" }),
        }));
        expect(response.status).toBe(200);
        return { response, url: new URL((await response.json()).url), cookie: responseCookies(response) };
      },
      callback: (state, cookie, error) => {
        const url = new URL(`${baseURL}/api/auth/callback/google`);
        if (state) url.searchParams.set("state", state);
        url.searchParams.set(error ? "error" : "code", error ?? "fixture-authorization-code");
        return auth.handler(new Request(url, { headers: cookie ? { cookie } : undefined }));
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    await client.close();
  }
}

describe("Google OAuth redirect contract", () => {
  it("exchanges an authorization code with PKCE and creates a usable session only once", async () => {
    await withGoogleRedirect(async ({ auth, db, exchanges, start, callback }) => {
      const flow = await start();
      expect(flow.url.origin).toBe("https://accounts.google.com");
      expect(flow.url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/google");
      expect(flow.url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid"]);
      expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
      const state = flow.url.searchParams.get("state")!;
      expect(state.length).toBeGreaterThan(20);
      expect(await db.select().from(session)).toHaveLength(0);

      const response = await callback(state, flow.cookie);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/dashboard");
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0].get("code")).toBe("fixture-authorization-code");
      expect(exchanges[0].get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/google");
      const verifier = exchanges[0].get("code_verifier")!;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      expect(Buffer.from(digest).toString("base64url")).toBe(flow.url.searchParams.get("code_challenge"));
      expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
      expect(response.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
      const currentSession = await auth.api.getSession({ headers: new Headers({ cookie: responseCookies(response) }) });
      expect(currentSession?.user.email).toBe("redirect-voter@example.com");
      expect(currentSession?.user.emailVerified).toBe(true);
      expect(await db.select().from(session)).toHaveLength(1);

      const replay = await callback(state, flow.cookie);
      expect(replay.headers.get("location")).toBe("http://localhost:3000/sign-in?error=state_mismatch");
      expect(exchanges).toHaveLength(1);
      expect(await db.select().from(session)).toHaveLength(1);
    });
  });

  it.each(["missing-state", "wrong-state", "missing-cookie"])("rejects %s and returns to recoverable sign-in", async (failure) => {
    await withGoogleRedirect(async ({ db, exchanges, start, callback }) => {
      const flow = await start();
      const state = failure === "missing-state" ? undefined
        : failure === "wrong-state" ? "not-the-issued-state" : flow.url.searchParams.get("state")!;
      const response = await callback(state, failure === "missing-cookie" ? undefined : flow.cookie);
      expect(response.status).toBe(302);
      const redirect = new URL(response.headers.get("location")!, "http://localhost:3000");
      expect(redirect.pathname).toBe("/sign-in");
      expect(redirect.searchParams.get("error")).toMatch(/^state_(not_found|mismatch)$/);
      expect(exchanges).toHaveLength(0);
      expect(await db.select().from(session)).toHaveLength(0);
    });
  });

  it("returns provider cancellation to sign-in without creating a session", async () => {
    await withGoogleRedirect(async ({ db, exchanges, start, callback }) => {
      const flow = await start();
      const response = await callback(flow.url.searchParams.get("state")!, flow.cookie, "access_denied");
      expect(response.headers.get("location")).toBe("/sign-in?error=access_denied");
      expect(exchanges).toHaveLength(0);
      expect(await db.select().from(session)).toHaveLength(0);
    });
  });

  it("rejects an unverified email from the real redirect callback", async () => {
    await withGoogleRedirect(async ({ db, start, callback }) => {
      const flow = await start();
      const response = await callback(flow.url.searchParams.get("state")!, flow.cookie);
      expect(response.headers.get("location")).toBe("/sign-in?error=unable_to_get_user_info");
      expect(await db.select().from(user)).toHaveLength(0);
      expect(await db.select().from(account)).toHaveLength(0);
      expect(await db.select().from(session)).toHaveLength(0);
    }, { verified: false });
  });

  it("recovers from a rejected authorization code without issuing a session", async () => {
    await withGoogleRedirect(async ({ db, start, callback }) => {
      const flow = await start();
      const response = await callback(flow.url.searchParams.get("state")!, flow.cookie);
      expect(response.headers.get("location")).toBe("/sign-in?error=invalid_code");
      expect(await db.select().from(session)).toHaveLength(0);
    }, { tokenError: true });
  });

  it("links a verified redirect profile to an existing same-email account", async () => {
    await withGoogleRedirect(async ({ auth, db, deliveries, start, callback }) => {
      await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "redirect-voter@example.com" }),
      }));
      await auth.handler(new Request(deliveries[0].url));
      const existingUser = (await db.select().from(user))[0];
      const flow = await start();
      await callback(flow.url.searchParams.get("state")!, flow.cookie);
      expect(await db.select().from(user)).toHaveLength(1);
      expect((await db.select().from(account))[0].userId).toBe(existingUser.id);
      expect(await db.select().from(session)).toHaveLength(2);
    });
  });

  it.each([
    { origin: "https://attacker.example", callbackURL: "/dashboard", errorCallbackURL: "/sign-in" },
    { origin: "http://localhost:3000", callbackURL: "https://attacker.example", errorCallbackURL: "/sign-in" },
    { origin: "http://localhost:3000", callbackURL: "/dashboard", errorCallbackURL: "https://attacker.example" },
  ])("rejects untrusted OAuth initiation or return URLs %#", async ({ origin, callbackURL, errorCallbackURL }) => {
    await withGoogleRedirect(async ({ auth, db, exchanges }) => {
      const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie: "better-auth.session_token=fixture" },
        body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL }),
      }));
      expect(response.status).toBe(403);
      expect(exchanges).toHaveLength(0);
      expect(await db.select().from(session)).toHaveLength(0);
      expect(await db.select().from(verification)).toHaveLength(0);
    });
  });
});
