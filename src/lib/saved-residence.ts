import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, asc, count, eq, gt, ne } from "drizzle-orm";
import { createDatabase } from "@/db";
import { savedResidence, savedResidenceDivision } from "@/db/schema";
import {
  isPublicResidenceResolution,
  type ResolutionResponse,
} from "./residence";

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
  | { status: "saved"; residence: SavedResidenceView | null };

export type VersionedSavedResidence = {
  residence: SavedResidenceView | null;
  revision: string;
};

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
  { status: "deleted" } | { status: "empty" };

export type SavedResidenceErrorResponse = {
  status:
    | "invalid_request"
    | "unauthenticated"
    | "forbidden"
    | "invalid_token"
    | "precondition_failed"
    | "unavailable";
  message: string;
};

export const SAVED_RESIDENCE_ERROR_MESSAGES = {
  invalid_request: "Review the residence details and try again.",
  unauthenticated: "Sign in again before managing a saved residence.",
  forbidden: "This saved residence request was not accepted.",
  invalid_token: "Preview your voting residence again before saving.",
  precondition_failed:
    "Saved residence changed. Reload the latest state and try again.",
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
const revisionPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const envelopeVersion = "v1";
const encryptionPurpose = "voteGPT/saved-residence/address";
const ivBytes = 12;
const tagBytes = 16;
const keyBytes = 32;
const keyringError = "Saved residence encryption configuration is invalid.";
const encryptedAddressError = "Saved residence encrypted address is invalid.";
const savedResidenceRecordError = "Saved residence record is invalid.";
const savedResidenceRotationError = "Saved residence key rotation failed.";
const divisionTypes = new Set<SavedResidenceDivision["type"]>([
  "country",
  "state",
  "county",
  "congressional_district",
  "state_upper",
  "state_lower",
  "place",
  "other",
]);

type Database = Awaited<ReturnType<typeof createDatabase>>;

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
    decipher.setAAD(authenticatedData(value.version, value.keyVersion, userId));
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

export async function getSavedResidenceDivisions(
  userId: string,
): Promise<readonly SavedResidenceDivision[]> {
  requireUserId(userId);
  return (await productionRepository()).getDivisions(userId);
}

export async function saveSavedResidence(
  userId: string,
  request: SaveResidenceRequest,
  verifiedResolution: SavedResidenceResolution,
  now: Date,
  expectedRevision: string | null,
): Promise<(SavedResidenceMutationResult & { revision: string }) | null> {
  requireUserId(userId);
  return (await productionRepository()).save(
    userId,
    request,
    verifiedResolution,
    now,
    loadResidenceEncryptionKeyring(),
    expectedRevision,
  );
}

export async function getSavedResidence(
  userId: string,
): Promise<VersionedSavedResidence | null> {
  requireUserId(userId);
  return (await productionRepository()).get(
    userId,
    loadResidenceEncryptionKeyring(),
  );
}

export async function deleteSavedResidence(
  userId: string,
  expectedRevision: string,
): Promise<"deleted" | "empty" | "precondition_failed"> {
  requireUserId(userId);
  return (await productionRepository()).delete(userId, expectedRevision);
}

export async function rotateSavedResidenceKeys(): Promise<{
  rotated: number;
  skipped: number;
  remaining: number;
}> {
  const repository = await productionRepository();
  const keyring = loadResidenceEncryptionKeyring();
  return repository.rotateKeys(keyring, { batchSize: 100 });
}

export function createSavedResidenceRepository(database: Database) {
  return {
    async rotateKeys(
      keyring: ResidenceEncryptionKeyring,
      options: {
        batchSize: number;
        beforeUpdate?: () => Promise<void> | void;
      },
    ): Promise<{ rotated: number; skipped: number; remaining: number }> {
      try {
        if (
          !Number.isSafeInteger(options.batchSize) ||
          options.batchSize < 1 ||
          !keyring.keys.has(keyring.activeVersion)
        ) {
          throw new Error(savedResidenceRotationError);
        }

        let lastUserId: string | null = null;
        let rotated = 0;
        let skipped = 0;
        while (true) {
          const rows = await database
            .select({
              ciphertext: savedResidence.ciphertext,
              envelopeVersion: savedResidence.envelopeVersion,
              iv: savedResidence.iv,
              keyVersion: savedResidence.keyVersion,
              revision: savedResidence.revision,
              tag: savedResidence.tag,
              userId: savedResidence.userId,
            })
            .from(savedResidence)
            .where(
              lastUserId === null
                ? ne(savedResidence.keyVersion, keyring.activeVersion)
                : and(
                    ne(savedResidence.keyVersion, keyring.activeVersion),
                    gt(savedResidence.userId, lastUserId),
                  ),
            )
            .orderBy(asc(savedResidence.userId))
            .limit(options.batchSize);
          if (rows.length === 0) {
            break;
          }

          for (const row of rows) {
            lastUserId = row.userId;
            let envelope: SavedResidenceEncryptionEnvelope;
            try {
              const address = decryptSavedResidenceAddress(
                {
                  ciphertext: row.ciphertext,
                  iv: row.iv,
                  keyVersion: row.keyVersion,
                  tag: row.tag,
                  version: row.envelopeVersion,
                },
                row.userId,
                keyring,
              );
              envelope = encryptSavedResidenceAddress(
                address,
                row.userId,
                keyring,
              );
            } catch {
              skipped += 1;
              continue;
            }
            await options.beforeUpdate?.();
            const updated = await database
              .update(savedResidence)
              .set({
                ciphertext: envelope.ciphertext,
                envelopeVersion: envelope.version,
                iv: envelope.iv,
                keyVersion: envelope.keyVersion,
                tag: envelope.tag,
              })
              .where(
                and(
                  eq(savedResidence.userId, row.userId),
                  eq(savedResidence.revision, row.revision),
                  eq(savedResidence.envelopeVersion, row.envelopeVersion),
                  eq(savedResidence.keyVersion, row.keyVersion),
                  eq(savedResidence.iv, row.iv),
                  eq(savedResidence.ciphertext, row.ciphertext),
                  eq(savedResidence.tag, row.tag),
                ),
              )
              .returning();
            if (updated.length === 0) {
              skipped += 1;
            } else {
              rotated += 1;
            }
          }
        }

        const [{ remaining }] = await database
          .select({ remaining: count() })
          .from(savedResidence)
          .where(ne(savedResidence.keyVersion, keyring.activeVersion));
        return { rotated, skipped, remaining };
      } catch {
        throw new Error(savedResidenceRotationError);
      }
    },

    async save(
      userId: string,
      request: SaveResidenceRequest,
      verifiedResolution: SavedResidenceResolution,
      now: Date,
      keyring: ResidenceEncryptionKeyring,
      expectedRevision: string | null = null,
    ): Promise<(SavedResidenceMutationResult & { revision: string }) | null> {
      requireUserId(userId);
      if (
        expectedRevision !== null &&
        !revisionPattern.test(expectedRevision)
      ) {
        return null;
      }
      const resolution = copySavedResidenceResolution(
        verifiedResolution,
        request.address,
      );
      const envelope = encryptSavedResidenceAddress(
        request.address,
        userId,
        keyring,
      );
      const parent = {
        ciphertext: envelope.ciphertext,
        consentVersion: request.consent.version,
        consentedAt: now,
        coverageNotes: [...resolution.coverageNotes],
        createdAt: now,
        envelopeVersion: envelope.version,
        iv: envelope.iv,
        keyVersion: envelope.keyVersion,
        resolutionStatus: resolution.status,
        revision: randomUUID(),
        sourceBenchmark: resolution.source.benchmark ?? null,
        sourceCheckedAt: new Date(resolution.source.checkedAt),
        sourceEffectiveAt:
          resolution.source.effectiveAt === null
            ? null
            : new Date(resolution.source.effectiveAt),
        sourceName: resolution.source.name,
        sourceUrl: resolution.source.url,
        sourceVintage: resolution.source.vintage ?? null,
        tag: envelope.tag,
        updatedAt: now,
        userId,
      };

      const stored = await database.transaction(async (transaction) => {
        const [residence] =
          expectedRevision === null
            ? await transaction
                .insert(savedResidence)
                .values(parent)
                .onConflictDoNothing({ target: savedResidence.userId })
                .returning()
            : await transaction
                .update(savedResidence)
                .set({
                  ciphertext: parent.ciphertext,
                  consentVersion: parent.consentVersion,
                  consentedAt: parent.consentedAt,
                  coverageNotes: parent.coverageNotes,
                  envelopeVersion: parent.envelopeVersion,
                  iv: parent.iv,
                  keyVersion: parent.keyVersion,
                  resolutionStatus: parent.resolutionStatus,
                  revision: parent.revision,
                  sourceBenchmark: parent.sourceBenchmark,
                  sourceCheckedAt: parent.sourceCheckedAt,
                  sourceEffectiveAt: parent.sourceEffectiveAt,
                  sourceName: parent.sourceName,
                  sourceUrl: parent.sourceUrl,
                  sourceVintage: parent.sourceVintage,
                  tag: parent.tag,
                  updatedAt: parent.updatedAt,
                })
                .where(
                  and(
                    eq(savedResidence.userId, userId),
                    eq(savedResidence.revision, expectedRevision),
                  ),
                )
                .returning();

        if (!residence) {
          return null;
        }

        await transaction
          .delete(savedResidenceDivision)
          .where(eq(savedResidenceDivision.userId, userId));
        if (resolution.divisions.length > 0) {
          await transaction.insert(savedResidenceDivision).values(
            resolution.divisions.map((division, displayOrder) => ({
              displayOrder,
              divisionId: division.id,
              idScheme: division.idScheme,
              name: division.name,
              type: division.type,
              userId,
            })),
          );
        }

        return { ...residence, replaced: expectedRevision !== null };
      });

      if (stored === null) {
        return null;
      }

      return {
        replaced: stored.replaced,
        revision: stored.revision,
        residence: {
          address: request.address,
          consent: {
            acceptedAt: stored.consentedAt.toISOString(),
            version: SAVED_RESIDENCE_CONSENT_VERSION,
          },
          createdAt: stored.createdAt.toISOString(),
          resolution,
          updatedAt: stored.updatedAt.toISOString(),
        },
      };
    },

    async get(
      userId: string,
      keyring: ResidenceEncryptionKeyring,
    ): Promise<VersionedSavedResidence | null> {
      requireUserId(userId);
      const rows = await database
        .select({
          ciphertext: savedResidence.ciphertext,
          consentVersion: savedResidence.consentVersion,
          consentedAt: savedResidence.consentedAt,
          coverageNotes: savedResidence.coverageNotes,
          createdAt: savedResidence.createdAt,
          divisionId: savedResidenceDivision.divisionId,
          divisionIdScheme: savedResidenceDivision.idScheme,
          divisionName: savedResidenceDivision.name,
          divisionType: savedResidenceDivision.type,
          envelopeVersion: savedResidence.envelopeVersion,
          iv: savedResidence.iv,
          keyVersion: savedResidence.keyVersion,
          resolutionStatus: savedResidence.resolutionStatus,
          revision: savedResidence.revision,
          sourceBenchmark: savedResidence.sourceBenchmark,
          sourceCheckedAt: savedResidence.sourceCheckedAt,
          sourceEffectiveAt: savedResidence.sourceEffectiveAt,
          sourceName: savedResidence.sourceName,
          sourceUrl: savedResidence.sourceUrl,
          sourceVintage: savedResidence.sourceVintage,
          tag: savedResidence.tag,
          updatedAt: savedResidence.updatedAt,
        })
        .from(savedResidence)
        .leftJoin(
          savedResidenceDivision,
          eq(savedResidenceDivision.userId, savedResidence.userId),
        )
        .where(eq(savedResidence.userId, userId))
        .orderBy(savedResidenceDivision.displayOrder);
      const row = rows[0];
      if (!row) {
        return null;
      }
      try {
        if (
          (row.resolutionStatus !== "matched" &&
            row.resolutionStatus !== "partial") ||
          row.consentVersion !== SAVED_RESIDENCE_CONSENT_VERSION ||
          !Array.isArray(row.coverageNotes) ||
          !row.coverageNotes.every((note) => typeof note === "string")
        ) {
          throw new Error(savedResidenceRecordError);
        }

        const source: SavedResidenceResolution["source"] = {
          checkedAt: row.sourceCheckedAt.toISOString(),
          effectiveAt: row.sourceEffectiveAt?.toISOString() ?? null,
          name: row.sourceName,
          url: row.sourceUrl,
        };
        if (row.sourceBenchmark !== null) {
          source.benchmark = row.sourceBenchmark;
        }
        if (row.sourceVintage !== null) {
          source.vintage = row.sourceVintage;
        }
        const divisions = rows.flatMap((candidate) => {
          if (
            candidate.divisionType === null ||
            candidate.divisionName === null ||
            candidate.divisionId === null ||
            candidate.divisionIdScheme === null
          ) {
            return [];
          }
          return [
            savedDivision({
              id: candidate.divisionId,
              idScheme: candidate.divisionIdScheme,
              name: candidate.divisionName,
              type: candidate.divisionType,
            }),
          ];
        });

        return {
          residence: {
            address: decryptSavedResidenceAddress(
              {
                ciphertext: row.ciphertext,
                iv: row.iv,
                keyVersion: row.keyVersion,
                tag: row.tag,
                version: row.envelopeVersion,
              },
              userId,
              keyring,
            ),
            consent: {
              acceptedAt: row.consentedAt.toISOString(),
              version: SAVED_RESIDENCE_CONSENT_VERSION,
            },
            createdAt: row.createdAt.toISOString(),
            resolution: {
              coverageNotes: [...row.coverageNotes],
              divisions,
              source,
              status: row.resolutionStatus,
            },
            updatedAt: row.updatedAt.toISOString(),
          },
          revision: row.revision,
        };
      } catch {
        return { residence: null, revision: row.revision };
      }
    },

    async delete(userId: string, expectedRevision: string) {
      requireUserId(userId);
      if (!revisionPattern.test(expectedRevision)) {
        return "precondition_failed" as const;
      }
      return database.transaction(async (transaction) => {
        const [deleted] = await transaction
          .delete(savedResidence)
          .where(
            and(
              eq(savedResidence.userId, userId),
              eq(savedResidence.revision, expectedRevision),
            ),
          )
          .returning();
        if (deleted) {
          return "deleted" as const;
        }
        const [existing] = await transaction
          .select({ userId: savedResidence.userId })
          .from(savedResidence)
          .where(eq(savedResidence.userId, userId))
          .limit(1);
        return existing ? "precondition_failed" : "empty";
      });
    },

    async getDivisions(
      userId: string,
    ): Promise<readonly SavedResidenceDivision[]> {
      requireUserId(userId);
      const divisions = await database
        .select({
          id: savedResidenceDivision.divisionId,
          idScheme: savedResidenceDivision.idScheme,
          name: savedResidenceDivision.name,
          type: savedResidenceDivision.type,
        })
        .from(savedResidenceDivision)
        .where(eq(savedResidenceDivision.userId, userId))
        .orderBy(savedResidenceDivision.displayOrder);
      return divisions.map(savedDivision);
    },
  };
}

async function productionRepository() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return createSavedResidenceRepository(await createDatabase(connectionString));
}

