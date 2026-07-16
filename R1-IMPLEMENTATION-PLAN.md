# R1 Concurrent Roadmap Delivery Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

The RED/GREEN workers must also use `superpowers:test-driven-development`, the coordinator must use `superpowers:requesting-code-review` before VERIFIED, and every completion claim must use `superpowers:verification-before-completion`.

**Goal:** Bind the user-approved concurrent-roadmap operating model into repository policy, prove it with durable contract tests, and merge both the R1 feature PR and its post-merge closeout PR without activating or implementing F4–F14, G1, or G2.

**Architecture:** `AGENTS.md` owns binding contributor/agent behavior; `ROADMAP.md` owns the concise execution contract, item state, and evidence; `README.md` mirrors public status; `tests/foundation-contract.test.ts` enforces durable semantic invariants; `.gitignore` isolates feature worktrees. R1 executes sequentially because its test and policy files form one shared mutable contract. Independent review is read-only.

**Tech Stack:** Markdown policy, TypeScript, Vitest, npm 11 on Node 24, Git worktrees/branches, GitHub pull requests and Actions.

## Global Constraints

- The default branch is `main`. The user's earlier “master” wording maps to the repository's actual default branch.
- R1 stays the sole active roadmap item until its closeout PR is merged.
- R1 is the sole transition exception to the worktree rule: its branch was created in the root checkout before the rule becomes binding. Every roadmap item activated after R1 closes uses the new isolated worktree contract.
- Do not modify production code, migrations, environment variables, CI, F4–F14, G1, or G2.
- The coordinator alone edits `AGENTS.md`, `ROADMAP.md`, and `README.md`, changes roadmap state, creates PRs, decides merges, and records evidence.
- The RED agent may modify only `tests/foundation-contract.test.ts`.
- Run Windows commands through `npm.cmd`. Do not use skipped or quarantined tests.
- A `DONE` heading on a closeout branch has no authority until that branch is merged into `main`.
- If any command produces a materially different result from this plan, stop that task, preserve the evidence, and return it to the coordinator for triage.

---

## Task graph

| ID | Outcome | Expected RED/check | Mutable files | Depends on | Stop condition |
| --- | --- | --- | --- | --- | --- |
| R1-T1 | Falsifiable contract tests exist | Focused run reports seven new policy failures and the amendment-state guard passes | `tests/foundation-contract.test.ts`; coordinator records evidence in `ROADMAP.md` | Human Gate A | RED evidence independently reproduced |
| R1-T2 | Binding policy matches the approved model | Focused run passes all foundation contract tests | `AGENTS.md`, `ROADMAP.md`, `README.md`, `.gitignore` | R1-T1 | GREEN evidence recorded |
| R1-T3 | Whole change is independently verified | Focused/full/E2E/security/diff checks pass; read-only review has no unresolved Critical or Important finding | Coordinator evidence updates only | R1-T2 | R1 is `VERIFIED` |
| R1-T4 | R1 feature change is reviewed and merged | PR CI passes, GitHub is mergeable, Human Gate B is approved, feature PR merges | Feature branch and GitHub PR | R1-T3 | Feature commit is reachable from `main` |
| R1-T5 | Post-merge closeout is merged | Post-merge checks pass; closeout PR changes only status/evidence files; CI and merge pass | `ROADMAP.md`, `README.md` on `codex/r1-closeout` | R1-T4 | `main` contains R1 `DONE` |

There are no parallel implementation lanes in R1. R1-T1 must establish RED before R1-T2; R1-T3 reviews the integrated policy; R1-T4 and R1-T5 are ordered external-state transitions.

### Task 1: R1-T1 Contract Test RED

**Files:**

- Modify: `tests/foundation-contract.test.ts`
- Modify after RED, coordinator only: `ROADMAP.md`
- Read: `AGENTS.md`, `ROADMAP.md`, `README.md`, `.gitignore`
- Test: `tests/foundation-contract.test.ts`

**Interfaces:**

