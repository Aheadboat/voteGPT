// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSchema } from "@/db/schema";

const database = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/db", () => ({ createDatabase: database.create }));

const baseURL = "http://localhost:3000";
let client: PGlite;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("BETTER_AUTH_URL", baseURL);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-at-least-thirty-two-characters");
  vi.stubEnv("DATABASE_URL", "pglite://memory");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("EMAIL_SERVER", "");
  client = new PGlite();
  const db = drizzle(client, { schema: authSchema });
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  database.create.mockReset().mockResolvedValue(db);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

function socialRequest() {
  return new Request(`${baseURL}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseURL },
    body: JSON.stringify({
      provider: "google",
      callbackURL: "/dashboard",
      errorCallbackURL: "/sign-in",
    }),
  });
}

describe("runtime sign-in configuration", () => {
  it("reports only complete configured methods without exposing credentials", async () => {
    const authModule = await import("./auth");
    expect(authModule.getSignInMethods).toBeTypeOf("function");
    expect(authModule.getSignInMethods()).toEqual({ email: false, google: true });
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("EMAIL_FROM", "votegpt@example.invalid");
    expect(authModule.getSignInMethods()).toEqual({ email: false, google: false });
    vi.stubEnv("EMAIL_SERVER", "smtp://localhost:2525");
    expect(authModule.getSignInMethods()).toEqual({ email: true, google: false });
    vi.stubEnv("EMAIL_SERVER", "   ");
    expect(authModule.getSignInMethods()).toEqual({ email: false, google: false });
  });

  it("keeps email-link sign-in available without Google configuration", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("EMAIL_FROM", "votegpt@example.invalid");
    vi.stubEnv("EMAIL_SERVER", "smtp://localhost:2525");
    const { getRuntimeAuth } = await import("./auth");
    const auth = await getRuntimeAuth();
    expect(auth.options.plugins.map((plugin) => plugin.id)).toContain("magic-link");
    expect((await auth.handler(socialRequest())).status).toBe(404);
  });

  it("starts Google OAuth without email delivery configuration", async () => {
    const { getRuntimeAuth } = await import("./auth");
    const auth = await getRuntimeAuth();
    const response = await auth.handler(socialRequest());

    expect(response.status).toBe(200);
    const result = await response.json();
    const redirect = new URL(result.url);
    expect(redirect.origin).toBe("https://accounts.google.com");
    expect(redirect.searchParams.get("redirect_uri")).toBe(
      `${baseURL}/api/auth/callback/google`,
    );
    expect(result.redirect).toBe(true);
  });

  it("does not expose an email-link endpoint when delivery is unavailable", async () => {
    const { getRuntimeAuth } = await import("./auth");
    const auth = await getRuntimeAuth();
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ email: "voter@example.com" }),
    }));

    expect(response.status).toBe(404);
  });

  it("retries runtime initialization after a transient database failure", async () => {
    database.create.mockRejectedValueOnce(new Error("database unavailable"));
    const { getRuntimeAuth } = await import("./auth");

    await expect(getRuntimeAuth()).rejects.toThrow("database unavailable");
    const auth = await getRuntimeAuth();
    expect((await auth.handler(socialRequest())).status).toBe(200);
  });
});
