// @vitest-environment node

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "../db";
import { electionEvidence, electionEvidenceSupersession } from "../db/schema";
import { createElectionRepository, reviewElectionPackage } from "./election-repository";
import { projectContest, serializeElectionPackage, type ApprovedElectionReceipt } from "./elections";
import { evidence, fixtureGraph, NOW, VERIFIED_AT, STATE, DISTRICT, type Mutable } from "../../tests/fixtures/elections/domain";

function reviewedFixture(graph = fixtureGraph()) {
  const package_sha256 = createHash("sha256").update(serializeElectionPackage(graph.package), "utf8").digest("hex");
  const receipt: Mutable<ApprovedElectionReceipt> = {
    id: "synthetic-reviewed-release", package_sha256, policy_version: graph.policy.version,
    reviewer: "Synthetic Reviewer", approval_reference: "synthetic-review-only", verified_at: VERIFIED_AT,
    documents: graph.package.documents.map((document) => ({
      id: document.id, sha256: document.sha256,
      locators: [...new Set(graph.package.evidence.flatMap((entry) =>
        (entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry])
          .filter((source) => source.document_id === document.id).map((source) => source.locator)))].sort(),
    })),
    contest_inventory: graph.package.contests.map((contest) => ({
      contest_id: contest.id,
      candidacy_ids: graph.package.candidacies.filter((candidate) => candidate.contest_id === contest.id).map((candidate) => candidate.id).sort(),
      ballot_line_ids: graph.package.ballot_lines.filter((line) => graph.package.candidacies.some((candidate) =>
        candidate.id === line.candidacy_id && candidate.contest_id === contest.id)).map((line) => line.id).sort(),
    })),
  };
  return { graph, receipt, options: { policy: graph.policy, approvedReceipts: [receipt], now: () => NOW } };
}

