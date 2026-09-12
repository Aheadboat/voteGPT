import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import type { createDatabase } from "../db";
import {
  election, electionStage, electionContest, electionCandidacy, electionBallotLine,
  electionImportBatch, electionEvidence, electionEvidenceSupersession,
} from "../db/schema";

import {
  serializeElectionPackage, validateElectionPackage,
  type ApprovedElectionReceipt, type ElectionGraph, type ElectionPackage, type ElectionRepository,
  type ElectionRepositoryOptions, type EvidenceProvenance, type PackageRejection,
} from "./elections";

export type ElectionPackageReview =
  | Readonly<{ status: "valid"; package: ElectionPackage; package_sha256: string; receipt_id: string }>
  | Readonly<{ status: "rejected"; reason: PackageRejection["reason"] | "receipt_not_approved" | "invalid_receipt" | "receipt_mismatch" }>;

export function reviewElectionPackage(
  input: unknown,
  receiptId: string,
  options: ElectionRepositoryOptions,
): ElectionPackageReview {
  try {
    const now = options.now();
    const validated = validateElectionPackage(input, options.policy, now);
    if (validated.status === "rejected") return validated;
    const receipts = options.approvedReceipts.filter((receipt) => receipt.id === receiptId);
    if (receipts.length === 0) return { status: "rejected", reason: "receipt_not_approved" };
    if (receipts.length !== 1 || !validReceipt(receipts[0], now)) return { status: "rejected", reason: "invalid_receipt" };
    const receipt = receipts[0];
    const value = validated.package;
    const package_sha256 = createHash("sha256").update(serializeElectionPackage(value), "utf8").digest("hex");
    const sources = value.evidence.flatMap<EvidenceProvenance>((entry) => entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry]);
    if (receipt.package_sha256 !== package_sha256 || receipt.policy_version !== value.policy_version ||
      sources.some((source) => source.verified_at > receipt.verified_at) ||
      receipt.documents.length !== value.documents.length || receipt.contest_inventory.length !== value.contests.length) {
      return { status: "rejected", reason: "receipt_mismatch" };
    }
    for (const document of value.documents) {
      const reviewed = receipt.documents.find((item) => item.id === document.id);
      const locators = [...new Set(sources.filter((source) => source.document_id === document.id).map((source) => source.locator))];
      if (!reviewed || reviewed.sha256 !== document.sha256 || !sameSet(reviewed.locators, locators)) {
        return { status: "rejected", reason: "receipt_mismatch" };
      }
    }
    for (const contest of value.contests) {
      const reviewed = receipt.contest_inventory.find((item) => item.contest_id === contest.id);
      const candidates = value.candidacies.filter((candidate) => candidate.contest_id === contest.id).map((candidate) => candidate.id);
      const lines = value.ballot_lines.filter((line) => candidates.includes(line.candidacy_id)).map((line) => line.id);
      if (!reviewed || !sameSet(reviewed.candidacy_ids, candidates) || !sameSet(reviewed.ballot_line_ids, lines)) {
        return { status: "rejected", reason: "receipt_mismatch" };
      }
    }
    return { status: "valid", package: value, package_sha256, receipt_id: receipt.id };
  } catch {
    return { status: "rejected", reason: "invalid_receipt" };
  }
}

type Database = Awaited<ReturnType<typeof createDatabase>>;

