import { reviewElectionPackage } from "./election-repository";
import type { ElectionRepository, ElectionRepositoryOptions, ImportResult } from "./elections";

export function parseElectionImport(text: string):
  | Readonly<{ status: "parsed"; input: Record<string, unknown> }>
  | Readonly<{ status: "rejected"; reason: "invalid_package" }> {
  try {
    const input: unknown = JSON.parse(text);
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { status: "rejected", reason: "invalid_package" };
    }
    return { status: "parsed", input: input as Record<string, unknown> };
  } catch {
    return { status: "rejected", reason: "invalid_package" };
  }
}

export async function runElectionImport(text: string, options: Readonly<{
  mode: "dry-run" | "apply";
  receiptId: string;
  sourceOptions: ElectionRepositoryOptions;
  repository?: Pick<ElectionRepository, "importReviewedPackage">;
}>): Promise<ImportResult | Readonly<{ status: "validated"; package_sha256: string }>> {
  const parsed = parseElectionImport(text);
  if (parsed.status === "rejected") return parsed;
  try {
    const reviewed = reviewElectionPackage(parsed.input, options.receiptId, options.sourceOptions);
    if (reviewed.status === "rejected") return reviewed;
    if (options.mode === "dry-run") return { status: "validated", package_sha256: reviewed.package_sha256 };
    if (!options.repository) return { status: "unavailable" };
    return await options.repository.importReviewedPackage(reviewed.package, reviewed.receipt_id);
  } catch {
    return { status: "unavailable" };
  }
}