describe("protected election package review", () => {
  it("admits exactly the synthetic package bound by an injected reviewed receipt without a database", () => {
    const { graph, receipt, options } = reviewedFixture();
    expect(reviewElectionPackage(graph.package, receipt.id, options)).toMatchObject({
      status: "valid", package_sha256: receipt.package_sha256, package: graph.package, receipt_id: receipt.id,
    });
  });

  it.each(["unknown_id", "no_receipts", "duplicate_id", "extra_field", "blank_reviewer", "future_review", "earlier_review",
    "wrong_policy", "wrong_digest", "missing_document", "extra_document", "duplicate_document", "wrong_document_digest",
    "missing_locator", "extra_locator", "duplicate_locator", "missing_contest", "duplicate_contest", "missing_candidate",
    "extra_candidate", "duplicate_candidate", "missing_line", "extra_line", "duplicate_line"] as const)(
    "rejects %s after admitting the reviewed control", (change) => {
      const { graph, receipt, options } = reviewedFixture();
      expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("valid");
      let receiptId = receipt.id;
      if (change === "unknown_id") receiptId = "not-approved";
      if (change === "no_receipts") options.approvedReceipts = [];
      if (change === "duplicate_id") options.approvedReceipts.push(structuredClone(receipt));
      if (change === "extra_field") Object.assign(receipt, { approval: true });
      if (change === "blank_reviewer") receipt.reviewer = "";
      if (change === "future_review") receipt.verified_at = "2026-09-12T14:00:00.000Z";
      if (change === "earlier_review") receipt.verified_at = "2026-09-12T11:30:00.000Z";
      if (change === "wrong_policy") receipt.policy_version = "unapproved-policy";
      if (change === "wrong_digest") receipt.package_sha256 = "f".repeat(64);
      if (change === "missing_document") receipt.documents.pop();
      if (change === "extra_document") receipt.documents.push({ id: "extra", sha256: "e".repeat(64), locators: [] });
      if (change === "duplicate_document") receipt.documents.push(structuredClone(receipt.documents[0]));
      if (change === "wrong_document_digest") receipt.documents[0].sha256 = "e".repeat(64);
      if (change === "missing_locator") receipt.documents[0].locators = [];
      if (change === "extra_locator") receipt.documents[0].locators.push("Unreviewed locator");
      if (change === "duplicate_locator") receipt.documents[0].locators.push(receipt.documents[0].locators[0]);
      if (change === "missing_contest") receipt.contest_inventory = [];
      if (change === "duplicate_contest") receipt.contest_inventory.push(structuredClone(receipt.contest_inventory[0]));
      if (change === "missing_candidate") receipt.contest_inventory[0].candidacy_ids.pop();
      if (change === "extra_candidate") receipt.contest_inventory[0].candidacy_ids.push("unreviewed-candidate");
      if (change === "duplicate_candidate") receipt.contest_inventory[0].candidacy_ids.push(receipt.contest_inventory[0].candidacy_ids[0]);
      if (change === "missing_line") receipt.contest_inventory[0].ballot_line_ids.pop();
      if (change === "extra_line") receipt.contest_inventory[0].ballot_line_ids.push("unreviewed-line");
      if (change === "duplicate_line") receipt.contest_inventory[0].ballot_line_ids.push(receipt.contest_inventory[0].ballot_line_ids[0]);
      expect(reviewElectionPackage(graph.package, receiptId, options).status).toBe("rejected");
    },
  );

  it("binds every supporting-source locator, even when primary and supplement share a document", () => {
    const graph = fixtureGraph();
    const snapshot = graph.package.evidence.find((entry) => entry.kind === "contest_metadata")!;
    snapshot.supporting_sources.push({
      id: "synthetic-term-support", fields: ["term"], document_id: snapshot.document_id, mapping_id: snapshot.mapping_id,
      locator: "Synthetic supporting section", original_term: "Synthetic supporting term", retrieved_at: snapshot.retrieved_at,
      verified_at: snapshot.verified_at, effective: snapshot.effective, current_until: snapshot.current_until,
    });
    const { receipt, options } = reviewedFixture(graph);
    expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("valid");
    receipt.documents[0].locators = receipt.documents[0].locators.filter((locator) => locator !== "Synthetic supporting section");
    expect(reviewElectionPackage(graph.package, receipt.id, options)).toEqual({ status: "rejected", reason: "receipt_mismatch" });
  });

  it("ignores receipt inventory ordering but binds normalized package values and array ordering", () => {
    const { graph, receipt, options } = reviewedFixture();
    receipt.documents.reverse();
    receipt.contest_inventory[0].candidacy_ids.reverse();
    receipt.contest_inventory[0].ballot_line_ids.reverse();
    expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("valid");
    graph.package.candidacies.reverse();
    expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("rejected");
  });

  it("returns a detached validated package and still rejects invalid domain input", () => {
    const { graph, receipt, options } = reviewedFixture();
    const result = reviewElectionPackage(graph.package, receipt.id, options);
    expect(result.status).toBe("valid");
    graph.package.evidence[0].original_term = "Changed later";
    if (result.status === "valid") expect(result.package.evidence[0].original_term).toBe("Synthetic official term");
    expect(reviewElectionPackage({ ...graph.package, latitude: 37 }, receipt.id, options).status).toBe("rejected");
  });
});

