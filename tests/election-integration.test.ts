// @vitest-environment node

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db";
import { runElectionImport } from "../src/lib/election-import";
import { createElectionRepository } from "../src/lib/election-repository";
import { createElectionService, getStatewideElections } from "../src/lib/election-service";
import { getElectionSourceOptions } from "../src/lib/election-source-policy";
import { serializeElectionPackage, type ApprovedElectionReceipt, type ElectionRepositoryOptions, type EvidenceProvenance } from "../src/lib/elections";
import {
  evidence, fixtureCalendarGraph, fixtureGraph, NOW, STATE, DISTRICT, VERIFIED_AT,
  type FixtureGraph, type Mutable,
} from "./fixtures/elections/domain";

// Exercise the real import, migrated database, repository and public projection together.
// Physical-writer concurrency and append-only SQL guards live in integration/election-evidence.test.ts.
let database: Awaited<ReturnType<typeof createDatabase>>;
beforeEach(async () => { database = await createDatabase("pglite://memory"); });
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if ("close" in database.$client) await database.$client.close();
});

function receiptFor(graph: FixtureGraph, id = "synthetic-reviewed-release"): Mutable<ApprovedElectionReceipt> {
  const sources = graph.package.evidence.flatMap<EvidenceProvenance>((entry) => entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry]);
  return {
    id, package_sha256: createHash("sha256").update(serializeElectionPackage(graph.package), "utf8").digest("hex"),
    policy_version: graph.policy.version, reviewer: "Synthetic Reviewer",
    approval_reference: "synthetic-review-only", verified_at: VERIFIED_AT,
    documents: graph.package.documents.map((document) => ({
      id: document.id, sha256: document.sha256,
      locators: [...new Set([
        ...sources.filter((source) => source.document_id === document.id).map((source) => source.locator),
        ...(document.calendar_reference ? [document.calendar_reference.locator] : []),
      ])],
    })),
    contest_inventory: graph.package.contests.map((contest) => ({
      contest_id: contest.id,
      candidacy_ids: graph.package.candidacies.filter((candidate) => candidate.contest_id === contest.id).map((candidate) => candidate.id),
      ballot_line_ids: graph.package.ballot_lines.filter((line) => graph.package.candidacies.some((candidate) =>
        candidate.id === line.candidacy_id && candidate.contest_id === contest.id)).map((line) => line.id),
    })),
  };
}

function setup(graph = fixtureGraph()) {
  const receipt = receiptFor(graph);
  const options = { policy: graph.policy, approvedReceipts: [receipt], now: () => NOW };
  const repository = createElectionRepository(database, options);
  const service = createElectionService({ repository, now: () => options.now() });
  const run = (mode: "dry-run" | "apply" = "apply", input: unknown = graph.package, receiptId = receipt.id,
    sourceOptions: ElectionRepositoryOptions = options) => runElectionImport(JSON.stringify(input), {
    mode, receiptId, sourceOptions, repository: sourceOptions === options ? repository : createElectionRepository(database, sourceOptions),
  });
  return { graph, receipt, options, repository, service, run };
}

async function expectEmptyLedger() {
  for (const table of ["election", "election_stage", "election_contest", "election_candidacy", "election_ballot_line",
    "election_import_batch", "election_evidence", "election_evidence_supersession"]) {
    expect((await database.execute(sql.raw(`select count(*)::int as count from ${table}`))).rows[0].count).toBe(0);
  }
}
const scope = { level: "federal", jurisdiction_id: STATE, division_ids: [STATE] } as const;

