import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { eq, inArray } from "drizzle-orm";

import type { createDatabase } from "../db";
import {
  election, electionStage, electionContest, electionCandidacy, electionBallotLine,
  electionImportBatch, electionEvidence, electionEvidenceSupersession,
} from "../db/schema";

import {
  projectContest, serializeElectionPackage, validateElectionPackage,
  type ApprovedElectionReceipt, type ElectionGraph, type ElectionPackage, type ElectionRepository,
  type ElectionRepositoryOptions, type ElectionLedger, type ElectionReadScope, type ContestMetadata, type EvidenceProvenance, type PackageRejection,
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
    return bindReviewedPackage(validated.package, receiptId, options, now);
  } catch {
    return { status: "rejected", reason: "invalid_receipt" };
  }
}

function bindReviewedPackage(value: ElectionPackage, receiptId: string, options: ElectionRepositoryOptions, now: Date): ElectionPackageReview {
    const receipts = options.approvedReceipts.filter((receipt) => receipt.id === receiptId);
    if (receipts.length === 0) return { status: "rejected", reason: "receipt_not_approved" };
    if (receipts.length !== 1 || !validReceipt(receipts[0], now)) return { status: "rejected", reason: "invalid_receipt" };
    const receipt = receipts[0];
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
}

type Database = Awaited<ReturnType<typeof createDatabase>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createElectionRepository(database: Database, options: ElectionRepositoryOptions): ElectionRepository {
  return {
    async importReviewedPackage(input, receiptId) {
      try {
        return await database.transaction(async (transaction) => {
          const config = snapshotOptions(options);
          const reviewed = reviewElectionPackage(input, receiptId, config);
          if (reviewed.status === "rejected") return reviewed;
          const value = reviewed.package;
          await transaction.insert(election).values({ ...value.election, dataset_kind: value.dataset_kind }).onConflictDoNothing();
          // One election row serializes imports, including competing first imports.
          const [identity] = await transaction.select().from(election).where(eq(election.id, value.election.id)).for("update");
          if (!isDeepStrictEqual(identity, { ...value.election, dataset_kind: value.dataset_kind })) throw new Error("Election identity differs");
          const previous = await loadLedger(transaction, value.election.id, config);
          const ledger = mergeLedgers(previous ? [previous, value] : [value]);
          validateLedger(ledger, config);
          const [existing] = await transaction.select().from(electionImportBatch).where(eq(electionImportBatch.package_sha256, reviewed.package_sha256));
          if (existing) return { status: "unchanged" as const, package_sha256: reviewed.package_sha256 };
          if (value.stages.length) await transaction.insert(electionStage).values([...value.stages]).onConflictDoNothing();
          if (value.contests.length) await transaction.insert(electionContest).values([...value.contests]).onConflictDoNothing();
          if (value.candidacies.length) await transaction.insert(electionCandidacy).values([...value.candidacies]).onConflictDoNothing();
          if (value.ballot_lines.length) await transaction.insert(electionBallotLine).values([...value.ballot_lines]).onConflictDoNothing();
          await transaction.insert(electionImportBatch).values({
            package_sha256: reviewed.package_sha256, election_id: value.election.id,
            schema_version: value.schema_version, policy_version: value.policy_version,
            receipt_id: reviewed.receipt_id, canonical_package: serializeElectionPackage(value), accepted_at: config.now(),
          });
          if (value.evidence.length) await transaction.insert(electionEvidence).values(value.evidence.map((entry) => ({
            id: entry.id, batch_sha256: reviewed.package_sha256, kind: entry.kind,
            election_id: null, stage_id: null, contest_id: null, candidacy_id: null, ballot_line_id: null,
            [entry.subject.kind + "_id"]: entry.subject.id, assertion: entry,
          }))).onConflictDoNothing();
          if (value.supersessions.length) await transaction.insert(electionEvidenceSupersession).values(value.supersessions.map((entry) =>
            ({ ...entry, batch_sha256: reviewed.package_sha256 }))).onConflictDoNothing();
          await loadLedger(transaction, value.election.id, config);
          return { status: "imported" as const, package_sha256: reviewed.package_sha256 };
        });
      } catch {
        return { status: "unavailable" };
      }
    },
    async readContest(id, historyPage = { offset: 0, limit: 100 }) {
      try {
        if (!identifier(id) || !exactRecord(historyPage, ["offset", "limit"]) ||
          !Number.isSafeInteger(historyPage.offset) || historyPage.offset < 0 ||
          !Number.isSafeInteger(historyPage.limit) || historyPage.limit < 1 || historyPage.limit > 100) throw new Error("Invalid election read request");
        return await database.transaction(async (transaction) => {
          const config = snapshotOptions(options);
          const [contest] = await transaction.select().from(electionContest).where(eq(electionContest.id, id));
          if (!contest) return null;
          const [stage] = await transaction.select().from(electionStage).where(eq(electionStage.id, contest.stage_id));
          const ledger = await loadLedger(transaction, stage.election_id, config);
          if (!ledger) throw new Error("Missing election ledger");
          return graphFor(ledger, config, id, historyPage);
        }, { isolationLevel: "repeatable read", accessMode: "read only" });
      } catch { throw new Error("Election read is not verified"); }
    },
    async readUpcoming(scope, now) {
      try {
        if (!validReadScope(scope)) throw new Error("Invalid election scope");
        return await database.transaction(async (transaction) => {
          const config = snapshotOptions(options, now);
          const identities = await transaction.select().from(election);
          const result: ElectionGraph[] = [];
          for (const identity of identities) {
            if (identity.dataset_kind !== config.policy.dataset_kind || !config.policy.authorities.some((authority) =>
              authority.election_issuer === identity.issuer && authority.election_key === identity.official_key &&
              authority.jurisdiction_id === scope.jurisdiction_id)) continue;
            const ledger = await loadLedger(transaction, identity.id, config);
            if (!ledger) continue;
            for (const contest of ledger.contests) {
              const graph = graphFor(ledger, config, contest.id);
              if (matchesUpcoming(graph, scope, now)) result.push(graph);
            }
          }
          return result.sort((a, b) => a.contest_id.localeCompare(b.contest_id));
        }, { isolationLevel: "repeatable read", accessMode: "read only" });
      } catch { throw new Error("Election read is not verified"); }
    },
  };
}

