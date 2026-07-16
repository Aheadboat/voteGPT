import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { ResolutionResponse } from "./residence";

type ResolvedPreviewResponse = Extract<
  ResolutionResponse,
  { status: "matched" | "partial" }
>;

export type SavedResidenceResolution = Readonly<
  Pick<
    ResolvedPreviewResponse,
    "status" | "divisions" | "source" | "coverageNotes"
  >
>;

export type SavedResidenceDivision = Readonly<
  SavedResidenceResolution["divisions"][number]
>;

export const SAVED_RESIDENCE_CONSENT_VERSION = "saved-residence-v1";

export type SaveResidenceRequest = {
  address: string;
  resolutionToken: string;
  consent: {
    accepted: true;
    version: typeof SAVED_RESIDENCE_CONSENT_VERSION;
  };
};

export type SavedResidenceView = {
  address: string;
  resolution: SavedResidenceResolution;
  consent: {
    version: typeof SAVED_RESIDENCE_CONSENT_VERSION;
    acceptedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type GetSavedResidenceResponse =
  | { status: "empty" }
  | { status: "saved"; residence: SavedResidenceView };

export type SaveResidenceResponse = {
  status: "saved";
  residence: SavedResidenceView;
  replaced: boolean;
};

export type SavedResidenceMutationResult = Omit<
  SaveResidenceResponse,
  "status"
>;

export type DeleteSavedResidenceResponse =
  | { status: "deleted" }
  | { status: "empty" };

export type SavedResidenceErrorResponse = {
  status:
    | "invalid_request"
    | "unauthenticated"
    | "forbidden"
    | "invalid_token"
    | "unavailable";
  message: string;
};

export const SAVED_RESIDENCE_ERROR_MESSAGES = {
  invalid_request: "Review the residence details and try again.",
  unauthenticated: "Sign in again before managing a saved residence.",
  forbidden: "This saved residence request was not accepted.",
  invalid_token: "Preview your voting residence again before saving.",
  unavailable: "Saved residence is temporarily unavailable. Try again later.",
} as const satisfies Record<SavedResidenceErrorResponse["status"], string>;

export type SavedResidenceEncryptionEnvelope = Readonly<{
  version: "v1";
  keyVersion: string;
  iv: string;
  ciphertext: string;
  tag: string;
}>;

export type ResidenceEncryptionKeyring = Readonly<{
  activeVersion: string;
  keys: ReadonlyMap<string, string>;
}>;

type ResidenceEncryptionEnvironment = Readonly<{
  RESIDENCE_ENCRYPTION_ACTIVE_KEY?: string;
  RESIDENCE_ENCRYPTION_KEYS?: string;
}>;

const requestKeys = new Set(["address", "resolutionToken", "consent"]);
const consentKeys = new Set(["accepted", "version"]);
const keyEntryKeys = new Set(["version", "key"]);
const envelopeKeys = new Set([
  "version",
  "keyVersion",
  "iv",
  "ciphertext",
  "tag",
]);
const keyVersionPattern = /^[a-z0-9][a-z0-9._-]{0,31}$/;
const base64urlPattern = /^[A-Za-z0-9_-]+$/;
const envelopeVersion = "v1";
const encryptionPurpose = "voteGPT/saved-residence/address";
const ivBytes = 12;
const tagBytes = 16;
const keyBytes = 32;
const keyringError =
  "Saved residence encryption configuration is invalid.";
const encryptedAddressError =
  "Saved residence encrypted address is invalid.";

export function parseSaveResidenceRequest(
  value: unknown,
): SaveResidenceRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, requestKeys)) {
    return null;
  }

  const { address: untrimmedAddress, consent, resolutionToken } = value;
  if (
    typeof untrimmedAddress !== "string" ||
    typeof resolutionToken !== "string" ||
    !isRecord(consent) ||
    !hasExactKeys(consent, consentKeys) ||
    consent.accepted !== true ||
    consent.version !== SAVED_RESIDENCE_CONSENT_VERSION
  ) {
    return null;
  }

  const address = untrimmedAddress.trim();
  if (!isValidAddress(address)) {
    return null;
  }

  return {
    address,
    resolutionToken,
    consent: {
      accepted: true,
      version: SAVED_RESIDENCE_CONSENT_VERSION,
    },
  };
}

export function loadResidenceEncryptionKeyring(
  environment: ResidenceEncryptionEnvironment = {
    RESIDENCE_ENCRYPTION_ACTIVE_KEY:
      process.env.RESIDENCE_ENCRYPTION_ACTIVE_KEY,
    RESIDENCE_ENCRYPTION_KEYS: process.env.RESIDENCE_ENCRYPTION_KEYS,
  },
): ResidenceEncryptionKeyring {
  const activeVersion = environment.RESIDENCE_ENCRYPTION_ACTIVE_KEY;
  const serializedKeys = environment.RESIDENCE_ENCRYPTION_KEYS;
  if (
    typeof activeVersion !== "string" ||
    !keyVersionPattern.test(activeVersion) ||
    typeof serializedKeys !== "string"
  ) {
    throw new Error(keyringError);
  }

  let entries: unknown;
  try {
    entries = JSON.parse(serializedKeys) as unknown;
  } catch {
    throw new Error(keyringError);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(keyringError);
  }

  const keys = new Map<string, string>();
  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, keyEntryKeys) ||
      typeof entry.version !== "string" ||
      !keyVersionPattern.test(entry.version) ||
      typeof entry.key !== "string" ||
      decodeCanonicalBase64url(entry.key, keyBytes) === null ||
      keys.has(entry.version)
    ) {
      throw new Error(keyringError);
    }
    keys.set(entry.version, entry.key);
  }

  if (!keys.has(activeVersion)) {
    throw new Error(keyringError);
  }

  return Object.freeze({ activeVersion, keys });
}