- Consumes: the approved R1 lifecycle and Human Gate A approval.
- Produces: `readMarkdownSection(contents, heading)`, `expectTokensInOrder(contents, tokens)`, `readRoadmapStatuses(contents)`, and eight durable contract checks for R1-T2.

**Agent brief**

- **Outcome:** Durable tests fail specifically because the old single-item/direct-to-DONE policy is still binding.
- **Allowed file:** `tests/foundation-contract.test.ts` only.
- **Applicable DNA IDs:** None; this is contributor workflow.
- **Dependencies/interfaces:** Human Gate A approved; clean `codex/r1-roadmap-coordinator-contract` branch; current `ROADMAP.md` R1 design is read-only to the agent.
- **Expected RED:** Seven new policy tests fail; six existing foundation tests and the transition-safe R1 amendment guard pass.
- **Focused command:** `npm.cmd test -- tests/foundation-contract.test.ts`.
- **Stop condition:** Report the exact failure names/reasons and leave the failing test patch unstaged.

- [ ] **Step 1: Add semantic helpers**

Add these functions after `findUnsafeEnvironmentEntries`:

```ts
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
```

- [ ] **Step 2: Add the RED matrix**

Append this describe block after the existing `development foundation` suite:

```ts
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

  it("separates coordinator, feature lead, reviewer, and shared-file authority", () => {
    const agents = readRepositoryFile("AGENTS.md")
    const delegation = readMarkdownSection(
      agents,
      "### Task graph and delegation",
    )
    const admission = readMarkdownSection(
      agents,
      "### Concurrency admission and shared ownership",
    )

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
```

- [ ] **Step 3: Prove RED**

Run:

```powershell
npm.cmd test -- tests/foundation-contract.test.ts
```

Expected: exit 1; 14 tests total, 7 failed and 7 passed. The seven failures must map to admission, isolation, ordered completion, roles, durable records, conflict recovery, and escalation/scope. The amendment-state guard must pass.

- [ ] **Step 4: Have the coordinator reproduce RED**

The coordinator inspects the complete test diff and independently runs `npm.cmd test -- tests/foundation-contract.test.ts`. Expected: the same seven failures and seven passes.

- [ ] **Step 5: Record RED evidence**

Change the R1 heading to `[IN PROGRESS (RED)]` and append:

```md
- **RED evidence (2026-07-15):** `npm.cmd test -- tests/foundation-contract.test.ts` exited 1 with 14 tests: seven expected policy failures and seven passes (the six pre-existing foundation checks plus the transition-safe R1 amendment guard). The failures prove that the binding contract still lacks concurrent admission, branch/worktree isolation, ordered feature/closeout completion, role/shared-file authority, durable coordination records, conflict recovery, and explicit escalation/scope governance.
```

- [ ] **Step 6: Commit RED**

Commit only the reviewed test and RED evidence:

```powershell
git add -- tests/foundation-contract.test.ts ROADMAP.md
git diff --cached --check
git commit -m "test(roadmap): define concurrent contract"
```

### Task 2: R1-T2 Binding Policy GREEN

**Files:**

- Modify: `AGENTS.md`
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Test: `tests/foundation-contract.test.ts`

**Interfaces:**

- Consumes: the eight R1-T1 contract checks and recorded RED evidence.
- Produces: the binding concurrent-delivery contract, exact worktree ignore rule, GREEN evidence, and phase/status text used by R1-T3.

The coordinator performs this task sequentially because every mutable file is authoritative workflow state.

- [ ] **Step 1: Replace the binding AGENTS contract**

In `AGENTS.md`, replace everything from `## Source of truth` through the line before `## Domain contracts` with this exact block:

