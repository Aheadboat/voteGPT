import { createHash } from "node:crypto";
import { serializeElectionPackage, type ApprovedElectionReceipt } from "../../../src/lib/elections";
import { fixturePackage, fixturePolicy, NOW, VERIFIED_AT, type Mutable } from "./domain";

// Synthetic test-only approval. This is never loaded by the production source module.
export function importFixture() {
  const input = fixturePackage();
  const policy = fixturePolicy();
  const receipt: Mutable<ApprovedElectionReceipt> = {
    id: "synthetic-import-review", policy_version: policy.version,
    package_sha256: createHash("sha256").update(serializeElectionPackage(input), "utf8").digest("hex"),
    reviewer: "Synthetic Reviewer", approval_reference: "synthetic-independent-review",
    verified_at: VERIFIED_AT,
    documents: [
      { id: "election-document", sha256: "a".repeat(64), locators: ["Synthetic row 1"] },
      { id: "finance-document", sha256: "b".repeat(64), locators: [] },
    ],
    contest_inventory: [{ contest_id: "contest-house", candidacy_ids: ["candidate-avery", "candidate-blair"],
      ballot_line_ids: ["line-a-one", "line-a-two"] }],
  };
  return { input, receipt, options: { policy, approvedReceipts: [receipt], now: () => NOW } };
}
