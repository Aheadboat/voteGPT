// @vitest-environment node

import { createCipheriv, createDecipheriv } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { count, eq } from "drizzle-orm";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createDatabase } from "@/db";
import {
  savedResidence,
  savedResidenceDivision,
  user,
} from "@/db/schema";
import type { ResolutionResponse } from "./residence";
import {
  SAVED_RESIDENCE_CONSENT_VERSION,
  SAVED_RESIDENCE_ERROR_MESSAGES,
  createSavedResidenceRepository,
  decryptSavedResidenceAddress,
  deleteSavedResidence,
  encryptSavedResidenceAddress,
  getSavedResidenceDivisions,
  loadResidenceEncryptionKeyring,
  parseSaveResidenceRequest,
  rotateSavedResidenceKeys,
  type DeleteSavedResidenceResponse,
  type GetSavedResidenceResponse,
  type SaveResidenceRequest,
  type SaveResidenceResponse,
  type SavedResidenceErrorResponse,
  type SavedResidenceDivision,
  type SavedResidenceMutationResult,
  type SavedResidenceResolution,
  type SavedResidenceView,
} from "./saved-residence";

type ExpectedSavedResidenceResolution = Readonly<
  Pick<
    Extract<ResolutionResponse, { status: "matched" | "partial" }>,
    "status" | "divisions" | "source" | "coverageNotes"
  >
>;

type ExpectedSavedResidenceDivision = Readonly<
  ExpectedSavedResidenceResolution["divisions"][number]
>;

type ExpectedSaveResidenceRequest = {
  address: string;
  resolutionToken: string;
  consent: {
    accepted: true;
    version: "saved-residence-v1";
  };
};

