# Repository Instructions

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Source of truth

- `ROADMAP.md` owns scope, order, acceptance criteria, gates, progress, and concurrency records.
- Work only on roadmap items that the user explicitly authorized and that `ROADMAP.md` marks active.
- At most two roadmap items may be active after each candidate pair receives a recorded concurrency admission.
- Do not begin an unauthorized or dependent item, create speculative scaffolding, or widen scope without roadmap approval.
- Concurrent cross-item work requires the isolation, ownership, and merge-order rules below; otherwise parallelize only inside one active item.
- Coordinator-only pre-activation audit and activation setup are the sole pre-active exceptions: after explicit authorization the coordinator may inspect dependency and interface state, then create inert branches/worktrees and the authoritative activation record only when the audit permits activation; no feature exploration or edits begin before that record is merged to `main` and integrated into every feature branch.

## Roadmap item protocol

Roadmap items move through `TODO → explicit authorization → read-only dependency/interface/admission audit → inert feature branch/worktree → activation record PR/CI/merge → IN PROGRESS (DISCOVER/DESIGN/PLAN) → Human Gate A → RED → GREEN → REFACTOR → VERIFIED → feature PR/CI/review → Human Gate B → feature merge → post-merge verification → closeout PR/CI → closeout merge → DONE`.

- Only explicit user authorization starts an item.
- After explicit user authorization and before creating inert item branches/worktrees or an activation PR, the coordinator-only pre-activation step is a read-only dependency/interface/admission audit; the audit may inspect repository and roadmap state but cannot modify files or external state; no feature agent or `DISCOVER/DESIGN/PLAN` dispatch occurs during the audit; `PASS` or `CONDITIONAL` may proceed to paired activation; unsettled or coupled interfaces yield `FAIL`; `FAIL` does not create paired activation; the coordinator reports `FAIL` and requires explicit user activation order for sequential work.
- When the user selects a sequential order after `FAIL`, the next single-item activation record preserves the failed pair audit and chosen order. A separately authorized single item may activate with admission `N/A` after the audit confirms its dependencies.
- After explicit user authorization, coordinator-only inert activation setup may create item branches/worktrees from dependency-complete `main`; this is setup, not feature work.
- One coordinator-owned activation PR/CI/merge on `main` records every activated item, its branch/base, assigned lead, ownership, admission, and merge order as the single authoritative active/admission record.
- The coordinator integrates the activation merge into every feature branch before any agent dispatch or `DISCOVER/DESIGN/PLAN`.
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
- Every feature-design dispatch copies this exact portable line: `Required skills: invoke ponytail full, then caveman full, before exploration.` This applies to every dispatch that includes `DISCOVER/DESIGN/PLAN`, including the feature lead. Resolve both skills by name from the agent's available skill catalog; never hardcode a machine path.
- Ponytail governs design scope but cannot simplify away explicit requirements, trust-boundary validation, data-loss prevention, privacy, security, accessibility, or required tests.
- Caveman governs communication but cannot omit outcome, dependencies, interfaces, decisions, rejected alternatives, risks, non-goals, expected RED, evidence, Human Gates, or blockers. Use full prose whenever compression would create ambiguity.
- Subagents do not change roadmap status or mark work complete. The coordinator inspects their diffs and reruns their tests.
- Independent review agents remain read-only unless the coordinator assigns a separately approved fix task.

### Concurrency admission and shared ownership

Before concurrent dispatch, record one result for the candidate pair:

- `PASS` requires: Every dependency must be `DONE` on `main`; interfaces must be settled; mutable files and external state must be disjoint; tests must be independent; and separate worktrees plus a merge order must be recorded.
- `CONDITIONAL` requires useful isolated lanes plus exactly one active branch that owns each shared file, schema, migration sequence, generated artifact, or external resource; record every deferred surface, serialized integration point, and merge order before work begins.
- `FAIL` applies when dependencies, interfaces, mutable state, ownership, migrations, tests, or integration order remain coupled; run those items sequentially.

