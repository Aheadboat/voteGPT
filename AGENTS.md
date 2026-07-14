# Repository Instructions

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## Source of truth

- `ROADMAP.md` owns scope, order, acceptance criteria, gates, and progress.
- Work only on the single roadmap item marked active.
- Do not begin a later feature, create speculative scaffolding, or widen scope without roadmap approval.
- Parallel work is allowed only inside the active feature.

## Roadmap item protocol

Roadmap items move through `TODO → explicit authorization → IN PROGRESS (DISCOVER/DESIGN/PLAN) → Human Gate A → RED → GREEN → REFACTOR → VERIFIED → Human Gate B → DONE`.

- Only explicit user authorization moves a `TODO` item to `IN PROGRESS`.
- At most one item may be `IN PROGRESS`; zero active items is valid between authorizations.
- Never activate the next item automatically.

### Discover, design, and plan

- Confirm the user outcome, dependencies, applicable domain DNA, risks, non-goals, and unresolved decisions.
- Prefer vertical, independently testable user outcomes over frontend/backend layer splits.
- Build a task graph. Each implementation task records its outcome, expected RED failure, files or interfaces, dependencies, and done criteria. Non-implementation tasks record a falsifiable check and expected result.
- Mark parallel lanes only after their dependencies and interfaces are settled.
- Keep the plan in the active `ROADMAP.md` item while it remains readable. If it cannot stay concise, create a single linked plan file. Do not create a plan directory in advance.

### Human Gate A

Before RED or production work, present the overall design, tests-first implementation plan, task graph, proposed parallel lanes, risks, dependencies, and non-goals. Continue only after explicit user approval.

### Task graph and delegation

- Main agent owns integration, roadmap state, and final verification.
- Parallelize only independent tasks with settled interfaces and no overlapping files or mutable state; otherwise work sequentially.
- Give each subagent one bounded task with the roadmap/task ID, outcome, allowed files, applicable DNA IDs, dependencies and interfaces, expected RED failure, focused test command, and stop condition.
- Subagents do not change roadmap status or mark work complete. The main agent inspects their changes and reruns their tests.
- Independent review agents stay read-only unless a separately approved fix task is assigned.

### Human Gate B

After VERIFIED, present delivered behavior, the final overall design, design deviations and tradeoffs, test evidence, applicable DNA evidence, manual accessibility or visual checks when relevant, and remaining risks or non-goals. Only explicit user approval marks the item DONE. If changes are requested, return to the appropriate earlier stage and reverify.

After approval, record it, mark only the current item `DONE`, and leave every later item `TODO` until separately authorized.

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
7. Record evidence, present Human Gate B, and stop. Mark the feature done only after explicit user approval.

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

Finish the active feature end to end, verify it, update durable artifacts, present Human Gate B, and stop. After approval, mark it done without rolling into the next feature.