type ExpectedSavedResidenceView = {
  address: string;
  resolution: ExpectedSavedResidenceResolution;
  consent: {
    version: "saved-residence-v1";
    acceptedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

type ExpectedGetSavedResidenceResponse =
  | { status: "empty" }
  | { status: "saved"; residence: ExpectedSavedResidenceView };

type ExpectedSaveResidenceResponse = {
  status: "saved";
  residence: ExpectedSavedResidenceView;
  replaced: boolean;
};

type ExpectedSavedResidenceMutationResult = {
  residence: ExpectedSavedResidenceView;
  replaced: boolean;
};

type ExpectedDeleteSavedResidenceResponse =
  | { status: "deleted" }
  | { status: "empty" };

type ExpectedSavedResidenceErrorResponse = {
  status:
    | "invalid_request"
    | "unauthenticated"
    | "forbidden"
    | "invalid_token"
    | "unavailable";
  message: string;
};

const resolution = {
  status: "matched",
  divisions: [
    {
      type: "congressional_district",
      name: "Example Congressional District 1",
      id: "ocd-division/country:us/state:ex/cd:1",
      idScheme: "ocd",
    },
  ],
  source: {
    name: "Google Civic Information API",
    url: "https://developers.google.com/civic-information",
    checkedAt: "2026-07-16T18:00:00.000Z",
    effectiveAt: null,
  },
  coverageNotes: ["Local divisions may be unavailable."],
} satisfies SavedResidenceResolution;

const residenceView = {
  address: "123 Main Street",
  resolution,
  consent: {
    version: SAVED_RESIDENCE_CONSENT_VERSION,
    acceptedAt: "2026-07-16T18:00:00.000Z",
  },
  createdAt: "2026-07-16T18:00:00.000Z",
  updatedAt: "2026-07-16T18:00:00.000Z",
} satisfies SavedResidenceView;

describe("saved residence contract", () => {
  it("freezes the consent version, response DTOs, and calm generic recovery copy (UX-01, UX-06, UX-09)", () => {
    expect(SAVED_RESIDENCE_CONSENT_VERSION).toBe("saved-residence-v1");
    expect(SAVED_RESIDENCE_ERROR_MESSAGES).toEqual({
      invalid_request: "Review the residence details and try again.",
      unauthenticated: "Sign in again before managing a saved residence.",
      forbidden: "This saved residence request was not accepted.",
      invalid_token: "Preview your voting residence again before saving.",
      unavailable: "Saved residence is temporarily unavailable. Try again later.",
    });

    expectTypeOf<SavedResidenceResolution>().toEqualTypeOf<ExpectedSavedResidenceResolution>();
    expectTypeOf<SavedResidenceDivision>().toEqualTypeOf<ExpectedSavedResidenceDivision>();
    expectTypeOf<SaveResidenceRequest>().toEqualTypeOf<ExpectedSaveResidenceRequest>();
    expectTypeOf<SavedResidenceView>().toEqualTypeOf<ExpectedSavedResidenceView>();
    expectTypeOf<GetSavedResidenceResponse>().toEqualTypeOf<ExpectedGetSavedResidenceResponse>();
    expectTypeOf<SaveResidenceResponse>().toEqualTypeOf<ExpectedSaveResidenceResponse>();
    expectTypeOf<SavedResidenceMutationResult>().toEqualTypeOf<ExpectedSavedResidenceMutationResult>();
    expectTypeOf<DeleteSavedResidenceResponse>().toEqualTypeOf<ExpectedDeleteSavedResidenceResponse>();
    expectTypeOf<SavedResidenceErrorResponse>().toEqualTypeOf<ExpectedSavedResidenceErrorResponse>();

    expectTypeOf<SavedResidenceView["resolution"]>().not.toHaveProperty(
      "resolutionToken",
    );
    expectTypeOf<SavedResidenceView["resolution"]>().not.toHaveProperty(
      "expiresAt",
    );
    expect(residenceView.resolution).not.toHaveProperty("resolutionToken");
    expect(residenceView.resolution).not.toHaveProperty("expiresAt");
  });

  it("accepts only exact request and consent shapes while trimming the address (UX-04, UX-07)", () => {
    const request = {
      address: "  123 Main Street  ",
      resolutionToken: "v1.payload.signature",
      consent: {
        accepted: true,
        version: SAVED_RESIDENCE_CONSENT_VERSION,
      },
    } satisfies SaveResidenceRequest;

    expect(parseSaveResidenceRequest(request)).toEqual({
      ...request,
      address: "123 Main Street",
    } satisfies SaveResidenceRequest);
    expect(
      parseSaveResidenceRequest({ ...request, address: "a" }),
    ).toEqual({ ...request, address: "a" });
    expect(
      parseSaveResidenceRequest({ ...request, address: "a".repeat(300) }),
    ).toEqual({ ...request, address: "a".repeat(300) });
  });

  it("rejects malformed, extra, coordinate-bearing, or unconsented requests recursively (UX-04, UX-06)", () => {
    const valid = {
      address: "123 Main Street",
      resolutionToken: "v1.payload.signature",
      consent: {
        accepted: true,
        version: SAVED_RESIDENCE_CONSENT_VERSION,
      },
    };

    for (const value of [
      null,
      [],
      {},
      { ...valid, address: "" },
      { ...valid, address: "   " },
      { ...valid, address: "a".repeat(301) },
      { ...valid, address: 123 },
      { ...valid, resolutionToken: null },
      { ...valid, extra: true },
      { ...valid, latitude: 38.8977 },
      { ...valid, longitude: -77.0365 },
      { ...valid, consent: null },
      { ...valid, consent: [] },
      { ...valid, consent: { accepted: false, version: "saved-residence-v1" } },
      { ...valid, consent: { accepted: true, version: "saved-residence-v2" } },
      { ...valid, consent: { accepted: true } },
      {
        ...valid,
        consent: {
          accepted: true,
          version: "saved-residence-v1",
          extra: true,
        },
      },
      {
        ...valid,
        consent: {
          accepted: true,
          version: "saved-residence-v1",
          latitude: 38.8977,
        },
      },
      {
        ...valid,
        metadata: { location: { longitude: -77.0365 } },
      },
    ]) {
      expect(parseSaveResidenceRequest(value)).toBeNull();
    }
  });
});

describe("saved residence encryption keyring", () => {
  it("loads an exact versioned key list and requires the active 32-byte key", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());

    expect(keyring.activeVersion).toBe("2026-07");
    expect([...keyring.keys.keys()]).toEqual(["2026-01", "2026-07"]);
  });

  it.each([
    ["missing active version", { RESIDENCE_ENCRYPTION_KEYS: "[]" }],
    [
      "missing key list",
      { RESIDENCE_ENCRYPTION_ACTIVE_KEY: "2026-07" },
    ],
    ["invalid JSON", environmentWithKeys("not-json")],
    ["non-array JSON", environmentWithKeys("{}")],
    ["empty key list", environmentWithKeys("[]")],
    [
      "unknown active version",
      validEnvironment({ activeVersion: "2027-01" }),
    ],
    [
      "duplicate version",
      validEnvironment({
        entries: [
          { version: "2026-07", key: encodedKey(1) },
          { version: "2026-07", key: encodedKey(2) },
        ],
      }),
    ],
    [
      "missing object field",
      environmentWithEntries([{ version: "2026-07" }]),
    ],
    [
      "extra object field",
      environmentWithEntries([
        { version: "2026-07", key: encodedKey(1), purpose: "other" },
      ]),
    ],
    [
      "non-object entry",
      environmentWithEntries([null]),
    ],
    [
      "uppercase version",
      environmentWithEntries([{ version: "JULY", key: encodedKey(1) }], "JULY"),
    ],
    [
      "invalid version punctuation",
      environmentWithEntries([{ version: "-july", key: encodedKey(1) }], "-july"),
    ],
    [
      "overlong version",
      environmentWithEntries(
        [{ version: "a".repeat(33), key: encodedKey(1) }],
        "a".repeat(33),
      ),
    ],
    [
      "short decoded key",
      environmentWithEntries([
        { version: "2026-07", key: Buffer.alloc(31, 1).toString("base64url") },
      ]),
    ],
    [
      "long decoded key",
      environmentWithEntries([
        { version: "2026-07", key: Buffer.alloc(33, 1).toString("base64url") },
      ]),
    ],
    [
      "padded key",
      environmentWithEntries([
        { version: "2026-07", key: `${encodedKey(1)}=` },
      ]),
    ],
    [
      "invalid base64url key",
      environmentWithEntries([{ version: "2026-07", key: "not+a/key" }]),
    ],
  ])("fails closed for %s", (_case, environment) => {
    expect(() => loadResidenceEncryptionKeyring(environment)).toThrow(
      "Saved residence encryption configuration is invalid.",
    );
  });

  it("does not substitute BETTER_AUTH_SECRET when residence keys are missing", () => {
    const environment = {
      BETTER_AUTH_SECRET: encodedKey(1),
      RESIDENCE_ENCRYPTION_ACTIVE_KEY: undefined,
      RESIDENCE_ENCRYPTION_KEYS: undefined,
    };

    expect(() => loadResidenceEncryptionKeyring(environment)).toThrow(
      "Saved residence encryption configuration is invalid.",
    );
  });
});

