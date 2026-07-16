import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  account,
  authSchema,
  savedResidence,
  savedResidenceDivision,
  session,
  user,
  verification,
} from "@/db/schema";
import { deleteCurrentAccount } from "@/lib/account";
import { createAuth } from "@/lib/auth";
import {
  decryptSavedResidenceAddress,
  encryptSavedResidenceAddress,
  loadResidenceEncryptionKeyring,
} from "@/lib/saved-residence";

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
  it("runs one-shot residence rotation with count-only output and a committed fresh envelope", async () => {
    const userId = "postgres_rotation_user";
    const address = "901 PostgreSQL Private Residence Lane";
    const serializedKeys = JSON.stringify([
      { version: "2026-01", key: encodedKey(1) },
      { version: "2026-07", key: encodedKey(2) },
    ]);
    const legacyKeyring = loadResidenceEncryptionKeyring({
      RESIDENCE_ENCRYPTION_ACTIVE_KEY: "2026-01",
      RESIDENCE_ENCRYPTION_KEYS: serializedKeys,
    });
    const activeKeyring = loadResidenceEncryptionKeyring({
      RESIDENCE_ENCRYPTION_ACTIVE_KEY: "2026-07",
      RESIDENCE_ENCRYPTION_KEYS: serializedKeys,
    });
    const before = encryptSavedResidenceAddress(
      address,
      userId,
      legacyKeyring,
    );
    const now = new Date("2026-07-16T20:00:00.000Z");
    await db.insert(user).values({
      email: "postgres-rotation@example.com",
      id: userId,
      name: "PostgreSQL Rotation Voter",
    });
    await db.insert(savedResidence).values({
      ciphertext: before.ciphertext,
      consentVersion: "saved-residence-v1",
      consentedAt: now,
      coverageNotes: [],
      createdAt: now,
      envelopeVersion: before.version,
      iv: before.iv,
      keyVersion: before.keyVersion,
      resolutionStatus: "matched",
      sourceCheckedAt: now,
      sourceName: "PostgreSQL fixture civic source",
      sourceUrl: "https://example.com/postgres-civic-source",
      tag: before.tag,
      updatedAt: now,
      userId,
    });

    const command = await runRotationCommand({
      DATABASE_URL: connectionString,
      RESIDENCE_ENCRYPTION_ACTIVE_KEY: "2026-07",
      RESIDENCE_ENCRYPTION_KEYS: serializedKeys,
    });
    expect(command).toEqual({
      code: 0,
      stderr: "",
      stdout: '{"rotated":1,"skipped":0,"remaining":0}\n',
    });

    const [stored] = await db
      .select({
        ciphertext: savedResidence.ciphertext,
        envelopeVersion: savedResidence.envelopeVersion,
        iv: savedResidence.iv,
        keyVersion: savedResidence.keyVersion,
        tag: savedResidence.tag,
      })
      .from(savedResidence)
      .where(eq(savedResidence.userId, userId));
    expect(stored).toBeDefined();
    expect(stored?.keyVersion).toBe(activeKeyring.activeVersion);
    expect(stored?.iv).not.toBe(before.iv);
    expect(stored?.ciphertext).not.toBe(before.ciphertext);
    expect(stored?.tag).not.toBe(before.tag);
    expect(
      decryptSavedResidenceAddress(
        {
          ciphertext: stored?.ciphertext,
          iv: stored?.iv,
          keyVersion: stored?.keyVersion,
          tag: stored?.tag,
          version: stored?.envelopeVersion,
        },
        userId,
        activeKeyring,
      ),
    ).toBe(address);
    for (const secret of [
      address,
      userId,
      "2026-01",
      "2026-07",
      encodedKey(1),
      encodedKey(2),
    ]) {
      expect(`${command.stdout}${command.stderr}`).not.toContain(secret);
    }
  }, 20_000);

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
    const residenceNow = new Date("2026-07-16T20:00:00.000Z");
    await db.insert(savedResidence).values({
      ciphertext: "postgres-fixture-ciphertext",
      consentVersion: "saved-residence-v1",
      consentedAt: residenceNow,
      coverageNotes: [],
      createdAt: residenceNow,
      envelopeVersion: "v1",
      iv: "postgres-fixture-iv",
      keyVersion: "postgres-fixture-key",
      resolutionStatus: "matched",
      sourceCheckedAt: residenceNow,
      sourceName: "PostgreSQL fixture civic source",
      sourceUrl: "https://example.com/postgres-civic-source",
      tag: "postgres-fixture-tag",
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
    expect(await db.select().from(savedResidence)).toHaveLength(0);
    expect(await db.select().from(savedResidenceDivision)).toHaveLength(0);
    expect(
      (await db.select().from(verification)).map(({ value }) => value).sort(),
    ).toEqual(["not-json", '{"email":"other@example.com"}']);
  });
});

function encodedKey(fill: number) {
  return Buffer.alloc(32, fill).toString("base64url");
}

function runRotationCommand(environment: Readonly<Record<string, string>>) {
  return new Promise<{ code: number; stderr: string; stdout: string }>(
    (resolveCommand, rejectCommand) => {
      const child = spawn(
        process.execPath,
        [resolve(process.cwd(), "scripts/rotate-saved-residence-keys.mts")],
        {
          cwd: process.cwd(),
          env: { ...process.env, ...environment },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15_000,
        },
      );
      let stderr = "";
      let stdout = "";
      child.stderr.setEncoding("utf8");
      child.stdout.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.once("error", rejectCommand);
      child.once("close", (code) => {
        resolveCommand({ code: code ?? 1, stderr, stdout });
      });
    },
  );
}
