// @vitest-environment node

import { createCipheriv, createDecipheriv } from "node:crypto";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ResolutionResponse } from "./residence";
import {
  SAVED_RESIDENCE_CONSENT_VERSION,
  SAVED_RESIDENCE_ERROR_MESSAGES,
  decryptSavedResidenceAddress,
  encryptSavedResidenceAddress,
  loadResidenceEncryptionKeyring,
  parseSaveResidenceRequest,
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
