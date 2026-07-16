// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@/db";
import { session, user } from "@/db/schema";
import { createAuth, getRuntimeAuth } from "@/lib/auth";
import * as residenceModule from "@/lib/residence";
import * as savedResidenceModule from "@/lib/saved-residence";
import type {
  SavedResidenceResolution,
  SavedResidenceView,
} from "@/lib/saved-residence";
import { DELETE, GET, POST } from "./route";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getRuntimeAuth: vi.fn() };
});

vi.mock("@/lib/residence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/residence")>();
  return {
    ...actual,
    resolveResidence: vi.fn(actual.resolveResidence),
    verifyResolutionToken: vi.fn(actual.verifyResolutionToken),
  };
});

vi.mock("@/lib/saved-residence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/saved-residence")>();
  return {
    ...actual,
    deleteSavedResidence: vi.fn(),
    getSavedResidence: vi.fn(),
    loadResidenceEncryptionKeyring: vi.fn(),
    parseSaveResidenceRequest: vi.fn(actual.parseSaveResidenceRequest),
    saveSavedResidence: vi.fn(),
  };
});

const appOrigin = "http://localhost:3000";
const endpoint = `${appOrigin}/api/v1/residence`;
const now = new Date("2026-07-16T20:00:00.000Z");
const secret = "route-secret-at-least-thirty-two-characters";
const userId = "user_route_owner";
const otherUserId = "user_route_other";
const getSession = vi.fn();
const providerFetch = vi.fn<typeof globalThis.fetch>();

const resolution = {
  status: "matched",
  divisions: [
    {
      type: "congressional_district",
      name: "Example Congressional District 12",
      id: "ocd-division/country:us/state:ex/cd:12",
      idScheme: "ocd",
    },
  ],
  source: {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/",
    checkedAt: "2026-07-16T19:59:00.000Z",
    effectiveAt: null,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
  },
  coverageNotes: ["Local divisions may be unavailable."],
} as const satisfies SavedResidenceResolution;

const savedResidenceView = {
  address: "123 Main Street",
  resolution,
  consent: {
    version: "saved-residence-v1",
    acceptedAt: now.toISOString(),
  },
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
} as const satisfies SavedResidenceView;

