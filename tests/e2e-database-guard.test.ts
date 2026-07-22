import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

type GuardModule = {
  requireE2eDatabase: (
    environment: Record<string, string | undefined>,
    readTargetMarker: (databaseUrl: string) => Promise<string | undefined>,
  ) => Promise<string>;
};

const marker = "0123456789abcdef0123456789abcdef";
const target = "pglite://.data/e2e-guard-contract";

async function loadGuard(): Promise<GuardModule> {
  const guardModule = "../e2e/database-guard.mjs";
  return await import(guardModule);
}

function validEnvironment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    E2E_DATABASE_MARKER: marker,
    E2E_DATABASE_URL: target,
    E2E_DESTRUCTIVE_OPT_IN: "1",
    ...overrides,
  };
}

function repositoryFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("destructive E2E database guard", () => {
  it.each([
    ["opt-in", { E2E_DESTRUCTIVE_OPT_IN: undefined }],
    ["URL", { E2E_DATABASE_URL: undefined }],
    ["marker", { E2E_DATABASE_MARKER: undefined }],
  ])("requires explicit %s", async (_name, overrides) => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(validEnvironment(overrides), readTargetMarker),
    ).rejects.toThrow(/E2E database/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it("rejects an E2E database equal to the normalized ambient runtime database", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({ DATABASE_URL: "pglite://.data/./e2e-guard-contract" }),
        readTargetMarker,
      ),
    ).rejects.toThrow(/ambient/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it.each([undefined, "different-marker"])(
    "rejects target-resident marker %s before migration or write",
    async (targetMarker) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => targetMarker);

      await expect(
        requireE2eDatabase(validEnvironment(), readTargetMarker),
      ).rejects.toThrow(/marker/i);
      expect(readTargetMarker).toHaveBeenCalledOnce();
      expect(readTargetMarker).toHaveBeenCalledWith(target);
    },
  );

  it("returns the URL only after an exact target-resident marker match", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(validEnvironment(), readTargetMarker),
    ).resolves.toBe(target);
    expect(readTargetMarker).toHaveBeenCalledOnce();
  });

  it("rejects PGlite targets outside this worktree's ignored test-data area", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({ E2E_DATABASE_URL: "pglite://../outside" }),
        readTargetMarker,
      ),
    ).rejects.toThrow(/\.data/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it("guards seed, app, browser inspection, and E2E rotation before destructive work", () => {
    const config = repositoryFile("playwright.config.ts");
    const seed = repositoryFile("e2e/seed-session.mjs");
    const residence = repositoryFile("e2e/residence.spec.ts");
    const rotation = repositoryFile("scripts/rotate-saved-residence-keys.mts");

    expect(config).toMatch(
      /command:\s*"node e2e\/seed-session\.mjs --start-server"/,
    );
    expect(config).toContain("process.env.E2E_DATABASE_URL?.trim()");
    expect(config).not.toContain("pglite://.data/e2e");
    expect(config).toContain("E2E_DATABASE_URL: databaseUrl");
    expect(config).toContain("E2E_DATABASE_MARKER: databaseMarker");
    expect(seed.indexOf("await requireE2eDatabase")).toBeLessThan(
      seed.indexOf("await migrate"),
    );
    expect(seed.indexOf("await requireE2eDatabase")).toBeLessThan(
      seed.indexOf("await startApplication"),
    );
    expect(seed).toContain("DATABASE_URL: validatedDatabaseUrl");
    expect(residence).toContain(
      "process.env.E2E_DATABASE_URL?.trim()",
    );
    expect(residence).toContain("const connectionString = e2eDatabaseUrl");
    expect(rotation.indexOf("await requireE2eDatabase")).toBeLessThan(
      rotation.indexOf('import("@/lib/saved-residence")'),
    );
    expect(rotation).toContain("process.env.DATABASE_URL = databaseUrl");
  });

  it("keeps contract and marked destructive E2E databases separate in CI", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("votegpt_test");
    expect(workflow).toContain("votegpt_e2e");
    expect(workflow).toContain('E2E_DESTRUCTIVE_OPT_IN: "1"');
    expect(workflow).toContain("E2E_DATABASE_URL:");
    expect(workflow).toContain("E2E_DATABASE_MARKER:");
    expect(workflow).toMatch(/randomBytes|openssl rand/);
    expect(workflow).toMatch(/CREATE TABLE.*e2e_database_guard/i);
    expect(workflow).toMatch(/DROP DATABASE.*votegpt_e2e/i);
  });

  it("provisions the marker through psql stdin substitution and stops on SQL errors", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    const provision = workflow.match(
      /- name: Provision marked destructive E2E database([\s\S]*?)(?=\n\s*- name:)/,
    )?.[1];

    expect(provision).toBeDefined();
    expect(provision).toMatch(/-v ON_ERROR_STOP=1/);
    expect(provision).toMatch(/-v marker="\$marker"\s*<<'SQL'/);
    expect(provision).toContain("VALUES (1, :'marker');");
    expect(provision).not.toMatch(/-v marker="\$marker"\s+-c/);
  });

  it("drops each disposable CI database in its own psql invocation", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    const cleanup = workflow.match(
      /- name: Destroy disposable databases([\s\S]*)/,
    )?.[1];

    expect(cleanup).toBeDefined();
    expect(cleanup).toMatch(
      /psql[^\n]*-c 'DROP DATABASE IF EXISTS votegpt_e2e WITH \(FORCE\);'/,
    );
    expect(cleanup).toMatch(
      /psql[^\n]*-c 'DROP DATABASE IF EXISTS votegpt_test WITH \(FORCE\);'/,
    );
    expect(cleanup).not.toMatch(
      /DROP DATABASE IF EXISTS votegpt_e2e WITH \(FORCE\);\s*DROP DATABASE IF EXISTS votegpt_test WITH \(FORCE\);/,
    );
  });
});
