import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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
});