const errors = {
  invalidRequest: {
    status: "invalid_request",
    message: "Review the residence details and try again.",
  },
  unauthenticated: {
    status: "unauthenticated",
    message: "Sign in again before managing a saved residence.",
  },
  forbidden: {
    status: "forbidden",
    message: "This saved residence request was not accepted.",
  },
  invalidToken: {
    status: "invalid_token",
    message: "Preview your voting residence again before saving.",
  },
  unavailable: {
    status: "unavailable",
    message: "Saved residence is temporarily unavailable. Try again later.",
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("BETTER_AUTH_URL", appOrigin);
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubGlobal("fetch", providerFetch);

  getSession.mockResolvedValue(sessionFor(userId));
  vi.mocked(getRuntimeAuth).mockResolvedValue({
    api: { getSession },
  } as never);
  vi.mocked(savedResidenceModule.getSavedResidence).mockResolvedValue(null);
  vi.mocked(savedResidenceModule.saveSavedResidence).mockResolvedValue({
    replaced: true,
    residence: savedResidenceView,
  });
  vi.mocked(savedResidenceModule.deleteSavedResidence).mockResolvedValue(false);
  vi.mocked(
    savedResidenceModule.loadResidenceEncryptionKeyring,
  ).mockImplementation(() => {
    throw new Error("Route must not load residence keys directly.");
  });
  vi.mocked(residenceModule.resolveResidence).mockRejectedValue(
    new Error("Route must not call a residence provider."),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/v1/residence request boundary", () => {
  it("rejects missing or foreign origins before JSON, auth, body, or operation work", async () => {
    for (const origin of [
      null,
      "null",
      "https://attacker.example",
      "http://localhost:3000.attacker.example",
    ]) {
      const request = residenceRequest("POST", validSaveBody(), { origin });
      const readBody = vi.spyOn(request, "json");

      await expectPrivateJson(await POST(request), 403, errors.forbidden);

      expect(readBody).not.toHaveBeenCalled();
    }

    expect(getRuntimeAuth).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(savedResidenceModule.parseSaveResidenceRequest).not.toHaveBeenCalled();
    expect(residenceModule.verifyResolutionToken).not.toHaveBeenCalled();
    expect(savedResidenceModule.saveSavedResidence).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("rejects non-JSON POST and DELETE before auth, body, or operation work", async () => {
    for (const method of ["POST", "DELETE"] as const) {
      for (const contentType of [null, "text/plain", "application/problem+json"]) {
        const request = residenceRequest(method, validBodyFor(method), {
          contentType,
        });
        const readBody = vi.spyOn(request, "json");

        const response =
          method === "POST" ? await POST(request) : await DELETE(request);
        await expectPrivateJson(response, 400, errors.invalidRequest);

        expect(readBody).not.toHaveBeenCalled();
      }
    }

    expect(getRuntimeAuth).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(savedResidenceModule.saveSavedResidence).not.toHaveBeenCalled();
    expect(savedResidenceModule.deleteSavedResidence).not.toHaveBeenCalled();
  });

  it("requires a fresh DB-backed session before reading a mutation body", async () => {
    for (const method of ["POST", "DELETE"] as const) {
      getSession.mockResolvedValueOnce(null);
      const request = residenceRequest(method, validBodyFor(method));
      const readBody = vi.spyOn(request, "json");

      const response =
        method === "POST" ? await POST(request) : await DELETE(request);
      await expectPrivateJson(response, 401, errors.unauthenticated);

      expect(readBody).not.toHaveBeenCalled();
    }

    getSession.mockResolvedValueOnce(null);
    await expectPrivateJson(
      await GET(residenceRequest("GET")),
      401,
      errors.unauthenticated,
    );

    expect(getSession).toHaveBeenCalledTimes(3);
    expect(savedResidenceModule.getSavedResidence).not.toHaveBeenCalled();
    expect(savedResidenceModule.saveSavedResidence).not.toHaveBeenCalled();
    expect(savedResidenceModule.deleteSavedResidence).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-exact POST bodies after authentication", async () => {
    const valid = validSaveBody();
    const invalidBodies: unknown[] = [
      null,
      [],
      { ...valid, extra: true },
      { ...valid, address: "   " },
      { ...valid, address: "x".repeat(301) },
      { ...valid, resolutionToken: 42 },
      { ...valid, consent: { ...valid.consent, accepted: false } },
      { ...valid, consent: { ...valid.consent, version: "saved-residence-v2" } },
      { ...valid, consent: { ...valid.consent, extra: true } },
      { ...valid, latitude: 34.0522 },
      { ...valid, longitude: -118.2437 },
      { ...valid, consent: { ...valid.consent, latitude: 34.0522 } },
      { ...valid, consentedAt: now.toISOString() },
    ];

    const malformed = residenceRequest("POST", "{", { raw: true });
    await expectPrivateJson(
      await POST(malformed),
      400,
      errors.invalidRequest,
    );

    for (const body of invalidBodies) {
      await expectPrivateJson(
        await POST(residenceRequest("POST", body)),
        400,
        errors.invalidRequest,
      );
    }

    expect(getSession).toHaveBeenCalledTimes(invalidBodies.length + 1);
    expect(residenceModule.verifyResolutionToken).not.toHaveBeenCalled();
    expect(savedResidenceModule.saveSavedResidence).not.toHaveBeenCalled();
  });

  it("rejects malformed or non-exact DELETE bodies after authentication", async () => {
    const invalidBodies: unknown[] = [
      null,
      [],
      "DELETE_SAVED_RESIDENCE",
      { confirmation: "DELETE" },
      { confirmation: "DELETE_SAVED_RESIDENCE", extra: true },
      { confirmation: "DELETE_SAVED_RESIDENCE", latitude: 34.0522 },
    ];

    const malformed = residenceRequest("DELETE", "{", { raw: true });
    await expectPrivateJson(
      await DELETE(malformed),
      400,
      errors.invalidRequest,
    );

    for (const body of invalidBodies) {
      await expectPrivateJson(
        await DELETE(residenceRequest("DELETE", body)),
        400,
        errors.invalidRequest,
      );
    }

    expect(getSession).toHaveBeenCalledTimes(invalidBodies.length + 1);
    expect(savedResidenceModule.deleteSavedResidence).not.toHaveBeenCalled();
  });

  it("orders origin, JSON type, session, exact body, token, then POST operation", async () => {
    const request = residenceRequest("POST", validSaveBody());
    const readBody = vi.spyOn(request, "json");

    await expectPrivateJson(
      await POST(request),
      200,
      savedResponse(true),
    );

    expectStrictlyIncreasing([
      firstCall(vi.mocked(getRuntimeAuth)),
      firstCall(getSession),
      firstCall(readBody),
      firstCall(vi.mocked(savedResidenceModule.parseSaveResidenceRequest)),
      firstCall(vi.mocked(residenceModule.verifyResolutionToken)),
      firstCall(vi.mocked(savedResidenceModule.saveSavedResidence)),
    ]);
    expect(savedResidenceModule.saveSavedResidence).toHaveBeenCalledWith(
      userId,
      validSaveBody(),
      resolution,
      now,
    );
  });
});

describe("/api/v1/residence owner behavior", () => {
  it("returns exact GET, POST, and DELETE success DTOs with no-store and fresh sessions", async () => {
    vi.mocked(savedResidenceModule.getSavedResidence)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedResidenceView);
    vi.mocked(savedResidenceModule.deleteSavedResidence)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expectPrivateJson(
      await GET(residenceRequest("GET", undefined, { origin: null })),
      200,
      { status: "empty" },
    );
    await expectPrivateJson(
      await GET(
        residenceRequest("GET", undefined, {
          origin: "https://attacker.example",
        }),
      ),
      200,
      { status: "saved", residence: savedResidenceView },
    );
    const token = validSaveBody().resolutionToken;
    const savedBody = await expectPrivateJson(
      await POST(residenceRequest("POST", validSaveBody())),
      200,
      savedResponse(true),
    );
    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      200,
      { status: "empty" },
    );
    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      200,
      { status: "deleted" },
    );

    expect(getSession).toHaveBeenCalledTimes(5);
    expect(getSession.mock.calls.map(([input]) => input)).toEqual([
      { headers: expect.any(Headers) },
      { headers: expect.any(Headers) },
      { headers: expect.any(Headers) },
      { headers: expect.any(Headers) },
      { headers: expect.any(Headers) },
    ]);
    expect(JSON.stringify(savedBody)).not.toContain(token);
    expect(providerFetch).not.toHaveBeenCalled();
    expect(residenceModule.resolveResidence).not.toHaveBeenCalled();
  });

  it("accepts only valid, unexpired tokens bound to the current user", async () => {
    const cases = [
      {
        name: "tampered signature",
        token: tamperedToken(signedToken(userId, now)),
      },
      {
        name: "expired",
        token: signedToken(
          userId,
          new Date(now.getTime() - 10 * 60 * 1000),
        ),
      },
      { name: "wrong user", token: signedToken(otherUserId, now) },
    ];

    for (const testCase of cases) {
      const body = validSaveBody(testCase.token);
      const response = await POST(residenceRequest("POST", body));
      const responseBody = await expectPrivateJson(
        response,
        422,
        errors.invalidToken,
      );

      expect(JSON.stringify(responseBody)).not.toContain(testCase.token);
    }

    expect(savedResidenceModule.saveSavedResidence).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
    expect(residenceModule.resolveResidence).not.toHaveBeenCalled();
  });

  it("passes only the current session user to reads and deletes", async () => {
    const homes = new Map<string, SavedResidenceView>([
      [userId, savedResidenceView],
    ]);
    vi.mocked(savedResidenceModule.getSavedResidence).mockImplementation(
      async (ownerId) => homes.get(ownerId) ?? null,
    );
    vi.mocked(savedResidenceModule.deleteSavedResidence).mockImplementation(
      async (ownerId) => homes.delete(ownerId),
    );
    getSession
      .mockResolvedValueOnce(sessionFor(userId))
      .mockResolvedValueOnce(sessionFor(otherUserId))
      .mockResolvedValueOnce(sessionFor(otherUserId))
      .mockResolvedValueOnce(sessionFor(userId));

    await expectPrivateJson(await GET(residenceRequest("GET")), 200, {
      status: "saved",
      residence: savedResidenceView,
    });
    await expectPrivateJson(await GET(residenceRequest("GET")), 200, {
      status: "empty",
    });
    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      200,
      { status: "empty" },
    );
    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      200,
      { status: "deleted" },
    );

    expect(savedResidenceModule.getSavedResidence).toHaveBeenNthCalledWith(
      1,
      userId,
    );
    expect(savedResidenceModule.getSavedResidence).toHaveBeenNthCalledWith(
      2,
      otherUserId,
    );
    expect(savedResidenceModule.deleteSavedResidence).toHaveBeenNthCalledWith(
      1,
      otherUserId,
    );
    expect(savedResidenceModule.deleteSavedResidence).toHaveBeenNthCalledWith(
      2,
      userId,
    );
  });

  it(
    "enforces owner boundaries with real file-backed sessions and residences",
    async () => {
      vi.useRealTimers();
      const root = await mkdtemp(join(tmpdir(), "votegpt-route-owner-"));
      const connectionString = pgliteConnection(join(root, "database"));
      const keyVersion = "2026-07";
      const encodedKey = Buffer.alloc(32, 7).toString("base64url");
      let db: Awaited<ReturnType<typeof createDatabase>> | undefined;

      vi.stubEnv("DATABASE_URL", connectionString);
      vi.stubEnv("RESIDENCE_ENCRYPTION_ACTIVE_KEY", keyVersion);
      vi.stubEnv(
        "RESIDENCE_ENCRYPTION_KEYS",
        JSON.stringify([{ version: keyVersion, key: encodedKey }]),
      );

      try {
        db = await createDatabase(connectionString);
        const deliveries: Array<{
          email: string;
          token: string;
          url: string;
        }> = [];
        const auth = createAuth({
          baseURL: appOrigin,
          database: db,
          secret,
          sendMagicLink: async (delivery) => {
            deliveries.push(delivery);
          },
        });
        const signIn = async (email: string) => {
          const sent = await auth.handler(
            new Request(`${appOrigin}/api/auth/sign-in/magic-link`, {
              body: JSON.stringify({ email }),
              headers: {
                "content-type": "application/json",
                origin: appOrigin,
              },
              method: "POST",
            }),
          );
          expect(sent.status).toBe(200);
          const delivery = deliveries.at(-1);
          expect(delivery?.email).toBe(email);
          const signedIn = await auth.handler(new Request(delivery!.url));
          expect(signedIn.status).toBe(302);
          const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
          expect(cookie).toMatch(/^better-auth\.session_token=/);
          return cookie!;
        };

        const firstEmail = "route-owner-one@example.test";
        const secondEmail = "route-owner-two@example.test";
        const firstCookie = await signIn(firstEmail);
        const secondCookie = await signIn(secondEmail);
        expect(secondCookie).not.toBe(firstCookie);

        const [firstUser] = await db
          .select()
          .from(user)
          .where(eq(user.email, firstEmail));
        const [secondUser] = await db
          .select()
          .from(user)
          .where(eq(user.email, secondEmail));
        expect(firstUser).toBeDefined();
        expect(secondUser).toBeDefined();
        if (!firstUser || !secondUser) {
          throw new Error("Expected both signed-in users.");
        }
        expect(
          new Set(
            (await db.select().from(session)).map((row) => row.userId),
          ),
        ).toEqual(new Set([firstUser.id, secondUser.id]));

        const actualSavedResidence = await vi.importActual<
          typeof import("@/lib/saved-residence")
        >("@/lib/saved-residence");
        const repository =
          actualSavedResidence.createSavedResidenceRepository(db);
        const keyring = actualSavedResidence.loadResidenceEncryptionKeyring();
        const secondResolution = {
          ...resolution,
          divisions: [
            {
              ...resolution.divisions[0],
              id: "ocd-division/country:us/state:ex/cd:13",
              name: "Example Congressional District 13",
            },
          ],
        } satisfies SavedResidenceResolution;
        const firstStored = await repository.save(
          firstUser.id,
          validSaveBody("unused", "111 First Owner Lane"),
          resolution,
          now,
          keyring,
        );
        const secondStored = await repository.save(
          secondUser.id,
          validSaveBody("unused", "222 Second Owner Road"),
          secondResolution,
          now,
          keyring,
        );
        vi.mocked(savedResidenceModule.getSavedResidence).mockImplementation(
          actualSavedResidence.getSavedResidence,
        );
        vi.mocked(savedResidenceModule.deleteSavedResidence).mockImplementation(
          actualSavedResidence.deleteSavedResidence,
        );
        vi.mocked(getRuntimeAuth).mockResolvedValue(auth);

        await expectPrivateJson(
          await GET(
            residenceRequest("GET", undefined, { cookie: firstCookie }),
          ),
          200,
          { status: "saved", residence: firstStored.residence },
        );
        await expectPrivateJson(
          await GET(
            residenceRequest("GET", undefined, { cookie: secondCookie }),
          ),
          200,
          { status: "saved", residence: secondStored.residence },
        );

        await expectPrivateJson(
          await DELETE(
            residenceRequest("DELETE", validDeleteBody(), {
              cookie: firstCookie,
            }),
          ),
          200,
          { status: "deleted" },
        );
        expect(await repository.get(firstUser.id, keyring)).toBeNull();
        expect(await repository.get(secondUser.id, keyring)).toEqual(
          secondStored.residence,
        );

        await db
          .delete(session)
          .where(eq(session.userId, secondUser.id));
        vi.mocked(savedResidenceModule.deleteSavedResidence).mockClear();
        const revokedRequest = residenceRequest("DELETE", validDeleteBody(), {
          cookie: secondCookie,
        });
        const readBody = vi.spyOn(revokedRequest, "json");
        await expectPrivateJson(
          await DELETE(revokedRequest),
          401,
          errors.unauthenticated,
        );
        expect(readBody).not.toHaveBeenCalled();
        expect(savedResidenceModule.deleteSavedResidence).not.toHaveBeenCalled();
        expect(await repository.get(secondUser.id, keyring)).toEqual(
          secondStored.residence,
        );
      } finally {
        if (db) {
          await closeDatabase(db);
        }
        await rm(root, { force: true, recursive: true });
      }
    },
    30_000,
  );

  it("deletes without loading or decrypting an address key", async () => {
    vi.stubEnv("RESIDENCE_ENCRYPTION_ACTIVE_KEY", "");
    vi.stubEnv("RESIDENCE_ENCRYPTION_KEYS", "");
    vi.mocked(savedResidenceModule.deleteSavedResidence).mockResolvedValue(true);

    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      200,
      { status: "deleted" },
    );

    expect(savedResidenceModule.deleteSavedResidence).toHaveBeenCalledWith(
      userId,
    );
    expect(savedResidenceModule.getSavedResidence).not.toHaveBeenCalled();
    expect(
      savedResidenceModule.loadResidenceEncryptionKeyring,
    ).not.toHaveBeenCalled();
  });
});

