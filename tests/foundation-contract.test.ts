import { execFileSync } from "node:child_process"
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

function readTrackedRepositoryFiles(): Set<string> {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })

  return new Set(
    output
      .split("\0")
      .filter(Boolean)
      .map((path) => path.replaceAll("\\", "/")),
  )
}

function readLocalMarkdownLinks(contents: string): string[] {
  return [...contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(([, destination]) => destination.trim().replace(/^<|>$/g, ""))
    .filter(
      (destination) =>
        !destination.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(destination),
    )
    .map((destination) => decodeURIComponent(destination.split("#")[0] ?? ""))
    .filter(Boolean)
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
    ]
    const yamlBlockScalarIndicators = new Set(["|", ">-"])
    const executableCommands = [
      ...workflow.matchAll(/^\s*run:\s*(.+?)\s*$/gm),
    ]
      .map(([, command]) => command)
      .filter((command) => !yamlBlockScalarIndicators.has(command))

    expect(executableCommands).toEqual(commands)
    expect(workflow).toContain("npm run test:e2e")

    expect(workflow).toMatch(/push:\s*\n/)
    expect(workflow).toMatch(/pull_request:\s*\n/)
    expect(workflow).toContain("node-version: 24")
    expect(workflow).not.toMatch(/^\s*continue-on-error\s*:/m)
    expect(
      [...workflow.matchAll(/^\s*if:\s*(.+?)\s*$/gm)].map(
        ([, condition]) => condition,
      ),
    ).toEqual(["always()"])
    expectTokensInOrder(workflow, [
      "Validate and apply database migrations",
      "Run PostgreSQL auth contract",
      "Run non-E2E checks",
      "Install Chromium",
      "Provision and run marked destructive E2E tests",
      "Destroy disposable databases",
    ])
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
        "CONGRESS_GOV_API_KEY=",
        "DATABASE_URL=",
        "E2E_DATABASE_MARKER=",
        "E2E_DATABASE_URL=",
        "E2E_DESTRUCTIVE_OPT_IN=",
        "EMAIL_FROM=",
        "EMAIL_SERVER=",
        "GOOGLE_CLIENT_ID=",
        "GOOGLE_CLIENT_SECRET=",
        "GOOGLE_CIVIC_API_KEY=",
        "OPENSTATES_API_KEY=",
        "RESIDENCE_ENCRYPTION_ACTIVE_KEY=",
        "RESIDENCE_ENCRYPTION_KEYS=",
      ].sort(),
    )
  })

  it("fails closed before a migration can target an implicit database", () => {
    const config = readRepositoryFile("drizzle.config.ts")

    expect(config).toContain("DATABASE_URL is required for database migrations")
    expect(config).not.toContain("postgres://localhost")
  })
})

