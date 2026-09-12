import { createHash } from "node:crypto";

import {
  serializeElectionPackage, validateElectionPackage,
  type ElectionPackage, type ElectionRepositoryOptions, type PackageRejection,
} from "./elections";

export type ElectionPackageReview =
  | Readonly<{ status: "valid"; package: ElectionPackage; package_sha256: string; receipt_id: string }>
  | Readonly<{ status: "rejected"; reason: PackageRejection["reason"] | "receipt_not_approved" | "invalid_receipt" | "receipt_mismatch" }>;

export function reviewElectionPackage(
  input: unknown,
  receiptId: string,
  options: ElectionRepositoryOptions,
): ElectionPackageReview {
  const validated = validateElectionPackage(input, options.policy, options.now());
  if (validated.status === "rejected") return validated;
  return {
    status: "valid", package: validated.package,
    package_sha256: createHash("sha256").update(serializeElectionPackage(validated.package), "utf8").digest("hex"),
    receipt_id: receiptId,
  };
}