function snapshotOptions(options: ElectionRepositoryOptions, now = options.now()): ElectionRepositoryOptions {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid election clock");
  return { policy: structuredClone(options.policy), approvedReceipts: structuredClone(options.approvedReceipts), now: () => new Date(now) };
}

function validReadScope(scope: ElectionReadScope): boolean {
  return exactRecord(scope, ["level", "jurisdiction_id", "division_ids"]) &&
    ["federal", "state", "local"].includes(scope.level) && typeof scope.jurisdiction_id === "string" &&
    /^ocd-division\/country:us\/state:[a-z]{2}$/.test(scope.jurisdiction_id) &&
    textSet(scope.division_ids, 100, (value) => typeof value === "string" &&
      (value === scope.jurisdiction_id || (value.startsWith(scope.jurisdiction_id + "/") &&
        /^ocd-division\/country:us\/state:[a-z]{2}\/(?:cd|sldu|sldl|county|place|board_of_equalization):[a-z0-9][a-z0-9_-]{0,199}$/.test(value))));
}

function graphFor(ledger: ElectionLedger, options: ElectionRepositoryOptions, contestId: string, historyPage = { offset: 0, limit: 100 }): ElectionGraph {
  return { ledger, policy: options.policy, contest_id: contestId, history_page: historyPage,
    completeness: { current: "complete", supersession: "complete", history: "complete" } };
}

function validateLedger(ledger: ElectionLedger, options: ElectionRepositoryOptions) {
  const projected = projectContest(graphFor(ledger, options, ledger.contests[0]?.id ?? "missing"), options.now());
  if (projected.status === "unverified" && projected.reason === "invalid_graph") throw new Error("Invalid election ledger");
}

function mergeLedgers(values: readonly ElectionLedger[]): ElectionLedger {
  const first = values[0];
  if (values.some((value) => value.dataset_kind !== first.dataset_kind || !isDeepStrictEqual(value.election, first.election))) throw new Error("Election identity differs");
  function records<K extends Exclude<keyof ElectionLedger, "election" | "dataset_kind">>(field: K): ElectionLedger[K] {
    const merged = new Map<string, unknown>();
    for (const value of values) for (const item of value[field]) {
      const key = "id" in item ? item.id : JSON.stringify([item.replacement_id, item.predecessor_id]);
      if (merged.has(key) && !isDeepStrictEqual(merged.get(key), item)) throw new Error("Election record differs");
      merged.set(key, item);
    }
    return [...merged.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value) as ElectionLedger[K];
  }
  return { dataset_kind: first.dataset_kind, election: first.election,
    stages: records("stages"), contests: records("contests"), candidacies: records("candidacies"),
    ballot_lines: records("ballot_lines"), documents: records("documents"), evidence: records("evidence"), supersessions: records("supersessions") };
}