function copySavedResidenceResolution(
  resolution: SavedResidenceResolution,
  address: string,
): SavedResidenceResolution {
  try {
    if (
      !isPublicResidenceResolution(resolution, {
        kind: "address",
        address,
      })
    ) {
      throw new Error(savedResidenceRecordError);
    }

    const source: SavedResidenceResolution["source"] = {
      checkedAt: resolution.source.checkedAt,
      effectiveAt: resolution.source.effectiveAt,
      name: resolution.source.name,
      url: resolution.source.url,
    };
    if (resolution.source.benchmark !== undefined) {
      source.benchmark = resolution.source.benchmark;
    }
    if (resolution.source.vintage !== undefined) {
      source.vintage = resolution.source.vintage;
    }
    return {
      coverageNotes: [...resolution.coverageNotes],
      divisions: resolution.divisions.map(savedDivision),
      source,
      status: resolution.status,
    };
  } catch {
    throw new Error(savedResidenceRecordError);
  }
}

function savedDivision(value: {
  id: string;
  idScheme: string;
  name: string;
  type: string;
}): SavedResidenceDivision {
  if (!divisionTypes.has(value.type as SavedResidenceDivision["type"])) {
    throw new Error(savedResidenceRecordError);
  }
  return {
    id: value.id,
    idScheme: value.idScheme,
    name: value.name,
    type: value.type as SavedResidenceDivision["type"],
  };
}

function requireUserId(userId: string) {
  if (!isNonemptyUserId(userId)) {
    throw new Error(savedResidenceRecordError);
  }
}

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

function keyForVersion(keyring: ResidenceEncryptionKeyring, version: string) {
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
