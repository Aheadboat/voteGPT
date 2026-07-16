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

  const nextHeadingOffset = normalizedContents
    .slice(start + marker.length)
    .search(new RegExp("^#{1," + level.length + "} ", "m"))
  return normalizedContents.slice(
    start,
    nextHeadingOffset === -1
      ? normalizedContents.length
      : start + marker.length + nextHeadingOffset,
  )
}

function readRoadmapItem(contents: string, id: string): string {
  const normalizedContents = contents.replace(/\r\n/g, "\n")
  const headings = [
    ...normalizedContents.matchAll(new RegExp("^## " + id + "\\b.*$", "gm")),
  ]
  const heading = headings[0]?.[0]

  if (headings.length !== 1 || !heading) {
    throw new Error("Expected one roadmap item: " + id)
  }

  return readMarkdownSection(normalizedContents, heading)
}

function readCoordinationField(item: string, label: string): string {
  const coordination = readMarkdownSection(item, "### Coordination record")
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const value = coordination
    .match(
      new RegExp(
        "^\\s*-\\s+\\*\\*" + escapedLabel + ":\\*\\*\\s*(\\S.*)\\s*$",
        "m",
      ),
    )?.[1]
    ?.trim()

  if (!value) {
    throw new Error("Missing or empty coordination field: " + label)
  }

  return value
}