```md
## Source of truth

- `ROADMAP.md` owns scope, order, acceptance criteria, gates, progress, and concurrency records.
- Work only on roadmap items that the user explicitly authorized and that `ROADMAP.md` marks active.
- At most two roadmap items may be active after each candidate pair receives a recorded concurrency admission.
- Do not begin an unauthorized or dependent item, create speculative scaffolding, or widen scope without roadmap approval.
- Concurrent cross-item work requires the isolation, ownership, and merge-order rules below; otherwise parallelize only inside one active item.

## Roadmap item protocol

Roadmap items move through `TODO → explicit authorization → feature branch/worktree → IN PROGRESS (DISCOVER/DESIGN/PLAN) → Human Gate A → RED → GREEN → REFACTOR → VERIFIED → feature PR/CI/review → Human Gate B → feature merge → post-merge verification → closeout PR/CI → closeout merge → DONE`.

- Only explicit user authorization starts an item.
- The coordinator creates the item branch and worktree from dependency-complete `main` before recording the item active.
- At most two roadmap items may be active; zero or one remains valid.
- Never activate a dependent or replacement item automatically.
- An item is `DONE` only when its closeout merge places that status on `main`.

### Discover, design, and plan

- Confirm the user outcome, dependencies, applicable domain DNA, risks, non-goals, and unresolved decisions.
- Record phase, branch, base and integrated-main commits, concurrency admission, assigned feature lead, ownership, merge order, PR/CI state, blockers, evidence, and next Human Gate.
- Prefer vertical, independently testable user outcomes over frontend/backend layer splits.
- Build a task graph. Each implementation task records its outcome, expected RED failure, files or interfaces, dependencies, and done criteria. Non-implementation tasks record a falsifiable check and expected result.
- Mark parallel lanes only after dependencies and interfaces are settled and mutable files or external state are disjoint or exclusively owned.
- Keep the plan in the active `ROADMAP.md` item while it remains readable. If it cannot stay concise, create one linked plan file. Do not create a plan directory in advance.

### Branch and worktree isolation

- Every roadmap item activated after R1 closes uses `codex/<roadmap-id>-<slug>` in a separate ignored `.worktrees/<roadmap-id>-<slug>` checkout, created from the latest dependency-complete `main`. R1 is the sole documented transition exception because its branch predates this binding rule.
- Record both the original base commit and the latest integrated-main commit.
- A branch is current only if the current dependency-complete `main` commit is an ancestor of the feature head, checked with `git merge-base --is-ancestor <current-main> <feature-head>`.
- If that check fails, integrate current `main` into the feature branch and rerun focused and full verification before review or merge.
- Never let one feature lead edit another item's worktree.

### Human Gate A

Before RED or production work for an item, present its overall design, tests-first implementation plan, task graph, proposed parallel lanes, risks, dependencies, and non-goals. Continue that item only after explicit user approval.

### Task graph and delegation

- The coordinator owns dependency and concurrency audits, branch/worktree creation, task briefs, `AGENTS.md`, `ROADMAP.md`, `README.md`, roadmap status, Human Gates, review orchestration, CI/PR monitoring, merge decisions, post-merge checks, closeout PRs, and blocker reports; it does not implement feature production code.
- One feature lead owns one roadmap item from discovery through `VERIFIED` and may coordinate bounded implementation subtasks. It cannot change roadmap status, merge, edit another worktree, or modify coordinator-owned authoritative files.
- Give each subagent one bounded task with the roadmap/task ID, outcome, allowed files, applicable DNA IDs, dependencies and interfaces, expected RED failure, focused test command, and stop condition.
- Subagents do not change roadmap status or mark work complete. The coordinator inspects their diffs and reruns their tests.
- Independent review agents remain read-only unless the coordinator assigns a separately approved fix task.

### Concurrency admission and shared ownership

Before concurrent dispatch, record one result for the candidate pair:

- `PASS` requires: Every dependency must be `DONE` on `main`; interfaces must be settled; mutable files and external state must be disjoint; tests must be independent; and separate worktrees plus a merge order must be recorded.
- `CONDITIONAL` requires useful isolated lanes plus exactly one active branch that owns each shared file, schema, migration sequence, generated artifact, or external resource; record every deferred surface, serialized integration point, and merge order before work begins.
- `FAIL` applies when dependencies, interfaces, mutable state, ownership, migrations, tests, or integration order remain coupled; run those items sequentially.

Completion or blockage never fills an open slot automatically. A blocked item does not stop another item whose recorded admission remains valid.

### Review, merge, and closeout

- A feature PR is merge-eligible only when its branch contains current dependency-complete `main`, focused and full verification pass, independent review has no unresolved Critical or Important finding, hosted CI succeeds, GitHub reports it mergeable, and Human Gate B is approved.
- When those conditions remain true and there is no conflict, the coordinator merges the feature PR directly to `main` in the recorded merge order.
- After each feature merge, the coordinator verifies reachability from `main` and reruns the required post-merge checks.
- The coordinator then creates `codex/<roadmap-id>-closeout` from the latest `main` in the recorded merge order. Its closeout PR changes only `ROADMAP.md` and `README.md`, passes hosted CI, and is merged before the next concurrent feature may reach Gate B.
- The roadmap slot remains active until the closeout merge places `DONE` on `main`. Git history and the linked PR provide the final closeout-merge proof.

### Human Gate B

After `VERIFIED`, successful feature PR CI, mergeability, and independent review, present delivered behavior, the final overall design, deviations and tradeoffs, test evidence, applicable DNA evidence, manual accessibility or visual checks when relevant, and remaining risks or non-goals.

Gate B authorizes merge; it does not mark the item `DONE`. Continue only after explicit user approval. If changes are requested, return to the appropriate earlier stage and reverify.

### Durable coordination record

For each active item, `ROADMAP.md` records phase, branch, base commit, integrated-main commit, admission result, assigned feature lead, exclusive/shared file or external-state ownership, merge order, feature PR/CI, blockers, feature merge, post-merge evidence, closeout PR/CI/merge, and next Human Gate. Conversation state and agent reports alone never advance status.

### Conflict recovery and escalation

- Feature or closeout PR conflicts go to a dedicated conflict agent on that item branch. It integrates current `main`, resolves only the conflicting surface, runs focused and full verification, and returns the branch for renewed independent review and CI.
- Material behavior or architecture changes invalidate the prior Gate B approval and return the item to the appropriate earlier phase.
- The coordinator autonomously repairs missing agent context, escalates reasoning, splits tasks, triages technically attributable failures, addresses in-scope review findings, retries transient CI, and coordinates merge-conflict work.
- Interrupt the user only for Human Gates; product, privacy, editorial, legal, vendor, spending, credential, scope, or material design decisions; launch-scope removal; or a blocker that remains after context repair, stronger reasoning, and task decomposition.
- Every escalation packet identifies the item, branch, PR, evidence, attempts, downstream impact, recommendation, and exact decision needed.

### Scope governance

The coordinator may investigate and propose a new roadmap item only for a demonstrated launch, safety, compliance, operability, or dependency gap not covered by existing items. Adding, ordering, activating, deferring, or removing an item requires explicit user approval. No agent may silently widen scope.
```

