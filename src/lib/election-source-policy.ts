import type { ElectionRepositoryOptions } from "./elections";

export function getElectionSourceOptions(): ElectionRepositoryOptions {
  // Exact release artifacts must be admitted in a reviewed deployment change.
  // Environment variables and incoming files cannot grant source or receipt approval.
  return {
    policy: { version: "f7-no-admitted-release", dataset_kind: "official", authorities: [] },
    approvedReceipts: [],
    now: () => new Date(),
  };
}