function expectTokensInOrder(contents: string, tokens: string[]): void {
  let previousIndex = -1

  for (const token of tokens) {
    const index = contents.indexOf(token, previousIndex + 1)
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

function expectedActivePhase(status: string): string {
  const normalizedStatus = status.replace(/[`*_]/g, "").trim().toUpperCase()

  if (normalizedStatus === "IN PROGRESS (DISCOVER/DESIGN/PLAN)") {
    return "DISCOVER/DESIGN/PLAN"
  }

  const implementationPhase = normalizedStatus.match(
    /^IN PROGRESS \((RED|GREEN|REFACTOR)\)$/,
  )?.[1]

  if (implementationPhase) {
    return implementationPhase
  }

  if (normalizedStatus === "VERIFIED") {
    return "VERIFIED"
  }

  throw new Error("Unsupported active roadmap status: " + status)
}

function expectedAuthorizedPairActiveIds(statuses: Map<string, string>) {
  const f4Status = statuses.get("F4") ?? ""
  const f5Status = statuses.get("F5") ?? ""

  for (const status of [f4Status, f5Status]) {
    if (status !== "DONE") {
      expectedActivePhase(status)
    }
  }

  if (f5Status === "DONE" && f4Status !== "DONE") {
    throw new Error("F5 cannot close before F4")
  }

  return [
    ["F4", f4Status],
    ["F5", f5Status],
  ]
    .filter(([, status]) => status !== "DONE")
    .map(([id]) => id)
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
    const executionAdmission = execution.match(/^- ADMISSION:.*$/m)?.[0] ?? ""

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

    for (const auditContract of [protocol, execution]) {
      expect(auditContract).toMatch(
        /after explicit user authorization[^.\n]*before (?:creating )?(?:inert )?(?:item |feature )?branch(?:es)?(?:\/worktrees?)?[^.\n]*(?:activation PR|activation record)[^.\n]*(?:coordinator-only|only the coordinator)[^.\n]*read-only dependency\/interface\/admission audit/i,
      )
      expect(auditContract).toMatch(
        /audit may inspect (?:repository|repo) and roadmap state[^.\n]*(?:cannot|must not) modify files or external state/i,
      )
      expect(auditContract).toMatch(
        /no feature agent[^.\n]*DISCOVER\/DESIGN\/PLAN[^.\n]*dispatch[^.\n]*during (?:the )?audit/i,
      )
      expect(auditContract).toMatch(
        /`PASS`(?:\s*\/\s*|\s+or\s+)`CONDITIONAL`[^.\n]*proceed to paired activation/i,
      )
      expect(auditContract).toMatch(
        /unsettled(?:\s*\/\s*|\s+or\s+)coupled interfaces[^.\n]*(?:yield|require)[^.\n]*`FAIL`/i,
      )
      expect(auditContract).toMatch(
        /`FAIL`[^.\n]*(?:does not|must not|cannot) create paired activation/i,
      )
      expect(auditContract).toMatch(
        /coordinator reports (?:the )?`FAIL`[^.\n]*requires explicit user activation order for sequential work/i,
      )
      expect(auditContract).toMatch(
        /user selects a sequential order after `FAIL`[^.\n]*next single-item activation record preserves the failed pair audit and chosen order/i,
      )
      expect(auditContract).toMatch(
        /separately authorized single item[^.\n]*admission `N\/A`[^.\n]*after the audit confirms (?:its )?dependencies/i,
      )
    }

    for (const activationContract of [protocol, execution]) {
      expect(activationContract).toMatch(
        /explicit user authorization[^.\n]*(?:coordinator-only|only the coordinator)[^.\n]*inert activation setup/i,
      )
      expect(activationContract).toMatch(
        /coordinator-owned activation PR\/CI\/merge on `main`[^.\n]*single authoritative active\/admission record/i,
      )
      expect(activationContract).toMatch(
        /integrat(?:e|es|ed|ing) the activation merge into every feature branch[^.\n]*before (?:any )?agent dispatch[^.\n]*`?DISCOVER\/DESIGN\/PLAN`?/i,
      )
    }

    for (const admissionContract of [admission, executionAdmission]) {
      const pass =
        admissionContract.match(
          /`PASS`(?:(?!`CONDITIONAL`)[^\n])*/,
        )?.[0] ?? ""
      const conditional =
        admissionContract.match(/`CONDITIONAL`(?:(?!`FAIL`)[^\n])*/)?.[0] ??
        ""
      const fail = admissionContract.match(/`FAIL`[^\n]*/)?.[0] ?? ""

      expect(pass).toMatch(/settled interfaces|interfaces must be settled/)
      expect(pass).toMatch(
        /disjoint mutable files(?: and|\/) external state|mutable files and external state must be disjoint/,
      )
      expect(pass).toMatch(/independent tests|tests must be independent/)
      expect(pass).toContain("separate worktrees")
      expect(pass).toContain("merge order")
      expect(conditional).toMatch(/exactly one[^\n]*(?:owner|owns)/)
      expect(conditional).toContain("every deferred surface")
      expect(conditional).toContain("serialized integration point")
      expect(conditional).toContain("merge order")
      expect(fail).toContain("coupled")
      expect(fail).toMatch(/run(?:s)?\b[^\n]*\bsequentially\b/)
    }

    expect(readRoadmapItem(roadmap, "R1")).not.toContain(
      "For initial F4/F5 work",
    )
    expect(execution).not.toContain("At most one roadmap item may be active")
    expect(execution).toContain("At most two roadmap items may be active")
  })

  it("isolates feature work from current dependency-complete main", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const isolation = readMarkdownSection(
      agents,
      "### Branch and worktree isolation",
    )
    const execution = readMarkdownSection(roadmap, "## Execution contract")
    const executionIsolation = execution.match(/^- ISOLATION:.*$/m)?.[0] ?? ""
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
    for (const isolationContract of [isolation, executionIsolation]) {
      expect(isolationContract).toMatch(
        /(?:check fails|failed check|otherwise)[^\n]*integrat(?:e|es) current `main`[^\n]*focused and full verification[^\n]*before review or merge/i,
      )
    }
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

    for (const authorityContract of [record, execution]) {
      expect(authorityContract).toContain(
        "`main` owns authorization, active slots, pair admission, cross-item ownership/merge order, feature merges, closeout, and `DONE`",
      )
      expect(authorityContract).toMatch(
        /coordinator-authored commits on each item branch own only that item's phase\/evidence, blockers, integrated-main, and PR\/CI state until (?:the )?feature merge promotes (?:them|that state) to `main`/i,
      )
      expect(authorityContract).toContain(
        "Feature agents, agent reports, and conversation cannot write or advance either authority",
      )
      expect(authorityContract).toContain(
        "Item-branch state cannot activate another item or mark `DONE`",
      )
      expect(authorityContract).toMatch(
        /(?:no direct(?:-|\s)(?:`main`|main) status writes|direct(?:-|\s)(?:`main`|main) status writes are forbidden)/i,
      )
    }

    const statuses = readRoadmapStatuses(roadmap)
    const activeItems = [...statuses].filter(
      ([, status]) => status !== "TODO" && status !== "DONE",
    )
    const coordinationFields = [
      "Phase",
      "Branch",
      "Base commit",
      "Integrated-main commit",
      "Admission result",
      "Assigned feature lead",
      "Ownership",
      "Merge order",
      "Feature PR/CI",
      "Blockers",
      "Feature merge",
      "Post-merge evidence",
      "Closeout PR/CI/merge",
      "Next Human Gate",
    ]

    for (const [id, status] of activeItems) {
      const item = readRoadmapItem(roadmap, id)
      const values = new Map(
        coordinationFields.map((field) => [
          field,
          readCoordinationField(item, field),
        ]),
      )
      const phase = values.get("Phase") ?? ""

      expect(phase.replace(/[`*_]/g, "").trim().toUpperCase()).toBe(
        expectedActivePhase(status),
      )
      for (const commitField of ["Base commit", "Integrated-main commit"]) {
        expect(values.get(commitField), id + " " + commitField).toMatch(
          /^`?[0-9a-f]{40}`?$/i,
        )
      }
    }
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

  it("scopes standing F4-F8 authorization to an isolated integration branch", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const roadmap = readRepositoryFile("ROADMAP.md")
    const readme = readRepositoryFile("README.md")
    const agentBatch = readMarkdownSection(
      agents,
      "## Temporary autonomous F4-F8 integration batch",
    )
    const roadmapBatch = readMarkdownSection(
      roadmap,
      "## Temporary autonomous F4-F8 integration batch",
    )

    for (const batch of [agentBatch, roadmapBatch]) {
      expect(batch).toContain("`codex/autonomous-f4-f8-integration`")
      expect(batch).toContain("`d5978ba830f0ee715c9162afba8963139c0fb707`")
      expectTokensInOrder(batch, ["F4", "F5", "F6", "F7", "F8"])
      expect(batch).toContain("At most two roadmap items may be active")
      expect(batch).toContain("dependency/interface/admission audit")
      expect(batch).toContain("independent review")
      expect(batch).toContain("hosted CI")
      expect(batch).toContain("feature and closeout PRs")
      expect(batch).toContain("standing authorization")
      expect(batch).toContain("delegated Gate A")
      expect(batch).toContain("delegated Gate B")
      expect(batch).toContain("G1")
      expect(batch).toContain("no paid vendor commitment")
      expect(batch).toContain("final human review")
      expect(batch).toContain("must not merge")
    }

    expect(agentBatch).toContain(
      "The coordinator remains coordinator-only and does not implement feature production code.",
    )
    expect(roadmapBatch).toContain(
      "Actual `main` remains frozen at the batch base",
    )
    expect(readme).toContain(
      "F4-F8 autonomous integration batch is staged on `codex/autonomous-f4-f8-integration`",
    )
    expect(readme).toContain(
      "The batch branch will not merge into `main` before final human review.",
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

  it("keeps R1 closed and validates the authorized F4/F5 activation", () => {
    expect(
      readMarkdownSection("## One\r\nbody\r\n## Two\r\n", "## One"),
    ).toContain("body")
    expect(
      readMarkdownSection(
        "## Before\n### Target\ninside\n## Parent\noutside\n",
        "### Target",
      ),
    ).not.toContain("outside")
    expectTokensInOrder("alpha beta alpha", ["alpha", "beta", "alpha"])
    expect(
      readRoadmapStatuses(
        "## R1 — Concurrent Roadmap Delivery Contract [DONE]\r\n",
      ).get("R1"),
    ).toBe("DONE")
    expect(
      [
        "IN PROGRESS (DISCOVER/DESIGN/PLAN)",
        "IN PROGRESS (RED)",
        "IN PROGRESS (GREEN)",
        "IN PROGRESS (REFACTOR)",
        "VERIFIED",
      ].map(expectedActivePhase),
    ).toEqual([
      "DISCOVER/DESIGN/PLAN",
      "RED",
      "GREEN",
      "REFACTOR",
      "VERIFIED",
    ])
    expect(() => expectedActivePhase("IN PROGRESS (PROGRESS)")).toThrow(
      "Unsupported active roadmap status: IN PROGRESS (PROGRESS)",
    )

    const syntheticRoadmap = [
      "## R1 - Active [IN PROGRESS (GREEN)]",
      "",
      "### Coordination record",
      "",
      "- **Phase:** GREEN",
      "- **Branch:** `codex/r1`",
      "",
      "## F4 - Future [TODO]",
      "",
      "### Coordination record",
      "",
      "- **Phase:** TODO",
    ].join("\n")
    const syntheticR1 = readRoadmapItem(syntheticRoadmap, "R1")

    expect(syntheticR1).toContain("`codex/r1`")
    expect(syntheticR1).not.toContain("F4")
    expect(readCoordinationField(syntheticR1, "Phase")).toBe("GREEN")

    const roadmap = readRepositoryFile("ROADMAP.md")
    const readme = readRepositoryFile("README.md")
    const implementationPlan = readRepositoryFile("R1-IMPLEMENTATION-PLAN.md")
    const statuses = readRoadmapStatuses(roadmap)
    const r1Status = statuses.get("R1")
    const inactiveLaterRoadmapIds = [
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
      "F13",
      "F14",
      "G1",
      "G2",
    ]
    const activeIds = [...statuses]
      .filter(([, status]) => status !== "TODO" && status !== "DONE")
      .map(([id]) => id)
    const f4 = readRoadmapItem(roadmap, "F4")
    const f5 = readRoadmapItem(roadmap, "F5")
    const f4Status = statuses.get("F4") ?? ""
    const f5Status = statuses.get("F5") ?? ""
    const f4Ownership = readCoordinationField(f4, "Ownership")
    const f5Ownership = readCoordinationField(f5, "Ownership")
    const f4MergeOrder = readCoordinationField(f4, "Merge order")
    const f5MergeOrder = readCoordinationField(f5, "Merge order")
    const activationBase = "735d73b0b069fa67a1e16a968a7298fb973ef17a"
    const sharedSurfaces = [
      "src/db/schema.ts",
      "src/db/index.ts",
      "drizzle/**",
      "drizzle.config.ts",
      "src/db/index.test.ts",
      "integration/postgres-auth.test.ts",
      "e2e/seed-session.mjs",
      "src/lib/residence.ts",
      "src/lib/account.test.ts",
      "src/components/residence-preview.tsx",
      "src/components/residence-preview.test.tsx",
      "src/components/account-controls.tsx",
      "src/app/dashboard/page.tsx",
      "src/app/dashboard/page.test.tsx",
      "src/app/identity-shell.test.tsx",
      "src/app/globals.css",
      "e2e/residence.spec.ts",
      ".env.example",
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "vitest.config.mts",
      "vitest.postgres.config.mts",
      "playwright.config.ts",
    ]

    expect(r1Status).toBe("DONE")
    expect(activeIds).toEqual(expectedAuthorizedPairActiveIds(statuses))
    expect(
      expectedAuthorizedPairActiveIds(
        new Map([
          ["F4", "IN PROGRESS (RED)"],
          ["F5", "IN PROGRESS (DISCOVER/DESIGN/PLAN)"],
        ]),
      ),
    ).toEqual(["F4", "F5"])
    expect(
      expectedAuthorizedPairActiveIds(
        new Map([
          ["F4", "DONE"],
          ["F5", "IN PROGRESS (GREEN)"],
        ]),
      ),
    ).toEqual(["F5"])
    expect(
      expectedAuthorizedPairActiveIds(
        new Map([
          ["F4", "DONE"],
          ["F5", "DONE"],
        ]),
      ),
    ).toEqual([])
    expect(() =>
      expectedAuthorizedPairActiveIds(
        new Map([
          ["F4", "IN PROGRESS (GREEN)"],
          ["F5", "DONE"],
        ]),
      ),
    ).toThrow("F5 cannot close before F4")
    expect(() =>
      expectedAuthorizedPairActiveIds(
        new Map([
          ["F4", "TODO"],
          ["F5", "IN PROGRESS (DISCOVER/DESIGN/PLAN)"],
        ]),
      ),
    ).toThrow("Unsupported active roadmap status: TODO")
    for (const id of inactiveLaterRoadmapIds) {
      expect(statuses.get(id), id + " must remain TODO").toBe("TODO")
    }
    expect(readme).not.toContain("is implemented and verified")
    expect(implementationPlan).toContain(
      "contents.indexOf(token, previousIndex + 1)",
    )
    expect(readme).toContain(
      "R1 — Concurrent Roadmap Delivery Contract is complete",
    )
    if (f4Status === "DONE") {
      expect(readme).toMatch(/F4[^.\n]*complete/i)
    } else {
      expect(readme).toContain(
        "F4 and F5 are active in `DISCOVER/DESIGN/PLAN`",
      )
    }
    if (f5Status === "DONE") {
      expect(readme).toMatch(/F5[^.\n]*complete/i)
    } else {
      expect(readme).toMatch(/F5[^.\n]*active/i)
    }
    expect(readme).toContain(
      "F6, F7, and F8 remain TODO in the authorized batch queue",
    )
    for (const item of [f4, f5]) {
      expect(readCoordinationField(item, "Admission result")).toContain(
        "CONDITIONAL",
      )
      expect(
        readCoordinationField(item, "Base commit").replace(/`/g, ""),
      ).toBe(activationBase)
      expect(
        readCoordinationField(item, "Integrated-main commit").replace(/`/g, ""),
      ).toMatch(/^[0-9a-f]{40}$/i)
      expect(item).toContain(
        "Human Gate A remains required before RED or production work.",
      )
    }
    expect(readCoordinationField(f4, "Branch")).toContain(
      "codex/f4-consented-saved-residence",
    )
    expect(readCoordinationField(f5, "Branch")).toContain(
      "codex/f5-federal-officials",
    )
    expect(f4Ownership).toContain("F4 exclusively owns these shared surfaces:")
    expect(f5Ownership).toContain(
      "F5 defers these F4-owned shared surfaces:",
    )
    for (const surface of sharedSurfaces) {
      expect(f4Ownership, "F4 must own " + surface).toContain(surface)
      expect(f5Ownership, "F5 must defer " + surface).toContain(surface)
    }
    for (const coordinatorFile of [
      "AGENTS.md",
      "ROADMAP.md",
      "README.md",
      "tests/foundation-contract.test.ts",
    ]) {
      expect(f4Ownership).toContain(coordinatorFile)
    }
    expect(f4Ownership).toContain("shared PostgreSQL schema/migration history")
    expect(f4Ownership).toContain(
      "F4 exclusively owns the encryption-key configuration external resource",
    )
    expect(f5Ownership).toContain(
      "F5 exclusively owns the Congress.gov request/configuration external resource",
    )
    expect(f4Ownership).toContain(
      "shared CI configuration and generated artifacts remain frozen",
    )
    expect(f5Ownership).toContain(
      "shared CI configuration and generated artifacts remain frozen",
    )
    expectTokensInOrder(f4MergeOrder + " " + f5MergeOrder, [
      "F4 feature PR",
      "post-merge verification",
      "F4 closeout",
      "integrates completed F4",
      "shared-surface handoff",
      "only then may approach Gate B",
    ])
    expect(f5MergeOrder).toContain(
      "cannot reach Gate B until it integrates completed F4",
    )
  })
})
