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

function readMarkdownSection(contents: string, heading: string): string {
  const normalizedContents = contents.replace(/\r\n/g, "\n")
  const marker = heading + "\n"
  const start = normalizedContents.indexOf(marker)

  if (start === -1) {
    throw new Error("Missing Markdown section: " + heading)
  }

  const level = heading.match(/^#+/)?.[0]

  if (!level) {
    throw new Error("Markdown heading has no level: " + heading)
  }

  const nextHeading = normalizedContents.indexOf(
    "\n" + level + " ",
    start + marker.length,
  )
  return normalizedContents.slice(
    start,
    nextHeading === -1 ? normalizedContents.length : nextHeading,
  )
}

function expectTokensInOrder(contents: string, tokens: string[]): void {
  let previousIndex = -1

  for (const token of tokens) {
    const index = contents.indexOf(token)
    expect(index, "missing or out-of-order token: " + token).toBeGreaterThan(
      previousIndex,
    )
    previousIndex = index
  }
}

function readRoadmapStatuses(contents: string): Map<string, string> {
  const normalizedContents = contents.replace(/\r\n/g, "\n")
  const matches = [
    ...normalizedContents.matchAll(/^## ([RFG]\d+)\b.*\[([^\]]+)\]$/gm),
  ]

  return new Map(
    matches.map(([, id, status]) => [id, status] as const),
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

describe("concurrent roadmap delivery contract", () => {
  it("requires dependency-safe concurrent admission", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const sourceOfTruth = readMarkdownSection(agents, "## Source of truth")
    const protocol = readMarkdownSection(agents, "## Roadmap item protocol")
    const admission = readMarkdownSection(
      agents,
      "### Concurrency admission and shared ownership",
    )
    const execution = readMarkdownSection(roadmap, "## Execution contract")

    expect(sourceOfTruth).not.toContain("single roadmap item")
    expect(sourceOfTruth).toContain("At most two roadmap items may be active")
    expect(protocol).toContain("Only explicit user authorization")
    expect(protocol).toContain(
      "Never activate a dependent or replacement item automatically.",
    )
    expect(admission).toContain("`PASS`")
    expect(admission).toContain("`CONDITIONAL`")
    expect(admission).toContain("`FAIL`")
    expect(admission).toContain("Every dependency must be `DONE` on `main`")
    expect(execution).not.toContain("At most one roadmap item may be active")
    expect(execution).toContain("At most two roadmap items may be active")
  })

  it("isolates feature work from current dependency-complete main", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const isolation = readMarkdownSection(
      agents,
      "### Branch and worktree isolation",
    )
    const gitignoreLines = readRepositoryFile(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim())

    expect(isolation).toContain("`codex/<roadmap-id>-<slug>`")
    expect(isolation).toContain("`.worktrees/<roadmap-id>-<slug>`")
    expect(isolation).toContain("latest dependency-complete `main`")
    expect(isolation).toContain(
      "current dependency-complete `main` commit is an ancestor of the feature head",
    )
    expect(isolation).toContain(
      "`git merge-base --is-ancestor <current-main> <feature-head>`",
    )
    expect(gitignoreLines).toContain("/.worktrees/")
  })

  it("orders review, both merges, and completion", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const protocol = readMarkdownSection(agents, "## Roadmap item protocol")
    const review = readMarkdownSection(
      agents,
      "### Review, merge, and closeout",
    )
    const gateB = readMarkdownSection(agents, "### Human Gate B")
    const execution = readMarkdownSection(roadmap, "## Execution contract")
    const lifecycle = [
      "feature PR/CI/review",
      "Human Gate B",
      "feature merge",
      "post-merge verification",
      "closeout PR/CI",
      "closeout merge",
      "DONE",
    ]

    expectTokensInOrder(protocol, lifecycle)
    expectTokensInOrder(execution, lifecycle)
    expect(review).toContain("focused and full verification")
    expect(review).toContain("no unresolved Critical or Important finding")
    expect(review).toContain("hosted CI succeeds")
    expect(review).toContain("GitHub reports it mergeable")
    expect(review).toContain("Human Gate B is approved")
    expect(review).toContain(
      "closeout PR changes only `ROADMAP.md` and `README.md`",
    )
    expect(review).toContain(
      "The roadmap slot remains active until the closeout merge",
    )
    expect(gateB).toContain(
      "Gate B authorizes merge; it does not mark the item `DONE`.",
    )
    expect(protocol).not.toContain("At most one item may be `IN PROGRESS`")
    expect(gateB).not.toContain(
      "Only explicit user approval marks the item `DONE`.",
    )
    expect(execution).not.toContain(
      "only explicit user approval permits `DONE`",
    )
  })

  it("separates roles and requires portable feature-design skills", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const delegation = readMarkdownSection(
      agents,
      "### Task graph and delegation",
    )
    const execution = readMarkdownSection(roadmap, "## Execution contract")

    expectTokensInOrder(delegation, ["ponytail full", "caveman full"])
    expect(delegation).toContain(
      "Required skills: invoke ponytail full, then caveman full, before exploration.",
    )
    expect(delegation).toContain(
      "This applies to every dispatch that includes `DISCOVER/DESIGN/PLAN`, including the feature lead.",
    )
    expect(delegation).toContain(
      "Resolve both skills by name from the agent's available skill catalog; never hardcode a machine path.",
    )
    expect(delegation).toContain(
      "Ponytail governs design scope but cannot simplify away explicit requirements, trust-boundary validation, data-loss prevention, privacy, security, accessibility, or required tests.",
    )
    expect(delegation).toContain(
      "Caveman governs communication but cannot omit outcome, dependencies, interfaces, decisions, rejected alternatives, risks, non-goals, expected RED, evidence, Human Gates, or blockers.",
    )
    expect(delegation).toContain(
      "Use full prose whenever compression would create ambiguity.",
    )
    expect(execution).toContain(
      "DESIGN AGENTS: every dispatch that includes DISCOVER/DESIGN/PLAN, including the feature lead, requires ponytail full then caveman full before exploration.",
    )
    expect(agents).not.toMatch(/(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)/)
    expect(delegation).toContain(
      "The coordinator owns dependency and concurrency audits",
    )
    expect(delegation).toContain(
      "does not implement feature production code",
    )
    expect(delegation).toContain(
      "cannot change roadmap status, merge, edit another worktree, or modify coordinator-owned authoritative files",
    )
    expect(delegation).toContain("Independent review agents remain read-only")
    const admission = readMarkdownSection(
      agents,
      "### Concurrency admission and shared ownership",
    )
    expect(admission).toContain(
      "exactly one active branch that owns each shared file",
    )
  })

  it("requires a durable coordination record", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const record = readMarkdownSection(
      agents,
      "### Durable coordination record",
    )
    const execution = readMarkdownSection(roadmap, "## Execution contract")
    const fields = [
      "phase",
      "branch",
      "base commit",
      "integrated-main commit",
      "admission result",
      "assigned feature lead",
      "ownership",
      "merge order",
      "feature PR/CI",
      "blockers",
      "feature merge",
      "post-merge evidence",
      "closeout PR/CI/merge",
      "next Human Gate",
    ]

    for (const field of fields) {
      expect(record).toContain(field)
      expect(execution).toContain(field)
    }
    expect(record).toContain(
      "Conversation state and agent reports alone never advance status.",
    )
  })

  it("recovers feature and closeout conflicts without stale approval", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const recovery = readMarkdownSection(
      agents,
      "### Conflict recovery and escalation",
    )

    expect(recovery).toContain("Feature or closeout PR conflicts")
    expect(recovery).toContain("dedicated conflict agent")
    expect(recovery).toContain("focused and full verification")
    expect(recovery).toContain("renewed independent review and CI")
    expect(recovery).toContain(
      "Material behavior or architecture changes invalidate the prior Gate B approval",
    )
  })

  it("keeps human escalation packets and scope changes explicit", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const recovery = readMarkdownSection(
      agents,
      "### Conflict recovery and escalation",
    )
    const scope = readMarkdownSection(agents, "### Scope governance")

    for (const category of [
      "product",
      "privacy",
      "editorial",
      "legal",
      "vendor",
      "spending",
      "credential",
      "scope",
      "material design",
      "launch-scope removal",
    ]) {
      expect(recovery).toContain(category)
    }

    for (const field of [
      "item",
      "branch",
      "PR",
      "evidence",
      "attempts",
      "downstream impact",
      "recommendation",
      "exact decision needed",
    ]) {
      expect(recovery).toContain(field)
    }

    expect(scope).toContain(
      "Adding, ordering, activating, deferring, or removing an item requires explicit user approval.",
    )
  })

  it("keeps the R1 amendment isolated until its closeout merge", () => {
    expect(
      readMarkdownSection("## One\r\nbody\r\n## Two\r\n", "## One"),
    ).toContain("body")
    expect(
      readRoadmapStatuses(
        "## R1 — Concurrent Roadmap Delivery Contract [DONE]\r\n",
      ).get("R1"),
    ).toBe("DONE")

    const roadmap = readRepositoryFile("ROADMAP.md")
    const readme = readRepositoryFile("README.md")
    const statuses = readRoadmapStatuses(roadmap)
    const r1Status = statuses.get("R1")
    const activeIds = [...statuses]
      .filter(([, status]) => status !== "TODO" && status !== "DONE")
      .map(([id]) => id)

    expect(r1Status).toBeDefined()
    expect(activeIds.length).toBeLessThanOrEqual(2)

    if (r1Status !== "DONE") {
      expect(activeIds).toEqual(["R1"])
      expect(statuses.get("F4")).toBe("TODO")
      expect(statuses.get("F5")).toBe("TODO")
      expect(readme).toContain(
        "R1 — Concurrent Roadmap Delivery Contract is active",
      )
      expect(readme).toContain(
        "F4 and every later roadmap item remain TODO",
      )
    } else {
      expect(readme).toContain(
        "R1 — Concurrent Roadmap Delivery Contract is complete",
      )
    }
  })
})