async function loadLedger(transaction: Transaction, electionId: string, options: ElectionRepositoryOptions): Promise<ElectionLedger | null> {
  const batches = await transaction.select().from(electionImportBatch).where(eq(electionImportBatch.election_id, electionId));
  if (batches.length === 0) return null;
  const packages = new Map<string, ElectionPackage>();
  for (const batch of batches) {
    const value: ElectionPackage = JSON.parse(batch.canonical_package);
    if (!exactRecord(value, ["schema_version", "dataset_kind", "policy_version", "election", "stages", "contests", "candidacies", "ballot_lines", "documents", "evidence", "supersessions"]) ||
      value.schema_version !== "f7-v1" || value.dataset_kind !== options.policy.dataset_kind ||
      serializeElectionPackage(value) !== batch.canonical_package) throw new Error("Invalid election batch");
    // Original receipt/version binds the bytes. Current source rules validate the merged ledger below.
    const reviewed = bindReviewedPackage(value, batch.receipt_id, options, options.now());
    if (reviewed.status !== "valid" || reviewed.package_sha256 !== batch.package_sha256 || value.election.id !== batch.election_id ||
      value.schema_version !== batch.schema_version || value.policy_version !== batch.policy_version ||
      !Number.isFinite(batch.accepted_at.getTime()) || batch.accepted_at > options.now()) throw new Error("Invalid election batch");
    packages.set(batch.package_sha256, value);
  }
  const ledger = mergeLedgers([...packages.values()]);
  validateLedger(ledger, options);
  const [identity] = await transaction.select().from(election).where(eq(election.id, electionId));
  if (!isDeepStrictEqual(identity, { ...ledger.election, dataset_kind: ledger.dataset_kind })) throw new Error("Election identity differs");
  const stages = await transaction.select().from(electionStage).where(eq(electionStage.election_id, electionId));
  const contests = stages.length ? await transaction.select().from(electionContest).where(inArray(electionContest.stage_id, stages.map((item) => item.id))) : [];
  const candidates = contests.length ? await transaction.select().from(electionCandidacy).where(inArray(electionCandidacy.contest_id, contests.map((item) => item.id))) : [];
  const lines = candidates.length ? await transaction.select().from(electionBallotLine).where(inArray(electionBallotLine.candidacy_id, candidates.map((item) => item.id))) : [];
  for (const [actual, expected] of [[stages, ledger.stages], [contests, ledger.contests], [candidates, ledger.candidacies], [lines, ledger.ballot_lines]] as const) {
    if (actual.length !== expected.length || actual.some((row) => !isDeepStrictEqual(row, expected.find((item) => item.id === row.id)))) throw new Error("Election identity differs");
  }
  const assertions = await transaction.select().from(electionEvidence).where(inArray(electionEvidence.batch_sha256, [...packages.keys()]));
  if (assertions.length !== ledger.evidence.length) throw new Error("Election evidence is incomplete");
  for (const row of assertions) {
    const assertion = packages.get(row.batch_sha256)?.evidence.find((item) => item.id === row.id);
    if (!assertion || !isDeepStrictEqual(row, {
      id: assertion.id, batch_sha256: row.batch_sha256, kind: assertion.kind, assertion,
      election_id: null, stage_id: null, contest_id: null, candidacy_id: null, ballot_line_id: null,
      [assertion.subject.kind + "_id"]: assertion.subject.id,
    })) throw new Error("Election evidence differs");
  }
  const links = await transaction.select().from(electionEvidenceSupersession).where(inArray(electionEvidenceSupersession.batch_sha256, [...packages.keys()]));
  if (links.length !== ledger.supersessions.length || links.some((row) => !packages.get(row.batch_sha256)?.supersessions.some((link) =>
    isDeepStrictEqual(row, { ...link, batch_sha256: row.batch_sha256 })))) throw new Error("Election corrections differ");
  return ledger;
}

function matchesUpcoming(graph: ElectionGraph, scope: ElectionReadScope, now: Date): boolean {
  const view = projectContest(graph, now);
  if (view.status !== "available") {
    if (view.reason === "retired_identity") return false;
    if (view.reason !== "unverified_metadata") throw new Error("Invalid election projection");
    // Possible historical scope retains an unverified entry; it never asserts a current date or office.
    const metadata = graph.ledger.evidence.filter((entry) => entry.kind === "contest_metadata" && entry.subject.id === graph.contest_id);
    return metadata.length === 0 || metadata.some((entry) => entry.kind === "contest_metadata" && contestMatches(entry.value, scope));
  }
  const contest = view.contest.state === "verified" ? view.contest.value : view.contest.state === "stale" ? view.contest.previous[0]?.value : null;
  const stage = view.stage.state === "verified" ? view.stage.value : view.stage.state === "stale" ? view.stage.previous[0]?.value : null;
  if (!contest || !contestMatches(contest, scope)) return false;
  if (!stage?.date || !stage.time_zone) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: stage.time_zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return stage.date >= `${part("year")}-${part("month")}-${part("day")}`;
}

function contestMatches(contest: ContestMetadata, scope: ElectionReadScope): boolean {
  return contest.level === scope.level && contest.jurisdiction_id === scope.jurisdiction_id &&
    (scope.division_ids.length === 0 || scope.division_ids.includes(scope.jurisdiction_id) || scope.division_ids.some((id) => contest.division_ids.includes(id)));
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