export function createElectionRepository(database: Database, options: ElectionRepositoryOptions): ElectionRepository {
  return {
    async importReviewedPackage(input, receiptId) {
      try {
        return await database.transaction(async (transaction) => {
          const reviewed = reviewElectionPackage(input, receiptId, options);
          if (reviewed.status === "rejected") return reviewed;
          const value = reviewed.package;
          await transaction.insert(election).values({ ...value.election, dataset_kind: value.dataset_kind });
          if (value.stages.length) await transaction.insert(electionStage).values([...value.stages]);
          if (value.contests.length) await transaction.insert(electionContest).values([...value.contests]);
          if (value.candidacies.length) await transaction.insert(electionCandidacy).values([...value.candidacies]);
          if (value.ballot_lines.length) await transaction.insert(electionBallotLine).values([...value.ballot_lines]);
          await transaction.insert(electionImportBatch).values({
            package_sha256: reviewed.package_sha256, election_id: value.election.id,
            schema_version: value.schema_version, policy_version: value.policy_version,
            receipt_id: reviewed.receipt_id, canonical_package: serializeElectionPackage(value), accepted_at: options.now(),
          });
          if (value.evidence.length) await transaction.insert(electionEvidence).values(value.evidence.map((entry) => ({
            id: entry.id, batch_sha256: reviewed.package_sha256, kind: entry.kind,
            election_id: null, stage_id: null, contest_id: null, candidacy_id: null, ballot_line_id: null,
            [entry.subject.kind + "_id"]: entry.subject.id, assertion: entry,
          })));
          if (value.supersessions.length) await transaction.insert(electionEvidenceSupersession).values(value.supersessions.map((entry) =>
            ({ ...entry, batch_sha256: reviewed.package_sha256 })));
          return { status: "imported" as const, package_sha256: reviewed.package_sha256 };
        });
      } catch {
        return { status: "unavailable" };
      }
    },
    async readContest(id, historyPage = { offset: 0, limit: 100 }) {
      return database.transaction(async (transaction) => {
        const [contest] = await transaction.select().from(electionContest).where(eq(electionContest.id, id));
        if (!contest) return null;
        const [stage] = await transaction.select().from(electionStage).where(eq(electionStage.id, contest.stage_id));
        const batches = await transaction.select().from(electionImportBatch).where(eq(electionImportBatch.election_id, stage.election_id));
        if (batches.length !== 1) throw new Error("Election read is not complete");
        const reviewed = reviewElectionPackage(JSON.parse(batches[0].canonical_package), batches[0].receipt_id, options);
        if (reviewed.status !== "valid") throw new Error("Election read is not verified");
        const { schema_version: _schema, policy_version: _policy, ...ledger } = reviewed.package;
        return {
          ledger, policy: options.policy, contest_id: id,
          completeness: { current: "complete", supersession: "complete", history: "complete" }, history_page: historyPage,
        } satisfies ElectionGraph;
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async readUpcoming() { return []; },
  };
}

function validReceipt(value: ApprovedElectionReceipt, now: Date): boolean {
  if (!exactRecord(value, ["id", "package_sha256", "policy_version", "reviewer", "approval_reference", "verified_at", "documents", "contest_inventory"]) ||
    !identifier(value.id) || !digest(value.package_sha256) || !identifier(value.policy_version) ||
    !publicText(value.reviewer) || !publicText(value.approval_reference) || !instant(value.verified_at) ||
    Date.parse(value.verified_at) > now.getTime() || !dataArray(value.documents, 20) || !dataArray(value.contest_inventory, 1_000)) return false;
  if (!value.documents.every((item) => exactRecord(item, ["id", "sha256", "locators"]) &&
    identifier(item.id) && digest(item.sha256) && textSet(item.locators, 10_000, publicText)) ||
    !value.contest_inventory.every((item) => exactRecord(item, ["contest_id", "candidacy_ids", "ballot_line_ids"]) &&
      identifier(item.contest_id) && textSet(item.candidacy_ids, 1_000, identifier) && textSet(item.ballot_line_ids, 10_000, identifier))) return false;
  return new Set(value.documents.map((item) => item.id)).size === value.documents.length &&
    new Set(value.contest_inventory.map((item) => item.contest_id)).size === value.contest_inventory.length;
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && Object.hasOwn(descriptor, "value");
  });
}

function dataArray(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && Reflect.ownKeys(value).length === value.length + 1 &&
    Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, index))
      .every((descriptor) => descriptor?.enumerable && Object.hasOwn(descriptor, "value"));
}

function textSet(value: unknown, maximum: number, valid: (item: unknown) => boolean): value is string[] {
  return dataArray(value, maximum) && value.every(valid) && new Set(value).size === value.length;
}
function sameSet(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value) => second.includes(value));
}
function identifier(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value); }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function publicText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function instant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
