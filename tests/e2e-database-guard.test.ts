import { spawnSync } from "node:child_process";
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
const target = "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e";
const redactionSentinel = "task4-redaction-sentinel";
const redactionUsername = `${redactionSentinel}-user`;
const redactionPassword = `${redactionSentinel}-password`;

function malformedDatabaseUrl(username = redactionUsername) {
  return `postgresql://${username}:${redactionPassword}@[`;
}

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
        validEnvironment({
          DATABASE_URL:
            "postgres://ambient:ambient-secret@LOCALHOST:5432/votegpt_e2e",
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow(/ambient/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it.each([
    [
      "protocol aliases and credentials",
      "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e",
      "postgresql://e2e:e2e-secret@LOCALHOST:5432/votegpt_e2e",
    ],
    [
      "non-routing connection options",
      "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e?application_name=browser&sslmode=disable",
      "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e?application_name=e2e&sslmode=require",
    ],
  ])(
    "rejects reviewer PostgreSQL identity bypass example with %s before reading the marker",
    async (_description, ambientDatabaseUrl, e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({
            DATABASE_URL: ambientDatabaseUrl,
            E2E_DATABASE_URL: e2eDatabaseUrl,
          }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/ambient/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it("rejects the reviewer PGPORT routing reproducer before reading the marker", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({
          DATABASE_URL:
            "postgresql://ambient:ambient-secret@localhost:5432/votegpt_e2e",
          E2E_DATABASE_URL:
            "postgresql://e2e:e2e-secret@localhost/votegpt_e2e",
          PGPORT: "6543",
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow("E2E PostgreSQL database URL must specify an explicit port.");
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it.each([
    [
      "target",
      { E2E_DATABASE_URL: "postgresql://e2e:e2e-secret@localhost/votegpt_e2e" },
    ],
    [
      "ambient database",
      { DATABASE_URL: "postgresql://ambient:ambient-secret@localhost/votegpt_e2e" },
    ],
  ])(
    "rejects a portless PostgreSQL %s before reading the marker regardless of PGPORT",
    async (_description, urls) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({ ...urls, PGPORT: "6543" }),
          readTargetMarker,
        ),
      ).rejects.toThrow("E2E PostgreSQL database URL must specify an explicit port.");
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it("rejects a percent-encoded target host before reading the marker", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({
          DATABASE_URL:
            "postgresql://ambient:ambient-secret@localhost:5432/votegpt_e2e",
          E2E_DATABASE_URL:
            "postgresql://e2e:e2e-secret@%6cocalhost:5432/votegpt_e2e",
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow(/ambient/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a DNS root-dot alias",
      "postgresql://ambient:ambient-secret@localhost:5432/votegpt_e2e",
      "postgresql://e2e:e2e-secret@localhost.:5432/votegpt_e2e",
    ],
    [
      "a non-canonical IPv4 spelling accepted by pg",
      "postgresql://ambient:ambient-secret@127.0.0.1:5432/votegpt_e2e",
      "postgresql://e2e:e2e-secret@127.1:5432/votegpt_e2e",
    ],
    [
      "an expanded IPv6 spelling normalized by pg",
      "postgresql://ambient:ambient-secret@[::1]:5432/votegpt_e2e",
      "postgresql://e2e:e2e-secret@[0:0:0:0:0:0:0:1]:5432/votegpt_e2e",
    ],
  ])(
    "rejects equivalent PostgreSQL host identity expressed as %s before reading the marker",
    async (_description, ambientDatabaseUrl, e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({
            DATABASE_URL: ambientDatabaseUrl,
            E2E_DATABASE_URL: e2eDatabaseUrl,
          }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/ambient/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "localhost and the IPv4 loopback address",
      "postgresql://ambient:ambient-secret@localhost:5432/shared_db",
      "postgresql://e2e:e2e-secret@127.0.0.1:5432/shared_db",
    ],
    [
      "canonicalized 127/8 loopback aliases",
      "postgresql://ambient:ambient-secret@127.0.0.1:5432/shared_db",
      "postgresql://e2e:e2e-secret@127.1:5432/shared_db",
    ],
    [
      "localhost and the IPv6 loopback address",
      "postgresql://ambient:ambient-secret@localhost:5432/shared_db",
      "postgresql://e2e:e2e-secret@[::1]:5432/shared_db",
    ],
  ])(
    "rejects common loopback aliases expressed as %s before reading the marker",
    async (_description, ambientDatabaseUrl, e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({
            DATABASE_URL: ambientDatabaseUrl,
            E2E_DATABASE_URL: e2eDatabaseUrl,
          }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/ambient/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "the IPv4-mapped IPv6 form of 127.0.0.1",
      "postgresql://ambient:ambient-secret@127.0.0.1:5432/shared_db",
      "postgresql://e2e:e2e-secret@[::ffff:127.0.0.1]:5432/shared_db",
    ],
    [
      "the IPv4-mapped IPv6 form of a 127/8 alias",
      "postgresql://ambient:ambient-secret@127.1:5432/shared_db",
      "postgresql://e2e:e2e-secret@[::ffff:127.1.0.1]:5432/shared_db",
    ],
  ])(
    "rejects %s before reading the marker",
    async (_description, ambientDatabaseUrl, e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({
            DATABASE_URL: ambientDatabaseUrl,
            E2E_DATABASE_URL: e2eDatabaseUrl,
          }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/ambient/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it("keeps a non-loopback IPv4-mapped IPv6 host distinct", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);
    const e2eDatabaseUrl =
      "postgresql://e2e:e2e-secret@[::ffff:192.0.2.1]:5432/shared_db";

    await expect(
      requireE2eDatabase(
        validEnvironment({
          DATABASE_URL:
            "postgresql://ambient:ambient-secret@192.0.2.1:5432/shared_db",
          E2E_DATABASE_URL: e2eDatabaseUrl,
        }),
        readTargetMarker,
      ),
    ).resolves.toBe(e2eDatabaseUrl);
    expect(readTargetMarker).toHaveBeenCalledOnce();
  });

  it("rejects an ambiguous PostgreSQL host before reading the marker", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({
          E2E_DATABASE_URL:
            "postgresql://e2e:e2e-secret@localhost..:5432/votegpt_e2e",
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow("E2E PostgreSQL database URL is invalid.");
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it.each([
    ["host", "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e?host=elsewhere"],
    ["port", "postgresql://e2e:e2e-secret@localhost:5432/votegpt_e2e?port=5433"],
  ])(
    "rejects PostgreSQL %s routing overrides before reading the marker",
    async (_parameter, e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({ E2E_DATABASE_URL: e2eDatabaseUrl }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/routing parameters/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid PostgreSQL path encoding before reading the marker", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({
          E2E_DATABASE_URL:
            "postgresql://e2e:e2e-secret@localhost:5432/votegpt%ZZ_e2e",
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow(/invalid/i);
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it("redacts malformed target credentials from unhandled seed-style stderr", () => {
    const malformedUrl = malformedDatabaseUrl();
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "import { requireE2eDatabase } from './e2e/database-guard.mjs'; await requireE2eDatabase(process.env);",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: undefined,
          E2E_DATABASE_MARKER: marker,
          E2E_DATABASE_URL: malformedUrl,
          E2E_DESTRUCTIVE_OPT_IN: "1",
        },
      },
    );

    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain("E2E PostgreSQL database URL is invalid.");
    for (const secret of [
      redactionSentinel,
      redactionUsername,
      redactionPassword,
      malformedUrl,
    ]) {
      expect(child.stderr).not.toContain(secret);
    }
  });

  it("redacts malformed ambient credentials before reading the marker", async () => {
    const { requireE2eDatabase } = await loadGuard();
    const readTargetMarker = vi.fn(async () => marker);

    await expect(
      requireE2eDatabase(
        validEnvironment({
          DATABASE_URL: malformedDatabaseUrl("task4-ambient-user"),
        }),
        readTargetMarker,
      ),
    ).rejects.toThrow("E2E PostgreSQL database URL is invalid.");
    expect(readTargetMarker).not.toHaveBeenCalled();
  });

  it("derives PostgreSQL routing identity through the declared pg package", () => {
    const guard = repositoryFile("e2e/database-guard.mjs");

    expect(guard).not.toMatch(/from\s+["']pg-connection-string["']/);
    expect(guard).toMatch(
      /new Client\(\{ connectionString: databaseUrl \}\)\.connectionParameters/,
    );
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

  it.each([
    "pglite://.data/e2e-guard-contract",
    "pglite://.data/link-shaped/../../outside",
  ])(
    "rejects PGlite target %s before reading the marker",
    async (e2eDatabaseUrl) => {
      const { requireE2eDatabase } = await loadGuard();
      const readTargetMarker = vi.fn(async () => marker);

      await expect(
        requireE2eDatabase(
          validEnvironment({ E2E_DATABASE_URL: e2eDatabaseUrl }),
          readTargetMarker,
        ),
      ).rejects.toThrow(/PostgreSQL only/i);
      expect(readTargetMarker).not.toHaveBeenCalled();
    },
  );

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

  it("passes the caller's destructive opt-in through to Playwright unchanged", () => {
    const config = repositoryFile("playwright.config.ts");

    expect(config).toContain(
      "const destructiveOptIn = process.env.E2E_DESTRUCTIVE_OPT_IN",
    );
    expect(config).toMatch(
      /\.\.\.\(destructiveOptIn === undefined\s*\? \{\}\s*:\s*\{ E2E_DESTRUCTIVE_OPT_IN: destructiveOptIn \}\),/,
    );
    expect(config).not.toMatch(/E2E_DESTRUCTIVE_OPT_IN:\s*[\"']1[\"']/);
  });

  it("keeps contract and marked destructive E2E databases separate in CI", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("votegpt_test");
    expect(workflow).toContain("votegpt_e2e");
    expect(workflow).toContain('E2E_DESTRUCTIVE_OPT_IN="1"');
    expect(workflow).toContain('E2E_DATABASE_URL="$e2e_database_url"');
    expect(workflow).toContain('E2E_DATABASE_MARKER="$marker"');
    expect(workflow).toMatch(/randomBytes|openssl rand/);
    expect(workflow).toMatch(/CREATE TABLE.*e2e_database_guard/i);
    expect(workflow).toMatch(/DROP DATABASE.*votegpt_e2e/i);
  });

  it("provisions the marker through psql stdin substitution and stops on SQL errors", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    const provision = workflow.match(
      /- name: Provision and run marked destructive E2E tests([\s\S]*?)(?=\n\s*- name:)/,
    )?.[1];

    expect(provision).toBeDefined();
    expect(provision).toMatch(/-v ON_ERROR_STOP=1/);
    expect(provision).toMatch(/-v marker="\$marker"\s*<<'SQL'/);
    expect(provision).toContain("VALUES (1, :'marker');");
    expect(provision).not.toMatch(/-v marker="\$marker"\s+-c/);
  });

  it("keeps the CI marker masked and command-scoped within the E2E step", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    const e2e = workflow.match(
      /- name: Provision and run marked destructive E2E tests([\s\S]*?)(?=\n\s*- name:)/,
    )?.[1];

    expect(e2e).toBeDefined();
    const e2eStep = e2e ?? "";
    expect(workflow).not.toContain("GITHUB_OUTPUT");
    expect(workflow).not.toContain("steps.e2e_database.outputs.marker");
    expect(workflow).not.toMatch(
      /^\s+E2E_DATABASE_(?:MARKER|URL|DESTRUCTIVE_OPT_IN):/m,
    );
    expect(e2eStep).toMatch(/marker="\$\(openssl rand -hex 32\)"/);
    expect(e2eStep).toMatch(/echo "::add-mask::\$marker"/);
    expect(e2eStep.match(/echo [^\r\n]*\$marker[^\r\n]*/g)).toEqual([
      'echo "::add-mask::$marker"',
    ]);
    expect(e2eStep.indexOf('echo "::add-mask::$marker"')).toBeLessThan(
      e2eStep.indexOf("psql -h 127.0.0.1 -U postgres -d postgres"),
    );
    expect(e2eStep).not.toContain("postgresql://");
    expect(e2eStep).not.toMatch(/postgres(?:ql)?:\/\/[^\s/:]+:[^\s/@]+@/);
    expect(e2eStep).toContain(
      'database_scheme="postgresql"',
    );
    expect(e2eStep).toContain('database_user="postgres"');
    expect(e2eStep).toContain('database_host="127.0.0.1"');
    expect(e2eStep).toContain('database_port="5432"');
    expect(e2eStep).toContain('database_name="votegpt_e2e"');
    expect(e2eStep).toContain(
      'e2e_database_url="${database_scheme}://${database_user}:${PGPASSWORD}@${database_host}:${database_port}/${database_name}"',
    );
    expect(e2eStep).toContain('echo "::add-mask::$e2e_database_url"');
    expect(e2eStep.indexOf('echo "::add-mask::$e2e_database_url"')).toBeLessThan(
      e2eStep.indexOf("psql -h 127.0.0.1 -U postgres -d postgres"),
    );
    expect(e2eStep.indexOf('echo "::add-mask::$e2e_database_url"')).toBeLessThan(
      e2eStep.indexOf('E2E_DATABASE_URL="$e2e_database_url"'),
    );
    expect(e2eStep.indexOf('echo "::add-mask::$marker"')).toBeLessThan(
      e2eStep.indexOf("E2E_DATABASE_MARKER=\"$marker\""),
    );
    expect(e2eStep).toMatch(/-v ON_ERROR_STOP=1 -v marker="\$marker"\s*<<'SQL'/);
    expect(e2eStep).toContain(
      'E2E_DATABASE_MARKER="$marker" E2E_DATABASE_URL="$e2e_database_url" E2E_DESTRUCTIVE_OPT_IN="1" npm run test:e2e',
    );
    expect(e2eStep).not.toMatch(/^\s+E2E_DATABASE_(?:MARKER|URL):/m);
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

  it("attempts both CI database drops before returning either cleanup failure", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    const cleanup = workflow.match(
      /- name: Destroy disposable databases([\s\S]*)/,
    )?.[1];

    expect(cleanup).toBeDefined();
    const cleanupStep = cleanup ?? "";
    expect(cleanupStep).toContain("cleanup_status=0");
    expect(cleanupStep).toMatch(
      /psql[^\n]*DROP DATABASE IF EXISTS votegpt_e2e WITH \(FORCE\);'\s*\|\| cleanup_status=\$\?/,
    );
    expect(cleanupStep).toMatch(
      /psql[^\n]*DROP DATABASE IF EXISTS votegpt_test WITH \(FORCE\);'\s*\|\| cleanup_status=\$\?/,
    );
    expect(cleanupStep).toMatch(/exit "\$cleanup_status"/);
  });
});
