import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = process.cwd()
const expectedG1GovernanceSnapshots = {
  "README.md":
    "a31c9a633916534599b7e0b89242b96ad0928b0a932545c2f230f00e53c0ab6a",
  "ROADMAP.md":
    "ac1037e41be3f95a43640ccb6beb8b57250c00b83c99b94fc3beb75544a7ce2e",
} as const
const expectedG1NonGovernanceSnapshot =
  "afdb1ddf08bf45ac5272cc921e7b334d1cd8b60423b558b9a0b87dad3b920884"
const g1ImplementationHead = "5e51e85f7a48935bf9d6e4e873996195963c8926"
const g1IntegratedMain = "d4e1f2d411847b44ab1d50996d0ded22cba218c3"
const g1FeaturePr = "28"
const g1InitialPushRun = "33361506030"
const g1InitialPullRequestRun = "33361531224"
const g1VerifiedFeatureEvidence =
  "[PR #28](https://github.com/Aheadboat/voteGPT/pull/28) contains immutable implementation evidence at reviewed head `5e51e85f7a48935bf9d6e4e873996195963c8926`. Exact-head push [run `33361506030`](https://github.com/Aheadboat/voteGPT/actions/runs/33361506030) and pull-request [run `33361531224`](https://github.com/Aheadboat/voteGPT/actions/runs/33361531224) each passed migrations, 3/3 PostgreSQL files with 37/37 tests, 37/37 non-E2E files with 1308/1308 tests, typecheck, zero-warning lint, production build, 26/26 Chromium journeys, and both disposable-database drops. GitHub reported that head `CLEAN` and `MERGEABLE`; independent blocker-resolution review of the exact diff found no unresolved Critical, Important, or Minor finding. No formal GitHub review object is claimed. The coordinator-only G1-T8 guard is added on top; its final PR head must pass fresh exact-head hosted CI, renewed independent review, and mergeability before Human Gate B."
const g1Blockers =
  "None for the approved G1 scope. G1-T5/T6 vendor outreach, credentials, data, legal rights, quote, spend, and production enablement remain unauthorized, and F7 remains inactive; reopening the decision or taking any external action requires separate explicit approval."
const g1NextGate =
  "Human Gate B — after offline G1-T1 through G1-T4/G1-T7 reach `VERIFIED`, the feature PR has successful hosted CI and mergeability, and independent review has no unresolved Critical or Important finding, approve or reject the delivered behavior before merge. G1-T5/T6 external vendor actions remain separately unapproved."
const g1VerifiedReadmeStatus =
  "## Status\n\nR0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, F3 — Residence Resolution Preview, F4 — Consented Saved Residence, and F5 — Federal Officials are complete on `main` through their required closeout merges. R1 — Concurrent Roadmap Delivery Contract is complete. R2 — Repository Context and Hygiene Contract is complete. F6 — State Officials and Government-Level Navigation is complete on `main` through [feature PR #24](https://github.com/Aheadboat/voteGPT/pull/24) and its required status-only closeout. G1 — Candidate-Data Vendor Proof of Concept is active in `VERIFIED` on [feature PR #28](https://github.com/Aheadboat/voteGPT/pull/28) at immutable reviewed implementation head `5e51e85f7a48935bf9d6e4e873996195963c8926`; both exact-head hosted CI triggers passed, GitHub reported `CLEAN` and `MERGEABLE`, and independent exact-diff review found no unresolved Critical, Important, or Minor finding. The coordinator-only G1-T8 lifecycle guard is added on top, and its final PR head still requires fresh exact-head hosted CI, renewed independent review, and mergeability before Human Gate B; G1 has not merged and is not `DONE`. Its durable decision remains a public-source-fallback `NO-GO (reopenable)`. F7 plus every later item remain `TODO` and inactive, and G1-T5/T6 external vendor actions remain unapproved.\n\n"
const g1VerifiedReadmeClause = g1VerifiedReadmeStatus
  .slice(g1VerifiedReadmeStatus.indexOf("G1 —"))
  .trim()

function g1CompletedReadmeClause(closeoutPr: string): string {
  return (
    "G1 — Candidate-Data Vendor Proof of Concept is complete on `main` through [feature PR #28](https://github.com/Aheadboat/voteGPT/pull/28) and required status-only [closeout PR #" +
    closeoutPr +
    "](https://github.com/Aheadboat/voteGPT/pull/" +
    closeoutPr +
    "); its durable decision remains `NO-GO (reopenable)`. F7 plus every later item remain `TODO` and inactive, and G1-T5/T6 external vendor actions remain unapproved."
  )
}

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8")
}

function governanceSha256(contents: string): string {
  return createHash("sha256")
    .update(normalizeGovernanceDocument(contents))
    .digest("hex")
}

function normalizeGovernanceDocument(contents: string): string {
  if (/\r(?!\n)/u.test(contents)) {
    throw new Error("Governance document contains a lone carriage return")
  }

  for (const character of contents) {
    if (
      /[\p{Z}\p{Cc}\p{Cf}]/u.test(character) &&
      !" \t\r\n".includes(character)
    ) {
      throw new Error("Governance document contains an unsafe separator")
    }
  }

  return contents.replace(/\r\n/g, "\n")
}

function expectG1GovernanceSnapshot(
  path: keyof typeof expectedG1GovernanceSnapshots,
  contents: string,
): void {
  expect(
    governanceSha256(contents),
    path + " exact G1 governance snapshot",
  ).toBe(expectedG1GovernanceSnapshots[path])
}

type G1GovernanceLifecycleContext = {
  changedFiles?: string[]
  preCloseoutReadme?: string
  preCloseoutRoadmap?: string
  readme: string
  roadmap: string
}

function replaceExactlyOnce(
  contents: string,
  before: string,
  after: string,
  label: string,
): string {
  const first = contents.indexOf(before)

  if (first === -1 || first !== contents.lastIndexOf(before)) {
    throw new Error("Expected exactly one " + label)
  }

  return (
    contents.slice(0, first) + after + contents.slice(first + before.length)
  )
}

function replaceCoordinationField(
  item: string,
  label: string,
  value: string,
): string {
  const current = `- **${label}:** ${readCoordinationField(item, label)}`
  return replaceExactlyOnce(
    item,
    current,
    `- **${label}:** ${value}`,
    "G1 coordination field " + label,
  )
}

function gitObjectSha(type: "blob" | "tree", contents: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`${type} ${contents.length}\0`, "utf8"))
    .update(contents)
    .digest("hex")
}

type GitCommitRecord = {
  message: string
  parents: string[]
  tree: string
}

function hasGitCommitObject(revision: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", revision + "^{commit}"], {
      cwd: repositoryRoot,
      stdio: "ignore",
    })
    return true
  } catch {
    return false
  }
}