describe("reviewed election evidence integration", () => {
  it("rejects unapproved sources, altered reviews and private input without persisting anything", async () => {
    const f = setup(fixtureCalendarGraph());
    expect((await f.run("dry-run")).status).toBe("validated");
    vi.stubEnv("ELECTION_ALLOW_SYNTHETIC", "true");
    vi.stubEnv("ELECTION_APPROVAL_FILE", "unreviewed.approval.json");
    expect((await f.run("apply", f.graph.package, f.receipt.id, getElectionSourceOptions())).status).toBe("rejected");
    expect(await f.run("apply", f.graph.package, "self-approved")).toEqual({ status: "rejected", reason: "receipt_not_approved" });

    const untrusted = structuredClone(f.graph.package);
    untrusted.documents[0].url = "https://unapproved.example.test/candidates";
    expect(await f.run("apply", untrusted)).toEqual({ status: "rejected", reason: "source_not_admitted" });
    const changed = structuredClone(f.graph.package);
    changed.candidacies.reverse();
    expect(await f.run("apply", changed)).toEqual({ status: "rejected", reason: "receipt_mismatch" });
    expect(await f.run("apply", { ...f.graph.package, address: "123 Synthetic Private Lane" }))
      .toEqual({ status: "rejected", reason: "invalid_package" });

    const reference = f.receipt.documents.find((document) => document.id === "calendar-zone-reference")!;
    reference.locators = [];
    expect(await f.run()).toEqual({ status: "rejected", reason: "receipt_mismatch" });
    reference.locators = ["Synthetic California zone entry"];
    f.receipt.contest_inventory[0].candidacy_ids.pop();
    expect(await f.run()).toEqual({ status: "rejected", reason: "receipt_mismatch" });
    const misattributed = fixtureGraph();
    misattributed.policy.authorities[1].mappings.push({ ...misattributed.policy.authorities[0].mappings.find((mapping) => mapping.id === "ballot_qualification:candidacy")! });
    misattributed.package.evidence.push(evidence("ballot_qualification", "certified", { document_id: "finance-document" }));
    expect((await setup(misattributed).run()).status).toBe("rejected");
    await expectEmptyLedger();
  });

  it("dry-runs then imports source-backed candidates without inferring qualification from finance or filing", async () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(
      evidence("finance", "filed"),
      evidence("filing", "accepted", { subject: { kind: "candidacy", id: "candidate-blair" } }),
    );
    const f = setup(graph);
    const fetchSource = vi.fn(() => { throw new Error("Imports and reads must not fetch providers or AI"); });
    vi.stubGlobal("fetch", fetchSource);
    expect(await f.run("dry-run")).toEqual({ status: "validated", package_sha256: f.receipt.package_sha256 });
    await expectEmptyLedger();
    expect(await f.run()).toEqual({ status: "imported", package_sha256: f.receipt.package_sha256 });
    const result = await f.service.getContest(graph.contest_id);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Missing imported contest");
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["candidate-avery", "candidate-blair"]);
    expect(result.candidates[0].tracks).toMatchObject({
      finance: { state: "verified", value: "filed", verified_at: VERIFIED_AT,
        evidence: [{ source_type: "official_finance", source_url: "https://finance.example.test/2026/filings" }] },
      filing: { state: "unknown" }, ballot_qualification: { state: "unknown" }, ballot_appearance: { state: "unknown" },
    });
    expect(result.candidates[1].tracks).toMatchObject({
      filing: { state: "verified", value: "accepted" }, ballot_qualification: { state: "unknown" }, outcome: { state: "unknown" },
    });
    expect(await f.service.getUpcoming(scope)).toMatchObject({ status: "available", contests: [{ contest_id: graph.contest_id }], unverified_count: 0 });
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it("rolls back identities and the review batch on a late database failure, then safely retries", async () => {
    const f = setup();
    await database.execute(sql`create function synthetic_reject_evidence() returns trigger language plpgsql as $$ begin raise exception 'private database detail'; end $$`);
    await database.execute(sql`create trigger synthetic_failure before insert on election_evidence for each row execute function synthetic_reject_evidence()`);
    expect(await f.run()).toEqual({ status: "unavailable" });
    await expectEmptyLedger();
    expect(await f.service.getContest(f.graph.contest_id)).toEqual({ status: "missing" });
    await database.execute(sql`drop trigger synthetic_failure on election_evidence`);
    expect((await f.run()).status).toBe("imported");
    expect((await f.service.getContest(f.graph.contest_id)).status).toBe("available");
  });

  it("keeps cross-import conflicts outside paged history and never resurrects a corrected claim after expiry", async () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("ballot_qualification", "certified", { id: "qualification-before" }));
    const f = setup(graph);
    expect((await f.run()).status).toBe("imported");
    const changed = structuredClone(graph);
    changed.package.evidence.push(evidence("ballot_qualification", "removed", {
      id: "qualification-corrected", current_until: "2026-09-12T14:00:00.000Z",
    }));
    const changedReceipt = receiptFor(changed, "synthetic-change");
    f.options.approvedReceipts.push(changedReceipt);
    expect((await f.run("apply", changed.package, changedReceipt.id)).status).toBe("imported");
    const conflict = await f.service.getContest(graph.contest_id, { offset: 0, limit: 1 });
    expect(conflict).toMatchObject({ status: "available", history_page: { limit: 1, total: 9, next_offset: 1 },
      candidates: [{ tracks: { ballot_qualification: { state: "conflict", assertions: [
        { value: "certified", evidence: { id: "qualification-before" } },
        { value: "removed", evidence: { id: "qualification-corrected" } },
      ] } } }, expect.anything()] });

    changed.package.supersessions.push({ predecessor_id: "qualification-before", replacement_id: "qualification-corrected", reason: "Synthetic reviewed correction" });
    const correctionReceipt = receiptFor(changed, "synthetic-correction");
    f.options.approvedReceipts.push(correctionReceipt);
    expect((await f.run("apply", changed.package, correctionReceipt.id)).status).toBe("imported");
    expect(await f.service.getContest(graph.contest_id)).toMatchObject({ status: "available",
      candidates: [{ tracks: { ballot_qualification: { state: "verified", value: "removed" } } }, expect.anything()] });
    f.options.now = () => new Date("2026-09-12T14:00:00.000Z");
    const expired = await f.service.getContest(graph.contest_id);
    expect(expired.status).toBe("available");
    if (expired.status !== "available") throw new Error("Missing retained history");
    expect(expired.candidates[0].tracks.ballot_qualification).toMatchObject({ state: "stale", previous: [
      { value: "removed", evidence: { id: "qualification-corrected" } },
    ] });
    expect(expired.candidates[0].history.find((entry) => entry.evidence.id === "qualification-before")?.superseded).toBe(true);
  });

  it("retires a corrected identity without transferring its status or erasing its evidence", async () => {
    const graph = fixtureGraph();
    graph.package.evidence.push(evidence("intent", "declared"));
    const f = setup(graph);
    expect((await f.run()).status).toBe("imported");
    const corrected = structuredClone(graph);
    corrected.package.candidacies.push({ ...corrected.package.candidacies[0], id: "candidate-corrected", revision: "correction-1", revision_of: "candidate-avery" });
    corrected.package.evidence.push(
      evidence("candidacy_metadata", { name: "Avery Corrected", official_person_id: { issuer: "fixture-office", value: "person-a" } }, { subject: { kind: "candidacy", id: "candidate-corrected" } }),
      evidence("retirement", { replacement_id: "candidate-corrected" }),
    );
    const receipt = receiptFor(corrected, "synthetic-identity-correction");
    f.options.approvedReceipts.push(receipt);
    expect((await f.run("apply", corrected.package, receipt.id)).status).toBe("imported");
    const result = await f.service.getContest(graph.contest_id);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Missing corrected identity");
    expect(result.candidates.find((candidate) => candidate.id === "candidate-corrected")?.tracks.intent.state).toBe("unknown");
    expect(result.candidates.some((candidate) => candidate.id === "candidate-avery")).toBe(false);
    expect(result.retired_candidates.map((candidate) => candidate.id)).toEqual(["candidate-avery"]);
    expect((await f.repository.readContest(graph.contest_id))?.ledger.evidence.find((entry) => entry.id === "candidate-avery:intent")?.value).toBe("declared");
  });

  it("expires a reviewed calendar at its reference cutoff without refreshing a replay or losing provenance", async () => {
    const f = setup(fixtureCalendarGraph());
    expect((await f.run()).status).toBe("imported");
    const batch = (await database.execute(sql`select * from election_import_batch`)).rows;
    expect(await f.service.getContest(f.graph.contest_id)).toMatchObject({ status: "available", upcoming: true,
      stage: { state: "verified", verified_at: "2026-09-12T11:45:00.000Z", evidence: [{ calendar_basis: {
        time_zone: "America/Los_Angeles", references: [
          { source_url: "https://time.example.test/northamerica", locator: "Synthetic California zone entry", document_sha256: "c".repeat(64) },
          { source_url: "https://time.example.test/pacific-boundary", locator: "Synthetic Pacific boundary paragraph" },
        ],
      } }] } });
    f.options.now = () => new Date("2026-09-13T11:45:00.000Z");
    expect(await f.run()).toEqual({ status: "unchanged", package_sha256: f.receipt.package_sha256 });
    expect((await database.execute(sql`select * from election_import_batch`)).rows).toEqual(batch);
    expect(await f.service.getUpcoming(scope)).toEqual({ status: "available", contests: [], unverified_count: 1 });
    const expired = await f.service.getContest(f.graph.contest_id);
    expect(expired).toMatchObject({ status: "available", verification: "historical", upcoming: null, stage: { state: "stale" } });
    if (expired.status !== "available") throw new Error("Missing calendar history");
    expect(expired.history.find((entry) => entry.kind === "stage_metadata")).toMatchObject({ applicability: "historical",
      evidence: { calendar_basis: { references: expect.arrayContaining([expect.objectContaining({
        locator: "Synthetic California zone entry", verified_at: "2026-09-12T11:45:00.000Z",
      })]) } } });
  });

  it("withholds disputed contest metadata while preserving both sources and an honest unverified count", async () => {
    const graph = fixtureGraph();
    const original = graph.package.evidence.find((entry) => entry.kind === "contest_metadata")!;
    graph.package.evidence.push({ ...structuredClone(original), id: "conflicting-contest", value: { ...original.value, office: "Conflicting office" } });
    const f = setup(graph);
    expect((await f.run()).status).toBe("imported");
    expect(await f.service.getContest(graph.contest_id, { offset: 0, limit: 1 })).toMatchObject({
      status: "unverified", reason: "unverified_metadata", metadata_conflicts: [expect.anything(), expect.anything()],
      history_page: { limit: 1, total: 8 },
    });
    expect(await f.service.getUpcoming(scope)).toEqual({ status: "available", contests: [], unverified_count: 1 });
  });

  it("fails closed at public reads if retained evidence no longer matches its reviewed package", async () => {
    const f = setup();
    expect((await f.run()).status).toBe("imported");
    // Simulate storage corruption outside the append-only guards, which the PostgreSQL suite tests separately.
    await database.execute(sql`alter table election_evidence disable trigger user`);
    await database.execute(sql`delete from election_evidence where id = 'candidate-avery:candidacy_metadata'`);
    expect(await f.service.getContest(f.graph.contest_id)).toEqual({ status: "unavailable" });
    expect(await f.service.getUpcoming(scope)).toEqual({ status: "unavailable" });
  });

  it("personalizes only statewide contests and never treats saved district or private labels as verified ballot scope", async () => {
    const graph = fixtureGraph();
    const metadata = graph.package.evidence.find((entry) => entry.kind === "contest_metadata")!;
    for (const [id, divisions] of [["contest-statewide", [STATE]], ["contest-mixed", [STATE, DISTRICT]]] as const) {
      graph.package.contests.push({ ...graph.package.contests[0], id, official_key: id });
      graph.policy.authorities[0].contest_keys.push(id);
      graph.package.evidence.push({ ...structuredClone(metadata), id: id + ":metadata", subject: { kind: "contest", id },
        value: { ...metadata.value, division_ids: [...divisions] } });
      graph.package.evidence.find((entry) => entry.kind === "election_metadata")!.value.coverage.contest_ids.push(id);
    }
    const f = setup(graph);
    expect((await f.run()).status).toBe("imported");
    const publicResult = await f.service.getUpcoming(scope);
    expect(publicResult.status === "available" && publicResult.contests.map((contest) => contest.contest_id).sort())
      .toEqual(["contest-house", "contest-mixed", "contest-statewide"]);
    const saved = [
      { id: STATE, idScheme: "ocd", type: "state", name: "Private residence label" },
      { id: DISTRICT, idScheme: "ocd", type: "congressional_district", name: "123 Synthetic Private Lane" },
    ] as const;
    const result = await getStatewideElections(f.service, saved, "federal");
    expect(result.status === "available" && result.contests.map((contest) => contest.contest_id)).toEqual(["contest-statewide"]);
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(await getStatewideElections(f.service, saved.slice(1), "federal")).toEqual({ status: "invalid" });
    expect(await getStatewideElections(f.service, saved, "local")).toEqual({ status: "unsupported" });
    expect(await getStatewideElections(f.service, [], "federal")).toEqual({ status: "missing" });
    const stored = (await database.execute(sql`select canonical_package from election_import_batch`)).rows;
    expect(JSON.stringify(stored)).not.toContain("Private");
  });
});
