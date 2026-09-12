// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { reviewElectionPackage } from "./election-repository";
import { serializeElectionPackage, type ApprovedElectionReceipt } from "./elections";
import { fixtureGraph, NOW, VERIFIED_AT, type Mutable } from "../../tests/fixtures/elections/domain";

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