describe("/api/v1/residence fail-closed privacy", () => {
  it("maps auth, decrypt, crypto, and database failures to generic exact errors", async () => {
    vi.mocked(getRuntimeAuth).mockRejectedValueOnce(
      new Error("SENTINEL_AUTH_DATABASE_DETAIL"),
    );
    await expectPrivateJson(
      await GET(residenceRequest("GET")),
      503,
      errors.unavailable,
    );

    getSession.mockRejectedValueOnce(
      new Error("SENTINEL_SESSION_DATABASE_DETAIL"),
    );
    await expectPrivateJson(
      await GET(residenceRequest("GET")),
      503,
      errors.unavailable,
    );
    expect(savedResidenceModule.getSavedResidence).not.toHaveBeenCalled();

    vi.mocked(savedResidenceModule.getSavedResidence).mockRejectedValueOnce(
      new Error("SENTINEL_DECRYPT_KEY_VERSION_CIPHERTEXT"),
    );
    await expectPrivateJson(
      await GET(residenceRequest("GET")),
      503,
      errors.unavailable,
    );

    vi.mocked(savedResidenceModule.saveSavedResidence).mockRejectedValueOnce(
      new Error("SENTINEL_CRYPTO_DATABASE_PROVIDER_DETAIL"),
    );
    await expectPrivateJson(
      await POST(residenceRequest("POST", validSaveBody())),
      503,
      errors.unavailable,
    );

    vi.mocked(savedResidenceModule.deleteSavedResidence).mockRejectedValueOnce(
      new Error("SENTINEL_DELETE_DATABASE_DETAIL"),
    );
    await expectPrivateJson(
      await DELETE(residenceRequest("DELETE", validDeleteBody())),
      503,
      errors.unavailable,
    );
  });

  it("keeps exact address and token out of URLs, logs, and error responses", async () => {
    const privateAddress = "742 SENTINEL PRIVATE ADDRESS, Example City";
    const privateToken = signedToken(userId, now);
    const logged = [
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
    ];
    vi.mocked(savedResidenceModule.saveSavedResidence).mockRejectedValueOnce(
      new Error(
        `${privateAddress} ${privateToken} SENTINEL_KEY_VERSION_DATABASE`,
      ),
    );
    const request = residenceRequest(
      "POST",
      validSaveBody(privateToken, privateAddress),
    );

    const responseBody = await expectPrivateJson(
      await POST(request),
      503,
      errors.unavailable,
    );

    expect(request.url).toBe(endpoint);
    expect(new URL(request.url).search).toBe("");
    expect(JSON.stringify(responseBody)).not.toMatch(
      /SENTINEL|resolutionToken|ciphertext|key.version|database/i,
    );
    expect(JSON.stringify(logged.flatMap((spy) => spy.mock.calls))).not.toMatch(
      /SENTINEL|742|resolutionToken|ciphertext/i,
    );
    expect(providerFetch).not.toHaveBeenCalled();
    expect(residenceModule.resolveResidence).not.toHaveBeenCalled();
  });
});