Completion or blockage never fills an open slot automatically. A blocked item does not stop another item whose recorded admission remains valid.
The activation merge on `main` is the sole authoritative admission and merge-order record; item branches carry only coordinator-authored per-item state, never competing cross-item coordination state.

### Review, merge, and closeout

- A feature PR is merge-eligible only when its branch contains current dependency-complete `main`, focused and full verification pass, independent review has no unresolved Critical or Important finding, hosted CI succeeds, GitHub reports it mergeable, and Human Gate B is approved.
- When those conditions remain true and there is no conflict, the coordinator merges the feature PR directly to `main` in the recorded merge order.
- After each feature merge, the coordinator verifies reachability from `main` and reruns the required post-merge checks.
- The coordinator then creates `codex/<roadmap-id>-closeout` from the latest `main` in the recorded merge order. Its closeout PR changes only `ROADMAP.md` and `README.md`, passes hosted CI, and is merged before the next concurrent feature may reach Gate B.
- The roadmap slot remains active until the closeout merge places `DONE` on `main`. Git history and the linked PR provide the final closeout-merge proof.

### Human Gate B

After `VERIFIED`, successful feature PR CI, mergeability, and independent review, present delivered behavior, the final overall design, deviations and tradeoffs, test evidence, applicable DNA evidence, manual accessibility or visual checks when relevant, and remaining risks or non-goals.

Gate B authorizes merge; it does not mark the item `DONE`. Continue only after explicit user approval. If changes are requested, return to the appropriate earlier phase and reverify.

### Durable coordination record

For each active item, `ROADMAP.md` records phase, branch, base commit, integrated-main commit, admission result, assigned feature lead, exclusive/shared file or external-state ownership, merge order, feature PR/CI, blockers, feature merge, post-merge evidence, closeout PR/CI/merge, and next Human Gate. `main` owns authorization, active slots, pair admission, cross-item ownership/merge order, feature merges, closeout, and `DONE`. Coordinator-authored commits on each item branch own only that item's phase/evidence, blockers, integrated-main, and PR/CI state until the feature merge promotes them to `main`. No direct-main status writes are allowed; `main` authority changes only through reviewed coordinator-owned PR merges. Feature agents, agent reports, and conversation cannot write or advance either authority. Item-branch state cannot activate another item or mark `DONE`. Conversation state and agent reports alone never advance status.

### Conflict recovery and escalation

- Feature or closeout PR conflicts go to a dedicated conflict agent on that item branch. It integrates current `main`, resolves only the conflicting surface, runs focused and full verification, and returns the branch for renewed independent review and CI.
- Material behavior or architecture changes invalidate the prior Gate B approval and return the item to the appropriate earlier phase.
- The coordinator autonomously repairs missing agent context, escalates reasoning, splits tasks, triages technically attributable failures, addresses in-scope review findings, retries transient CI, and coordinates merge-conflict work.
- Interrupt the user only for Human Gates; product, privacy, editorial, legal, vendor, spending, credential, scope, or material design decisions; launch-scope removal; or a blocker that remains after context repair, stronger reasoning, and task decomposition.
- Every escalation packet identifies the item, branch, PR, evidence, attempts, downstream impact, recommendation, and exact decision needed.

### Scope governance

The coordinator may investigate and propose a new roadmap item only for a demonstrated launch, safety, compliance, operability, or dependency gap not covered by existing items. Adding, ordering, activating, deferring, or removing an item requires explicit user approval. No agent may silently widen scope.

## Domain contracts

`AGENTS.md` is the context router. Before domain work, read the matching contract, do not load unrelated domain contracts, and give its applicable IDs to any delegated agent.

