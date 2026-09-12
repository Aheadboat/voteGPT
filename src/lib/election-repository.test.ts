// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { reviewElectionPackage } from "./election-repository";
import { serializeElectionPackage, type ApprovedElectionReceipt } from "./elections";
import { fixtureGraph, NOW, VERIFIED_AT } from "../../tests/fixtures/elections/domain";

function reviewedFixture() {
  const graph = fixtureGraph();
  const package_sha256 = createHash("sha256").update(serializeElectionPackage(graph.package), "utf8").digest("hex");
  const receipt: ApprovedElectionReceipt = {
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
});
