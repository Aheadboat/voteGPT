import { afterEach, describe, expect, it, vi } from "vitest";
import { parseElectionImport, runElectionImport } from "./election-import";
import { fixturePackage } from "../../tests/fixtures/elections/domain";
import { importFixture } from "../../tests/fixtures/elections/import";
import type { ImportResult } from "./elections";

afterEach(() => vi.unstubAllGlobals());

describe("local normalized election package parsing", () => {
  it("accepts JSON formatting without changing values or array order", () => {
    const input = fixturePackage();
    expect(parseElectionImport(JSON.stringify(input, null, 2).replaceAll("\n", "\r\n")))
      .toEqual({ status: "parsed", input });
  });

  it.each(["", "null", "[]", "42", '{"private_address":"123 Private Lane",'])
    ("rejects malformed/nonobject input without echoing contents: %s", (text) => {
      expect(parseElectionImport(text)).toEqual({ status: "rejected", reason: "invalid_package" });
    });
});

describe("reviewed import execution", () => {
  it("dry-runs reviewed normalized data without repository writes or source fetches", async () => {
    const { input, receipt, options } = importFixture();
    const fetchSource = vi.fn(() => { throw new Error("Source fetch forbidden"); });
    vi.stubGlobal("fetch", fetchSource);
    const write = vi.fn(async (): Promise<ImportResult> => { throw new Error("Dry-run write forbidden"); });
    const result = await runElectionImport(JSON.stringify(input, null, 2).replaceAll("\n", "\r\n"), {
      mode: "dry-run", receiptId: receipt.id, sourceOptions: options,
      repository: { importReviewedPackage: write },
    });
    expect(result).toEqual({ status: "validated", package_sha256: receipt.package_sha256 });
    expect(write).not.toHaveBeenCalled();
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it.each(["unknown_receipt", "changed_array", "private_field", "finite_retention", "missing_candidate"] as const)
    ("rejects %s before any apply write", async (change) => {
      const { input, receipt, options } = importFixture();
      let receiptId = receipt.id;
      if (change === "unknown_receipt") receiptId = "self-approved";
      if (change === "changed_array") input.candidacies.reverse();
      if (change === "private_field") Object.assign(input, { address: "123 Synthetic Private Lane" });
      if (change === "finite_retention") Object.assign(options.policy.authorities[0], { retention: "30_days" });
      if (change === "missing_candidate") receipt.contest_inventory[0].candidacy_ids.pop();
      const write = vi.fn(async (): Promise<ImportResult> => ({ status: "imported", package_sha256: receipt.package_sha256 }));
      const result = await runElectionImport(JSON.stringify(input), {
        mode: "apply", receiptId, sourceOptions: options, repository: { importReviewedPackage: write },
      });
      expect(result.status).toBe("rejected");
      expect(JSON.stringify(result)).not.toContain("123 Synthetic");
      expect(write).not.toHaveBeenCalled();
    });

  it("applies exactly the reviewed package through the repository and preserves its idempotent result", async () => {
    const { input, receipt, options } = importFixture();
    const write = vi.fn(async (): Promise<ImportResult> => ({ status: "unchanged", package_sha256: receipt.package_sha256 }));
    expect(await runElectionImport(JSON.stringify(input), {
      mode: "apply", receiptId: receipt.id, sourceOptions: options, repository: { importReviewedPackage: write },
    })).toEqual({ status: "unchanged", package_sha256: receipt.package_sha256 });
    expect(write).toHaveBeenCalledExactlyOnceWith(input, receipt.id);
  });

  it.each(["absent", "throws"] as const)("reports unavailable when storage is %s without exposing error details", async (storage) => {
    const { input, receipt, options } = importFixture();
    const repository = storage === "absent" ? undefined : {
      importReviewedPackage: async (): Promise<ImportResult> => { throw new Error("private database address or credential"); },
    };
    expect(await runElectionImport(JSON.stringify(input), {
      mode: "apply", receiptId: receipt.id, sourceOptions: options, repository,
    })).toEqual({ status: "unavailable" });
  });

  it("returns a typed parser rejection before trying review or apply", async () => {
    const { receipt, options } = importFixture();
    expect(await runElectionImport("{invalid", { mode: "apply", receiptId: receipt.id, sourceOptions: options }))
      .toEqual({ status: "rejected", reason: "invalid_package" });
  });
});