export function encryptSavedResidenceAddress(
  address: string,
  userId: string,
  keyring: ResidenceEncryptionKeyring,
): SavedResidenceEncryptionEnvelope {
  try {
    if (
      !isValidAddress(address) ||
      address.trim() !== address ||
      !isNonemptyUserId(userId)
    ) {
      throw new Error(encryptedAddressError);
    }

    const keyVersion = keyring.activeVersion;
    const key = keyForVersion(keyring, keyVersion);
    if (key === null) {
      throw new Error(encryptedAddressError);
    }

    const iv = randomBytes(ivBytes);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: tagBytes,
    });
    cipher.setAAD(authenticatedData(envelopeVersion, keyVersion, userId));
    const ciphertext = Buffer.concat([
      cipher.update(address, "utf8"),
      cipher.final(),
    ]);

    return {
      version: envelopeVersion,
      keyVersion,
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    };
  } catch {
    throw new Error(encryptedAddressError);
  }
}

export function decryptSavedResidenceAddress(
  value: unknown,
  userId: string,
  keyring: ResidenceEncryptionKeyring,
): string {
  try {
    if (!isEncryptionEnvelope(value) || !isNonemptyUserId(userId)) {
      throw new Error(encryptedAddressError);
    }

    const key = keyForVersion(keyring, value.keyVersion);
    const iv = decodeCanonicalBase64url(value.iv, ivBytes);
    const ciphertext = decodeCanonicalBase64url(value.ciphertext);
    const tag = decodeCanonicalBase64url(value.tag, tagBytes);
    if (key === null || iv === null || ciphertext === null || tag === null) {
      throw new Error(encryptedAddressError);
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: tagBytes,
    });
    decipher.setAAD(
      authenticatedData(value.version, value.keyVersion, userId),
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const address = plaintext.toString("utf8");
    if (
      !Buffer.from(address, "utf8").equals(plaintext) ||
      !isValidAddress(address) ||
      address.trim() !== address
    ) {
      throw new Error(encryptedAddressError);
    }
    return address;
  } catch {
    throw new Error(encryptedAddressError);
  }
}

export declare function getSavedResidenceDivisions(
  userId: string,
): Promise<readonly SavedResidenceDivision[]>;

export declare function saveSavedResidence(
  userId: string,
  request: SaveResidenceRequest,
  verifiedResolution: SavedResidenceResolution,
  now: Date,
): Promise<SavedResidenceMutationResult>;

export declare function getSavedResidence(
  userId: string,
): Promise<SavedResidenceView | null>;

export declare function deleteSavedResidence(userId: string): Promise<boolean>;

export declare function rotateSavedResidenceKeys(): Promise<{
  rotated: number;
  skipped: number;
  remaining: number;
}>;

function authenticatedData(
  version: string,
  keyVersion: string,
  userId: string,
) {
  return Buffer.from(
    JSON.stringify([encryptionPurpose, version, keyVersion, userId]),
    "utf8",
  );
}

function keyForVersion(
  keyring: ResidenceEncryptionKeyring,
  version: string,
) {
  if (!keyVersionPattern.test(version)) {
    return null;
  }
  const encodedKey = keyring.keys.get(version);
  return typeof encodedKey === "string"
    ? decodeCanonicalBase64url(encodedKey, keyBytes)
    : null;
}

function isEncryptionEnvelope(
  value: unknown,
): value is SavedResidenceEncryptionEnvelope {
  return (
    isRecord(value) &&
    hasExactKeys(value, envelopeKeys) &&
    value.version === envelopeVersion &&
    typeof value.keyVersion === "string" &&
    keyVersionPattern.test(value.keyVersion) &&
    typeof value.iv === "string" &&
    decodeCanonicalBase64url(value.iv, ivBytes) !== null &&
    typeof value.ciphertext === "string" &&
    decodeCanonicalBase64url(value.ciphertext) !== null &&
    typeof value.tag === "string" &&
    decodeCanonicalBase64url(value.tag, tagBytes) !== null
  );
}

function decodeCanonicalBase64url(value: string, bytes?: number) {
  if (!base64urlPattern.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    (bytes !== undefined && decoded.length !== bytes)
  ) {
    return null;
  }
  return decoded;
}

function isValidAddress(value: string) {
  return value.length >= 1 && value.length <= 300;
}

function isNonemptyUserId(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: Set<string>) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}