describe("saved residence authenticated encryption", () => {
  it("round-trips exact address text with fresh AES-256-GCM envelope fields and user-bound AAD (UX-04)", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());
    const address = "123 Main Street, Apt 2, Example City, CA 90000";

    const first = encryptSavedResidenceAddress(address, "user_fixture", keyring);
    const second = encryptSavedResidenceAddress(address, "user_fixture", keyring);

    expect(first).toEqual({
      version: "v1",
      keyVersion: "2026-07",
      iv: expect.any(String),
      ciphertext: expect.any(String),
      tag: expect.any(String),
    });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toContain(address);
    expect(JSON.stringify(first)).not.toContain(address);
    expectCanonicalBase64url(first.iv, 12);
    expectCanonicalBase64url(first.ciphertext);
    expectCanonicalBase64url(first.tag, 16);
    expect(
      decryptSavedResidenceAddress(first, "user_fixture", keyring),
    ).toBe(address);
  });

  it("lets independent Node crypto decrypt production output only with fixed-purpose, version, key-version, user AAD in canonical order (UX-04)", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());
    const address = "123 Main Street";
    const envelope = encryptSavedResidenceAddress(
      address,
      "user_fixture",
      keyring,
    );
    const aad = Buffer.from(
      JSON.stringify([
        "voteGPT/saved-residence/address",
        "v1",
        "2026-07",
        "user_fixture",
      ]),
      "utf8",
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(encodedKey(2), "base64url"),
      Buffer.from(envelope.iv, "base64url"),
      { authTagLength: 16 },
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    expect(plaintext.toString("utf8")).toBe(address);
  });

  it("decrypts an independent Node crypto envelope only with fixed-purpose, version, key-version, user AAD in canonical order (UX-04)", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());
    const address = "123 Main Street";
    const iv = Buffer.alloc(12, 3);
    const aad = Buffer.from(
      JSON.stringify([
        "voteGPT/saved-residence/address",
        "v1",
        "2026-07",
        "user_fixture",
      ]),
      "utf8",
    );
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(encodedKey(2), "base64url"),
      iv,
      { authTagLength: 16 },
    );
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(address, "utf8"),
      cipher.final(),
    ]);

    expect(
      decryptSavedResidenceAddress(
        {
          version: "v1",
          keyVersion: "2026-07",
          iv: iv.toString("base64url"),
          ciphertext: ciphertext.toString("base64url"),
          tag: cipher.getAuthTag().toString("base64url"),
        },
        "user_fixture",
        keyring,
      ),
    ).toBe(address);
  });

  it("rejects tampering, a different user, a different key, and unknown key or envelope versions without details (UX-04, UX-06)", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());
    const envelope = encryptSavedResidenceAddress(
      "123 Main Street",
      "user_fixture",
      keyring,
    );
    const wrongKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(
        [{ version: "2026-07", key: encodedKey(9) }],
        "2026-07",
      ),
    );

    for (const [candidate, candidateUser, candidateKeyring] of [
      [envelope, "other_user", keyring],
      [envelope, "user_fixture", wrongKeyring],
      [{ ...envelope, iv: alter(envelope.iv) }, "user_fixture", keyring],
      [
        { ...envelope, ciphertext: alter(envelope.ciphertext) },
        "user_fixture",
        keyring,
      ],
      [{ ...envelope, tag: alter(envelope.tag) }, "user_fixture", keyring],
      [{ ...envelope, version: "v2" }, "user_fixture", keyring],
      [
        { ...envelope, keyVersion: "2027-01" },
        "user_fixture",
        keyring,
      ],
      [
        { ...envelope, keyVersion: "2026-01" },
        "user_fixture",
        keyring,
      ],
    ] as const) {
      expectCryptoFailure(candidate, candidateUser, candidateKeyring);
    }
  });

  it("rejects malformed or noncanonical envelopes before decrypting (UX-04, UX-06)", () => {
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());
    const envelope = encryptSavedResidenceAddress(
      "123 Main Street",
      "user_fixture",
      keyring,
    );

    for (const candidate of [
      null,
      [],
      {},
      { ...envelope, extra: true },
      { ...envelope, version: 1 },
      { ...envelope, keyVersion: "" },
      { ...envelope, iv: `${envelope.iv}=` },
      { ...envelope, iv: Buffer.alloc(11).toString("base64url") },
      { ...envelope, ciphertext: "" },
      { ...envelope, ciphertext: "not+base64url" },
      { ...envelope, tag: Buffer.alloc(15).toString("base64url") },
      {
        version: envelope.version,
        keyVersion: envelope.keyVersion,
        iv: envelope.iv,
        ciphertext: envelope.ciphertext,
      },
    ]) {
      expectCryptoFailure(candidate, "user_fixture", keyring);
    }
  });
});

