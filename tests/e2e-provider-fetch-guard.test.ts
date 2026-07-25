import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS } from "../src/lib/federal-policy";

describe("federal E2E server provider guard", () => {
  it("kills the child even when application code catches the blocked fetch", () => {
    const blockedHost = FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS[0];
    const guardUrl = pathToFileURL(
      resolve("e2e/provider-fetch-guard.mjs"),
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `try { await fetch("https://${blockedHost}/v3/member"); } catch {} console.log("survived");`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS?.trim(),
            "--no-warnings",
            `--import=${guardUrl}`,
          ]
            .filter(Boolean)
            .join(" "),
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `E2E blocked server-side provider fetch: ${blockedHost}`,
    );
    expect(result.stdout).not.toContain("survived");
  });

  it("composes the guard with NODE_OPTIONS only for the spawned Next child", () => {
    const seed = readFileSync(resolve("e2e/seed-session.mjs"), "utf8");

    expect(seed).toMatch(
      /NODE_OPTIONS:\s*nextChildNodeOptions\(process\.env\.NODE_OPTIONS\)/,
    );
    expect(seed).toContain("provider-fetch-guard.mjs");
  });
});
