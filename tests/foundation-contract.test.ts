import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = process.cwd()

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8")
}

function findUnsafeEnvironmentEntries(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !line.startsWith("#") && !/^[A-Z][A-Z0-9_]*=$/.test(line),
    )
}

describe("development foundation", () => {
  it("permits named environment variables only when their values are empty", () => {
    expect(findUnsafeEnvironmentEntries("CIVIC_PROVIDER_URL=\n")).toEqual([])
    expect(findUnsafeEnvironmentEntries("CIVIC_PROVIDER_URL=https://example.com\n")).toEqual([
      "CIVIC_PROVIDER_URL=https://example.com",
    ])
    expect(findUnsafeEnvironmentEntries("civic_provider_url=\n")).toEqual([
      "civic_provider_url=",
    ])
  })

  it("exposes the standard local verification commands", () => {
    const packageJson = JSON.parse(readRepositoryFile("package.json")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts).toMatchObject({
      test: "vitest run",
      typecheck: "next typegen && tsc --noEmit",
      lint: "eslint . --max-warnings=0",
      build: "next build",
      "test:e2e": "playwright test",
      "test:postgres": "vitest run --config vitest.postgres.config.mts",
      "db:check": "drizzle-kit check --dialect=postgresql --out=drizzle",
      "db:migrate": "drizzle-kit migrate",
      check: "npm test && npm run typecheck && npm run lint && npm run build",
    })
  })

  it("keeps Next.js generated type entrypoints untracked", () => {
    const gitignoreLines = readRepositoryFile(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim())

    expect(gitignoreLines).toContain("/next-env.d.ts")
  })

  it("mirrors the local verification contract in GitHub Actions", () => {
    const workflowPath = resolve(repositoryRoot, ".github/workflows/ci.yml")
    expect(existsSync(workflowPath), "expected .github/workflows/ci.yml").toBe(
      true,
    )

    const workflow = readFileSync(workflowPath, "utf8")
    const commands = [
      "npm ci",
      "npm run db:check && npm run db:migrate",
      "npm run test:postgres",
      "npm run check",
      "npx playwright install --with-deps chromium",
      "npm run test:e2e",
    ]
    const executableCommands = [...workflow.matchAll(/^\s*run:\s*(.+?)\s*$/gm)].map(
      ([, command]) => command,
    )

    expect(executableCommands).toEqual(commands)

    expect(workflow).toMatch(/push:\s*\n/)
    expect(workflow).toMatch(/pull_request:\s*\n/)
    expect(workflow).toContain("node-version: 24")
    expect(workflow).not.toMatch(/^\s*continue-on-error\s*:/m)
    expect(workflow).not.toMatch(/^\s*if\s*:/m)
  })

  it("keeps the environment example free of configured values", () => {
    const examplePath = resolve(repositoryRoot, ".env.example")
    expect(existsSync(examplePath), "expected .env.example").toBe(true)

    const example = readFileSync(examplePath, "utf8")
    expect(findUnsafeEnvironmentEntries(example)).toEqual([])
    expect(example.trim().split(/\r?\n/).sort()).toEqual(
      [
        "BETTER_AUTH_SECRET=",
        "BETTER_AUTH_URL=",
        "DATABASE_URL=",
        "EMAIL_FROM=",
        "EMAIL_SERVER=",
        "GOOGLE_CLIENT_ID=",
        "GOOGLE_CLIENT_SECRET=",
        "GOOGLE_CIVIC_API_KEY=",
      ].sort(),
    )
  })

  it("fails closed before a migration can target an implicit database", () => {
    const config = readRepositoryFile("drizzle.config.ts")

    expect(config).toContain("DATABASE_URL is required for database migrations")
    expect(config).not.toContain("postgres://localhost")
  })
})