describe("saved residence key rotation", () => {
  it("preflights every referenced key version for presence before writing", async () => {
    const { db, repository } = await rotationFixture(["alpha", "bravo"]);
    const entries = [
      { version: "2025-01", key: encodedKey(3) },
      { version: "2026-01", key: encodedKey(1) },
      { version: "2026-07", key: encodedKey(2) },
    ];
    const firstKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(entries, "2025-01"),
    );
    const secondKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(entries, "2026-01"),
    );
    let attemptedWrites = 0;

    try {
      await saveRotationResidence(
        repository,
        "user_alpha",
        "101 Alpha Avenue",
        firstKeyring,
      );
      await saveRotationResidence(
        repository,
        "user_bravo",
        "202 Bravo Boulevard",
        secondKeyring,
      );
      const before = await encryptedRows(db);

      await expect(
        repository.rotateKeys(
          {
            activeVersion: "2026-07",
            keys: new Map([
              ["2025-01", encodedKey(3)],
              ["2026-07", encodedKey(2)],
            ]),
          },
          {
            batchSize: 1,
            beforeUpdate: () => {
              attemptedWrites += 1;
            },
          },
        ),
      ).rejects.toThrow("Saved residence key rotation failed.");

      expect(attemptedWrites).toBe(0);
      expect(await encryptedRows(db)).toEqual(before);
    } finally {
      await closeDatabase(db);
    }
  });

  it("discovers a present wrong key at its row, keeps earlier commits, and resumes with the corrected key", async () => {
    const { db, repository } = await rotationFixture(["alpha", "bravo"]);
    const entries = [
      { version: "2025-01", key: encodedKey(3) },
      { version: "2026-01", key: encodedKey(1) },
      { version: "2026-07", key: encodedKey(2) },
    ];
    const firstKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(entries, "2025-01"),
    );
    const secondKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(entries, "2026-01"),
    );
    const correctedKeyring = loadResidenceEncryptionKeyring(
      environmentWithEntries(entries),
    );

    try {
      await saveRotationResidence(
        repository,
        "user_alpha",
        "101 Alpha Avenue",
        firstKeyring,
      );
      await saveRotationResidence(
        repository,
        "user_bravo",
        "202 Bravo Boulevard",
        secondKeyring,
      );

      await expect(
        repository.rotateKeys(
          {
            activeVersion: "2026-07",
            keys: new Map([
              ["2025-01", encodedKey(3)],
              ["2026-01", encodedKey(9)],
              ["2026-07", encodedKey(2)],
            ]),
          },
          { batchSize: 1 },
        ),
      ).rejects.toThrow("Saved residence key rotation failed.");
      const afterFailure = await encryptedRows(db);
      expect(afterFailure.map(({ keyVersion }) => keyVersion)).toEqual([
        correctedKeyring.activeVersion,
        secondKeyring.activeVersion,
      ]);
      const committedAlpha = afterFailure[0];

      expect(
        await repository.rotateKeys(correctedKeyring, { batchSize: 1 }),
      ).toEqual({ rotated: 1, skipped: 0, remaining: 0 });
      expect((await encryptedRows(db))[0]).toEqual(committedAlpha);
    } finally {
      await closeDatabase(db);
    }
  });

  it("rotates stable ascending batches with fresh envelopes, leaves active rows untouched, and returns counts only", async () => {
    const { db, legacyKeyring, repository, rotationKeyring } =
      await rotationFixture(["charlie", "alpha", "zulu", "bravo"]);
    const addresses = new Map([
      ["user_alpha", "101 Alpha Avenue"],
      ["user_bravo", "202 Bravo Boulevard"],
      ["user_charlie", "303 Charlie Court"],
    ]);

    try {
      for (const [userId, address] of addresses) {
        await saveRotationResidence(repository, userId, address, legacyKeyring);
      }
      await saveRotationResidence(
        repository,
        "user_zulu",
        "404 Zulu Way",
        rotationKeyring,
      );
      const before = await encryptedRows(db);
      const activeSnapshots: string[][] = [];

      const result = await repository.rotateKeys(rotationKeyring, {
        batchSize: 2,
        beforeUpdate: async () => {
          activeSnapshots.push(
            (
              await db
                .select({ userId: savedResidence.userId })
                .from(savedResidence)
                .where(
                  eq(
                    savedResidence.keyVersion,
                    rotationKeyring.activeVersion,
                  ),
                )
                .orderBy(savedResidence.userId)
            ).map(({ userId }) => userId),
          );
        },
      });

      expect(result).toEqual({ rotated: 3, skipped: 0, remaining: 0 });
      expect(Object.keys(result).sort()).toEqual([
        "remaining",
        "rotated",
        "skipped",
      ]);
      expect(activeSnapshots).toEqual([
        ["user_zulu"],
        ["user_alpha", "user_zulu"],
        ["user_alpha", "user_bravo", "user_zulu"],
      ]);

      const after = await encryptedRows(db);
      for (const row of after) {
        const previous = before.find(({ userId }) => userId === row.userId);
        expect(previous).toBeDefined();
        if (row.userId === "user_zulu") {
          expect(row).toEqual(previous);
          continue;
        }
        expect(row.keyVersion).toBe(rotationKeyring.activeVersion);
        expect(row.iv).not.toBe(previous?.iv);
        expect(row.ciphertext).not.toBe(previous?.ciphertext);
        expect(row.tag).not.toBe(previous?.tag);
        expect(
          decryptSavedResidenceAddress(
            {
              ciphertext: row.ciphertext,
              iv: row.iv,
              keyVersion: row.keyVersion,
              tag: row.tag,
              version: row.envelopeVersion,
            },
            row.userId,
            rotationKeyring,
          ),
        ).toBe(addresses.get(row.userId));
      }
      expect(
        await db
          .select({
            keyVersion: savedResidence.keyVersion,
            residences: count(),
          })
          .from(savedResidence)
          .groupBy(savedResidence.keyVersion),
      ).toEqual([
        { keyVersion: rotationKeyring.activeVersion, residences: 4 },
      ]);
    } finally {
      await closeDatabase(db);
    }
  });

  it.each([
    ["envelope_version", "v2"],
    ["key_version", "concurrent-key"],
    ["iv", Buffer.alloc(12, 7).toString("base64url")],
    ["ciphertext", Buffer.from("concurrent replacement").toString("base64url")],
    ["tag", Buffer.alloc(16, 7).toString("base64url")],
  ] as const)(
    "uses %s in full-envelope CAS and skips a concurrent replacement",
    async (column, replacement) => {
      const { db, legacyKeyring, repository, rotationKeyring } =
        await rotationFixture(["one"]);

      try {
        await saveRotationResidence(
          repository,
          "user_one",
          "101 Alpha Avenue",
          legacyKeyring,
        );
        if (column === "envelope_version") {
          await rawDatabaseClient(db).query(
            'alter table "saved_residence" drop constraint "saved_residence_envelope_version_check"',
          );
        }

        const result = await repository.rotateKeys(rotationKeyring, {
          batchSize: 1,
          beforeUpdate: async () => {
            await rawDatabaseClient(db).query(
              `update "saved_residence" set "${column}" = $1 where "user_id" = $2`,
              [replacement, "user_one"],
            );
          },
        });
        const stored = await rawDatabaseClient(db).query<{ value: string }>(
          `select "${column}" as value from "saved_residence" where "user_id" = $1`,
          ["user_one"],
        );

        expect(result).toEqual({ rotated: 0, skipped: 1, remaining: 1 });
        expect(stored.rows[0]?.value).toBe(replacement);
      } finally {
        await closeDatabase(db);
      }
    },
  );

  it("uses user ID in CAS when a concurrent replacement moves the old envelope", async () => {
    const { db, legacyKeyring, repository, rotationKeyring } =
      await rotationFixture(["one", "alpha"]);

    try {
      await repository.save(
        "user_one",
        saveRequest("101 Alpha Avenue", "unused-by-persistence"),
        { ...resolution, divisions: [] },
        new Date("2026-07-16T18:00:00.000Z"),
        legacyKeyring,
      );
      const before = (await encryptedRows(db))[0];
      if (!before) {
        throw new Error("Rotation fixture did not create a residence.");
      }

      const result = await repository.rotateKeys(rotationKeyring, {
        batchSize: 1,
        beforeUpdate: async () => {
          await db
            .update(savedResidence)
            .set({ userId: "user_alpha" })
            .where(eq(savedResidence.userId, "user_one"));
        },
      });

      expect(result).toEqual({ rotated: 0, skipped: 1, remaining: 1 });
      expect(await encryptedRows(db)).toEqual([
        { ...before, userId: "user_alpha" },
      ]);
    } finally {
      await closeDatabase(db);
    }
  });

  it("keeps earlier commits after later cross-user AAD tampering and resumes without rerotating", async () => {
    const { db, legacyKeyring, repository, rotationKeyring } =
      await rotationFixture(["alpha", "bravo"]);

    try {
      await saveRotationResidence(
        repository,
        "user_alpha",
        "101 Alpha Avenue",
        legacyKeyring,
      );
      await saveRotationResidence(
        repository,
        "user_bravo",
        "202 Bravo Boulevard",
        legacyKeyring,
      );
      const [alpha] = await db
        .select({
          ciphertext: savedResidence.ciphertext,
          envelopeVersion: savedResidence.envelopeVersion,
          iv: savedResidence.iv,
          keyVersion: savedResidence.keyVersion,
          tag: savedResidence.tag,
        })
        .from(savedResidence)
        .where(eq(savedResidence.userId, "user_alpha"));
      expect(alpha).toBeDefined();
      await db
        .update(savedResidence)
        .set(alpha)
        .where(eq(savedResidence.userId, "user_bravo"));

      await expect(
        repository.rotateKeys(rotationKeyring, { batchSize: 1 }),
      ).rejects.toThrow("Saved residence key rotation failed.");
      const afterFailure = await encryptedRows(db);
      expect(
        afterFailure.map(({ keyVersion }) => keyVersion),
      ).toEqual([rotationKeyring.activeVersion, legacyKeyring.activeVersion]);
      const committedAlpha = afterFailure[0];

      await saveRotationResidence(
        repository,
        "user_bravo",
        "202 Bravo Boulevard",
        legacyKeyring,
      );
      expect(
        await repository.rotateKeys(rotationKeyring, { batchSize: 1 }),
      ).toEqual({ rotated: 1, skipped: 0, remaining: 0 });
      expect((await encryptedRows(db))[0]).toEqual(committedAlpha);
    } finally {
      await closeDatabase(db);
    }
  });

  it("keeps earlier row commits after a later database failure and resumes", async () => {
    const { db, legacyKeyring, repository, rotationKeyring } =
      await rotationFixture(["charlie", "alpha", "bravo"]);
    let attemptedRows = 0;

    try {
      for (const [userId, address] of [
        ["user_charlie", "303 Charlie Court"],
        ["user_alpha", "101 Alpha Avenue"],
        ["user_bravo", "202 Bravo Boulevard"],
      ] as const) {
        await saveRotationResidence(repository, userId, address, legacyKeyring);
      }

      await expect(
        repository.rotateKeys(rotationKeyring, {
          batchSize: 2,
          beforeUpdate: async () => {
            attemptedRows += 1;
            if (attemptedRows === 2) {
              await rawDatabaseClient(db).query(
                "select * from missing_rotation_relation",
              );
            }
          },
        }),
      ).rejects.toThrow("Saved residence key rotation failed.");
      const afterFailure = await encryptedRows(db);
      expect(
        afterFailure.map(({ keyVersion }) => keyVersion),
      ).toEqual([
        rotationKeyring.activeVersion,
        legacyKeyring.activeVersion,
        legacyKeyring.activeVersion,
      ]);
      const committedAlpha = afterFailure[0];

      expect(
        await repository.rotateKeys(rotationKeyring, { batchSize: 2 }),
      ).toEqual({ rotated: 2, skipped: 0, remaining: 0 });
      expect((await encryptedRows(db))[0]).toEqual(committedAlpha);
    } finally {
      await closeDatabase(db);
    }
  });

  it("uses process database and dedicated keyring through the top-level rotation entry point", async () => {
    const root = await mkdtemp(join(tmpdir(), "votegpt-residence-rotation-"));
    const connectionString = pgliteConnection(join(root, "database"));
    const previousEnvironment = residenceEnvironment();
    process.env.DATABASE_URL = connectionString;
    Object.assign(process.env, validEnvironment());
    const db = await createDatabase(connectionString);
    const repository = createSavedResidenceRepository(db);
    const legacyKeyring = loadResidenceEncryptionKeyring(
      validEnvironment({ activeVersion: "2026-01" }),
    );

    try {
      await db.insert(user).values(testUser("one"));
      await saveRotationResidence(
        repository,
        "user_one",
        "101 Alpha Avenue",
        legacyKeyring,
      );

      expect(await rotateSavedResidenceKeys()).toEqual({
        rotated: 1,
        skipped: 0,
        remaining: 0,
      });
    } finally {
      restoreResidenceEnvironment(previousEnvironment);
      await closeDatabase(db);
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("saved residence persistence", () => {
  it("migrates only encrypted residence and normalized division columns with required constraints", async () => {
    const db = await createDatabase("pglite://memory");

    try {
      const client = db.$client as unknown as {
        query: (query: string) => Promise<{
          rows: Array<{ column_name: string; table_name: string }>;
        }>;
      };
      const { rows } = await client.query(
        `select table_name, column_name
         from information_schema.columns
         where table_name in ('saved_residence', 'saved_residence_division')
         order by table_name, column_name`,
      );
      const columns = Object.groupBy(
        rows,
        ({ table_name: tableName }) => tableName,
      );

      expect(columns.saved_residence?.map(({ column_name }) => column_name)).toEqual(
        [
          "ciphertext",
          "consent_version",
          "consented_at",
          "coverage_notes",
          "created_at",
          "envelope_version",
          "iv",
          "key_version",
          "resolution_status",
          "source_benchmark",
          "source_checked_at",
          "source_effective_at",
          "source_name",
          "source_url",
          "source_vintage",
          "tag",
          "updated_at",
          "user_id",
        ],
      );
      expect(
        columns.saved_residence_division?.map(
          ({ column_name }) => column_name,
        ),
      ).toEqual([
        "display_order",
        "division_id",
        "id_scheme",
        "name",
        "type",
        "user_id",
      ]);
      expect(JSON.stringify(rows)).not.toMatch(
        /address|token|hash|latitude|longitude/i,
      );

      const migration = await readFile(
        resolve(process.cwd(), "drizzle/0002_saved_residence.sql"),
        "utf8",
      );
      expect(migration).toContain(
        'CONSTRAINT "saved_residence_envelope_version_check" CHECK ("saved_residence"."envelope_version" = \'v1\')',
      );
      expect(migration).toContain(
        'CONSTRAINT "saved_residence_resolution_status_check" CHECK ("saved_residence"."resolution_status" in (\'matched\', \'partial\'))',
      );
      expect(migration).toContain(
        'CONSTRAINT "saved_residence_consent_version_check" CHECK ("saved_residence"."consent_version" = \'saved-residence-v1\')',
      );
      expect(migration).toContain("ON DELETE cascade");
      expect(migration).toContain(
        'CREATE INDEX "saved_residence_division_lookup_idx" ON "saved_residence_division" USING btree ("id_scheme","type","division_id","user_id")',
      );
      expect(migration).not.toMatch(/address|token|hash|latitude|longitude/i);
    } finally {
      await closeDatabase(db);
    }
  });

  it("atomically creates and replaces one encrypted home without history", async () => {
    const { db, keyring, repository } = await persistenceFixture();
    const firstNow = new Date("2026-07-16T18:00:00.000Z");
    const secondNow = new Date("2026-07-16T19:00:00.000Z");

    try {
      const created = await repository.save(
        "user_one",
        saveRequest("123 Main Street", "v1.private.first"),
        resolution,
        firstNow,
        keyring,
      );
      expect(created).toEqual({
        replaced: false,
        residence: residenceView,
      });

      const replaced = await repository.save(
        "user_one",
        saveRequest("456 Oak Avenue", "v1.private.second"),
        replacementResolution,
        secondNow,
        keyring,
      );
      expect(replaced).toEqual({
        replaced: true,
        residence: {
          address: "456 Oak Avenue",
          consent: {
            acceptedAt: secondNow.toISOString(),
            version: SAVED_RESIDENCE_CONSENT_VERSION,
          },
          createdAt: firstNow.toISOString(),
          resolution: replacementResolution,
          updatedAt: secondNow.toISOString(),
        },
      });
      expect(await repository.get("user_one", keyring)).toEqual(
        replaced.residence,
      );
      expect(await db.select().from(savedResidence)).toHaveLength(1);
      expect(
        await db
          .select({
            displayOrder: savedResidenceDivision.displayOrder,
            id: savedResidenceDivision.divisionId,
          })
          .from(savedResidenceDivision)
          .where(eq(savedResidenceDivision.userId, "user_one"))
          .orderBy(savedResidenceDivision.displayOrder),
      ).toEqual([
        { displayOrder: 0, id: replacementResolution.divisions[0].id },
        { displayOrder: 1, id: replacementResolution.divisions[1].id },
      ]);

      const rawState = JSON.stringify({
        divisions: await db.select().from(savedResidenceDivision),
        residences: await db.select().from(savedResidence),
      });
      expect(rawState).not.toContain("123 Main Street");
      expect(rawState).not.toContain("456 Oak Avenue");
      expect(rawState).not.toContain("v1.private.first");
      expect(rawState).not.toContain("v1.private.second");
    } finally {
      await closeDatabase(db);
    }
  });

  it("rolls back parent and child replacement when new divisions fail", async () => {
    const { db, keyring, repository } = await persistenceFixture();
    const firstNow = new Date("2026-07-16T18:00:00.000Z");

    try {
      await repository.save(
        "user_one",
        saveRequest("123 Main Street", "v1.private.first"),
        resolution,
        firstNow,
        keyring,
      );

      await expect(
        repository.save(
          "user_one",
          saveRequest("456 Oak Avenue", "v1.private.second"),
          {
            ...replacementResolution,
            divisions: [
              replacementResolution.divisions[0],
              replacementResolution.divisions[0],
            ],
          },
          new Date("2026-07-16T19:00:00.000Z"),
          keyring,
        ),
      ).rejects.toThrow();

      expect(await repository.get("user_one", keyring)).toEqual(
        residenceView,
      );
      expect(await db.select().from(savedResidenceDivision)).toHaveLength(1);
    } finally {
      await closeDatabase(db);
    }
  });

  it("hands off ordered divisions for two users and deletes without keys or decryption", async () => {
    const root = await mkdtemp(join(tmpdir(), "votegpt-residence-db-"));
    const connectionString = pgliteConnection(join(root, "database"));
    const previousEnvironment = residenceEnvironment();
    process.env.DATABASE_URL = connectionString;
    delete process.env.RESIDENCE_ENCRYPTION_ACTIVE_KEY;
    delete process.env.RESIDENCE_ENCRYPTION_KEYS;
    const db = await createDatabase(connectionString);
    const repository = createSavedResidenceRepository(db);
    const keyring = loadResidenceEncryptionKeyring(validEnvironment());

    try {
      await db.insert(user).values([
        testUser("one"),
        testUser("two"),
      ]);
      await repository.save(
        "user_one",
        saveRequest("123 Main Street", "v1.private.one"),
        replacementResolution,
        new Date("2026-07-16T18:00:00.000Z"),
        keyring,
      );
      await repository.save(
        "user_two",
        saveRequest("789 Pine Road", "v1.private.two"),
        {
          ...replacementResolution,
          divisions: [...replacementResolution.divisions].reverse(),
        },
        new Date("2026-07-16T18:00:00.000Z"),
        keyring,
      );
      await db
        .update(savedResidence)
        .set({ keyVersion: "retired-key" })
        .where(eq(savedResidence.userId, "user_one"));

      expect(await getSavedResidenceDivisions("user_one")).toEqual(
        replacementResolution.divisions,
      );
      expect(await getSavedResidenceDivisions("user_two")).toEqual(
        [...replacementResolution.divisions].reverse(),
      );
      expect(await deleteSavedResidence("user_one")).toBe(true);
      expect(
        await db
          .select()
          .from(savedResidenceDivision)
          .where(eq(savedResidenceDivision.userId, "user_one")),
      ).toEqual([]);

      await db.delete(user).where(eq(user.id, "user_two"));
      expect(await db.select().from(savedResidence)).toEqual([]);
      expect(await db.select().from(savedResidenceDivision)).toEqual([]);
    } finally {
      restoreResidenceEnvironment(previousEnvironment);
      await closeDatabase(db);
      await rm(root, { force: true, recursive: true });
    }
  });
});

const replacementResolution = {
  status: "partial",
  divisions: [
    {
      type: "state",
      name: "Example State",
      id: "ocd-division/country:us/state:ex",
      idScheme: "ocd",
    },
    {
      type: "county",
      name: "Example County",
      id: "0500000US99999",
      idScheme: "geoid",
    },
  ],
  source: {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/",
    checkedAt: "2026-07-16T19:00:00.000Z",
    effectiveAt: "2020-01-01T00:00:00.000Z",
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
  },
  coverageNotes: ["Congressional district coverage is unavailable."],
} satisfies SavedResidenceResolution;

async function persistenceFixture() {
  const db = await createDatabase("pglite://memory");
  await db.insert(user).values([testUser("one"), testUser("two")]);
  return {
    db,
    keyring: loadResidenceEncryptionKeyring(validEnvironment()),
    repository: createSavedResidenceRepository(db),
  };
}

async function rotationFixture(suffixes: readonly string[]) {
  const db = await createDatabase("pglite://memory");
  await db.insert(user).values(suffixes.map(testUser));
  return {
    db,
    legacyKeyring: loadResidenceEncryptionKeyring(
      validEnvironment({ activeVersion: "2026-01" }),
    ),
    repository: createSavedResidenceRepository(db),
    rotationKeyring: loadResidenceEncryptionKeyring(validEnvironment()),
  };
}

async function saveRotationResidence(
  repository: ReturnType<typeof createSavedResidenceRepository>,
  userId: string,
  address: string,
  keyring: ReturnType<typeof loadResidenceEncryptionKeyring>,
) {
  return repository.save(
    userId,
    saveRequest(address, "unused-by-persistence"),
    resolution,
    new Date("2026-07-16T18:00:00.000Z"),
    keyring,
  );
}

function encryptedRows(
  db: Awaited<ReturnType<typeof createDatabase>>,
) {
  return db
    .select({
      ciphertext: savedResidence.ciphertext,
      envelopeVersion: savedResidence.envelopeVersion,
      iv: savedResidence.iv,
      keyVersion: savedResidence.keyVersion,
      tag: savedResidence.tag,
      userId: savedResidence.userId,
    })
    .from(savedResidence)
    .orderBy(savedResidence.userId);
}

function saveRequest(address: string, resolutionToken: string) {
  return {
    address,
    consent: {
      accepted: true,
      version: SAVED_RESIDENCE_CONSENT_VERSION,
    },
    resolutionToken,
  } satisfies SaveResidenceRequest;
}

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

function residenceEnvironment() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    RESIDENCE_ENCRYPTION_ACTIVE_KEY:
      process.env.RESIDENCE_ENCRYPTION_ACTIVE_KEY,
    RESIDENCE_ENCRYPTION_KEYS: process.env.RESIDENCE_ENCRYPTION_KEYS,
  };
}

function restoreResidenceEnvironment(environment: ReturnType<typeof residenceEnvironment>) {
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function closeDatabase(
  database: Awaited<ReturnType<typeof createDatabase>>,
) {
  const client = database.$client as unknown as {
    close?: () => Promise<void>;
  };
  await client.close?.();
}

function rawDatabaseClient(
  database: Awaited<ReturnType<typeof createDatabase>>,
) {
  return database.$client as unknown as {
    query<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: string,
      params?: unknown[],
    ): Promise<{ rows: Row[] }>;
  };
}

function encodedKey(fill: number) {
  return Buffer.alloc(32, fill).toString("base64url");
}

function validEnvironment(
  overrides: {
    activeVersion?: string;
    entries?: unknown[];
  } = {},
) {
  return environmentWithEntries(
    overrides.entries ?? [
      { version: "2026-01", key: encodedKey(1) },
      { version: "2026-07", key: encodedKey(2) },
    ],
    overrides.activeVersion ?? "2026-07",
  );
}

function environmentWithEntries(entries: unknown[], activeVersion = "2026-07") {
  return environmentWithKeys(JSON.stringify(entries), activeVersion);
}

function environmentWithKeys(keys: string, activeVersion = "2026-07") {
  return {
    RESIDENCE_ENCRYPTION_ACTIVE_KEY: activeVersion,
    RESIDENCE_ENCRYPTION_KEYS: keys,
  };
}

function expectCanonicalBase64url(value: string, decodedBytes?: number) {
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(value, "base64url");
  expect(decoded.toString("base64url")).toBe(value);
  if (decodedBytes !== undefined) {
    expect(decoded).toHaveLength(decodedBytes);
  }
}

function alter(value: string) {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

function expectCryptoFailure(
  envelope: unknown,
  userId: string,
  keyring: ReturnType<typeof loadResidenceEncryptionKeyring>,
) {
  expect(() =>
    decryptSavedResidenceAddress(envelope, userId, keyring),
  ).toThrow("Saved residence encrypted address is invalid.");
}