- [ ] **Step 2: Replace the TDD and checkpoint completion rules**

Replace TDD workflow step 7 with:

```md
7. Record evidence, complete feature PR CI/review, present Human Gate B, and stop. After approval, merge, verify `main`, and complete the closeout PR/CI/merge before recording `DONE`.
```

Replace `## Checkpoint rule` with:

```md
## Checkpoint rule

Finish each active item through `VERIFIED`, complete its feature PR CI/review, present Human Gate B, and wait for explicit approval. After approval, merge in recorded order, verify `main`, merge the status-only closeout PR, confirm `DONE` on `main`, and leave every unauthorized or dependent item inactive.
```

- [ ] **Step 3: Replace ROADMAP's global execution contract**

Replace the complete `## Execution contract` section in `ROADMAP.md` with:

```md
## Execution contract

Roadmap items move through `TODO → explicit authorization → feature branch/worktree → IN PROGRESS (DISCOVER/DESIGN/PLAN) → Human Gate A → RED → GREEN → REFACTOR → VERIFIED → feature PR/CI/review → Human Gate B → feature merge → post-merge verification → closeout PR/CI → closeout merge → DONE`.

- ACTIVATION: only explicit user authorization starts an item; never activate a dependent or replacement item automatically.
- CONCURRENCY CAP: At most two roadmap items may be active; zero or one is valid. Every concurrently active pair must have a recorded `PASS` or `CONDITIONAL` admission; a `FAIL` pair runs sequentially.
- ADMISSION: `PASS` requires dependencies `DONE` on `main`, settled interfaces, disjoint mutable files/external state, independent tests, worktrees, and merge order. `CONDITIONAL` additionally records exactly one owner for each shared surface plus deferred integration. `FAIL` means unresolved coupling prevents concurrent work.
- ISOLATION: every roadmap item activated after R1 closes uses `codex/<roadmap-id>-<slug>` and `.worktrees/<roadmap-id>-<slug>` from dependency-complete `main`; R1 is the sole documented transition exception. The base commit and integrated-main commit are recorded; current `main` must be an ancestor of feature HEAD under `git merge-base --is-ancestor <current-main> <feature-head>` before review or merge.
- DESIGN/PLAN: record applicable DNA, design, testable task graph, dependencies, interfaces, parallel lanes, risks, and non-goals in the active item; extract one linked plan only when inline detail stops being readable.
- HUMAN GATE A: user approves the item's design and tests-first plan before RED or production work.
- RED: record the exact test and expected failure before production code.
- GREEN: write minimum code required to pass.
- REFACTOR: simplify proven code only.
- VERIFIED: run focused tests, full checks, and manual accessibility/visual review when applicable.
- FEATURE PR: current branch, focused and full verification, no unresolved Critical or Important review finding, hosted CI, GitHub mergeability, and Human Gate B approval are all required.
- HUMAN GATE B: present delivered behavior, final design/deviations, evidence, and remaining risk. Approval authorizes feature merge; it does not mark the item `DONE`.
- MERGE/CLOSEOUT: merge the conflict-free feature PR in recorded order, verify reachability and required checks on `main`, then merge a `codex/<roadmap-id>-closeout` PR/CI that changes only `ROADMAP.md` and `README.md`. Serialize each feature merge, post-merge verification, and closeout merge before the next concurrent item reaches Gate B.
- CONFLICTS: feature or closeout conflicts use a dedicated conflict agent, current `main` integration, focused/full verification, renewed review and CI, and renewed Gate B approval after material behavior or architecture changes.
- OWNERSHIP: the coordinator owns authoritative docs, status, Human Gates, review/CI/PR orchestration, merges, post-merge checks, closeout, and blocker reports but not feature production code. Feature leads cannot change status, merge, edit other worktrees, or edit coordinator-owned files.
- DURABLE RECORD: each active item records phase, branch, base commit, integrated-main commit, admission result, assigned feature lead, ownership, merge order, feature PR/CI, blockers, feature merge, post-merge evidence, closeout PR/CI/merge, and next Human Gate.
- ESCALATION: autonomous technical triage precedes interruption. Human escalations are limited to Gates and product/privacy/editorial/legal/vendor/spending/credential/scope/material-design/launch-removal decisions or persistent blockers, and include item, branch, PR, evidence, attempts, downstream impact, recommendation, and exact decision needed.
- SCOPE: proposing a demonstrated launch, safety, compliance, operability, or dependency gap is allowed; adding, ordering, activating, deferring, or removing an item requires explicit user approval.
- DONE: the closeout merge places `DONE` and its evidence on `main`; completion never activates another item.
- UI/UX work: at RED record applicable UX DNA IDs and expected behavioral failures; at VERIFIED map those IDs to automated or recorded manual evidence.
- No skipped tests or arbitrary coverage percentage.
- External providers use small fixtures and contract tests; credentialed live tests remain optional.
```