type RequestOptions = {
  cookie?: string;
  contentType?: string | null;
  origin?: string | null;
  raw?: boolean;
};

function residenceRequest(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
  options: RequestOptions = {},
) {
  const headers = new Headers({
    cookie:
      options.cookie ?? "better-auth.session_token=synthetic-session",
  });
  const contentType =
    options.contentType === undefined ? "application/json" : options.contentType;
  const origin = options.origin === undefined ? appOrigin : options.origin;
  if (method !== "GET" && contentType !== null) {
    headers.set("content-type", contentType);
  }
  if (origin !== null) {
    headers.set("origin", origin);
  }

  return new Request(endpoint, {
    body:
      body === undefined
        ? undefined
        : options.raw
          ? String(body)
          : JSON.stringify(body),
    headers,
    method,
  });
}

function validSaveBody(
  resolutionToken = signedToken(userId, now),
  address: string = savedResidenceView.address,
) {
  return {
    address,
    resolutionToken,
    consent: {
      accepted: true as const,
      version: "saved-residence-v1" as const,
    },
  };
}

function validDeleteBody() {
  return { confirmation: "DELETE_SAVED_RESIDENCE" };
}

function validBodyFor(method: "POST" | "DELETE") {
  return method === "POST" ? validSaveBody() : validDeleteBody();
}

