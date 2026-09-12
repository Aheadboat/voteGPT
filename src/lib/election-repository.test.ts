// @vitest-environment node

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.restoreAllMocks();
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
    expect(projected).toMatchObject({ status: "available", candidates: [{ id: "candidate-avery", tracks: { intent: { state: "conflict", assertions: [expect.anything(), expect.anything()] } } }, { id: "candidate-blair" }], history_page: { limit: 1, total: 9, next_offset: 1 } });
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

  it("binds original receipt policy versions while validating retained history under current source rules", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    expect(await repository.readContest(graph.contest_id)).not.toBeNull();
    options.policy.version = "fixture-policy-v2";
    options.now = () => new Date("2026-09-14T13:00:00.000Z");
    const retained = await repository.readContest(graph.contest_id);
    expect(retained?.policy.version).toBe("fixture-policy-v2");
    expect(retained && projectContest(retained, options.now())).toMatchObject({ status: "available", verification: "historical" });
    expect((await database.execute(sql`select policy_version from election_import_batch`)).rows[0].policy_version).toBe("fixture-policy-v1");
    expect(await repository.importReviewedPackage(graph.package, receipt.id)).toMatchObject({ status: "rejected", reason: "source_not_admitted" });
    options.policy.authorities[0].urls = ["https://elections.example.test/unrelated"];
    await expect(repository.readContest(graph.contest_id)).rejects.toThrow("Election read is not verified");
  });

  it("rejects a raw three-edge correction cycle after admitting its acyclic control", async () => {
    const graph = fixtureGraph();
    for (const id of ["cycle-a", "cycle-b", "cycle-c"]) graph.package.evidence.push(evidence("intent", "declared", { id }));
    graph.package.supersessions.push(
      { replacement_id: "cycle-b", predecessor_id: "cycle-a", reason: "Synthetic first correction" },
      { replacement_id: "cycle-c", predecessor_id: "cycle-b", reason: "Synthetic second correction" },
    );
    const { receipt, options } = reviewedFixture(graph);
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    expect((await repository.readContest(graph.contest_id))?.ledger.supersessions).toHaveLength(2);
    await expect(database.insert(electionEvidenceSupersession).values({
      replacement_id: "cycle-a", predecessor_id: "cycle-c", reason: "Synthetic invalid cycle", batch_sha256: receipt.package_sha256,
    })).rejects.toThrow();
  });

  it("keeps disputed contest metadata visible as unverified in its public index scope", async () => {
    const graph = fixtureGraph();
    const original = graph.package.evidence.find((entry) => entry.kind === "contest_metadata")!;
    graph.package.evidence.push({ ...structuredClone(original), id: "disputed-office", value: { ...original.value, office: "Disputed synthetic office" } });
    const { receipt, options } = reviewedFixture(graph);
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    const direct = await repository.readContest(graph.contest_id);
    expect(direct && projectContest(direct, NOW)).toMatchObject({ status: "unverified", reason: "unverified_metadata" });
    const index = await repository.readUpcoming({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] }, NOW);
    expect(index.map((item) => item.contest_id)).toEqual([graph.contest_id]);
    expect(projectContest(index[0], NOW)).toMatchObject({ status: "unverified", metadata_conflicts: [expect.anything(), expect.anything()] });
  });

  it.each([
    { level: "federal", jurisdiction_id: STATE, division_ids: [STATE], address: "Synthetic private input" },
    { level: "federal", jurisdiction_id: STATE, division_ids: [STATE + "?address=private"] },
    { level: "federal", jurisdiction_id: STATE, division_ids: ["ocd-division/country:us/state:ny/cd:12"] },
    { level: "federal", jurisdiction_id: STATE, division_ids: [STATE, STATE] },
  ])("rejects invalid public read scope %# even when storage is empty", async (scope) => {
    const { options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect(await repository.readUpcoming({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] }, NOW)).toEqual([]);
    await expect(repository.readUpcoming(scope as Parameters<typeof repository.readUpcoming>[0], NOW)).rejects.toThrow("Election read is not verified");
  });

  it("rejects invalid clocks before returning an empty public read", async () => {
    const { options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect(await repository.readContest("missing-contest")).toBeNull();
    await expect(repository.readUpcoming({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] }, new Date(NaN))).rejects.toThrow("Election read is not verified");
    options.now = () => new Date(NaN);
    await expect(repository.readContest("missing-contest")).rejects.toThrow("Election read is not verified");
  });

  it("rejects invalid history requests without returning incomplete graphs", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    expect((await repository.readContest(graph.contest_id, { offset: 0, limit: 1 }))?.history_page.limit).toBe(1);
    for (const page of [{ offset: -1, limit: 1 }, { offset: 0, limit: 101 }, { offset: 0.5, limit: 1 }, { offset: 0, limit: 1, address: "private" }]) {
      await expect(repository.readContest(graph.contest_id, page)).rejects.toThrow("Election read is not verified");
    }
  });

  it("does not read an unrelated unadmitted election into an admitted public scope", async () => {
    const { graph, receipt, options } = reviewedFixture();
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    // Another domain dataset can coexist; its intentionally invalid batch is outside this source policy.
    await database.execute(sql`insert into election(id,issuer,official_key,revision,dataset_kind) values('unrelated','other-issuer','other-election','original','synthetic')`);
    await database.execute(sql`insert into election_import_batch(package_sha256,election_id,schema_version,policy_version,receipt_id,canonical_package,accepted_at)
      values(${"c".repeat(64)},'unrelated','f7-v1','unrelated-policy','unrelated-receipt','{}',${NOW.toISOString()})`);
    expect((await repository.readUpcoming({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] }, NOW)).map((item) => item.contest_id)).toEqual([graph.contest_id]);
  });

  it.each(["date", "time_zone"] as const)("retains scoped unknown %s for the unverified index count", async (field) => {
    const graph = fixtureGraph();
    graph.package.evidence.find((entry) => entry.kind === "stage_metadata")!.value[field] = null;
    const { receipt, options } = reviewedFixture(graph);
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    const direct = await repository.readContest(graph.contest_id);
    expect(direct && projectContest(direct, NOW)).toMatchObject({ status: "available", upcoming: null });
    const index = await repository.readUpcoming({ level: "federal", jurisdiction_id: STATE, division_ids: [STATE] }, NOW);
    expect(index.map((item) => item.contest_id)).toEqual([graph.contest_id]);
    expect(projectContest(index[0], NOW)).toMatchObject({ status: "available", upcoming: null });
  });

  it("rechecks a revoked protected receipt inside the apply transaction", async () => {
    const { graph, receipt, options } = reviewedFixture();
    expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("valid");
    const transact = database.transaction.bind(database);
    vi.spyOn(database, "transaction").mockImplementation((run: Parameters<typeof transact>[0], config: Parameters<typeof transact>[1]) => transact(async (transaction) => {
      options.approvedReceipts = [];
      return Reflect.apply(run, undefined, [transaction]);
    }, config));
    expect(await createElectionRepository(database, options).importReviewedPackage(graph.package, receipt.id)).toEqual({ status: "rejected", reason: "receipt_not_approved" });
    for (const table of relations) expect((await database.execute(sql.raw(`select count(*)::int as count from ${table}`))).rows[0].count).toBe(0);
  });

  it("preserves immutable source keys and applies a reviewed identity revision without transferring status", async () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("intent", "declared"));
    const first = reviewedFixture(graph);
    const repository = createElectionRepository(database, first.options);
    expect((await repository.importReviewedPackage(graph.package, first.receipt.id)).status).toBe("imported");
    const altered = structuredClone(graph);
    altered.package.candidacies[0].official_key = "changed-source-key";
    const bad = reviewedFixture(altered);
    bad.receipt.id += "-bad";
    first.options.approvedReceipts.push(bad.receipt);
    expect(reviewElectionPackage(altered.package, bad.receipt.id, first.options).status).toBe("valid");
    expect((await repository.importReviewedPackage(altered.package, bad.receipt.id)).status).toBe("unavailable");
    expect((await repository.readContest(graph.contest_id))?.ledger.candidacies[0].official_key).toBe("candidate-a");
    const corrected = structuredClone(graph);
    corrected.package.candidacies.push({ ...corrected.package.candidacies[0], id: "candidate-corrected", revision: "correction-1", revision_of: "candidate-avery" });
    corrected.package.evidence.push(
      evidence("candidacy_metadata", { name: "Avery Corrected", official_person_id: { issuer: "fixture-office", value: "person-a" } }, { subject: { kind: "candidacy", id: "candidate-corrected" } }),
      evidence("retirement", { replacement_id: "candidate-corrected" }),
    );
    const replacement = reviewedFixture(corrected);
    replacement.receipt.id += "-corrected";
    first.options.approvedReceipts.push(replacement.receipt);
    expect((await repository.importReviewedPackage(corrected.package, replacement.receipt.id)).status).toBe("imported");
    const retained = await repository.readContest(graph.contest_id);
    const view = retained && projectContest(retained, NOW);
    expect(view?.status).toBe("available");
    if (view?.status === "available") {
      expect(view.candidates.find((candidate) => candidate.id === "candidate-corrected")?.tracks.intent.state).toBe("unknown");
      expect(view.retired_candidates).toHaveLength(1);
      expect(view.retired_candidates[0].id).toBe("candidate-avery");
      expect(retained?.ledger.evidence.find((entry) => entry.id === "candidate-avery:intent")?.value).toBe("declared");
    }
  });

  it("retains more than one import's byte, document and assertion bounds without hiding conflicts", async () => {
    const initial = reviewedFixture();
    const repository = createElectionRepository(database, initial.options);
    const documentsPerBatch = 6;
    const assertionsPerBatch = 2_600;
    let bytes = 0;
    for (let batch = 0; batch < 4; batch++) {
      const graph = fixtureGraph();
      for (let document = 0; document < documentsPerBatch; document++) graph.package.documents.push({
        ...graph.package.documents[0], id: `retained-document-${batch}-${document}`, label: `Synthetic edition ${batch}-${document}`,
      });
      for (let assertion = 0; assertion < assertionsPerBatch; assertion++) graph.package.evidence.push(evidence("intent", assertion % 2 ? "withdrawn" : "declared", {
        id: `retained-assertion-${batch}-${assertion}`, document_id: `retained-document-${batch}-${assertion % documentsPerBatch}`,
      }));
      const item = reviewedFixture(graph);
      item.receipt.id += "-" + batch;
      initial.options.approvedReceipts.push(item.receipt);
      const size = Buffer.byteLength(serializeElectionPackage(graph.package), "utf8");
      expect(size).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(reviewElectionPackage(graph.package, item.receipt.id, initial.options).status).toBe("valid");
      bytes += size;
      expect((await repository.importReviewedPackage(graph.package, item.receipt.id)).status).toBe("imported");
    }
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
    const result = await repository.readContest(initial.graph.contest_id, { offset: 0, limit: 2 });
    expect(result?.ledger.documents).toHaveLength(26);
    expect(result?.ledger.evidence).toHaveLength(10_407);
    const view = result && projectContest(result, NOW);
    expect(view).toMatchObject({ status: "available", history_page: { total: 10_407, limit: 2, next_offset: 2 } });
    if (view?.status === "available") {
      const intent = view.candidates[0].tracks.intent;
      expect(intent.state).toBe("conflict");
      if (intent.state === "conflict") expect(intent.assertions).toHaveLength(10_400);
    }
    const secondPage = await repository.readContest(initial.graph.contest_id, { offset: 2, limit: 2 });
    expect(secondPage && projectContest(secondPage, NOW)).toMatchObject({ history_page: { offset: 2, total: 10_407, next_offset: 4 } });
  }, 60_000);
});