- [ ] **Step 4: Ignore isolated worktrees**

Add this block to `.gitignore` after the test outputs:

```gitignore
# isolated roadmap worktrees
/.worktrees/
```

- [ ] **Step 5: Prove GREEN**

Run:

```powershell
npm.cmd test -- tests/foundation-contract.test.ts
```

Expected: exit 0; all 14 foundation-contract tests pass.

- [ ] **Step 6: Record GREEN status**

- Change the R1 heading to `[IN PROGRESS (GREEN)]`.
- Append:

```md
- **GREEN evidence (2026-07-15):** `npm.cmd test -- tests/foundation-contract.test.ts` exited 0 with all 14 foundation-contract tests passing.
```

- Keep F4/F5 and all later items `TODO`.
- Replace README's status paragraph with:

```md
R0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, and F3 — Residence Resolution Preview are complete. R1 — Concurrent Roadmap Delivery Contract is active on `codex/r1-roadmap-coordinator-contract` while its binding policy is implemented and verified; F4 and every later roadmap item remain TODO pending separate authorization.
```

- [ ] **Step 7: Commit GREEN**

Run:

```powershell
git diff --check
git add -- .gitignore AGENTS.md ROADMAP.md README.md
git diff --cached --check
git commit -m "docs(roadmap): bind concurrent delivery"
```