| Work includes | Required contract |
| --- | --- |
| Anything an end user sees, reads, navigates, or interacts with | [UI and UX DNA](#ui-and-ux-dna) |

Each contract declares **Applies when**, **Principles**, and **Required evidence**. Keep a sole contract inline. When a second approved domain contract exists, move the contracts to `docs/dna/<domain>.md` and leave routing links here. Do not create placeholder files or directories.

### UI and UX DNA

**Applies when:** Work changes anything an end user sees, reads, navigates, or interacts with.

**Principles:**

- **UX-01 — Trust before persuasion.** Use calm, factual language; avoid engagement traps, dark patterns, and unsourced urgency.
- **UX-02 — Show provenance and freshness.** Keep the source and last-checked state close to the fact they qualify.
- **UX-03 — Treat candidates equally.** Use the same hierarchy, order, space, controls, and missing-data language; never preselect by party, popularity, or engagement.
- **UX-04 — Protect identity and location.** Ask only for necessary data, explain why, keep manual location primary, and never expose precise location outside the authorized residence flow or into telemetry.
- **UX-05 — Provide one accessible experience.** Keyboard, screen-reader, focus, contrast, reduced-motion, and responsive behavior belong to the primary flow, not an alternate mode.
- **UX-06 — Make system state and recovery explicit.** Loading, empty, error, stale, partial, and unknown states explain what happened and the next safe action.
- **UX-07 — Keep core civic facts independent of AI.** Browsing, provenance, and structured comparison remain usable when AI is disabled or unavailable.
- **UX-08 — Use progressive disclosure.** Lead with task-relevant facts, defer supporting detail, and minimize required choices without hiding sources or alternatives.
- **UX-09 — State coverage honestly.** Show unavailable and unverified coverage explicitly; never imply completeness the evidence does not support.

**Required evidence:** At RED, record the applicable IDs and expected behavioral failures. At VERIFIED, map each applicable ID to automated evidence or a recorded accessibility, responsive, visual, or recovery-state check.

Visual identity is not locked yet. Typography, color, spacing, shape, iconography, and motion stay feature-local until a real application shell proves reusable patterns.

## TDD workflow

Within an authorized roadmap item, code changes follow `RED → GREEN → REFACTOR → VERIFIED`.

1. Write the smallest behavioral test that proves the missing outcome.
2. Run it and confirm it fails for the expected reason.
3. Record the test and failure in `ROADMAP.md`.
4. Write minimum production code required to pass.
5. Refactor only proven code while tests stay green.
6. Run focused tests, then full verification.
7. Record evidence, complete feature PR CI/review, present Human Gate B, and stop. After approval, merge, verify `main`, and complete the closeout PR/CI/merge before recording `DONE`.

Rules:

- No skipped or quarantined tests.
- No arbitrary coverage target. Every business rule, privacy boundary, security rule, provider contract, and editorial rule needs a behavioral test.
- External APIs use small checked-in fixtures and contract tests. Live smoke tests are optional and require credentials.
- Add an abstraction only when a second real implementation or measured need requires it.
- After F1, standard verification is `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`; `npm run check` combines non-E2E checks.

## Privacy and security

- Never put exact address or GPS data in client-visible URLs, logs, analytics, research/search queries, source snapshots, or LLM prompts.
- For residence resolution, transmit precise input only from the authorized server endpoint to the configured civic or geocoding provider over TLS, then discard it; persistence requires F4's explicit-consent contract.
- Persist exact residence only after explicit consent and encrypt it with versioned keys.
- Keep provider credentials, model IDs, and private base URLs server-side.
- Unknown or unverified people cannot trigger candidate dossiers.
- Fail closed when evidence, validation, or authorization is missing.

## Civic and editorial integrity

- Deterministic source-backed code owns districts, offices, candidacy status, deadlines, and outcomes.
- Preserve source URL, source type, retrieval time, effective time, and freshness for displayable facts.
- Never equate FEC registration with ballot qualification.
- Treat every candidate equally: same query policy, issue order, summary limit, evidence labels, and missing-data language.
- Never preselect, rank, or recommend candidates by party, popularity, engagement, or inferred preference.
- Sensitive legal, ethics, corruption, or misconduct claims require the roadmap's evidence gate and human approval before publication.
- Keep core civic information usable when AI is disabled or unavailable.

## Checkpoint rule

Finish each active item through `VERIFIED`, complete its feature PR CI/review, present Human Gate B, and wait for explicit approval. After approval, merge in recorded order, verify `main`, merge the status-only closeout PR, confirm `DONE` on `main`, and leave every unauthorized or dependent item inactive.