describe("repository context and hygiene contract", () => {
  it("routes current capabilities through one compact root project map", () => {
    const projectMapPath = resolve(repositoryRoot, "PROJECT-MAP.md")
    expect(existsSync(projectMapPath), "expected root PROJECT-MAP.md").toBe(
      true,
    )

    const projectMap = readFileSync(projectMapPath, "utf8")
    const startHere = readMarkdownSection(projectMap, "## Start here")
    const capabilities = readMarkdownSection(
      projectMap,
      "## Capability routes",
    )
    const localLinks = readLocalMarkdownLinks(projectMap)
    const trackedFiles = readTrackedRepositoryFiles()

    for (const entrypoint of [
      "AGENTS.md",
      "ROADMAP.md",
      "README.md",
      "TEMPORARY.md",
    ]) {
      expect(
        readLocalMarkdownLinks(startHere),
        "missing start-here link: " + entrypoint,
      ).toContain(entrypoint)
    }
    expectTokensInOrder(capabilities, [
      "Public shell, identity, and account",
      "Residence preview",
      "Saved residence",
      "Federal officials",
      "Persistence",
      "Verification and delivery",
    ])
    for (const path of localLinks) {
      expect(existsSync(resolve(repositoryRoot, path)), path + " must resolve").toBe(
        true,
      )
      expect(trackedFiles.has(path), path + " must be tracked current code").toBe(
        true,
      )
    }
    expect(
      [...trackedFiles].filter(
        (path) =>
          path !== "PROJECT-MAP.md" && path.endsWith("/PROJECT-MAP.md"),
      ),
      "no child map is earned yet",
    ).toEqual([])
  })

  it("registers intentional temporary work and ignores derived local state", () => {
    const temporaryPath = resolve(repositoryRoot, "TEMPORARY.md")
    expect(existsSync(temporaryPath), "expected TEMPORARY.md").toBe(true)

    const temporary = readFileSync(temporaryPath, "utf8")
    const entryFormat = readMarkdownSection(temporary, "## Entry format")
    const openEntries = readMarkdownSection(temporary, "## Open entries")
      .replace(/\r\n/g, "\n")
      .trim()
    const gitignoreLines = readRepositoryFile(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim())

    for (const field of [
      "Owner/task",
      "Path/surface",
      "Reason",
      "Remove/revert/promote action",
      "Deadline",
    ]) {
      expect(entryFormat).toContain(field)
    }
    expect(openEntries).toBe("## Open entries\n\nNone.")
    expect(gitignoreLines).toContain("/.scratch/")
    expect(gitignoreLines).toContain("/.codegraph/")
  })

  it("makes map maintenance and temporary cleanup delivery gates", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const readme = readRepositoryFile("README.md")
    const codeGraph = readMarkdownSection(agents, "## CodeGraph")
    const context = readMarkdownSection(
      agents,
      "## Repository context and hygiene",
    )
    const readmeLinks = readLocalMarkdownLinks(readme)

    expect(readmeLinks).toContain("PROJECT-MAP.md")
    expect(readmeLinks).toContain("TEMPORARY.md")
    expect(codeGraph).toMatch(
      /PROJECT-MAP\.md[^.\n]*(?:first|before)[^.\n]*(?:grep|find|reading (?:other )?files)/i,
    )
    expectTokensInOrder(context, [
      "PROJECT-MAP.md",
      "CodeGraph",
      "scoped `rg`",
    ])
    expect(context).toMatch(
      /(?:adding|moving|removing)[^.\n]*routing surface[^.\n]*PROJECT-MAP\.md[^.\n]*before `VERIFIED`/i,
    )
    expect(context).toMatch(
      /TEMPORARY\.md[^.\n]*(?:no|zero) open entries[^.\n]*`VERIFIED`[^.\n]*Human Gate B/i,
    )
    expect(context).toContain("`codegraph init .`")
    expect(context).toContain("`codegraph sync .`")
    expect(context).toContain("`codegraph status --json .`")
    expect(context).toMatch(
      /PROJECT-MAP\.md[^.\n]*fallback[^.\n]*(?:missing|unavailable|stale)/i,
    )
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

  it("keeps completed items closed and activates only F6", () => {
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
    const recoveryDesign = readRepositoryFile(
      "F4-F5-LEAN-RECOVERY-DESIGN.md",
    )
    const f4RecoveryPlan = readRepositoryFile("F4-LEAN-RECOVERY-PLAN.md")
    const f5RecoveryPlan = readRepositoryFile("F5-LEAN-RECOVERY-PLAN.md")
    const statuses = readRoadmapStatuses(roadmap)
    const r1Status = statuses.get("R1")
    const inactiveLaterRoadmapIds = [
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
    const r2 = readRoadmapItem(roadmap, "R2")
    const f6 = readRoadmapItem(roadmap, "F6")
    const f4Status = statuses.get("F4") ?? ""
    const f5Status = statuses.get("F5") ?? ""
    const r2Status = statuses.get("R2") ?? ""
    const f6Status = statuses.get("F6") ?? ""
    const f4Ownership = readCoordinationField(f4, "Ownership")
    const f5Ownership = readCoordinationField(f5, "Ownership")
    const f4MergeOrder = readCoordinationField(f4, "Merge order")
    const f5MergeOrder = readCoordinationField(f5, "Merge order")
    const recoveryBase = "4c5fd46106013fe3a104f20de4bfcf51f2508710"
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
    expect(f4Status).toBe("DONE")
    expect(f5Status).toBe("DONE")
    expect(r2Status).toBe("DONE")
    expect(f6Status).toBe("IN PROGRESS (GREEN)")
    const r2IsDone = r2Status === "DONE"

    expect(["VERIFIED", "DONE"]).toContain(r2Status)
    expect(activeIds).toEqual(["F6"])
    expect(expectedAuthorizedPairActiveIds(statuses)).toEqual([])
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
    expect(recoveryDesign).toContain(
      "Human Gate A and written specification approved on 2026-07-21",
    )
    expect(recoveryDesign).toContain("This thread remains the coordinator")
    expect(f4RecoveryPlan).toContain("### Task 4: Guard destructive E2E")
    expect(f5RecoveryPlan).toContain(
      "### Task 4: Prove the F4 handoff",
    )
    expect(readme).toContain(
      "R1 — Concurrent Roadmap Delivery Contract is complete",
    )
    if (f4Status === "DONE") {
      expect(readme).toMatch(/F4[^.\n]*complete/i)
    } else {
      expect(readme).toContain(
        "F4 and F5 remain active under approved lean recovery plans.",
      )
    }
    if (f5Status === "DONE") {
      expect(readme).toMatch(/F5[^.\n]*complete/i)
    } else {
      expect(readme).toContain(
        "F4 and F5 remain active under approved lean recovery plans.",
      )
    }
    if (r2IsDone) {
      expect(readme).toMatch(/R2[^.\n]*complete/i)
      expect(readme).toContain("F6 is active in GREEN")
      expect(readme).toContain(
        "state-jurisdiction domain and bounded OpenStates provider adapter are independently reviewed",
      )
      expect(readme).toContain("Human Gate B")
    } else {
      expect(readme).toContain("R2 is `VERIFIED`")
      expect(readme).toContain("Human Gate B is approved")
    }
    expectTokensInOrder(roadmap, ["## F5 ", "## R2 ", "## F6 "])
    expect(r2).toContain("PROJECT-MAP.md")
    expect(r2).toContain("TEMPORARY.md")
    expect(r2).toContain("F4 and F5 must both be `DONE` on `main`")
    expect(r2).toContain("User explicitly activated R2 on 2026-07-30")
    expect(r2).toContain("single-item pre-activation audit passed")
    expect(r2).toContain(
      "every feature-owned entry is removed, reverted, or promoted before `VERIFIED` and remains absent through Gate B",
    )
    expect(r2).toContain("placeholder child indexes")
    expect(r2).toContain("root plus one child level")
    expect(r2).toContain("codegraph init .")
    expect(r2).toContain("codegraph sync .")
    expect(r2).toContain(
      "Human Gate B evidence:** User explicitly approved R2 on 2026-07-30",
    )
    expect(readCoordinationField(r2, "Phase")).toBe("`" + r2Status + "`")
    expect(readCoordinationField(r2, "Branch")).toContain(
      "codex/r2-context-hygiene",
    )
    expect(
      readCoordinationField(r2, "Base commit").replace(/`/g, ""),
    ).toBe("d262403200ff98bcf4a2d9a5cd05a7016a69d98d")
    expect(
      readCoordinationField(r2, "Integrated-main commit").replace(/`/g, ""),
    ).toBe("5496a4f71cf018ba4eeb368f1aa142e19976db61")
    expect(readCoordinationField(r2, "Admission result")).toContain("N/A")
    expect(readCoordinationField(r2, "Assigned feature lead")).toContain(
      "r2_context_hygiene_lead",
    )
    const r2Ownership = readCoordinationField(r2, "Ownership")
    const featureLeadOwnershipStart = r2Ownership.indexOf(
      "The R2 feature lead exclusively owns",
    )
    const frozenProductionStart = r2Ownership.indexOf(
      "Application production code remains frozen",
    )

    expect(featureLeadOwnershipStart).toBeGreaterThan(0)
    expect(frozenProductionStart).toBeGreaterThan(featureLeadOwnershipStart)
    const coordinatorOwnership = r2Ownership.slice(0, featureLeadOwnershipStart)
    const featureLeadOwnership = r2Ownership.slice(
      featureLeadOwnershipStart,
      frozenProductionStart,
    )
    expect(coordinatorOwnership).toContain("The coordinator exclusively owns")
    for (const coordinatorFile of [
      "AGENTS.md",
      "ROADMAP.md",
      "README.md",
      "tests/foundation-contract.test.ts",
    ]) {
      expect(coordinatorOwnership).toContain(coordinatorFile)
    }
    for (const featureFile of [
      "PROJECT-MAP.md",
      "TEMPORARY.md",
      ".gitignore",
    ]) {
      expect(featureLeadOwnership).toContain(featureFile)
    }
    expect(r2Ownership.toLowerCase()).toContain(
      "application production code remains frozen",
    )
    const r2MergeOrder = readCoordinationField(r2, "Merge order")
    expectTokensInOrder(r2MergeOrder, [
      "R2 feature PR",
      "post-merge verification on `main`",
      "R2 closeout PR/CI/merge",
      "No later item activates automatically",
    ])
    const r2FeaturePr = readCoordinationField(r2, "Feature PR/CI")
    expect(r2FeaturePr).toContain(
      "[PR #21](https://github.com/Aheadboat/voteGPT/pull/21)",
    )
    expect(r2FeaturePr).toContain("draft")
    expect(r2FeaturePr).toContain("hosted CI")
    expect(r2FeaturePr).toContain("mergeability")
    expect(r2FeaturePr).toContain("Human Gate B")
    expect(r2FeaturePr).not.toContain("Human Gate A")
    if (!r2IsDone) {
      expect(r2FeaturePr).toContain("draft")
    }
    expect(readCoordinationField(r2, "Blockers")).toBe("None.")
    const r2FeatureMerge = readCoordinationField(r2, "Feature merge")
    const r2PostMerge = readCoordinationField(r2, "Post-merge evidence")
    const r2Closeout = readCoordinationField(r2, "Closeout PR/CI/merge")
    const r2NextGate = readCoordinationField(r2, "Next Human Gate")

    if (r2IsDone) {
      expect(r2FeatureMerge).not.toContain("Pending")
      expect(r2FeatureMerge).toContain(
        "[PR #21](https://github.com/Aheadboat/voteGPT/pull/21)",
      )
      expect(r2FeatureMerge).toContain("merged")
      expect(r2PostMerge).not.toContain("Pending")
      expect(r2PostMerge).toContain("main")
      expect(r2PostMerge).toContain("codegraph sync .")
      expect(r2PostMerge).toContain("codegraph status --json .")
      expect(r2Closeout).not.toContain("Pending")
      expect(r2Closeout).toContain("ROADMAP.md")
      expect(r2Closeout).toContain("README.md")
      expect(r2Closeout).toContain("current-head hosted CI")
      expect(r2Closeout).toContain("merge")
    } else {
      expect(r2FeatureMerge).toContain("Pending")
      expect(r2PostMerge).toContain("Pending")
      expect(r2Closeout).toContain("Pending")
    }
    expect(r2NextGate).toContain("None")
    expect(r2NextGate).toContain("Human Gate B")
    expect(f6).toContain("**Dependencies:** F5 and R2.")
    expect(f6).toContain("User explicitly activated F6 on 2026-07-30")
    expect(f6).toContain("single-item pre-activation audit passed")
    const expectedF6CoordinationFields = new Map<string, string>([
      ["Phase", "`GREEN`"],
      ["Branch", "`codex/f6-state-officials-navigation`"],
      ["Base commit", "`ea8bff3417896ba8ca669ccb517e7617d070b00d`"],
      [
        "Integrated-main commit",
        "`9f77d15d2ef15ab411fadebd2c688a2f217886e5`",
      ],
      [
        "Admission result",
        "`N/A` — F6 is the sole active item; its F5/R2 dependencies are `DONE`, and no concurrent pair is admitted.",
      ],
      [
        "Assigned feature lead",
        "`f6_state_navigation_lead` — the activation merge and approved plan are integrated; the lead may execute the approved task graph and must stop after `VERIFIED` for coordinator review, feature PR/CI, and Human Gate B.",
      ],
      [
        "Ownership",
        "The coordinator exclusively owns `AGENTS.md`, `ROADMAP.md`, `README.md`, `tests/foundation-contract.test.ts`, authoritative status/evidence, review, CI, PRs, merges, and post-merge CodeGraph maintenance. The F6 feature lead exclusively owns F6-scoped state-official domain, source fixture, OpenStates adapter, policy, cache, service, provider, persistence, government-level navigation, style, unit/integration/E2E, `PROJECT-MAP.md`, and `TEMPORARY.md` surfaces in the isolated F6 worktree after Gate A. Existing saved-residence and federal-official contracts are consumption boundaries; any modification must be named in the Gate A-approved task graph. Every later roadmap item remains frozen, and shared CI or unrelated generated artifacts remain unmodified unless a coordinator record explicitly assigns them.",
      ],
      [
        "Merge order",
        "F6 feature PR → post-merge verification on `main` → F6 closeout PR/CI/merge. No later item activates automatically.",
      ],
      [
        "Feature PR/CI",
        "Pending; implementation, `VERIFIED`, and independent review precede the feature PR.",
      ],
      ["Blockers", "None."],
      ["Feature merge", "Pending."],
      ["Post-merge evidence", "Pending."],
      ["Closeout PR/CI/merge", "Pending."],
      [
        "Next Human Gate",
        "Human Gate B — after `VERIFIED`, successful feature PR CI, mergeability, and independent review, approve or reject the delivered behavior before merge.",
      ],
    ])
    const expectF6CoordinationFields = (item: string) => {
      for (const [field, expected] of expectedF6CoordinationFields) {
        expect(readCoordinationField(item, field), "F6 " + field).toBe(expected)
      }
    }

    expectF6CoordinationFields(f6)
    expect(f6).toContain(
      "[PR #23](https://github.com/Aheadboat/voteGPT/pull/23)",
    )
    expect(f6).toContain("30611790622")
    expect(f6).toContain("30611800273")
    expect(f6).toContain("4d50a417c3a613453d5832218c5abd467f2b93b0")
    expect(f6).toContain("9f77d15d2ef15ab411fadebd2c688a2f217886e5")
    expect(f6).toContain("CLEAN")
    expect(f6).toContain("MERGEABLE")
    expect(f6).toContain("codegraph status --json .")
    expect(f6).toContain("**F6-T1 RED/GREEN/review evidence:**")
    expect(f6).toContain("43c9b0b00ae810c27ec587d93fd786e24511a941")
    expect(f6).toContain("5581edc645729fd74cde8ae720ed9e0175406e76")
    expect(f6).toContain("f9f10a3f59d5f796ebdc1937fe18f95f1e2fa049")
    expect(f6).toContain("c1ed4a3b77191ff679936961b3b6b7133d96d366")
    expect(f6).toContain("a58e64f9c46a73639a45130fc680f8279e35da56")
    expect(f6).toContain("18/18")
    expect(f6).toContain("**F6-T2 RED/GREEN/review evidence:**")
    expect(f6).toContain("090c865abe4c43abc7b77eee15a6cf44e50b725e")
    expect(f6).toContain("d3f29429ad844862941af51eb30c8680b1a206eb")
    expect(f6).toContain("1402e4cd8e3b2d4ab28c2cd471b802302e64ed6c")
    expect(f6).toContain("471d13721a4117e9fb7efe8ca5d9740f02229a1c")
    expect(f6).toContain("server-only@0.0.1")
    expect(f6).toContain("50-state institutional host policy")
    expect(f6).toContain("public legislative query-key allowlist")
    expect(f6).toContain("29/29")
    expect(f6).toContain("32 files/767 tests")
    for (const [field, invalid] of [
      ["Branch", "`codex/f6-state-officials-navigation-wrong`"],
      [
        "Admission result",
        "`N/A` — F6 is the sole active item, but `PASS` is also approved.",
      ],
      [
        "Assigned feature lead",
        "`f6_state_navigation_lead_other` — dispatch may begin before activation merges.",
      ],
      [
        "Ownership",
        expectedF6CoordinationFields.get("Ownership") +
          " The coordinator may implement F6 production code.",
      ],
      [
        "Merge order",
        expectedF6CoordinationFields.get("Merge order") + " → G1 activation.",
      ],
      [
        "Feature PR/CI",
        "Not Pending; feature implementation may begin before Human Gate A.",
      ],
      ["Feature merge", "Not Pending."],
      [
        "Next Human Gate",
        "Human Gate A is approved — production work may begin.",
      ],
    ] as const) {
      const valid = expectedF6CoordinationFields.get(field)
      expect(valid, "missing mutation field " + field).toBeDefined()
      const marker = `- **${field}:** ${valid}`
      expect(f6, "missing mutation marker " + field).toContain(marker)
      const mutated = f6.replace(marker, `- **${field}:** ${invalid}`)
      expect(
        () => expectF6CoordinationFields(mutated),
        field + " mutation must fail",
      ).toThrow()
    }
    const f6Ownership = readCoordinationField(f6, "Ownership")
    const f6FeatureLeadOwnershipStart = f6Ownership.indexOf(
      "The F6 feature lead exclusively owns",
    )
    const frozenLaterItemsStart = f6Ownership.indexOf(
      "Every later roadmap item remains frozen",
    )

    expect(f6FeatureLeadOwnershipStart).toBeGreaterThan(0)
    expect(frozenLaterItemsStart).toBeGreaterThan(f6FeatureLeadOwnershipStart)
    const f6CoordinatorOwnership = f6Ownership.slice(
      0,
      f6FeatureLeadOwnershipStart,
    )
    const f6FeatureLeadOwnership = f6Ownership.slice(
      f6FeatureLeadOwnershipStart,
      frozenLaterItemsStart,
    )
    expect(f6CoordinatorOwnership).toContain(
      "The coordinator exclusively owns",
    )
    for (const coordinatorFile of [
      "AGENTS.md",
      "ROADMAP.md",
      "README.md",
      "tests/foundation-contract.test.ts",
    ]) {
      expect(f6CoordinatorOwnership).toContain(coordinatorFile)
    }
    for (const featureSurface of [
      "state-official",
      "government-level navigation",
      "OpenStates",
      "PROJECT-MAP.md",
      "TEMPORARY.md",
    ]) {
      expect(f6FeatureLeadOwnership).toContain(featureSurface)
    }
    const f6MergeOrder = readCoordinationField(f6, "Merge order")
    expectTokensInOrder(f6MergeOrder, [
      "F6 feature PR",
      "post-merge verification on `main`",
      "F6 closeout PR/CI/merge",
      "No later item activates automatically",
    ])
    for (const item of [f4, f5]) {
      expect(readCoordinationField(item, "Admission result")).toContain(
        "CONDITIONAL",
      )
      expect(
        readCoordinationField(item, "Base commit").replace(/`/g, ""),
      ).toBe(recoveryBase)
      expect(
        readCoordinationField(item, "Integrated-main commit").replace(/`/g, ""),
      ).toMatch(/^[0-9a-f]{40}$/i)
      expect(item).toContain("Human Gate A approved on 2026-07-21")
    }
    expect(readCoordinationField(f4, "Branch")).toContain(
      "codex/f4-main-recovery",
    )
    expect(readCoordinationField(f5, "Branch")).toContain(
      "codex/f5-main-recovery",
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
      "F4 exclusively owns the encryption-key configuration and the externally provisioned E2E-database marker resource",
    )
    expect(f4Ownership).toContain(".github/workflows/ci.yml")
    expect(f4Ownership).toContain(
      "externally provisioned E2E-database marker resource",
    )
    expect(f5Ownership).toContain(
      "F5 exclusively owns the Congress.gov request/configuration external resource",
    )
    expect(f4Ownership).toContain("other generated artifacts remain frozen")
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

  it("records the approved F6 Gate A plan without starting implementation", () => {
    const roadmap = readRepositoryFile("ROADMAP.md")
    const f6 = readRoadmapItem(roadmap, "F6")

    expect(f6).toContain("**Applicable UX DNA IDs:**")
    for (const id of [
      "UX-01",
      "UX-02",
      "UX-04",
      "UX-05",
      "UX-06",
      "UX-07",
      "UX-08",
      "UX-09",
    ]) {
      expect(f6, "F6 must map " + id).toContain(id)
    }
    expect(f6).toContain(
      "UX-03 is not applicable because F6 presents officials, not candidates",
    )
    for (const field of [
      "**Recommended design:**",
      "**Provider and privacy interface:**",
      "**Data and freshness interface:**",
      "**Navigation and recovery interface:**",
      "**Alternatives rejected:**",
      "**Parallel lanes:**",
      "**Risks and decisions:**",
      "**UX evidence plan:**",
    ]) {
      expect(f6).toContain(field)
    }
    expect(f6).toContain("https://docs.openstates.org/api-v3/")
    expect(f6).toContain("https://v3.openstates.org/openapi.json")
    expect(f6).toContain("API v3 `/people`")
    expect(f6).toContain("`X-API-KEY`")
    expect(f6).toContain("`/people.geo` is forbidden")
    expect(f6).toContain("zero people means `unknown`, never `vacant`")
    expect(f6).toContain("default selection remains `Federal`")
    expect(f6).toContain("Elections")
    expect(f6).toContain("F7")
    expect(f6).toContain("verified local provider")
    expect(f6).toContain("### Tests-first task graph")
    expect(f6).toContain(
      "| Task | Outcome | Expected RED | Files/interfaces | Depends on | Focused check | Done |",
    )
    expectTokensInOrder(f6, [
      "| T1 |",
      "| T2 |",
      "| T3 |",
      "| T4 |",
      "| T5 |",
      "| T6 |",
    ])
    for (const command of [
      "npm.cmd test -- src/lib/state-officials.test.ts",
      "npm.cmd test -- src/lib/openstates.test.ts",
      "npm.cmd run test:postgres -- integration/state-official-cache.test.ts",
      "npm.cmd test -- src/components/government-navigation.test.tsx",
      "npm.cmd test -- src/components/state-officials.test.tsx src/app/dashboard/page.test.tsx",
      "npm.cmd run check",
      "npm.cmd run test:e2e",
    ]) {
      expect(f6).toContain(command)
    }
    expect(f6).toContain("375px")
    expect(f6).toContain("1280px")
    expect(f6).toContain(
      "**Human Gate A approval:** Approved by the user on 2026-07-31",
    )
    expect(f6).not.toContain("Human Gate A candidate")
    expect(readCoordinationField(f6, "Next Human Gate")).toContain(
      "Human Gate B",
    )
  })
})
