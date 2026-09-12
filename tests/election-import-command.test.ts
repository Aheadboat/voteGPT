import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { fixturePackage } from "./fixtures/elections/domain";

describe("election import command boundary", () => {
  it.each([
    ["\\/synthetic-review.example.test/share/package.json", false],
    ["/\\synthetic-review.example.test/share/package.json", false],
    ["\\\\synthetic-review.example.test\\share\\package.json", false],
    [resolve("synthetic-review-package.json"), true],
  ] as const)("checks path %s before file access", (path, local) => {
    const hook = `import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const originalRead = fs.readFileSync;
fs.readFileSync = function(value, ...rest) {
  if (value === ${JSON.stringify(path)}) {
    process.stderr.write('BLOCKED TEST FILE READ\\n');
    throw new Error('Prevented actual file access');
  }
  return originalRead.call(this, value, ...rest);
};
const deny = () => { process.stderr.write('FORBIDDEN NETWORK ACCESS\\n'); process.exit(77); };
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
tls.connect = deny;
syncBuiltinESMExports();`;
    const result = spawnSync(process.execPath, [
      "--import", `data:text/javascript;base64,${Buffer.from(hook).toString("base64")}`,
      resolve("scripts/import-election-evidence.mts"), "--file", path, "--receipt", "receipt-1", "--dry-run",
    ], { encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(local ? "BLOCKED TEST FILE READ\nElection import could not read the package.\n" :
      "Election import arguments are invalid.\n");
  });

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

  it.each(["--dry-run", "--apply"])("denies a well-formed synthetic package under %s before source or database access", (mode) => {
    const directory = mkdtempSync(resolve(tmpdir(), "f7-import-"));
    try {
      const path = resolve(directory, "synthetic-package.json");
      const guard = resolve(directory, "deny-network.mjs");
      writeFileSync(path, JSON.stringify(fixturePackage()));
      writeFileSync(guard, `import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const fail = () => { process.stderr.write('FORBIDDEN NETWORK ACCESS\\n'); process.exit(77); };
globalThis.fetch = fail;
net.Socket.prototype.connect = fail;
tls.connect = fail;
syncBuiltinESMExports();\n`);
      const result = spawnSync(process.execPath, ["--import", pathToFileURL(guard).href, resolve("scripts/import-election-evidence.mts"),
        "--file", path, "--receipt", "synthetic-import-review", mode], {
        encoding: "utf8", timeout: 10_000,
        env: { ...process.env, DATABASE_URL: "postgres://private:secret@127.0.0.1:1/private", ELECTION_ALLOW_SYNTHETIC: "true" },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "rejected" });
      expect(result.stdout).not.toContain("Avery");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