### Task 3: R1-T3 Integrated Verification and Review

**Files:**

- Modify for evidence only: `ROADMAP.md`
- Modify for status only: `README.md`
- Read/test: the complete `main...HEAD` R1 diff

**Interfaces:**

- Consumes: GREEN binding policy and all R1-T1 contract checks.
- Produces: full local evidence, independent review disposition, `[VERIFIED]` state, and the feature-PR candidate used by R1-T4.

- [ ] **Step 1: Run the focused contract suite**

Run `npm.cmd test -- tests/foundation-contract.test.ts`. Expected: 14/14 pass.

- [ ] **Step 2: Validate migration artifacts**

Run `npm.cmd run db:check`. Expected: exit 0 without changing generated artifacts.

- [ ] **Step 3: Run the complete non-E2E check**

Run `npm.cmd run check`. Expected: every Vitest suite, generated route types, strict TypeScript, zero-warning lint, and optimized build pass.

- [ ] **Step 4: Run browser verification**

Run `npm.cmd run test:e2e`. Expected: every Playwright test passes.

- [ ] **Step 5: Run the dependency security audit**

Run `npm.cmd audit --json`. Expected: zero vulnerabilities.

- [ ] **Step 6: Check the Git diff**

Run `git diff --check main...HEAD`. Expected: no output and exit 0.

- [ ] **Step 7: Check policy and scope invariants**

Run:

```powershell
rg -n 'single roadmap item|At most one item may be|At most one roadmap item may be|only explicit user approval marks the item `DONE`|only explicit user approval permits `DONE`' AGENTS.md ROADMAP.md
git diff --name-only main...HEAD
git status --short
```

Expected:

- The obsolete-policy search prints nothing and exits 1.
- Changed paths are exactly `.gitignore`, `AGENTS.md`, `README.md`, `ROADMAP.md`, `R1-IMPLEMENTATION-PLAN.md`, and `tests/foundation-contract.test.ts`.
- Worktree status is clean after evidence updates are committed.

- [ ] **Step 8: Request independent read-only review**

Assign a fresh reviewer this brief:

- **Roadmap/task:** R1-T3.
- **Outcome:** Find contradictions, missing approved behavior, reversed Git logic, brittle tests, unauthorized scope, or claims unsupported by evidence.
- **Allowed files:** Read the complete `main...HEAD` diff and relevant current files; no writes.
- **Applicable DNA IDs:** None.
- **Dependencies:** Focused/full verification evidence is available.
- **Falsifiable check:** Every approved lifecycle, role, admission, ownership, merge, closeout, conflict, escalation, and scope rule is bound and tested; F4–F14/G1/G2 remain untouched.
- **Stop condition:** Return findings ranked Critical, Important, Minor; no fix.

The coordinator triages findings. Any Critical or Important finding gets a separately bounded fix task followed by all affected verification and another independent review.

- [ ] **Step 9: Record VERIFIED**

- Change the R1 heading to `[VERIFIED]`.
- Record exact focused/full/E2E/audit/diff results and independent-review disposition.
- Replace README's status paragraph with:

