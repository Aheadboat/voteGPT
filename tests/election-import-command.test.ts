import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("election import command boundary", () => {
  it.each([
    [],
    ["--file", "private-input.json", "--approval-file", "private.approval.json"],
    ["--file", "private-input.json", "--approved", "true"],
    ["--file", "private-input.json", "--receipt", "receipt-1", "--dry-run", "--apply"],
    ["--file", "https://elections.example.test/private-input.json", "--receipt", "receipt-1", "--dry-run"],
  ])("rejects invalid command arguments without echoing private input: %j", (...args) => {
    const result = spawnSync(process.execPath, [resolve("scripts/import-election-evidence.mts"), ...args], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: "" }, timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Election import arguments are invalid.\n");
  });

  it("reports malformed JSON without printing file contents or a private path", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "f7-import-"));
    try {
      const path = resolve(directory, "private-address.json");
      writeFileSync(path, '{"address":"123 Private Lane",');
      const result = spawnSync(process.execPath, [resolve("scripts/import-election-evidence.mts"),
        "--file", path, "--receipt", "receipt-1", "--dry-run"], {
        encoding: "utf8", env: { ...process.env, DATABASE_URL: "" }, timeout: 10_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({ status: "rejected", reason: "invalid_package" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports an unreadable local file without disclosing its path", () => {
    const result = spawnSync(process.execPath, [resolve("scripts/import-election-evidence.mts"),
      "--file", resolve("missing-private-package.json"), "--receipt", "receipt-1", "--dry-run"], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: "" }, timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Election import could not read the package.\n");
  });
});