describe("immutable election persistence", () => {
  let database: Awaited<ReturnType<typeof createDatabase>>;
  beforeEach(async () => { database = await createDatabase("pglite://memory"); });
  afterEach(async () => {
    const client = database.$client;
    if ("close" in client) await client.close();
  });

  it("migrates all eight election ledger relations", async () => {
    const result = await database.execute(sql`select name, to_regclass(name)::text as relation from unnest(array[
      'election', 'election_stage', 'election_contest', 'election_candidacy', 'election_ballot_line',
      'election_import_batch', 'election_evidence', 'election_evidence_supersession'
    ]) name`);
    expect(result.rows).toHaveLength(8);
    for (const row of result.rows) expect(row.relation).toBe(row.name);
  });

  it("imports a reviewed complete package and reads a coherent source-backed graph", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect(await repository.importReviewedPackage(graph.package, receipt.id)).toEqual({ status: "imported", package_sha256: receipt.package_sha256 });
    const result = await repository.readContest(graph.contest_id);
    expect(result).not.toBeNull();
    expect(result?.completeness).toEqual({ current: "complete", supersession: "complete", history: "complete" });
    expect(result?.history_page).toEqual({ offset: 0, limit: 100 });
    expect(result && projectContest(result, NOW)).toMatchObject({ status: "available", verification: "current", candidates: [{ id: "candidate-avery" }, { id: "candidate-blair" }] });
  });

  const relations = ["election", "election_stage", "election_contest", "election_candidacy", "election_ballot_line", "election_import_batch", "election_evidence", "election_evidence_supersession"];
  it.each(relations.flatMap((table) => ["update", "delete", "truncate"].map((operation) => ({ table, operation }))))(
    "rejects raw $operation on $table without losing history", async ({ table, operation }) => {
      const { graph, receipt, options } = reviewedFixture();
      const repository = createElectionRepository(database, options);
      expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
      const column = table === "election_import_batch" ? "receipt_id" : table === "election_evidence_supersession" ? "reason" : "id";
      const statement = operation === "update" ? `update ${table} set ${column} = ${column}` :
        operation === "delete" ? `delete from ${table}` : `truncate table ${table} cascade`;
      await expect(database.execute(sql.raw(statement))).rejects.toThrow();
      const restored = await repository.readContest(graph.contest_id);
      expect(restored && projectContest(restored, NOW).status).toBe("available");
    },
  );

  it("replays exactly the same package without changing stored review or import times", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    const before = await database.execute(sql`select * from election_import_batch`);
    options.now = () => new Date("2026-09-13T15:00:00.000Z");
    expect(await repository.importReviewedPackage(graph.package, receipt.id)).toEqual({ status: "unchanged", package_sha256: receipt.package_sha256 });
    expect((await database.execute(sql`select * from election_import_batch`)).rows).toEqual(before.rows);
    const result = await repository.readContest(graph.contest_id);
    expect(result && projectContest(result, options.now())).toMatchObject({ status: "available", verification: "historical" });
  });

  it("retains distinct reviewed imports and every current conflict outside bounded display history", async () => {
    const firstGraph = fixtureGraph();
    firstGraph.package.evidence.push(evidence("intent", "declared", { id: "first-intent" }));
    const first = reviewedFixture(firstGraph);
    const secondGraph = fixtureGraph();
    secondGraph.package.evidence.push(evidence("intent", "withdrawn", { id: "second-intent" }));
    const second = reviewedFixture(secondGraph);
    second.receipt.id = "synthetic-second-release";
    const options = { ...first.options, approvedReceipts: [first.receipt, second.receipt] };
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(first.graph.package, first.receipt.id)).status).toBe("imported");
    expect((await repository.importReviewedPackage(second.graph.package, second.receipt.id)).status).toBe("imported");
    const result = await repository.readContest(first.graph.contest_id, { offset: 0, limit: 1 });
    expect(result?.ledger.evidence.filter((entry) => entry.kind === "intent")).toHaveLength(2);
    const projected = result && projectContest(result, NOW);
    expect(projected).toMatchObject({ status: "available", candidates: [{ tracks: { intent: { state: "conflict", assertions: [expect.anything(), expect.anything()] } } }], history_page: { limit: 1, total: 9, next_offset: 1 } });
  });

  it("serializes concurrent distinct imports without dropping either assertion", async () => {
    const first = reviewedFixture();
    const repository = createElectionRepository(database, first.options);
    expect((await repository.importReviewedPackage(first.graph.package, first.receipt.id)).status).toBe("imported");
    const imports = ["declared", "withdrawn"].map((status, index) => {
      const graph = fixtureGraph();
      graph.package.evidence.push(evidence("intent", status as "declared" | "withdrawn", { id: "concurrent-" + index }));
      const reviewed = reviewedFixture(graph);
      reviewed.receipt.id += "-" + index;
      first.options.approvedReceipts.push(reviewed.receipt);
      return reviewed;
    });
    const results = await Promise.all(imports.map((item) => repository.importReviewedPackage(item.graph.package, item.receipt.id)));
    expect(results.map((result) => result.status)).toEqual(["imported", "imported"]);
    const graph = await repository.readContest(first.graph.contest_id);
    expect(graph?.ledger.evidence.filter((entry) => entry.kind === "intent")).toHaveLength(2);
  });

  it("rolls back every identity and receipt when a later statement fails", async () => {
    await database.execute(sql`create function synthetic_reject_evidence() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$`);
    await database.execute(sql`create trigger synthetic_failure before insert on election_evidence for each row execute function synthetic_reject_evidence()`);
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("unavailable");
    for (const table of relations) expect((await database.execute(sql.raw(`select count(*)::int as count from ${table}`))).rows[0].count).toBe(0);
  });

  it.each(["batch_whitespace", "batch_digest", "assertion_change", "assertion_omission", "unreviewed_assertion"] as const)(
    "fails closed for %s even after an administrator bypasses write guards", async (corruption) => {
      const { graph, receipt, options } = reviewedFixture();
      const repository = createElectionRepository(database, options);
      expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
      await database.execute(sql`alter table election_import_batch disable trigger user`);
      await database.execute(sql`alter table election_evidence disable trigger user`);
      if (corruption === "batch_whitespace") await database.execute(sql`update election_import_batch set canonical_package = canonical_package || ' '`);
      if (corruption === "batch_digest") await database.execute(sql`update election_import_batch set policy_version = 'different-policy'`);
      if (corruption === "assertion_change") await database.execute(sql`update election_evidence set assertion = jsonb_set(assertion, '{original_term}', '"Changed source term"') where id = 'candidate-avery:candidacy_metadata'`);
      if (corruption === "assertion_omission") await database.execute(sql`delete from election_evidence where id = 'candidate-avery:candidacy_metadata'`);
      if (corruption === "unreviewed_assertion") await database.insert(electionEvidence).values({
        id: "unreviewed-intent", kind: "intent", batch_sha256: receipt.package_sha256, candidacy_id: "candidate-avery",
        assertion: evidence("intent", "declared", { id: "unreviewed-intent" }),
      });
      await expect(repository.readContest(graph.contest_id)).rejects.toThrow("Election read is not verified");
    },
  );

  it.each(["zero_subjects", "two_subjects", "missing_provenance", "changed_identity", "cross_subject_link", "self_link"] as const)(
    "rejects invalid raw %s independently of import validation", async (invalid) => {
      const { graph, receipt, options } = reviewedFixture();
      const repository = createElectionRepository(database, options);
      expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
      if (invalid === "cross_subject_link" || invalid === "self_link") {
        await expect(database.insert(electionEvidenceSupersession).values({
          replacement_id: "candidate-avery:candidacy_metadata",
          predecessor_id: invalid === "self_link" ? "candidate-avery:candidacy_metadata" : "candidate-blair:candidacy_metadata",
          batch_sha256: receipt.package_sha256, reason: "Synthetic invalid correction",
        })).rejects.toThrow();
      } else {
        const assertion = evidence("intent", "declared", { id: "raw-invalid" });
        if (invalid === "missing_provenance") Object.assign(assertion, { locator: null });
        if (invalid === "changed_identity") assertion.subject.id = "candidate-blair";
        await expect(database.insert(electionEvidence).values({
          id: "raw-invalid", kind: "intent", batch_sha256: receipt.package_sha256, assertion,
          candidacy_id: invalid === "zero_subjects" ? null : "candidate-avery",
          contest_id: invalid === "two_subjects" ? "contest-house" : null,
        })).rejects.toThrow();
      }
    },
  );

  it("returns all admitted district contests for public jurisdiction scope and preserves stale recovery", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    const scope = { level: "federal" as const, jurisdiction_id: STATE, division_ids: [STATE] };
    expect((await repository.readUpcoming(scope, NOW)).map((item) => item.contest_id)).toEqual([graph.contest_id]);
    expect((await repository.readUpcoming({ ...scope, division_ids: [DISTRICT] }, NOW))).toHaveLength(1);
    expect((await repository.readUpcoming({ ...scope, division_ids: [STATE + "/cd:13"] }, NOW))).toHaveLength(0);
    expect((await repository.readUpcoming({ ...scope, level: "state" }, NOW))).toHaveLength(0);
    options.now = () => new Date("2026-09-14T13:00:00.000Z");
    const stale = await repository.readUpcoming(scope, options.now());
    expect(stale).toHaveLength(1);
    expect(projectContest(stale[0], options.now())).toMatchObject({ status: "available", verification: "historical" });
  });
});