function signedToken(ownerId: string, issuedAt: Date) {
  return residenceModule.createResolutionToken(
    { kind: "address", address: savedResidenceView.address },
    resolution,
    ownerId,
    secret,
    issuedAt,
  ).resolutionToken;
}

function tamperedToken(token: string) {
  const [version, payload, signature] = token.split(".");
  const firstSignatureCharacter = signature[0];
  const replacement = firstSignatureCharacter === "A" ? "B" : "A";
  return `${version}.${payload}.${replacement}${signature.slice(1)}`;
}

function sessionFor(ownerId: string) {
  return {
    session: { id: `session_${ownerId}` },
    user: { email: `${ownerId}@example.test`, id: ownerId },
  };
}

function savedResponse(replaced: boolean) {
  return {
    status: "saved",
    residence: savedResidenceView,
    replaced,
  };
}

async function expectPrivateJson(
  response: Response,
  status: number,
  expected: unknown,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toContain("application/json");
  const body = await response.json();
  expect(body).toEqual(expected);
  return body;
}

function firstCall(mock: { mock: { invocationCallOrder: number[] } }) {
  const [order] = mock.mock.invocationCallOrder;
  expect(order).toEqual(expect.any(Number));
  return order;
}

function expectStrictlyIncreasing(order: number[]) {
  expect(order).toEqual([...order].sort((left, right) => left - right));
  expect(new Set(order).size).toBe(order.length);
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