function readGitCommitRecord(revision: string): GitCommitRecord {
  const contents = execFileSync(
    "git",
    ["cat-file", "-p", revision + "^{commit}"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  ).replace(/\r\n/g, "\n")
  const separator = contents.indexOf("\n\n")

  if (separator === -1) {
    throw new Error("Git commit has no header separator for " + revision)
  }

  const header = contents.slice(0, separator)
  const lines = header.split("\n")
  const treeLines = lines.filter((line) => line.startsWith("tree "))
  const parentLines = lines.filter((line) => line.startsWith("parent "))

  if (
    treeLines.length !== 1 ||
    !/^tree [0-9a-f]{40}$/.test(treeLines[0]) ||
    parentLines.some((line) => !/^parent [0-9a-f]{40}$/.test(line))
  ) {
    throw new Error("Invalid Git commit header for " + revision)
  }

  return {
    message: contents.slice(separator + 2),
    parents: parentLines.map((line) => line.slice("parent ".length)),
    tree: treeLines[0].slice("tree ".length),
  }
}

function readNullDelimitedGitPaths(arguments_: string[]): string[] {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
}

function expectOnlyG1GovernanceWorktreeChanges(): void {
  const paths = [
    ...readNullDelimitedGitPaths(["diff", "--name-only", "-z"]),
    ...readNullDelimitedGitPaths(["diff", "--cached", "--name-only", "-z"]),
    ...readNullDelimitedGitPaths([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]),
  ]

  for (const path of paths) {
    expect(
      ["README.md", "ROADMAP.md"],
      "G1 closeout worktree change: " + path,
    ).toContain(path)
  }
}

type GitHubLifecycleEvent = {
  after?: unknown
  before?: unknown
  number?: unknown
  pull_request?: {
    base?: { ref?: unknown; sha?: unknown }
    head?: {
      label?: unknown
      ref?: unknown
      repo?: { full_name?: unknown }
      sha?: unknown
    }
  }
}

type GitHubLifecycleContext = {
  event: GitHubLifecycleEvent
  eventName: string
  ref: string | undefined
  sha: string | undefined
}

type G1TerminalRuntime = {
  branch: string
  closeoutBranchTip?: string
  github?: GitHubLifecycleContext
  mainCommit: string
}

type G1TerminalBase = {
  commit: string
  topology: "ancestry" | "direct"
}

function readGitHubLifecycleContext(): GitHubLifecycleContext | undefined {
  const eventName = process.env.GITHUB_EVENT_NAME
  const eventPath = process.env.GITHUB_EVENT_PATH

  if (!eventName && !eventPath) {
    return undefined
  }
  if (!eventName || !eventPath) {
    throw new Error("Incomplete GitHub event context for G1 closeout")
  }

  return {
    event: JSON.parse(readFileSync(eventPath, "utf8")) as GitHubLifecycleEvent,
    eventName,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
  }
}

function ensureG1MainHistoryAvailable(): void {
  const shallow = execFileSync(
    "git",
    ["rev-parse", "--is-shallow-repository"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  ).trim()

  if (shallow === "false") {
    return
  }
  if (shallow !== "true") {
    throw new Error("Invalid Git shallow-repository state")
  }

  execFileSync(
    "git",
    [
      "fetch",
      "--no-tags",
      "--unshallow",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ],
    { cwd: repositoryRoot, stdio: "pipe" },
  )
}

function fetchG1CloseoutBranchTip(): string {
  execFileSync(
    "git",
    [
      "fetch",
      "--no-tags",
      "origin",
      "+refs/heads/codex/g1-closeout:refs/remotes/origin/codex/g1-closeout",
    ],
    { cwd: repositoryRoot, stdio: "pipe" },
  )
  return execFileSync(
    "git",
    ["rev-parse", "refs/remotes/origin/codex/g1-closeout"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  ).trim()
}

function readG1TerminalRuntime(): G1TerminalRuntime {
  const github = readGitHubLifecycleContext()
  ensureG1MainHistoryAvailable()
  const needsCloseoutTip =
    github?.eventName === "pull_request" ||
    (github?.eventName === "push" &&
      github.ref === "refs/heads/codex/g1-closeout")

  return {
    branch: execFileSync("git", ["branch", "--show-current"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    closeoutBranchTip: needsCloseoutTip
      ? fetchG1CloseoutBranchTip()
      : undefined,
    github,
    mainCommit: execFileSync("git", ["rev-parse", "refs/remotes/origin/main"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
  }
}

function expectG1TerminalEventAnchor(
  closeoutPr: string,
  terminalCommit: string,
  terminalRecord: GitCommitRecord,
  runtime: G1TerminalRuntime,
): G1TerminalBase {
  const { github } = runtime

  if (!github) {
    if (runtime.branch === "codex/g1-closeout") {
      expect(
        terminalRecord.parents.length,
        "local G1 closeout commit must have a parent",
      ).toBeGreaterThan(0)
      expectNonzeroSha(runtime.mainCommit, "local G1 closeout base")
      return { commit: runtime.mainCommit, topology: "ancestry" }
    }
    if (runtime.branch === "main") {
      expect(
        terminalRecord.parents,
        "local G1 closeout merge parents",
      ).toHaveLength(2)
      expect(terminalRecord.message.split("\n", 1)[0]).toBe(
        `Merge pull request #${closeoutPr} from Aheadboat/codex/g1-closeout`,
      )
      return { commit: terminalRecord.parents[0], topology: "direct" }
    }
    throw new Error("G1 terminal state is on an unsupported local branch")
  }

  expect(github.sha, "GitHub terminal SHA").toBe(terminalCommit)

  if (github.eventName === "pull_request") {
    expect(
      terminalRecord.parents,
      "G1 closeout pull-request merge parents",
    ).toHaveLength(2)
    expect(
      terminalRecord.parents[0],
      "G1 closeout pull-request base parent",
    ).toBe(github.event.pull_request?.base?.sha)
    expect(
      terminalRecord.parents[1],
      "G1 closeout pull-request head parent",
    ).toBe(github.event.pull_request?.head?.sha)
    expect(String(github.event.number), "G1 closeout pull request").toBe(
      closeoutPr,
    )
    expect(github.ref, "G1 closeout pull-request ref").toBe(
      `refs/pull/${closeoutPr}/merge`,
    )
    expect(github.event.pull_request?.base?.ref, "G1 closeout base ref").toBe(
      "main",
    )
    expect(github.event.pull_request?.head?.ref, "G1 closeout head ref").toBe(
      "codex/g1-closeout",
    )
    expect(
      github.event.pull_request?.head?.label,
      "G1 closeout head label",
    ).toBe("Aheadboat:codex/g1-closeout")
    expect(
      github.event.pull_request?.head?.repo?.full_name,
      "G1 closeout head repository",
    ).toBe("Aheadboat/voteGPT")
    expect(runtime.closeoutBranchTip, "G1 closeout remote branch tip").toBe(
      github.event.pull_request?.head?.sha,
    )
    const base = github.event.pull_request?.base?.sha

    if (typeof base !== "string") {
      throw new Error("Missing G1 closeout pull-request base SHA")
    }
    expectNonzeroSha(base, "G1 closeout pull-request base")
    return { commit: base, topology: "direct" }
  }

  if (github.eventName === "push") {
    expect(
      ["refs/heads/codex/g1-closeout", "refs/heads/main"],
      "G1 closeout push ref",
    ).toContain(github.ref)
    expect(github.event.after, "G1 closeout pushed SHA").toBe(terminalCommit)

    if (github.ref === "refs/heads/main") {
      expect(
        terminalRecord.parents,
        "G1 closeout main merge parents",
      ).toHaveLength(2)
      expect(github.event.before, "G1 closeout main predecessor").toBe(
        terminalRecord.parents[0],
      )
      expect(terminalRecord.message.split("\n", 1)[0]).toBe(
        `Merge pull request #${closeoutPr} from Aheadboat/codex/g1-closeout`,
      )
      const base = github.event.before

      if (typeof base !== "string") {
        throw new Error("Missing G1 closeout main predecessor")
      }
      expectNonzeroSha(base, "G1 closeout main predecessor")
      return { commit: base, topology: "direct" }
    }

    expect(
      terminalRecord.parents.length,
      "G1 closeout branch commit must have a parent",
    ).toBeGreaterThan(0)
    expect(runtime.closeoutBranchTip, "G1 closeout pushed branch tip").toBe(
      terminalCommit,
    )
    expectNonzeroSha(runtime.mainCommit, "G1 closeout branch base")
    return { commit: runtime.mainCommit, topology: "ancestry" }
  }

  throw new Error(
    "Unsupported GitHub event for G1 closeout: " + github.eventName,
  )
}

function expectG1TerminalGitAnchor(
  mergeCommit: string,
  firstParent: string,
  secondParent: string,
  mergeTree: string,
  closeoutPr: string,
  reconstructedRoadmap: string,
  reconstructedReadme: string,
): { readme: string; roadmap: string } {
  expectOnlyG1GovernanceWorktreeChanges()

  const runtime = readG1TerminalRuntime()
  const terminalCommit = readGitCommitRecord("HEAD")
  const terminalCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim()
  const closeout = expectG1TerminalEventAnchor(
    closeoutPr,
    terminalCommitSha,
    terminalCommit,
    runtime,
  )
  const closeoutBase = closeout.commit

  if (!hasGitCommitObject(mergeCommit) || !hasGitCommitObject(closeoutBase)) {
    throw new Error("G1 closeout requires the feature merge and base commits")
  }

  const featureMerge = readGitCommitRecord(mergeCommit)
  expect(featureMerge.parents, "G1 feature-merge parents").toEqual([
    firstParent,
    secondParent,
  ])
  expect(featureMerge.tree, "G1 feature-merge tree").toBe(mergeTree)

  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", mergeCommit, closeoutBase],
    { cwd: repositoryRoot, stdio: "pipe" },
  )
  if (closeout.topology === "direct") {
    expect(terminalCommit.parents[0], "G1 closeout direct base parent").toBe(
      closeoutBase,
    )
  } else {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", closeoutBase, terminalCommitSha],
      { cwd: repositoryRoot, stdio: "pipe" },
    )
  }
  expect(
    [
      ...new Set(
        readNullDelimitedGitPaths(["diff", "--name-only", "-z", closeoutBase]),
      ),
    ].sort(),
    "G1 closeout changed paths against its actual base",
  ).toEqual(["README.md", "ROADMAP.md"])

  const closeoutBaseRecord = readGitCommitRecord(closeoutBase)
  expect(
    reconstructedPreCloseoutTreeSha(reconstructedRoadmap, reconstructedReadme),
    "G1 closeout tree after reversing its two governance documents",
  ).toBe(closeoutBaseRecord.tree)

  const baseRoadmap = normalizeGovernanceDocument(
    execFileSync("git", ["show", closeoutBase + ":ROADMAP.md"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }),
  )
  const baseReadme = normalizeGovernanceDocument(
    execFileSync("git", ["show", closeoutBase + ":README.md"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }),
  )
  expect(reconstructedRoadmap, "G1 closeout base ROADMAP.md").toBe(baseRoadmap)
  expect(reconstructedReadme, "G1 closeout base README.md").toBe(baseReadme)

  return { readme: baseReadme, roadmap: baseRoadmap }
}

function reconstructedPreCloseoutTreeSha(
  roadmap: string,
  readme: string,
): string {
  const replacements = new Map([
    ["README.md", gitObjectSha("blob", Buffer.from(readme, "utf8"))],
    ["ROADMAP.md", gitObjectSha("blob", Buffer.from(roadmap, "utf8"))],
  ])
  const seen = new Set<string>()
  const entries = execFileSync("git", ["ls-tree", "-z", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(
        /^([0-9]{6}) (?:blob|tree|commit) ([0-9a-f]{40})\t([^\t\r\n]+)$/,
      )

      if (!match) {
        throw new Error("Invalid HEAD root-tree entry")
      }

      const [, printedMode, originalObject, path] = match
      const replacement = replacements.get(path)

      if (replacement) {
        seen.add(path)
      }

      const treeMode = printedMode.startsWith("0")
        ? printedMode.slice(1)
        : printedMode
      return Buffer.concat([
        Buffer.from(`${treeMode} ${path}\0`, "utf8"),
        Buffer.from(replacement ?? originalObject, "hex"),
      ])
    })

  expect([...seen].sort()).toEqual(["README.md", "ROADMAP.md"])
  return gitObjectSha("tree", Buffer.concat(entries))
}

let cachedG1NonGovernanceSnapshot: string | undefined

function readG1NonGovernanceSnapshot(): string {
  if (cachedG1NonGovernanceSnapshot) {
    return cachedG1NonGovernanceSnapshot
  }

  const snapshot = createHash("sha256")
  const entries = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)

  for (const entry of entries) {
    const match = entry.match(/^([0-9]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$/)

    if (!match || match[3] !== "0") {
      throw new Error("Invalid or conflicted tracked-file entry")
    }

    const [, mode, objectId, , path] = match

    if (path === "README.md" || path === "ROADMAP.md") {
      continue
    }

    snapshot.update(`${mode} ${path}\0`, "utf8")

    if (path === "tests/foundation-contract.test.ts") {
      const source = normalizeGovernanceDocument(
        readFileSync(resolve(repositoryRoot, path), "utf8"),
      )
      const normalizedSource = replaceExactlyOnce(
        source,
        `"${expectedG1NonGovernanceSnapshot}"`,
        '"<G1_NON_GOVERNANCE_SNAPSHOT>"',
        "G1 non-governance snapshot declaration",
      )
      snapshot.update(normalizedSource, "utf8")
    } else {
      snapshot.update(objectId, "utf8")
    }

    snapshot.update("\0", "utf8")
  }

  cachedG1NonGovernanceSnapshot = snapshot.digest("hex")
  return cachedG1NonGovernanceSnapshot
}

function expectNonzeroSha(value: string, label: string): void {
  expect(value, label).toMatch(/^[0-9a-f]{40}$/)
  expect(value, label + " must not be all zeroes").not.toMatch(/^0{40}$/)
}

function parseCanonicalDate(value: string, label: string): number {
  const timestamp = Date.parse(value + "T00:00:00.000Z")

  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid " + label)
  }

  return timestamp
}

function expectG1VerifiedState(
  roadmap: string,
  readme: string,
  exactSnapshots: boolean,
): void {
  if (exactSnapshots) {
    expect(
      readG1NonGovernanceSnapshot(),
      "exact G1 non-governance snapshot",
    ).toBe(expectedG1NonGovernanceSnapshot)
    expectG1GovernanceSnapshot("ROADMAP.md", roadmap)
    expectG1GovernanceSnapshot("README.md", readme)
  }

  const statuses = readRoadmapStatuses(roadmap)
  const item = readRoadmapItem(roadmap, "G1")
  const activeIds = [...statuses]
    .filter(([, status]) => status !== "TODO" && status !== "DONE")
    .map(([id]) => id)

  expect(statuses.get("G1")).toBe("VERIFIED")
  expect(activeIds).toEqual(["G1"])
  expect(item.split("\n", 1)[0]).toBe(
    "## G1 — Candidate-Data Vendor Proof of Concept [VERIFIED]",
  )
  expect(readCoordinationField(item, "Phase")).toBe("`VERIFIED`")
  expect(readCoordinationField(item, "Feature PR/CI")).toBe(
    g1VerifiedFeatureEvidence,
  )
  expect(readCoordinationField(item, "Blockers")).toBe(g1Blockers)
  expect(readCoordinationField(item, "Feature merge")).toBe("Pending.")
  expect(readCoordinationField(item, "Post-merge evidence")).toBe("Pending.")
  expect(readCoordinationField(item, "Closeout PR/CI/merge")).toBe("Pending.")
  expect(readCoordinationField(item, "Next Human Gate")).toBe(g1NextGate)
  const readmeStatus = readMarkdownSection(readme, "## Status")

  if (exactSnapshots) {
    expect(readmeStatus).toBe(g1VerifiedReadmeStatus)
  } else {
    expect(readmeStatus.split(g1VerifiedReadmeClause)).toHaveLength(2)
  }
  expect(item).toContain(
    "**Human Gate A approval:** The user approved the presented design and tests-first plan on 2026-08-15 PT.",
  )
  expect(item).toContain(
    "G1-T5/T6 outreach, credentials, terms, a trial, vendor data, a quote, spend, production use, and every later roadmap item remain unapproved",
  )

  for (const id of [
    "F7",
    "F8",
    "G2",
    "F9",
    "F10",
    "F11",
    "F12",
    "F13",
    "F14",
  ]) {
    expect(statuses.get(id), id + " must remain inactive").toBe("TODO")
  }
}

function expectG1GovernanceLifecycle({
  changedFiles: providedChangedFiles,
  preCloseoutReadme: providedPreCloseoutReadme,
  preCloseoutRoadmap: providedPreCloseoutRoadmap,
  readme,
  roadmap,
}: G1GovernanceLifecycleContext): boolean {
  const normalizedRoadmap = normalizeGovernanceDocument(roadmap)
  const normalizedReadme = normalizeGovernanceDocument(readme)
  const status = readRoadmapStatuses(normalizedRoadmap).get("G1")

  if (status === "VERIFIED") {
    expect(providedChangedFiles).toBeUndefined()
    expect(providedPreCloseoutReadme).toBeUndefined()
    expect(providedPreCloseoutRoadmap).toBeUndefined()
    expectG1VerifiedState(normalizedRoadmap, normalizedReadme, true)
    return true
  }

  if (status !== "DONE") {
    throw new Error("Unsupported G1 lifecycle status: " + String(status))
  }

  const providedContextCount = [
    providedChangedFiles,
    providedPreCloseoutReadme,
    providedPreCloseoutRoadmap,
  ].filter((value) => value !== undefined).length

  if (providedContextCount !== 0 && providedContextCount !== 3) {
    throw new Error("G1 closeout context must be complete or Git-derived")
  }

  const hasExplicitContext = providedContextCount === 3

  if (hasExplicitContext) {
    if (!providedChangedFiles) {
      throw new Error("G1 closeout requires the changed-file set")
    }

    expect(providedChangedFiles).toHaveLength(2)
    expect([...new Set(providedChangedFiles)].sort()).toEqual([
      "README.md",
      "ROADMAP.md",
    ])
  }

  const statuses = readRoadmapStatuses(normalizedRoadmap)
  const activeIds = [...statuses]
    .filter(([, itemStatus]) => itemStatus !== "TODO" && itemStatus !== "DONE")
    .map(([id]) => id)
  const item = readRoadmapItem(normalizedRoadmap, "G1")
  const featureEvidence = readCoordinationField(item, "Feature PR/CI")
  const featureMerge = readCoordinationField(item, "Feature merge")
  const postMerge = readCoordinationField(item, "Post-merge evidence")
  const closeout = readCoordinationField(item, "Closeout PR/CI/merge")
  const nextGate = readCoordinationField(item, "Next Human Gate")

  expect(activeIds).toEqual([])
  expect(item.split("\n", 1)[0]).toBe(
    "## G1 — Candidate-Data Vendor Proof of Concept [DONE]",
  )
  expect(readCoordinationField(item, "Phase")).toBe("`DONE`")
  expect(readCoordinationField(item, "Blockers")).toBe(g1Blockers)
  expect(item).toContain(
    "**Human Gate A approval:** The user approved the presented design and tests-first plan on 2026-08-15 PT.",
  )
  expect(statuses.get("F7")).toBe("TODO")

  const featureMatch = featureEvidence.match(
    /^\[PR #([1-9][0-9]*)\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/pull\/([1-9][0-9]*)\) merged after approved head `([0-9a-f]{40})` passed exact-head push \[run `([1-9][0-9]*)`\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/actions\/runs\/([1-9][0-9]*)\) and pull-request \[run `([1-9][0-9]*)`\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/actions\/runs\/([1-9][0-9]*)\); each passed migrations, 3\/3 PostgreSQL files with 37\/37 tests, 37\/37 non-E2E files with 1308\/1308 tests, typecheck, zero-warning lint, production build, 26\/26 Chromium journeys, and both disposable-database drops\. GitHub reported the approved head `CLEAN` and `MERGEABLE`; independent review found no unresolved Critical, Important, or Minor finding, and the user approved Human Gate B on ([0-9]{4}-[0-9]{2}-[0-9]{2})\.$/,
  )

  if (!featureMatch) {
    throw new Error("Invalid G1 terminal feature evidence")
  }

  const [
    ,
    featurePrLabel,
    featurePrUrl,
    approvedHead,
    pushRunLabel,
    pushRunUrl,
    pullRequestRunLabel,
    pullRequestRunUrl,
    gateBDate,
  ] = featureMatch
  expect(featurePrLabel).toBe(g1FeaturePr)
  expect(featurePrUrl).toBe(featurePrLabel)
  expectNonzeroSha(approvedHead, "G1 approved feature head")
  expect(approvedHead).not.toBe(g1ImplementationHead)
  expect(pushRunUrl).toBe(pushRunLabel)
  expect(pullRequestRunUrl).toBe(pullRequestRunLabel)
  expect(pushRunLabel).not.toBe(pullRequestRunLabel)
  expect([pushRunLabel, pullRequestRunLabel]).not.toContain(g1InitialPushRun)
  expect([pushRunLabel, pullRequestRunLabel]).not.toContain(
    g1InitialPullRequestRun,
  )

  const mergeMatch = featureMerge.match(
    /^\[PR #([1-9][0-9]*)\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/pull\/([1-9][0-9]*)\) merged to `main` as `([0-9a-f]{40})` on ([0-9]{4}-[0-9]{2}-[0-9]{2}) UTC; feature head `([0-9a-f]{40})` is reachable from `main`, and the merge commit has parents `([0-9a-f]{40})` and `([0-9a-f]{40})` with tree `([0-9a-f]{40})`\.$/,
  )

  if (!mergeMatch) {
    throw new Error("Invalid G1 feature merge evidence")
  }

  const [
    ,
    mergePrLabel,
    mergePrUrl,
    mergeCommit,
    mergeDate,
    mergedHead,
    firstParent,
    secondParent,
    mergeTree,
  ] = mergeMatch
  expect(mergePrLabel).toBe(g1FeaturePr)
  expect(mergePrUrl).toBe(mergePrLabel)
  expectNonzeroSha(mergeCommit, "G1 merge commit")
  expectNonzeroSha(mergedHead, "G1 merged feature head")
  expectNonzeroSha(firstParent, "G1 merge first parent")
  expectNonzeroSha(secondParent, "G1 merge second parent")
  expectNonzeroSha(mergeTree, "G1 merge tree")
  expect(
    new Set([mergeCommit, firstParent, secondParent, mergeTree]).size,
    "G1 merge commit, parents, and tree must be distinct Git objects",
  ).toBe(4)
  expect(mergedHead).toBe(approvedHead)
  expect(secondParent).toBe(approvedHead)
  expect(firstParent).toBe(g1IntegratedMain)
  expect(
    parseCanonicalDate(gateBDate, "G1 Gate B date"),
    "Human Gate B must precede or match the feature merge date",
  ).toBeLessThanOrEqual(parseCanonicalDate(mergeDate, "G1 merge date"))

  const postMergeMatch = postMerge.match(
    /^Exact merged `main` `([0-9a-f]{40})` passed local `npm\.cmd run check` \(37 files\/1308 tests plus typecheck, zero-warning lint, and production build\), `npm\.cmd run db:check`, the focused G1 contract \(363\/363\), and the required local E2E guard `E2E database requires explicit destructive opt-in\.` Hosted post-merge push \[run `([1-9][0-9]*)`\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/actions\/runs\/([1-9][0-9]*)\) passed migrations, 3\/3 PostgreSQL files with 37\/37 tests, 37\/37 non-E2E files with 1308\/1308 tests, 26\/26 Chromium journeys, and both disposable-database drops\. After merge, `codegraph sync \.` and `codegraph status --json \.` reported ([1-9][0-9]*(?:,[0-9]{3})*) files, ([1-9][0-9]*(?:,[0-9]{3})*) nodes, ([1-9][0-9]*(?:,[0-9]{3})*) edges, zero pending files, no worktree mismatch, and no reindex recommendation\.$/,
  )

  if (!postMergeMatch) {
    throw new Error("Invalid G1 post-merge evidence")
  }

  const [, postMergeMain, postMergeRunLabel, postMergeRunUrl] = postMergeMatch
  expectNonzeroSha(postMergeMain, "G1 post-merge main")
  expect(postMergeMain).toBe(mergeCommit)
  expect(postMergeRunUrl).toBe(postMergeRunLabel)
  expect(postMergeRunLabel).not.toBe(pushRunLabel)
  expect(postMergeRunLabel).not.toBe(pullRequestRunLabel)
  expect(postMergeRunLabel).not.toBe(g1InitialPushRun)
  expect(postMergeRunLabel).not.toBe(g1InitialPullRequestRun)

  const closeoutMatch = closeout.match(
    /^\[PR #([1-9][0-9]*)\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/pull\/([1-9][0-9]*)\) changes only `ROADMAP\.md` and `README\.md`; current-head hosted CI and its merge provide final closeout proof\.$/,
  )

  if (!closeoutMatch) {
    throw new Error("Invalid G1 closeout evidence")
  }

  const [, closeoutPrLabel, closeoutPrUrl] = closeoutMatch
  expect(closeoutPrUrl).toBe(closeoutPrLabel)
  expect(closeoutPrLabel).not.toBe(g1FeaturePr)
  expect(nextGate).toBe(
    "None; Human Gate B was approved before the feature merge, this closeout activates no later item, and G1 is complete only when this closeout merge reaches `main`.",
  )

  let reconstructedItem = replaceExactlyOnce(
    item,
    "## G1 — Candidate-Data Vendor Proof of Concept [DONE]",
    "## G1 — Candidate-Data Vendor Proof of Concept [VERIFIED]",
    "G1 lifecycle heading",
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Phase",
    "`VERIFIED`",
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Feature PR/CI",
    g1VerifiedFeatureEvidence,
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Feature merge",
    "Pending.",
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Post-merge evidence",
    "Pending.",
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Closeout PR/CI/merge",
    "Pending.",
  )
  reconstructedItem = replaceCoordinationField(
    reconstructedItem,
    "Next Human Gate",
    g1NextGate,
  )
  const reconstructedRoadmap = replaceExactlyOnce(
    normalizedRoadmap,
    item,
    reconstructedItem,
    "G1 roadmap item",
  )
  const expectedCompletedReadmeClause = g1CompletedReadmeClause(closeoutPrLabel)
  const completedReadmeStatus = readMarkdownSection(
    normalizedReadme,
    "## Status",
  )
  const reconstructedReadmeStatus = replaceExactlyOnce(
    completedReadmeStatus,
    expectedCompletedReadmeClause,
    g1VerifiedReadmeClause,
    "G1 README status clause",
  )
  const reconstructedReadme = replaceExactlyOnce(
    normalizedReadme,
    completedReadmeStatus,
    reconstructedReadmeStatus,
    "G1 README status section",
  )

  if (hasExplicitContext) {
    if (!providedPreCloseoutRoadmap || !providedPreCloseoutReadme) {
      throw new Error("G1 closeout requires both pre-closeout documents")
    }

    expect(normalizeGovernanceDocument(providedPreCloseoutRoadmap)).toBe(
      reconstructedRoadmap,
    )
    expect(normalizeGovernanceDocument(providedPreCloseoutReadme)).toBe(
      reconstructedReadme,
    )
    expectG1VerifiedState(reconstructedRoadmap, reconstructedReadme, true)
  } else {
    const base = expectG1TerminalGitAnchor(
      mergeCommit,
      firstParent,
      secondParent,
      mergeTree,
      closeoutPrLabel,
      reconstructedRoadmap,
      reconstructedReadme,
    )
    expectG1VerifiedState(base.roadmap, base.readme, false)
  }

  return true
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

  return new Map(matches.map(([, id, status]) => [id, status] as const))
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

type F6LifecycleContext = {
  activeIds: string[]
  item: string
  readme: string
  status: string
}

function expectF6Lifecycle({
  activeIds,
  item,
  readme,
  status,
}: F6LifecycleContext): boolean {
  if (status !== "VERIFIED" && status !== "DONE") {
    throw new Error("Unsupported F6 lifecycle status: " + status)
  }

  const isDone = status === "DONE"

  expect(activeIds).toEqual(isDone ? [] : ["F6"])
  expect(readCoordinationField(item, "Phase")).toBe(
    isDone ? "`DONE`" : "`VERIFIED`",
  )

  if (isDone) {
    const featurePr = readCoordinationField(item, "Feature PR/CI")
    const featureMerge = readCoordinationField(item, "Feature merge")
    const postMerge = readCoordinationField(item, "Post-merge evidence")
    const closeout = readCoordinationField(item, "Closeout PR/CI/merge")
    const nextGate = readCoordinationField(item, "Next Human Gate")

    expect(featurePr).toBe(
      "[PR #24](https://github.com/Aheadboat/voteGPT/pull/24) merged after approved head `5abf51039bb4cd1d8de1861b598e1555f14f9f59` passed exact-head push CI run `30724914634` and pull-request CI run `30724915679`; each passed migrations, 3 files/37 PostgreSQL tests, 35 files/944 non-E2E tests, 26/26 Chromium journeys, and both disposable-database drops. GitHub reported the approved head `CLEAN` and `MERGEABLE`; independent review found no unresolved Critical, Important, or Minor finding, and the user approved Human Gate B on 2026-08-02.",
    )
    expect(featureMerge).toBe(
      "[PR #24](https://github.com/Aheadboat/voteGPT/pull/24) merged to `main` as `8ba96b61aa51b76355066b990b06498079cee92e` on 2026-08-02 UTC; feature head `5abf51039bb4cd1d8de1861b598e1555f14f9f59` is reachable from `main`, and the merge commit has parents `9f77d15d2ef15ab411fadebd2c688a2f217886e5` and `5abf51039bb4cd1d8de1861b598e1555f14f9f59` with tree `db0d7406aecdeab678a8e38509ac5ca4ba432554`.",
    )
    expect(postMerge).toBe(
      "Exact merged `main` `8ba96b61aa51b76355066b990b06498079cee92e` passed local `npm.cmd run check` (35 files/944 tests plus typecheck, zero-warning lint, and production build), `npm.cmd run db:check`, the focused state-official cache contract (6 passed, 2 PostgreSQL-only skipped under PGlite), and the required local E2E guard `E2E database requires explicit destructive opt-in.` Hosted push [run `30764781792`](https://github.com/Aheadboat/voteGPT/actions/runs/30764781792) passed migrations, 3 files/37 PostgreSQL tests, 35 files/944 non-E2E tests, 26/26 Chromium journeys, and both disposable-database drops. After merge, `codegraph sync .` and `codegraph status --json .` reported 102 files, 2,125 nodes, 7,953 edges, zero pending files, no worktree mismatch, and no reindex recommendation.",
    )
    const closeoutMatch = closeout.match(
      /^\[PR #(\d+)\]\(https:\/\/github\.com\/Aheadboat\/voteGPT\/pull\/(\d+)\) changes only `ROADMAP\.md` and `README\.md`; current-head hosted CI and its merge provide final closeout proof\.$/,
    )
    expect(closeoutMatch, "exact F6 closeout evidence").not.toBeNull()
    expect(closeoutMatch?.[1], "matching F6 closeout PR numbers").toBe(
      closeoutMatch?.[2],
    )
    expect(nextGate).toBe(
      "None; Human Gate B was approved before the feature merge, this closeout activates no later item, and F6 is complete only when this closeout merge reaches `main`.",
    )
    expect(readme).toContain(
      "F6 — State Officials and Government-Level Navigation is complete on `main` through [feature PR #24](https://github.com/Aheadboat/voteGPT/pull/24) and its required status-only closeout",
    )

    return true
  }

  expect(readCoordinationField(item, "Feature PR/CI")).toBe(
    "Draft [PR #24](https://github.com/Aheadboat/voteGPT/pull/24) contains feature implementation review head `3debae081b42747647b5158dc08be32aef7471d6`; its exact-head push CI run `30724661629` and pull-request CI run `30724663357` each passed migrations, 3 files/37 PostgreSQL tests, 35 files/944 non-E2E tests, 26/26 Chromium journeys, and both disposable-database drops. GitHub reported that implementation head `CLEAN` and `MERGEABLE`; independent whole-branch re-review found no unresolved Critical, Important, or Minor finding. The PR remains draft pending Human Gate B, and the coordinator-only `VERIFIED` record on top must pass its own current-head hosted CI before presentation.",
  )
  expect(readCoordinationField(item, "Feature merge")).toBe("Pending.")
  expect(readCoordinationField(item, "Post-merge evidence")).toBe("Pending.")
  expect(readCoordinationField(item, "Closeout PR/CI/merge")).toBe("Pending.")
  expect(readCoordinationField(item, "Next Human Gate")).toBe(
    "Human Gate B — after `VERIFIED`, successful feature PR CI, mergeability, and independent review, approve or reject the delivered behavior before merge.",
  )
  expect(readme).toContain("F6 is VERIFIED on draft PR #24")
  expect(readme).toContain("both exact-head hosted CI triggers passed")
  expect(readme).toContain(
    "Human Gate B is next; F6 has not merged and is not `DONE`",
  )

  return isDone
}

describe("development foundation", () => {
  it("permits named environment variables only when their values are empty", () => {
    expect(findUnsafeEnvironmentEntries("CIVIC_PROVIDER_URL=\n")).toEqual([])
    expect(
      findUnsafeEnvironmentEntries("CIVIC_PROVIDER_URL=https://example.com\n"),
    ).toEqual(["CIVIC_PROVIDER_URL=https://example.com"])
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
    const executableCommands = [...workflow.matchAll(/^\s*run:\s*(.+?)\s*$/gm)]
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
    const capabilities = readMarkdownSection(projectMap, "## Capability routes")
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
      expect(
        existsSync(resolve(repositoryRoot, path)),
        path + " must resolve",
      ).toBe(true)
      expect(
        trackedFiles.has(path),
        path + " must be tracked current code",
      ).toBe(true)
    }
    expect(
      [...trackedFiles].filter(
        (path) => path !== "PROJECT-MAP.md" && path.endsWith("/PROJECT-MAP.md"),
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
    expectTokensInOrder(context, ["PROJECT-MAP.md", "CodeGraph", "scoped `rg`"])
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
  const buildG1CompletedProjection = (
    preCloseoutRoadmap: string,
    preCloseoutReadme: string,
  ) => {
    const verifiedItem = readRoadmapItem(preCloseoutRoadmap, "G1")
    const replaceField = (
      item: string,
      label: string,
      value: string,
    ): string => {
      const current = `- **${label}:** ${readCoordinationField(item, label)}`
      expect(item, `missing G1 coordination field: ${label}`).toContain(current)
      return item.replace(current, `- **${label}:** ${value}`)
    }
    const approvedHead = "1111111111111111111111111111111111111111"
    const mergeCommit = "2222222222222222222222222222222222222222"
    const mergeTree = reconstructedPreCloseoutTreeSha(
      preCloseoutRoadmap,
      preCloseoutReadme,
    )
    let completedItem = verifiedItem.replace(
      "## G1 — Candidate-Data Vendor Proof of Concept [VERIFIED]",
      "## G1 — Candidate-Data Vendor Proof of Concept [DONE]",
    )

    completedItem = replaceField(completedItem, "Phase", "`DONE`")
    completedItem = replaceField(
      completedItem,
      "Feature PR/CI",
      `[PR #28](https://github.com/Aheadboat/voteGPT/pull/28) merged after approved head \`${approvedHead}\` passed exact-head push [run \`40000000001\`](https://github.com/Aheadboat/voteGPT/actions/runs/40000000001) and pull-request [run \`40000000002\`](https://github.com/Aheadboat/voteGPT/actions/runs/40000000002); each passed migrations, 3/3 PostgreSQL files with 37/37 tests, 37/37 non-E2E files with 1308/1308 tests, typecheck, zero-warning lint, production build, 26/26 Chromium journeys, and both disposable-database drops. GitHub reported the approved head \`CLEAN\` and \`MERGEABLE\`; independent review found no unresolved Critical, Important, or Minor finding, and the user approved Human Gate B on 2026-09-01.`,
    )
    completedItem = replaceField(
      completedItem,
      "Feature merge",
      `[PR #28](https://github.com/Aheadboat/voteGPT/pull/28) merged to \`main\` as \`${mergeCommit}\` on 2026-09-01 UTC; feature head \`${approvedHead}\` is reachable from \`main\`, and the merge commit has parents \`d4e1f2d411847b44ab1d50996d0ded22cba218c3\` and \`${approvedHead}\` with tree \`${mergeTree}\`.`,
    )
    completedItem = replaceField(
      completedItem,
      "Post-merge evidence",
      `Exact merged \`main\` \`${mergeCommit}\` passed local \`npm.cmd run check\` (37 files/1308 tests plus typecheck, zero-warning lint, and production build), \`npm.cmd run db:check\`, the focused G1 contract (363/363), and the required local E2E guard \`E2E database requires explicit destructive opt-in.\` Hosted post-merge push [run \`40000000003\`](https://github.com/Aheadboat/voteGPT/actions/runs/40000000003) passed migrations, 3/3 PostgreSQL files with 37/37 tests, 37/37 non-E2E files with 1308/1308 tests, 26/26 Chromium journeys, and both disposable-database drops. After merge, \`codegraph sync .\` and \`codegraph status --json .\` reported 112 files, 2300 nodes, 8400 edges, zero pending files, no worktree mismatch, and no reindex recommendation.`,
    )
    completedItem = replaceField(
      completedItem,
      "Closeout PR/CI/merge",
      "[PR #29](https://github.com/Aheadboat/voteGPT/pull/29) changes only `ROADMAP.md` and `README.md`; current-head hosted CI and its merge provide final closeout proof.",
    )
    completedItem = replaceField(
      completedItem,
      "Next Human Gate",
      "None; Human Gate B was approved before the feature merge, this closeout activates no later item, and G1 is complete only when this closeout merge reaches `main`.",
    )
    const completedRoadmap = preCloseoutRoadmap.replace(
      verifiedItem,
      completedItem,
    )
    const verifiedStatus = readMarkdownSection(preCloseoutReadme, "## Status")
    const completedStatus = replaceExactlyOnce(
      verifiedStatus,
      g1VerifiedReadmeClause,
      g1CompletedReadmeClause("29"),
      "synthetic G1 README status clause",
    )
    const completedReadme = replaceExactlyOnce(
      preCloseoutReadme,
      verifiedStatus,
      completedStatus,
      "synthetic G1 README status section",
    )

    expect(completedRoadmap).not.toBe(preCloseoutRoadmap)
    expect(completedReadme).not.toBe(preCloseoutReadme)

    return { completedReadme, completedRoadmap }
  }

  it("accepts the exact F6 closeout lifecycle without activating a later item", () => {
    const completedItem = [
      "## F6 — State Officials and Government-Level Navigation [DONE]",
      "",
      "### Coordination record",
      "",
      "- **Phase:** `DONE`",
      "- **Feature PR/CI:** [PR #24](https://github.com/Aheadboat/voteGPT/pull/24) merged after approved head `5abf51039bb4cd1d8de1861b598e1555f14f9f59` passed exact-head push CI run `30724914634` and pull-request CI run `30724915679`; each passed migrations, 3 files/37 PostgreSQL tests, 35 files/944 non-E2E tests, 26/26 Chromium journeys, and both disposable-database drops. GitHub reported the approved head `CLEAN` and `MERGEABLE`; independent review found no unresolved Critical, Important, or Minor finding, and the user approved Human Gate B on 2026-08-02.",
      "- **Feature merge:** [PR #24](https://github.com/Aheadboat/voteGPT/pull/24) merged to `main` as `8ba96b61aa51b76355066b990b06498079cee92e` on 2026-08-02 UTC; feature head `5abf51039bb4cd1d8de1861b598e1555f14f9f59` is reachable from `main`, and the merge commit has parents `9f77d15d2ef15ab411fadebd2c688a2f217886e5` and `5abf51039bb4cd1d8de1861b598e1555f14f9f59` with tree `db0d7406aecdeab678a8e38509ac5ca4ba432554`.",
      "- **Post-merge evidence:** Exact merged `main` `8ba96b61aa51b76355066b990b06498079cee92e` passed local `npm.cmd run check` (35 files/944 tests plus typecheck, zero-warning lint, and production build), `npm.cmd run db:check`, the focused state-official cache contract (6 passed, 2 PostgreSQL-only skipped under PGlite), and the required local E2E guard `E2E database requires explicit destructive opt-in.` Hosted push [run `30764781792`](https://github.com/Aheadboat/voteGPT/actions/runs/30764781792) passed migrations, 3 files/37 PostgreSQL tests, 35 files/944 non-E2E tests, 26/26 Chromium journeys, and both disposable-database drops. After merge, `codegraph sync .` and `codegraph status --json .` reported 102 files, 2,125 nodes, 7,953 edges, zero pending files, no worktree mismatch, and no reindex recommendation.",
      "- **Closeout PR/CI/merge:** [PR #26](https://github.com/Aheadboat/voteGPT/pull/26) changes only `ROADMAP.md` and `README.md`; current-head hosted CI and its merge provide final closeout proof.",
      "- **Next Human Gate:** None; Human Gate B was approved before the feature merge, this closeout activates no later item, and F6 is complete only when this closeout merge reaches `main`.",
    ].join("\n")
    const completedReadme =
      "F6 — State Officials and Government-Level Navigation is complete on `main` through [feature PR #24](https://github.com/Aheadboat/voteGPT/pull/24) and its required status-only closeout; G1 and every later item remain `TODO` and inactive."

    expect(
      expectF6Lifecycle({
        activeIds: [],
        item: completedItem,
        readme: completedReadme,
        status: "DONE",
      }),
    ).toBe(true)
    expect(() =>
      expectF6Lifecycle({
        activeIds: ["G1"],
        item: completedItem,
        readme: completedReadme,
        status: "DONE",
      }),
    ).toThrow()
    expect(() =>
      expectF6Lifecycle({
        activeIds: [],
        item: completedItem,
        readme: completedReadme,
        status: "TODO",
      }),
    ).toThrow("Unsupported F6 lifecycle status: TODO")
    for (const [valid, invalid] of [
      ["- **Phase:** `DONE`", "- **Phase:** `VERIFIED`"],
      [
        "the user approved Human Gate B",
        "the user did not approve Human Gate B",
      ],
      ["merged to `main`", "has not merged to `main`"],
      [
        "Hosted push [run `30764781792`]",
        "Hosted push [run `30764781792`] failed after",
      ],
      [
        "current-head hosted CI and its merge provide final closeout proof",
        "current-head hosted CI and its merge remain Pending",
      ],
      ["this closeout activates no later item", "this closeout activates G1"],
    ] as const) {
      const mutatedItem = completedItem.replace(valid, invalid)
      expect(
        mutatedItem,
        `missing F6 lifecycle mutation text: ${valid}`,
      ).not.toBe(completedItem)
      expect(() =>
        expectF6Lifecycle({
          activeIds: [],
          item: mutatedItem,
          readme: completedReadme,
          status: "DONE",
        }),
      ).toThrow()
    }
    expect(() =>
      expectF6Lifecycle({
        activeIds: [],
        item: completedItem,
        readme: completedReadme.replace("is complete", "is incomplete"),
        status: "DONE",
      }),
    ).toThrow()
  })

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
        admissionContract.match(/`PASS`(?:(?!`CONDITIONAL`)[^\n])*/)?.[0] ?? ""
      const conditional =
        admissionContract.match(/`CONDITIONAL`(?:(?!`FAIL`)[^\n])*/)?.[0] ?? ""
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
    expect(delegation).toContain("does not implement feature production code")
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

  it("keeps completed items closed and activates only G1", () => {
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
    ).toEqual(["DISCOVER/DESIGN/PLAN", "RED", "GREEN", "REFACTOR", "VERIFIED"])
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
    const liveG1Status = readRoadmapStatuses(roadmap).get("G1")
    expect(expectG1GovernanceLifecycle({ readme, roadmap })).toBe(true)
    const headRoadmap = normalizeGovernanceDocument(
      execFileSync("git", ["show", "HEAD:ROADMAP.md"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
    )
    const headReadme = normalizeGovernanceDocument(
      execFileSync("git", ["show", "HEAD:README.md"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
    )
    const headTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim()
    expect(readGitCommitRecord("HEAD").tree).toBe(headTree)
    expect(
      reconstructedPreCloseoutTreeSha(headRoadmap, headReadme),
      "root-tree reconstruction must match HEAD without parent history",
    ).toBe(headTree)

    for (const [path, current, mutated] of [
      [
        "ROADMAP.md",
        roadmap,
        roadmap + "\n- **Authorization:** F7 implementation is approved.",
      ],
      [
        "ROADMAP.md",
        roadmap,
        roadmap.replace(
          "## R0 — Durable Project Contract [DONE]",
          "## R0 — Durable Project Contract [TODO]",
        ),
      ],
      [
        "ROADMAP.md",
        roadmap,
        roadmap.replace(
          "## G1 — Candidate-Data Vendor Proof of Concept",
          "## **G1 — Candidate-Data Vendor Proof of Concept**",
        ),
      ],
      ["ROADMAP.md", roadmap, "<!--\n" + roadmap],
      [
        "README.md",
        readme,
        readme +
          "\n### Vendor access\n\nCredentialed production use is approved.",
      ],
      [
        "README.md",
        readme,
        readme + "\nStatus\n------\n\nVendor production access is approved.",
      ],
      ["README.md", readme, "<!--\n" + readme],
    ] as const) {
      expect(mutated, path + " mutation must change the document").not.toBe(
        current,
      )
      expect(() =>
        expectG1GovernanceLifecycle({
          readme: path === "README.md" ? mutated : readme,
          roadmap: path === "ROADMAP.md" ? mutated : roadmap,
        }),
      ).toThrow()
    }

    if (liveG1Status === "VERIFIED") {
      const preCloseoutRoadmap = normalizeGovernanceDocument(roadmap)
      const preCloseoutReadme = normalizeGovernanceDocument(readme)
      const { completedReadme, completedRoadmap } = buildG1CompletedProjection(
        preCloseoutRoadmap,
        preCloseoutReadme,
      )
      const changedFiles = ["README.md", "ROADMAP.md"]

      expect(
        expectG1GovernanceLifecycle({
          changedFiles,
          preCloseoutReadme,
          preCloseoutRoadmap,
          readme: completedReadme,
          roadmap: completedRoadmap,
        }),
      ).toBe(true)

      const syntheticBase = "3333333333333333333333333333333333333333"
      const syntheticCloseoutHead = "4444444444444444444444444444444444444444"
      const syntheticTerminal = "5555555555555555555555555555555555555555"
      const syntheticTree = "6666666666666666666666666666666666666666"
      const pullRequestRecord: GitCommitRecord = {
        message: "Synthetic pull-request merge\n",
        parents: [syntheticBase, syntheticCloseoutHead],
        tree: syntheticTree,
      }
      const pullRequestRuntime: G1TerminalRuntime = {
        branch: "",
        closeoutBranchTip: syntheticCloseoutHead,
        github: {
          event: {
            number: 29,
            pull_request: {
              base: { ref: "main", sha: syntheticBase },
              head: {
                label: "Aheadboat:codex/g1-closeout",
                ref: "codex/g1-closeout",
                repo: { full_name: "Aheadboat/voteGPT" },
                sha: syntheticCloseoutHead,
              },
            },
          },
          eventName: "pull_request",
          ref: "refs/pull/29/merge",
          sha: syntheticTerminal,
        },
        mainCommit: syntheticBase,
      }
      expect(
        expectG1TerminalEventAnchor(
          "29",
          syntheticTerminal,
          pullRequestRecord,
          pullRequestRuntime,
        ),
      ).toEqual({ commit: syntheticBase, topology: "direct" })

      const branchPushRecord: GitCommitRecord = {
        message: "Resolve closeout conflict\n",
        parents: [syntheticCloseoutHead, syntheticBase],
        tree: syntheticTree,
      }
      const branchPushRuntime: G1TerminalRuntime = {
        branch: "codex/g1-closeout",
        closeoutBranchTip: syntheticTerminal,
        github: {
          event: { after: syntheticTerminal, before: syntheticCloseoutHead },
          eventName: "push",
          ref: "refs/heads/codex/g1-closeout",
          sha: syntheticTerminal,
        },
        mainCommit: syntheticBase,
      }
      expect(
        expectG1TerminalEventAnchor(
          "29",
          syntheticTerminal,
          branchPushRecord,
          branchPushRuntime,
        ),
      ).toEqual({ commit: syntheticBase, topology: "ancestry" })

      const mainPushRecord: GitCommitRecord = {
        message:
          "Merge pull request #29 from Aheadboat/codex/g1-closeout\n\nG1 closeout\n",
        parents: [syntheticBase, syntheticCloseoutHead],
        tree: syntheticTree,
      }
      const mainPushRuntime: G1TerminalRuntime = {
        branch: "main",
        github: {
          event: { after: syntheticTerminal, before: syntheticBase },
          eventName: "push",
          ref: "refs/heads/main",
          sha: syntheticTerminal,
        },
        mainCommit: syntheticTerminal,
      }
      expect(
        expectG1TerminalEventAnchor(
          "29",
          syntheticTerminal,
          mainPushRecord,
          mainPushRuntime,
        ),
      ).toEqual({ commit: syntheticBase, topology: "direct" })

      for (const invalidAnchor of [
        () =>
          expectG1TerminalEventAnchor(
            "30",
            syntheticTerminal,
            pullRequestRecord,
            pullRequestRuntime,
          ),
        () =>
          expectG1TerminalEventAnchor(
            "29",
            syntheticTerminal,
            { ...pullRequestRecord, parents: [syntheticCloseoutHead] },
            pullRequestRuntime,
          ),
        () =>
          expectG1TerminalEventAnchor(
            "29",
            syntheticTerminal,
            pullRequestRecord,
            {
              ...pullRequestRuntime,
              closeoutBranchTip: syntheticBase,
            },
          ),
        () =>
          expectG1TerminalEventAnchor(
            "29",
            syntheticTerminal,
            branchPushRecord,
            {
              ...branchPushRuntime,
              github: {
                ...branchPushRuntime.github!,
                ref: "refs/heads/not-g1-closeout",
              },
            },
          ),
        () =>
          expectG1TerminalEventAnchor(
            "29",
            syntheticTerminal,
            { ...mainPushRecord, parents: [syntheticBase] },
            mainPushRuntime,
          ),
        () =>
          expectG1TerminalEventAnchor(
            "29",
            syntheticTerminal,
            { ...mainPushRecord, message: "Fabricated direct merge\n" },
            mainPushRuntime,
          ),
      ]) {
        expect(invalidAnchor).toThrow()
      }

      expect(() =>
        expectG1GovernanceLifecycle({
          readme: completedReadme,
          roadmap: completedRoadmap,
        }),
      ).toThrow()

      const mutateG1Item = (mutate: (item: string) => string): string => {
        const item = readRoadmapItem(completedRoadmap, "G1")
        const mutatedItem = mutate(item)
        expect(
          mutatedItem,
          "G1 terminal mutation must change the item",
        ).not.toBe(item)
        return replaceExactlyOnce(
          completedRoadmap,
          item,
          mutatedItem,
          "completed G1 item",
        )
      }
      const mutateG1Field = (
        label: string,
        mutate: (value: string) => string,
      ): string =>
        mutateG1Item((item) => {
          const value = readCoordinationField(item, label)
          const mutatedValue = mutate(value)
          expect(
            mutatedValue,
            label + " terminal mutation must change the field",
          ).not.toBe(value)
          return replaceCoordinationField(item, label, mutatedValue)
        })
      const replaceFieldText = (
        label: string,
        before: string,
        after: string,
      ): string =>
        mutateG1Field(label, (value) =>
          replaceExactlyOnce(value, before, after, label + " mutation target"),
        )
      const allZeroSha = "0000000000000000000000000000000000000000"
      const otherSha = "4444444444444444444444444444444444444444"
      const mismatchedTreeRoadmap = mutateG1Field("Feature merge", (value) =>
        value.replace(
          /with tree `[0-9a-f]{40}`\.$/,
          `with tree \`${otherSha}\`.`,
        ),
      )
      expect(() =>
        expectG1GovernanceLifecycle({
          readme: completedReadme,
          roadmap: mismatchedTreeRoadmap,
        }),
      ).toThrow()
      const terminalMutations: Array<{
        changedFiles?: string[]
        label: string
        readme?: string
        roadmap?: string
      }> = [
        {
          label: "zero feature PR",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "[PR #28](https://github.com/Aheadboat/voteGPT/pull/28)",
            "[PR #0](https://github.com/Aheadboat/voteGPT/pull/0)",
          ),
        },
        {
          label: "all-zero approved head",
          roadmap: mutateG1Item((item) =>
            item.replaceAll(
              "1111111111111111111111111111111111111111",
              allZeroSha,
            ),
          ),
        },
        {
          label: "push run URL mismatch",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "actions/runs/40000000001",
            "actions/runs/40000000009",
          ),
        },
        {
          label: "duplicate pre-merge run",
          roadmap: mutateG1Field("Feature PR/CI", (value) =>
            value.replaceAll("40000000002", "40000000001"),
          ),
        },
        {
          label: "zero push run",
          roadmap: mutateG1Field("Feature PR/CI", (value) =>
            value.replaceAll("40000000001", "0"),
          ),
        },
        {
          label: "zero PostgreSQL count",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "migrations, 3/3 PostgreSQL files",
            "migrations, 0/3 PostgreSQL files",
          ),
        },
        {
          label: "unequal Chromium count",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "26/26 Chromium journeys",
            "26/25 Chromium journeys",
          ),
        },
        {
          label: "post-merge count drift",
          roadmap: replaceFieldText(
            "Post-merge evidence",
            "37/37 non-E2E files with 1308/1308 tests",
            "37/37 non-E2E files with 1307/1308 tests",
          ),
        },
        {
          label: "malformed CodeGraph count",
          roadmap: replaceFieldText(
            "Post-merge evidence",
            "reported 112 files",
            "reported 1,,, files",
          ),
        },
        {
          label: "failed after passing",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "both disposable-database drops.",
            "both disposable-database drops, then failed.",
          ),
        },
        {
          label: "unresolved review finding",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "no unresolved Critical, Important, or Minor finding",
            "one unresolved Important finding",
          ),
        },
        {
          label: "negated Gate B approval",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "the user approved Human Gate B",
            "the user did not approve Human Gate B",
          ),
        },
        {
          label: "Gate B after merge",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "Human Gate B on 2026-09-01",
            "Human Gate B on 2026-09-02",
          ),
        },
        {
          label: "invalid Gate B date",
          roadmap: replaceFieldText(
            "Feature PR/CI",
            "Human Gate B on 2026-09-01",
            "Human Gate B on 2026-99-99",
          ),
        },
        {
          label: "pending feature merge",
          roadmap: mutateG1Field("Feature merge", () => "Pending."),
        },
        {
          label: "phase mismatch",
          roadmap: mutateG1Field("Phase", () => "`VERIFIED`"),
        },
        {
          label: "missing Gate A evidence",
          roadmap: mutateG1Item((item) =>
            replaceExactlyOnce(
              item,
              "**Human Gate A approval:** The user approved the presented design and tests-first plan on 2026-08-15 PT.",
              "**Human Gate A approval:** Missing.",
              "Gate A evidence",
            ),
          ),
        },
        {
          label: "duplicate coordination field",
          roadmap: mutateG1Item((item) =>
            replaceExactlyOnce(
              item,
              "- **Phase:** `DONE`",
              "- **Phase:** `DONE`\n- **Phase:** `DONE`",
              "G1 phase field",
            ),
          ),
        },
        {
          label: "merge PR mismatch",
          roadmap: replaceFieldText(
            "Feature merge",
            "[PR #28](https://github.com/Aheadboat/voteGPT/pull/28)",
            "[PR #27](https://github.com/Aheadboat/voteGPT/pull/27)",
          ),
        },
        {
          label: "merge second-parent mismatch",
          roadmap: replaceFieldText(
            "Feature merge",
            "and `1111111111111111111111111111111111111111` with tree",
            `and \`${otherSha}\` with tree`,
          ),
        },
        {
          label: "merge versus post-merge main mismatch",
          roadmap: replaceFieldText(
            "Post-merge evidence",
            "Exact merged `main` `2222222222222222222222222222222222222222`",
            `Exact merged \`main\` \`${otherSha}\``,
          ),
        },
        {
          label: "closeout equals feature PR",
          roadmap: mutateG1Field("Closeout PR/CI/merge", (value) =>
            value.replaceAll("29", "28"),
          ),
        },
        {
          label: "README closeout mismatch",
          readme: completedReadme.replaceAll(
            "closeout PR #29](https://github.com/Aheadboat/voteGPT/pull/29)",
            "closeout PR #30](https://github.com/Aheadboat/voteGPT/pull/30)",
          ),
        },
        {
          changedFiles: ["README.md", "ROADMAP.md", "AGENTS.md"],
          label: "extra changed file",
        },
        {
          label: "unrelated roadmap edit",
          roadmap: completedRoadmap.replace(
            "## R0 — Durable Project Contract [DONE]",
            "## R0 — Durable Project Contract [TODO]",
          ),
        },
        {
          label: "unrelated README edit",
          readme: completedReadme + "Unauthorized appendix.\n",
        },
        {
          label: "detached authority",
          roadmap:
            completedRoadmap +
            "\n- **Feature merge:** fabricated detached evidence.\n",
        },
        {
          label: "duplicate G1 heading",
          roadmap:
            completedRoadmap +
            "\n## G1 — Candidate-Data Vendor Proof of Concept [DONE]\n",
        },
        {
          label: "F7 activation",
          roadmap: completedRoadmap.replace(
            "## F7 — Elections and Deterministic Candidate Validity [TODO]",
            "## F7 — Elections and Deterministic Candidate Validity [IN PROGRESS (RED)]",
          ),
        },
        {
          label: "T5/T6 authorization",
          roadmap: replaceFieldText(
            "Blockers",
            "G1-T5/T6 vendor outreach, credentials, data, legal rights, quote, spend, and production enablement remain unauthorized",
            "G1-T5/T6 vendor outreach, credentials, data, legal rights, quote, spend, and production enablement are authorized",
          ),
        },
        { label: "BOM", roadmap: "\uFEFF" + completedRoadmap },
        { label: "lone carriage return", roadmap: completedRoadmap + "\rX" },
        {
          label: "non-breaking space",
          roadmap: completedRoadmap.replace("PR #29", "PR\u00A0#29"),
        },
        { label: "line separator", roadmap: "\u2028" + completedRoadmap },
        { label: "invisible separator", roadmap: "\u2063" + completedRoadmap },
        { label: "NUL", roadmap: "\u0000" + completedRoadmap },
      ]

      for (const mutation of terminalMutations) {
        const mutatedRoadmap = mutation.roadmap ?? completedRoadmap
        const mutatedReadme = mutation.readme ?? completedReadme
        const mutatedChangedFiles = mutation.changedFiles ?? changedFiles
        expect(
          mutatedRoadmap !== completedRoadmap ||
            mutatedReadme !== completedReadme ||
            mutatedChangedFiles !== changedFiles,
          mutation.label + " must change terminal input",
        ).toBe(true)
        expect(
          () =>
            expectG1GovernanceLifecycle({
              changedFiles: mutatedChangedFiles,
              preCloseoutReadme,
              preCloseoutRoadmap,
              readme: mutatedReadme,
              roadmap: mutatedRoadmap,
            }),
          mutation.label,
        ).toThrow()
      }
    }
    const implementationPlan = readRepositoryFile("R1-IMPLEMENTATION-PLAN.md")
    const recoveryDesign = readRepositoryFile("F4-F5-LEAN-RECOVERY-DESIGN.md")
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
      "G2",
    ]
    const activeIds = [...statuses]
      .filter(([, status]) => status !== "TODO" && status !== "DONE")
      .map(([id]) => id)
    const f4 = readRoadmapItem(roadmap, "F4")
    const f5 = readRoadmapItem(roadmap, "F5")
    const r2 = readRoadmapItem(roadmap, "R2")
    const f6 = readRoadmapItem(roadmap, "F6")
    const g1 = readRoadmapItem(roadmap, "G1")
    const f4Status = statuses.get("F4") ?? ""
    const f5Status = statuses.get("F5") ?? ""
    const r2Status = statuses.get("R2") ?? ""
    const f6Status = statuses.get("F6") ?? ""
    const g1Status = statuses.get("G1") ?? ""
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
    const r2IsDone = r2Status === "DONE"
    expectF6Lifecycle({
      activeIds: activeIds.filter((id) => id === "F6"),
      item: f6,
      readme,
      status: f6Status,
    })
    const expectedStatuses = new Map<string, string>([
      ["R0", "DONE"],
      ["F1", "DONE"],
      ["F2", "DONE"],
      ["F3", "DONE"],
      ["R1", "DONE"],
      ["F4", "DONE"],
      ["F5", "DONE"],
      ["R2", "DONE"],
      ["F6", "DONE"],
      ["G1", liveG1Status ?? ""],
      ["F7", "TODO"],
      ["F8", "TODO"],
      ["G2", "TODO"],
      ["F9", "TODO"],
      ["F10", "TODO"],
      ["F11", "TODO"],
      ["F12", "TODO"],
      ["F13", "TODO"],
      ["F14", "TODO"],
    ])
    expect([...statuses]).toEqual([...expectedStatuses])
    expect(activeIds).toEqual(g1Status === "DONE" ? [] : ["G1"])
    expect(["VERIFIED", "DONE"]).toContain(g1Status)
    expect(g1.split(/\r?\n/, 1)[0]).toBe(
      `## G1 — Candidate-Data Vendor Proof of Concept [${g1Status}]`,
    )
    expect(g1).toContain(
      "**Dependencies:** F6. The official comparison sample set is created and validated as G1-T1 rather than treated as an external prerequisite.",
    )
    expect(g1).toContain(
      "User approved creating the 100-record official comparison set as G1's first deliverable",
    )
    expect(g1).toContain("F7 plus every later item remain inactive")
    expect(g1).toContain(
      "No vendor credential, trial, quote, contract, spend, or production use is authorized by activation.",
    )
    expect(g1).toContain(
      "G1-T1 creates and validates that official comparison set before any vendor score is accepted.",
    )
    expect(g1).toContain(
      "Cell totals for federal-primary/federal-general/state-primary/state-general/local-primary/local-general are `17/17/17/16/16/17`",
    )
    for (const task of [
      "G1-T1 official comparison set",
      "G1-T2 deterministic evaluator",
      "G1-T3 rights and operations gate",
      "G1-T4 public-evidence decision",
      "G1-T5 separate vendor decision",
      "G1-T6 conditional adapter/evaluation",
      "G1-T7 verify and decide",
      "G1-T8 coordinator lifecycle guard",
    ]) {
      expect(g1).toContain("Task graph — " + task)
    }
    expect(g1).toContain(
      "Gate A approval does not authorize this task or any external action.",
    )
    expect(g1).toContain("`lifecycle_status=qualified|withdrawn|disqualified`")
    expect(g1).toContain(
      "Unicode lowercase while preserving punctuation, diacritics, suffixes, and word order",
    )
    expect(g1).toContain(
      "An identical issuer/namespace/value candidate identifier may match only when the exact jurisdiction/election-date/stage/office/district contest identity also matches",
    )
    expect(g1).toContain(
      "zero matched-row contradictions across identity, contest, level, jurisdiction, stage, office, district, lifecycle, appearance, or exact party-line set",
    )
    expect(g1).toContain(
      "Legal permissions and operational commitments are separate evidence records",
    )
    expect(g1).toContain(
      "current `NO-GO (reopenable)` for vendor data access and production",
    )
    expect(g1).toContain(
      "a new explicit user authorization for T6 RED/implementation",
    )
    expect(g1).toContain("completed T5 retaining NO-GO with no approved T6")
    expect(g1).toContain(
      "No terminal path is added now and no feature agent edits authority files.",
    )
    expect(g1).toContain(
      "**Human Gate A approval:** The user approved the presented design and tests-first plan on 2026-08-15 PT.",
    )
    expect(g1).toContain(
      "Approval authorizes RED/GREEN/REFACTOR/VERIFIED for offline G1-T1 through G1-T4 and G1-T7 only.",
    )
    expect(g1).toContain(
      "Feature-lead commit `7b85a0804eb7d2c7c30f48c745d82b36e9b81a81` added only `src/lib/candidate-vendor-evaluation.test.ts`.",
    )
    expect(g1).toContain(
      "Vite could not resolve the intentionally absent `./candidate-vendor-evaluation` module",
    )
    expect(g1).toContain(
      "Exact feature head `e648293e38323fa25d69f1fe9efd6233b3593a56` implements only the provider-neutral truth types",
    )
    expect(g1).toContain(
      "pass 189/189 cases covering exact plain/null-prototype data",
    )
    expect(g1).toContain(
      "Feature-lead commit `dff78f07a7fd0dcec0e62b912a74047538d4b8b1` changed only `src/lib/candidate-vendor-evaluation.test.ts`",
    )
    expect(g1).toContain(
      "sole new failure `TypeError: validateCandidateComparisonSet is not a function`",
    )
    expect(g1).toContain(
      "feature-lead commit `2acb075602fd22ee189894dd1e7fc440c28c8cd1` expanded only that test file",
    )
    expect(g1).toContain(
      "coordinator independently reproduced 189/240 existing cases passing and all 51 set cases failing only because `validateCandidateComparisonSet` was absent",
    )
    expect(g1).toContain(
      "No set implementation, fixture, source data, vendor/external action, or F7 surface exists before this recorded RED.",
    )
    expect(g1).toContain(
      "Feature-lead commit `45aaf3b876e5fe6717e7286b18bb7a3eeb2d75ed` implemented the provider-neutral exact-100 set boundary",
    )
    expect(g1).toContain(
      "Review-fix commit `17d81c2fdbce2c254b3a5d2fc5fa991915cd971a` compares full-precision instants without narrowing the accepted timestamp contract",
    )
    expect(g1).toContain(
      "Exact-head verification passed 243/243 focused cases, 36 files/1,188 full tests",
    )
    expect(g1).toContain(
      "The official 100-record fixture and its independent fact/source audit remain RED and pending, so G1 stays in `RED`",
    )
    expect(g1).toContain(
      "Fixture-only commit `f9f84f4e5b1b678fa9d88672d28f1881d5849618` durably froze six accepted ordinary-control pools before any candidate row existed",
    )
    expect(g1).toContain(
      "pools contain `12/16/12/12/9/9` federal-primary/federal-general/state-primary/state-general/local-primary/local-general keys",
    )
    expect(g1).toContain(
      "coordinator independently reproduced 356/357 focused cases passing with the sole expected failure at the exact official-set assertion",
    )
    expect(g1).toContain(
      "No official candidate record exists before this recorded RED.",
    )
    expect(g1).toContain(
      "fixture-only commit `ddd039dffadebad2f8a22d5d57094f15a4f82db1`",
    )
    expect(g1).toContain(
      "Independent structural review found one Important fail-closed defect: assignments proved record/source/authority existence but not that `authority_level` matched the assigned record level",
    )
    expect(g1).toContain(
      "RED-only commit `dd1d509ecdc026ec4f73452bae9ed649d457c3b6` adds that exact cross-level swap regression.",
    )
    expect(g1).toContain(
      "coordinator independently reproduced 357/358 focused cases passing with the sole expected failure",
    )
    expect(g1).toContain(
      "production fix `4f504e5d0d7aaa722d94cce5844eb5d3fcefb456` rejects an assignment whose resolved authority level differs from its record level",
    )
    expect(g1).toContain(
      "Final fixture SHA-256 is `83194a618952ff8b2f77bf02900e6f292126081bdaeff016135b31da60dc9b3e`.",
    )
    expect(g1).toContain(
      "Independent row-by-row integration audit accepted 100/100 records and all 151 source objects with zero replacement or blocker",
    )
    expect(g1).toContain(
      "coordinator verification passed 358/358 focused evaluator cases, 36 files/1,303 full tests",
    )
    expect(g1).toContain(
      "Feature-lead commit `d5a4da3fafc4b901be10e7791fff171c14d60a72` added only the synthetic vendor fixture and evaluator-focused tests",
    )
    expect(g1).toContain(
      "kept all 243 existing G1-T1 cases green and failed exactly 28 new cases at the intentionally absent `evaluateCandidateVendor` boundary",
    )
    expect(g1).toContain(
      "No evaluator production code, legal/SLA gate, vendor adapter, official truth fixture, external/vendor action, or F7 surface exists before this recorded RED.",
    )
    expect(g1).toContain(
      "Candidate implementation commit `877ccc9529a534b933a5372cc975077b549fbc5c` made the initial evaluator suite pass 273/273",
    )
    expect(g1).toContain(
      "no-fuzzy matching, foreign-ID conflict, qualified-write-in edge-threshold, and binary diagnostic-order regressions were added or materially changed after the original 28-case RED",
    )
    expect(g1).toContain(
      "RED-only commit `86c3606357e1bdff2b91215040dd56945a1d29f3` then kept all 273 existing cases green and failed exactly four new cases",
    )
    expect(g1).toContain(
      "No proxy fix, T3 legal/SLA gate, vendor adapter, external/vendor action, or F7 surface exists before this recorded regression RED.",
    )
    expect(g1).toContain(
      "Candidate proxy-fix commit `fa99baa5e3cf8a217d649a0f73366abaeb774ad3` closed the first four regressions at 277/277 focused cases",
    )
    expect(g1).toContain(
      "RED-only commit `8b4b6376d31b19d6ab5556752daf1d0f9503b474` changed only the colocated evaluator test",
    )
    expect(g1).toContain(
      "coordinator independently reproduced 276/281 focused cases passing and exactly five expected failures",
    )
    expect(g1).toContain(
      "No trust-boundary production repair, T3 legal/SLA gate, vendor adapter, official truth fixture, external/vendor action, or F7 surface exists before this recorded regression RED.",
    )
    expect(g1).toContain(
      "Review-fix commit `bd24513dba67c8a02141d9eb6602ffd26772afb0` detects proxies before reflection",
    )
    expect(g1).toContain(
      "formatter-only commit `5c196ca0527ea1e4b428de48ec69ca7434bacf12` then applied the repository-current Prettier 3.9.6 layout",
    )
    expect(g1).toContain(
      "coordinator verification passed 281/281 focused evaluator cases, 36 files/1,226 full tests",
    )
    expect(g1).toContain(
      "G1-T2 is GREEN, but G1 remains in `RED` until the official 100-record fixture and its independent fact/source audit pass",
    )
    expect(g1).toContain(
      "Test-only commits `c99e7d5435ad9a6121e6a6c186b78ddbdbccd714` and `e1d761e65956c4a7c487648b38b0e62f2b637b76` freeze the smallest provider-neutral decision boundary after T2",
    )
    expect(g1).toContain(
      "coordinator independently reproduced 281/352 existing evaluator cases passing and exactly 71 T3 cases failing only because `evaluateCandidateVendorDecision` is absent",
    )
    expect(g1).toContain(
      "Independent re-review approved the explicit minima, one-variable mutations, compact rejection shape, trust-boundary assertions, and duplicate coverage with no remaining finding.",
    )
    expect(g1).toContain(
      "No T3 production implementation, vendor adapter, official fixture, external/vendor action, or F7 surface exists before this recorded RED.",
    )
    expect(g1).toContain(
      "production commit `7f79f11ab620f785fc3fc927cba3c40bb73e5d65` implements the structured decision gate by reusing T2's trap-free preflight",
    )
    expect(g1).toContain(
      "test-only commit `cf15dee3f65520a16d5383bb3a0ffa7793f7b72b` added those passing regressions",
    )
    expect(g1).toContain(
      "coordinator verification passed 356/356 focused evaluator cases, 36 files/1,301 full tests",
    )
    expect(g1).toContain(
      "G1-T3 is GREEN, but G1 remains in `RED` until the official 100-record fixture and its independent fact/source audit pass",
    )
    expect(g1).toContain(
      "Test-only commits `5b0cee3c01e58ffa5026898785b829433b5231c3`, `f261df910e2df8d0d780c72c50a951523b2a7cf9`, and `74c5590ecda39572eac79de69f1df46b44fa658b` freeze the durable decision-document and PROJECT-MAP route contract",
    )
    expect(g1).toContain(
      "Three parser self-checks prove fenced/commented evidence, appended contradictory state/score text, and all-allowed or cross-provider matrix states cannot satisfy the contract.",
    )
    expect(g1).toContain(
      "coordinator independently reproduced those three passes plus exactly two expected failures for the absent unique project-map route and absent `G1-VENDOR-DECISION.md`",
    )
    expect(g1).toContain(
      "Public evidence refreshed on 2026-08-28 PT still supports `NO-GO (reopenable)`",
    )
    expect(g1).toContain(
      "Exact feature head `5d93a66f5e10c938330a08122cc3d61c588f62f0` adds only the durable `G1-VENDOR-DECISION.md` artifact and its concise `PROJECT-MAP.md` route.",
    )
    expect(g1).toContain(
      "coordinator verification passed 5/5 decision-contract cases, 358/358 evaluator cases, 37 files/1,308 full tests",
    )
    expect(g1).toContain(
      "Two independent read-only reviews reported zero Critical, Important, or Minor finding",
    )
    expect(g1).toContain(
      "G1-T4 is GREEN; G1-T5/T6 and every external or F7 action remain unauthorized",
    )
    expect(g1).toContain(
      "Exact independently reviewed implementation head `16fe8597ba4889a62d9b0c5cef0f69c969b10ba3` retains the one durable public-source-fallback `NO-GO (reopenable)` decision",
    )
    expect(g1).toContain(
      "The focused G1 suite passed 363/363 cases; `npm.cmd run check` passed 37 files/1,308 tests",
    )
    expect(g1).toContain(
      "local `npm.cmd run test:e2e` stopped at the required `E2E database requires explicit destructive opt-in.` guard",
    )
    expect(g1).toContain(
      "Independent final branch review reported zero Critical, Important, or Minor correctness, trust-boundary, provenance, authorization-scope, documentation, test, or maintainability finding.",
    )
    expect(g1).toContain(
      "G1-T7 is VERIFIED and ready for the feature PR, hosted CI/mergeability, G1-T8 lifecycle guard, and Human Gate B",
    )
    expect(readCoordinationField(g1, "Phase")).toBe(`\`${g1Status}\``)
    expect(readCoordinationField(g1, "Branch")).toBe(
      "`codex/g1-candidate-vendor-poc`",
    )
    expect(readCoordinationField(g1, "Base commit")).toBe(
      "`3e4449ca10fa36609726c1ca8c52a5eb626cb49c`",
    )
    expect(readCoordinationField(g1, "Integrated-main commit")).toBe(
      "`d4e1f2d411847b44ab1d50996d0ded22cba218c3`",
    )
    expect(readCoordinationField(g1, "Admission result")).toContain(
      "G1 is the sole active item",
    )
    expect(readCoordinationField(g1, "Assigned feature lead")).toContain(
      "the activation merge and coordinator handoff are integrated",
    )
    expect(readCoordinationField(g1, "Assigned feature lead")).toContain(
      "Human Gate A is approved",
    )
    expect(readCoordinationField(g1, "Assigned feature lead")).toContain(
      "must not begin G1-T5/T6 or any external/vendor action",
    )
    expect(readCoordinationField(g1, "Ownership")).toContain(
      "No credentialed vendor request",
    )
    expect(readCoordinationField(g1, "Merge order")).toBe(
      "G1 feature PR → post-merge verification on `main` → G1 closeout PR/CI/merge. No later item activates automatically.",
    )
    expect(readCoordinationField(g1, "Blockers")).toBe(g1Blockers)
    expect(g1).toContain(
      "Test-only commit `ecc1772fe30ee9c1a5586ccce418777a5e3fc31f` adds one canonical, internally cross-consistent future G1 `DONE` projection",
    )
    expect(g1).toContain(
      "The coordinator-only two-state guard accepts the exact current `VERIFIED` ROADMAP/README record and one later `DONE` projection",
    )
    expect(g1).toContain(
      "that final PR head still requires fresh exact-head hosted CI, renewed independent review, and mergeability before Human Gate B",
    )
    if (g1Status === "VERIFIED") {
      expect(readCoordinationField(g1, "Feature merge")).toBe("Pending.")
      expect(readCoordinationField(g1, "Post-merge evidence")).toBe("Pending.")
      expect(readCoordinationField(g1, "Closeout PR/CI/merge")).toBe("Pending.")
      expect(readCoordinationField(g1, "Feature PR/CI")).toBe(
        g1VerifiedFeatureEvidence,
      )
      expect(readCoordinationField(g1, "Next Human Gate")).toContain(
        "Human Gate B",
      )
      expect(readCoordinationField(g1, "Next Human Gate")).toContain(
        "G1-T5/T6 external vendor actions remain separately unapproved",
      )
      expect(readMarkdownSection(readme, "## Status")).toBe(
        g1VerifiedReadmeStatus,
      )
    } else {
      expect(readCoordinationField(g1, "Feature merge")).not.toBe("Pending.")
      expect(readCoordinationField(g1, "Post-merge evidence")).not.toBe(
        "Pending.",
      )
      expect(readCoordinationField(g1, "Closeout PR/CI/merge")).not.toBe(
        "Pending.",
      )
      expect(readCoordinationField(g1, "Feature PR/CI")).toContain(
        "merged after approved head",
      )
      expect(readCoordinationField(g1, "Next Human Gate")).toContain(
        "None; Human Gate B was approved",
      )
      expect(readMarkdownSection(readme, "## Status")).toContain(
        "G1 — Candidate-Data Vendor Proof of Concept is complete on `main` through [feature PR #28]",
      )
    }

    expect(["VERIFIED", "DONE"]).toContain(r2Status)
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
    expect(f5RecoveryPlan).toContain("### Task 4: Prove the F4 handoff")
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
    expect(readCoordinationField(r2, "Base commit").replace(/`/g, "")).toBe(
      "d262403200ff98bcf4a2d9a5cd05a7016a69d98d",
    )
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
      ["Branch", "`codex/f6-state-officials-navigation`"],
      ["Base commit", "`ea8bff3417896ba8ca669ccb517e7617d070b00d`"],
      ["Integrated-main commit", "`9f77d15d2ef15ab411fadebd2c688a2f217886e5`"],
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
      ["Blockers", "None."],
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
    expect(f6).toContain("**F6-T4 RED/GREEN/review evidence:**")
    expect(f6).toContain("a5bdc58e9cff54394bf530a4f376cdfdfd55ded0")
    expect(f6).toContain("46a6a9408a471912a3d24c2961e7f392fd4ef41b")
    expect(f6).toContain("directive-free shared query contract")
    expect(f6).toContain("hydration-safe manual roving focus")
    expect(f6).toContain("no-JavaScript")
    expect(f6).toContain("7/7")
    expect(f6).toContain("33 files/774 tests")
    expect(f6).toContain("**F6-T3 RED/GREEN/review evidence:**")
    expect(f6).toContain("f9a37d70763b3805992d3fd759753e8344d36cdc")
    expect(f6).toContain("6ae50dd3a8952376452af35787da18294f8f2493")
    expect(f6).toContain("bf15e7640f2213fa8b20eb043ae224bb3bdc5545")
    expect(f6).toContain("ba4e1d54eec2664b9b13ae9b459659186b2e14a1")
    expect(f6).toContain("canonical jurisdiction envelope")
    expect(f6).toContain("physical-connection lock contention")
    expect(f6).toContain("25/25")
    expect(f6).toContain("2/2 local PGlite")
    expect(f6).toContain("34 files/799 tests")
    expect(f6).toContain("**F6-T5 RED/GREEN/review evidence:**")
    expect(f6).toContain("ca21501e20a984e2cd79718b83226dc0351be9f0")
    expect(f6).toContain("8250927cf56523f4f773d9db9e3ea3fb6db0bc5b")
    expect(f6).toContain("per-person source evidence")
    expect(f6).toContain("client-bound prop tree")
    expect(f6).toContain("35 files/810 tests")
    expect(f6).toContain("**F6-T6 RED/GREEN/review evidence:**")
    for (const commit of [
      "f8674ad",
      "775883d",
      "fbc1ea6",
      "98677e0",
      "0ab6f0b",
      "cd0a6df",
    ]) {
      expect(f6).toContain(commit)
    }
    expect(f6).toContain("4 files/56 tests")
    expect(f6).toContain("4 files/104 tests")
    expect(f6).toContain("**F6-T6 hosted VERIFIED evidence:**")
    expect(f6).toContain("30680018371")
    expect(f6).toContain("cd0a6df9e013492ac8316c9c732efa5f51f00d87")
    expect(f6).toContain("3 files/33 tests")
    expect(f6).toContain("26/26 Chromium journeys")
    expect(f6).toContain("**F6 UX-DNA VERIFIED evidence:**")
    expect(f6).toContain("16.57:1")
    expect(f6).toContain("6.26:1")
    expect(f6).toContain("`TEMPORARY.md` remains `None.`")
    expect(f6).toContain("**F6 whole-branch review RED evidence:**")
    expect(f6).toContain("30719077587")
    expect(f6).toContain("30719089648")
    expect(f6).toContain("named district representation")
    expect(f6).toContain("cached-source trust-policy bypass")
    expect(f6).toContain("false `Effective` timestamps")
    expect(f6).toContain("equal-generation cache losers")
    expect(f6).toContain("### Whole-branch review correction task graph")
    expectTokensInOrder(f6, [
      "| T6-C1 |",
      "| T6-C2 |",
      "| T6-C3 |",
      "| T6-C4 |",
      "| T6-C5 |",
      "| T6-C6 |",
    ])
    expect(f6).toContain("canonical named OCD district")
    expect(f6).toContain("one state-scoped source validator")
    expect(f6).toContain("Person `updated_at` is not role-effective evidence")
    expect(f6).toContain("equal-generation authoritative winner")
    expect(f6).toContain("focused manual-activation tab")
    expect(f6).toContain("shared provider/cache cardinality ceilings")
    expect(f6).toContain("**F6 whole-branch correction VERIFIED evidence:**")
    expect(f6).toContain("ae8e57782e7ffb26fb2c3aca92e86b0b696df7a9")
    expect(f6).toContain("3debae081b42747647b5158dc08be32aef7471d6")
    expect(f6).toContain("30724007880")
    expect(f6).toContain("30724009154")
    expect(f6).toContain("30724661629")
    expect(f6).toContain("30724663357")
    expect(f6).toContain("6 files/213 tests")
    expect(f6).toContain("35 files/944 tests")
    expect(f6).toContain("no unresolved Critical, Important, or Minor finding")
    const expectF6CorrectionScope = (item: string) => {
      const lines = item.split(/\r?\n/)
      const task = lines.find((line) => line.startsWith("| T6 |"))
      const approval = lines.find((line) =>
        line.startsWith("- **F6-T6 hosted integration correction approval:**"),
      )
      expect(task).toBe(
        "| T6 | Integrated journey, routing, hygiene, and verification evidence. | Seeded authenticated deep links, keyboard navigation, source/freshness, stale/unavailable recovery, no-JS links, responsive layout, map route, and temporary-artifact checks fail or are absent. | Create `e2e/government-navigation.spec.ts`; modify `e2e/seed-session.mjs` and `PROJECT-MAP.md`; after explicit user approval on 2026-07-31, modify `e2e/residence.spec.ts` only to replace its obsolete pre-F6 exact tab-order oracle with bounded address-focus reachability; modify `TEMPORARY.md` only if an intentional temporary entry exists; no live provider call. | T5. | `npm.cmd run check`; `npm.cmd run test:e2e` | Focused suites, PostgreSQL contract, full check, guarded Chromium, 375px/1280px visual checks, keyboard/screen-reader review, JavaScript-disabled navigation, `git diff --check`, map impact, and zero open temporary entries pass; independent review has no unresolved Critical/Important finding. |",
      )
      expect(approval).toBe(
        "- **F6-T6 hosted integration correction approval:** Approved by the user on 2026-07-31 after exact head `fbc1ea674b975d83b596dbefd83cdbb35d5aa593` [pre-PR push CI run `30679042700`](https://github.com/Aheadboat/voteGPT/actions/runs/30679042700) passed migrations, PostgreSQL contracts, all non-E2E checks, and 25 passed Chromium journeys. Its sole failure repeated pre-T6 run `30676985461`: `e2e/residence.spec.ts` hard-coded pre-F6 tab order and expected the residence input immediately after the three header links, while the approved accessible government navigation now contributes focusable controls before that input. The user approved one test-only correction: preserve the three exact header focus assertions, use bounded keyboard reachability for the address, then preserve the exact form-control order. No production, provider, privacy, residence, or navigation behavior may change.",
      )
    }
    expectF6CorrectionScope(f6)
    for (const [authorized, widened] of [
      [
        "modify `e2e/residence.spec.ts` only",
        "modify `e2e/residence.spec.ts` and `src/app/dashboard/page.tsx`",
      ],
      ["pre-T6 run `30676985461`", "an unrecorded pre-T6 run"],
      ["one test-only correction", "production and test corrections"],
      [
        "preserve the three exact header focus assertions, use bounded keyboard reachability for the address, then preserve the exact form-control order",
        "replace the keyboard assertions as needed",
      ],
      [
        "No production, provider, privacy, residence, or navigation behavior may change.",
        "Production and navigation behavior may change.",
      ],
    ] as const) {
      const mutated = f6.replace(authorized, widened)
      expect(
        mutated,
        `missing authorized F6 correction text: ${authorized}`,
      ).not.toBe(f6)
      expect(() => expectF6CorrectionScope(mutated)).toThrow()
    }
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
    expect(f6CoordinatorOwnership).toContain("The coordinator exclusively owns")
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
      expect(readCoordinationField(item, "Base commit").replace(/`/g, "")).toBe(
        recoveryBase,
      )
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
    expect(f5Ownership).toContain("F5 defers these F4-owned shared surfaces:")
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
  }, 30_000)

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