```md
R0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, and F3 — Residence Resolution Preview are complete. R1 — Concurrent Roadmap Delivery Contract is active at VERIFIED on `codex/r1-roadmap-coordinator-contract` and awaits Human Gate B; F4 and every later roadmap item remain TODO pending separate authorization.
```

- [ ] **Step 10: Commit VERIFIED evidence**

Run:

```powershell
git add -- ROADMAP.md README.md
git diff --cached --check
git commit -m "docs(roadmap): verify concurrent delivery"
```

### Task 4: R1-T4 Feature PR and Merge

**Files:**

- Local content changes: none
- External state: `codex/r1-roadmap-coordinator-contract` remote branch, GitHub feature PR, GitHub Actions

**Interfaces:**

- Consumes: clean `[VERIFIED]` R1 feature branch and no unresolved Critical or Important finding.
- Produces: mergeable feature PR, Human Gate B decision, merged feature commit on `main`, and reachability evidence for R1-T5.

- [ ] **Step 1: Confirm the branch is current and clean**

Confirm the branch is clean and current:

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git status --short
```

Expected: ancestry exits 0 and status prints nothing.

- [ ] **Step 2: Push the feature branch**

Run:

```powershell
git push -u origin codex/r1-roadmap-coordinator-contract
```

Expected: push succeeds.

- [ ] **Step 3: Open the ready feature PR**

Run:

```powershell
gh pr create --base main --head codex/r1-roadmap-coordinator-contract --title "R1 roadmap coordination: bind concurrent delivery" --body "Binds the approved two-item admission, isolated branch/worktree, coordinator and feature-lead authority, feature and closeout PRs, conflict recovery, escalation, and scope rules. Verified with the focused foundation contract, db:check, full check, E2E, audit, and diff checks recorded in ROADMAP.md. Includes no F4-F14, G1, or G2 production work or activation."
```

Expected: GitHub returns the URL of a ready PR targeting `main`.

- [ ] **Step 4: Qualify the feature PR**

Run:

```powershell
gh pr checks --watch
gh pr view --json url,mergeable,reviewDecision,statusCheckRollup
```

Expected: every hosted check succeeds, `mergeable` is `MERGEABLE`, and review state contains no unresolved Critical or Important finding.

- If CI fails, triage the attributable failure and reverify.
- If the feature PR conflicts, assign the dedicated conflict workflow from R1-T2, rerun focused/full checks, renew review/CI, and renew Gate B if behavior or architecture changed.

- [ ] **Step 5: Present Human Gate B**

Present:

- Delivered binding behavior and final design.
- The corrected current-main ancestry direction.
- Serialized feature/post-merge/closeout order, including closeout conflicts.
- Exact automated and independent-review evidence.
- Design deviations/tradeoffs.
- Remaining risks and non-goals.
- PR URL, CI URL/state, mergeability, and the exact decision: approve or reject R1 feature merge.

Stop until the user explicitly approves Gate B.

- [ ] **Step 6: Merge after Gate B approval**

Recheck CI, review, ancestry, and mergeability, then run:

```powershell
gh pr merge --merge
```

Use the actual PR number with `gh pr merge` if the current branch cannot resolve it unambiguously. Expected: the merge succeeds.

- [ ] **Step 7: Prove feature-head reachability**

Run:

```powershell
git fetch origin main
git merge-base --is-ancestor HEAD origin/main
```

Expected: exit 0, proving the feature head is reachable from `origin/main`. Do not mark R1 `DONE`.

### Task 5: R1-T5 Post-Merge Verification and Closeout

**Files:**

- Modify on `codex/r1-closeout` only: `ROADMAP.md`
- Modify on `codex/r1-closeout` only: `README.md`
- External state: GitHub closeout PR and GitHub Actions

**Interfaces:**

- Consumes: Gate-B-approved R1 feature commit merged into `main`.
- Produces: post-merge verification evidence, merged closeout PR, R1 `DONE` on `main`, and inactive F4/F5.

- [ ] **Step 1: Update local main**

```powershell
git switch main
git pull --ff-only origin main
```

Expected: the feature commit is present and R1 is still `VERIFIED`.

- [ ] **Step 2: Run post-merge contract and migration checks**

```powershell
npm.cmd test -- tests/foundation-contract.test.ts
npm.cmd run db:check
```

Expected: 14/14 foundation-contract tests pass and migration validation passes without changes.

- [ ] **Step 3: Run post-merge full verification**

```powershell
npm.cmd run check
npm.cmd run test:e2e
```

Expected: all non-E2E and Playwright checks pass.

- [ ] **Step 4: Confirm post-merge cleanliness**

```powershell
git status --short
```

Expected: no output.

- [ ] **Step 5: Create the closeout branch**

```powershell
git switch -c codex/r1-closeout
```

- [ ] **Step 6: Record pre-closeout evidence**

Collect the exact feature PR evidence:

```powershell
gh pr list --state merged --head codex/r1-roadmap-coordinator-contract --limit 1 --json url,state,mergedAt,mergeCommit,statusCheckRollup
git rev-parse HEAD
```

Then use `apply_patch` only:

- Add Human Gate B approval, feature PR/merge evidence, and post-merge verification evidence to R1.
- Keep R1 `VERIFIED` and README active while the closeout PR is being established.
- Change no file except `ROADMAP.md` and `README.md`.

- [ ] **Step 7: Commit and push the pre-closeout evidence**

```powershell
git add -- ROADMAP.md README.md
git diff --cached --check
git commit -m "docs(roadmap): prepare R1 closeout"
git push -u origin codex/r1-closeout
```

- [ ] **Step 8: Open the draft closeout PR**

Run:

```powershell
gh pr create --draft --base main --head codex/r1-closeout --title "R1 roadmap coordination: close delivery contract" --body "Records approved R1 merge and post-merge evidence; marks R1 complete only when this closeout PR merges."
```

- [ ] **Step 9: Finalize DONE on the closeout branch**

After the PR URL exists:

- Change the R1 heading to `[DONE]`.
- Record the closeout PR URL and that `DONE` becomes authoritative only on merge.
- Replace README's status paragraph with:

```md
R0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, and F3 — Residence Resolution Preview are complete. R1 — Concurrent Roadmap Delivery Contract is complete. F4 and every later roadmap item remain TODO pending separate authorization.
```

- [ ] **Step 10: Commit and push DONE evidence**

```powershell
git add -- ROADMAP.md README.md
git diff --cached --check
git commit -m "docs(roadmap): close R1 delivery contract"
git push
gh pr ready
```

- [ ] **Step 11: Qualify the closeout PR**

Run:

```powershell
git diff --name-only main...HEAD
gh pr checks --watch
gh pr view --json url,mergeable,statusCheckRollup
```

Expected: the diff lists only `ROADMAP.md` and `README.md`, every hosted check succeeds, and `mergeable` is `MERGEABLE`.

- If it conflicts, use the dedicated closeout conflict agent, integrate current `main`, edit only the conflicting status/evidence surfaces, rerun focused/full verification, and renew review/CI.

- [ ] **Step 12: Merge the conflict-free closeout PR**

Run:

```powershell
gh pr merge --merge
git switch main
git pull --ff-only origin main
```

- [ ] **Step 13: Prove final completion**

Run:

```powershell
npm.cmd test -- tests/foundation-contract.test.ts
git status --short
git log -1 --oneline
rg -n "^## R1 .*\\[DONE\\]$|^## F4 .*\\[TODO\\]$|^## F5 .*\\[TODO\\]$" ROADMAP.md
$closeout = gh pr list --state merged --head codex/r1-closeout --limit 1 --json url,state,mergeCommit | ConvertFrom-Json
git merge-base --is-ancestor $closeout[0].mergeCommit.oid origin/main
```

Expected: foundation tests pass, status is clean, the closeout query returns one merged PR, its merge commit is an ancestor of `origin/main`, and R1 is `DONE` while F4/F5 remain `TODO`. Only then is R1 complete and a separate explicit authorization may activate F4 and/or F5.
