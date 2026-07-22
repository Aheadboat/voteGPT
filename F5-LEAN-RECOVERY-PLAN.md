# F5 Lean Main-Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver sourced current federal officials on actual `main` after F4 closes, using the accepted F5 implementation plus only the approved provider, provenance, cache-integrity, and same-page handoff corrections.

**Architecture:** Start a fresh F5 recovery branch from the F4 closeout commit, transplant only the reviewed F5 final tree and the reduced Census/policy final state, then complete three vertical TDD tasks. Provider work shares one snapshot/deadline, cache work preserves global identity coherence, and acceptance proves one real residence-to-officials journey without live providers.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Drizzle ORM, PostgreSQL/PGlite, Vitest, Testing Library, Playwright, Node 24 fetch/AbortController.

## Global Constraints

- Do not create or dispatch `codex/f5-main-recovery` until the F4 closeout merge places F4 `DONE` on actual `main`.
- This thread remains coordinator. A fresh subagent implements each task; separate subagents review specification compliance and code quality.
- Preserve deterministic current-office facts, equal official-card treatment, adjacent provenance/freshness, explicit partial/stale/conflict/unavailable states, normalized-location-only input, provider-free cached public profiles, and UX-01 through UX-09.
- Reuse the checked-in Census/policy bundle and its strict offline check. No local refresh writer, magic Congress/year/cache values, or duplicate provider limits.
- No state/local officials, candidates, AI, generalized provider registry, background job, transport observer/preload framework, speculative PGlite split, duplicate upgrade rehearsal, or third database.
- Feature agents cannot modify `AGENTS.md`, `ROADMAP.md`, `README.md`, `F4-F5-LEAN-RECOVERY-DESIGN.md`, this plan, or coordinator-owned status tests unless their task explicitly names a focused runtime-contract hunk.

---

### Task 1: Recover the accepted F5 and policy tree

**Files:**

- Source `9c2f29b89aa8cc434d73bc40b53699ebc4088bee`: `.env.example`, `drizzle/0003_federal_official_cache.sql`, `drizzle/meta/0003_snapshot.json`, `drizzle/meta/_journal.json`, `e2e/federal-officials.spec.ts`, `e2e/seed-session.mjs`, `integration/federal-official-cache.test.ts`, `src/app/dashboard/page.test.tsx`, `src/app/dashboard/page.tsx`, `src/app/officials/federal/[bioguideId]/page.test.tsx`, `src/app/officials/federal/[bioguideId]/page.tsx`, `src/components/federal-officials.module.css`, `src/components/federal-officials.test.tsx`, `src/components/federal-officials.tsx`, `src/components/federal-profile.test.tsx`, `src/components/federal-profile.tsx`, `src/db/schema.ts`, `src/lib/congress-gov.test.ts`, `src/lib/congress-gov.ts`, `src/lib/federal-officials-service.test.ts`, `src/lib/federal-officials-service.ts`, `src/lib/federal-officials.test.ts`, `src/lib/federal-officials.ts`, `src/lib/house-clerk-vacancy.test.ts`, `src/lib/house-clerk-vacancy.ts`, `tests/fixtures/clerk-current-vacancies.html`, `tests/fixtures/congress-current.json`, `tests/fixtures/congress-house.json`, `tests/fixtures/congress-member-house.json`, `tests/fixtures/congress-member-senator-one.json`, `tests/fixtures/congress-member-senator-two.json`, and `tests/fixtures/congress-senate.json`.
- Source `149ea1d66cf81f3d4405a5774c18f203e801e236`: `.gitattributes`, `data/census/2020-apportionment.csv`, `data/census/2020-apportionment.metadata.json`, `data/census/state.txt`, `scripts/generate-federal-policy.mts`, `src/lib/federal-officials.test.ts`, `src/lib/federal-officials.ts`, `src/lib/federal-policy.generated.ts`, `src/lib/federal-policy.test.ts`, `src/lib/federal-policy.ts`, `src/lib/federal-provider-host-policy.d.mts`, `src/lib/federal-provider-host-policy.mjs`, `tests/federal-policy-literal-audit.test.ts`, and `tests/generate-federal-policy.test.ts`.
- Exclude `.gitignore` refresh-writer state and all old coordinator/design/plan files.

**Interfaces:**

- Consumes: F4 closeout `main`, saved normalized divisions, guarded E2E database contract, router refresh behavior, and existing-data migration evidence.
- Produces: accepted federal domain/adapters/cache/views/E2E baseline plus `CongressSnapshot`, checked-in Census data, offline policy check, named provider/cache limits, URL builders, and validation policies.

- [ ] **Step 1: Confirm the F4 handoff baseline**

Run:

```powershell
$f4CloseoutCommit = (git rev-parse main).Trim()
git merge-base --is-ancestor $f4CloseoutCommit HEAD
rg -n "## F4 .*\[DONE\]" ROADMAP.md
npm.cmd test
```

Expected: the current `main` F4 closeout commit is an ancestor, F4 is `DONE`, and current-main verification passes. The coordinator records the exact resolved SHA in the task report before dispatch.

- [ ] **Step 2: Apply only the listed final path states**

Apply path-filtered final-tree diffs for `6a7db1d9037ebd9ea7a47d2c00d6a623575619f5..9c2f29b` and the listed final R1 paths from `149ea1d`. Do not replay the 48-commit correction history and do not import `.gitignore`, README, roadmap, AGENTS, or old plan/spec amendments.

- [ ] **Step 3: Prove transplant boundaries**

```powershell
node scripts/generate-federal-policy.mts --check
npm.cmd test -- tests/generate-federal-policy.test.ts tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx "src/app/officials/federal/[bioguideId]/page.test.tsx" src/app/dashboard/page.test.tsx
npm.cmd run test:postgres -- integration/federal-official-cache.test.ts
```

Expected: offline policy state is internally consistent and tests either pass or expose only the approved provider/cache/handoff gaps.

- [ ] **Step 4: Commit one reviewed final-state recovery**

```powershell
git add -- .env.example .gitattributes data drizzle e2e integration scripts src tests
git commit -m "feat(f5): recover federal officials"
```

Stop for coordinator replay and independent task review.

---

### Task 2: Share provider snapshot, deadline, and provenance

**Files:**

- Modify: `src/lib/federal-policy.ts`, `src/lib/federal-policy.test.ts`, `tests/federal-policy-literal-audit.test.ts`, `src/lib/federal-officials.ts`, `src/lib/federal-officials.test.ts`, `src/lib/congress-gov.ts`, `src/lib/congress-gov.test.ts`, `src/lib/house-clerk-vacancy.ts`, `src/lib/house-clerk-vacancy.test.ts`, `src/lib/federal-officials-service.ts`, `src/lib/federal-officials-service.test.ts`, `src/components/federal-officials.tsx`, `src/components/federal-officials.test.tsx`, `src/components/federal-profile.tsx`, `src/components/federal-profile.test.tsx`, `src/app/officials/federal/[bioguideId]/page.test.tsx`, `src/app/dashboard/page.test.tsx`, `tests/fixtures/clerk-current-vacancies.html`, `tests/fixtures/congress-current.json`, `tests/fixtures/congress-house.json`, `tests/fixtures/congress-member-house.json`, `tests/fixtures/congress-member-senator-one.json`, `tests/fixtures/congress-member-senator-two.json`, and `tests/fixtures/congress-senate.json`.

**Interfaces:**

```ts
export type SourceRef = Readonly<{
  publisher:
    | "Biographical Directory of the United States Congress"
    | "Office of the Clerk, U.S. House of Representatives";
  sourceType: "member" | "vacancy";
  publicUrl: string;
  ingestionUrl: string;
  retrievedAt: string;
  recordUpdatedAt: string | null;
  effectiveAt: string | null;
}>;

export type FetchCongressRoster = (
  jurisdiction: FederalJurisdiction,
  options: {
    apiKey: string;
    fetch: typeof globalThis.fetch;
    snapshot: CongressSnapshot;
    signal: AbortSignal;
  },
) => Promise<CongressRosterOutcome>;

export type FetchCurrentHouseVacancies = (
  snapshot: CongressSnapshot,
  options: { fetch: typeof globalThis.fetch; signal: AbortSignal },
) => Promise<HouseVacancyOutcome>;
```

The service creates one `CongressSnapshot`, one `AbortController`, and one `FEDERAL_REFRESH_DEADLINE_MS` timer; starts Congress and Clerk promises before awaiting either; clears the timer in `finally`. Adapters create no timer, controller, retry, or transport client.

- [ ] **Step 1: Write focused RED tests**

Add:

```text
starts Congress and Clerk together with one snapshot and one deadline
rejects invalid national Clerk evidence before selecting the requested state
keeps authenticated Congress URLs fetch-only and emits credential-free ingestion provenance
renders publicUrl only and never serializes ingestionUrl
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx "src/app/officials/federal/[bioguideId]/page.test.tsx" src/app/dashboard/page.test.tsx
```

Expected: providers serialize and own separate timers/clocks, Clerk filters before validating the national response, and `SourceRef.url` conflates public and ingestion links.

- [ ] **Step 3: Implement the minimum provider seam**

- Consume the R1 snapshot, deadline, response bounds, name/Bioguide validators, and URL builders; define no local duplicates.
- Launch both fetch-only adapters concurrently with the shared signal.
- Validate the complete national Clerk response before jurisdiction selection and map complete/partial/conflict/unavailable evidence explicitly.
- Give every source a stable human `publicUrl` and credential-free canonical `ingestionUrl`; pass API-key URLs only to fetch.
- Render only `publicUrl`; never serialize or expose `ingestionUrl`, API keys, precise location, or provider-private query values.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd test -- tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx "src/app/officials/federal/[bioguideId]/page.test.tsx" src/app/dashboard/page.test.tsx
npm.cmd run typecheck
npm.cmd run lint
git diff --check
git add -- src tests
git commit -m "fix(f5): unify provider evidence"
```

Stop for coordinator replay and independent provider/domain review.

---

### Task 3: Preserve cache integrity under locks and races

**Files:**

- Modify: `src/lib/federal-officials-service.ts`, `src/lib/federal-officials-service.test.ts`, `integration/federal-official-cache.test.ts`.

**Interfaces:** existing exported repository/service signatures remain unchanged. Add internal helpers only:

```ts
type FederalCacheTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

async function acquireFederalCacheLock(
  tx: FederalCacheTransaction,
): Promise<void>;
async function readClockTimestamp(
  tx: FederalCacheTransaction,
): Promise<Date>;
```

Transaction order is lock, database `clock_timestamp()`, target/global reads and validation, replacement/profile mutation, then commit.

- [ ] **Step 1: Write focused RED tests**

Retain existing real race tests and add:

```text
captures database time after the refresh lock and preserves a waited-for winner
repairs an invalid target row before publishing a valid generation
keeps a profile while any surviving roster references its Bioguide ID
removes a profile only after its final roster reference disappears
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- src/lib/federal-officials-service.test.ts
npm.cmd run test:postgres -- integration/federal-official-cache.test.ts
```

Expected: target state is interpreted without a proven post-lock database time, invalid target data aborts refresh, and orphan analysis is state-local.

- [ ] **Step 3: Implement the minimum cache correction**

- Acquire the existing lock before reading database time or classifying target state.
- Preserve a valid winner that became fresh while this writer waited.
- Repair invalid target rows only inside the locked replacement transaction.
- Reject older/equal generation conflicts that would mutate newer state.
- Determine displaced profile deletion from all surviving roster references across states.
- Keep the existing table and indexes; add no background worker or normalized reference table.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd test -- src/lib/federal-officials-service.test.ts
npm.cmd run test:postgres -- integration/federal-official-cache.test.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
git add -- src/lib/federal-officials-service.ts src/lib/federal-officials-service.test.ts integration/federal-official-cache.test.ts
git commit -m "fix(f5): preserve official cache integrity"
```

Stop for coordinator replay and independent cache/database review.

---

### Task 4: Prove the F4 handoff and verify the candidate

**Files:**

- Create: `e2e/fixture-policy.mts`, `tests/e2e-fixture-policy.test.ts`.
- Modify: `e2e/seed-session.mjs`, `e2e/federal-officials.spec.ts`, `src/app/dashboard/page.test.tsx`.
- Modify `src/app/dashboard/page.tsx` only if RED proves server refresh does not consume the latest saved divisions.
- Consume unchanged: F4 database guard, Playwright configuration, router refresh behavior, and two-database CI contract.

**Interface:**

```ts
export type FederalFixtureClock = Readonly<{
  snapshot: CongressSnapshot;
  servingTerm: Readonly<{ start: string; end: string }>;
  freshRetrievedAt: string;
  staleRetrievedAt: string;
  expiredRetrievedAt: string;
}>;

export function createFederalFixtureClock(now: Date): FederalFixtureClock;
```

- [ ] **Step 1: Write focused RED tests**

Add:

```text
derives Congress, terms, and cache ages from one federal fixture clock
updates one authenticated dashboard no home -> Georgia -> California -> no home without reload or provider traffic
```

The browser test records reload/navigation events, blocks live provider hosts, and checks that old cards, sources, exact address, tokens, and revisions disappear after each transition.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/e2e-fixture-policy.test.ts src/app/dashboard/page.test.tsx
npm.cmd run test:e2e -- e2e/federal-officials.spec.ts
```

Expected: seed code hardcodes Congress/term/cache arithmetic and existing journeys use separate preseeded identities instead of one live residence lifecycle.

- [ ] **Step 3: Implement the minimum acceptance seam**

- Derive all Congress, term, fresh/stale/expired fixture values from one injected time and R1 policy.
- Preserve the F4 contract and marked E2E database separation; add no third database.
- On one authenticated page, save GA-13, replace with CA-01, then delete; wait for authoritative F4 success and server refresh after each mutation.
- Assert no manual reload, live provider call, stale prior-state card/source, or exact-location/token/revision leak.
- Preserve equal cards, adjacent source/freshness, honest coverage, keyboard/focus/responsive behavior, and SSR/no-JavaScript profiles.

- [ ] **Step 4: Run focused GREEN**

```powershell
node scripts/generate-federal-policy.mts --check
npm.cmd test -- tests/e2e-fixture-policy.test.ts src/app/dashboard/page.test.tsx
npm.cmd run test:e2e -- e2e/federal-officials.spec.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

- [ ] **Step 5: Run exact-candidate verification**

```powershell
npm.cmd test
npm.cmd run db:check
npm.cmd run test:postgres
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --json
```

If default-parallel tests show PGlite host contention, rerun `npm.cmd test -- --maxWorkers=1` and record both outcomes. The audit must introduce no finding beyond the recorded current-main baseline of two high-severity findings; any changed affected dependency returns to coordinator review. Confirm ports 3000/3001 clear and complete privacy, keyboard, focus, responsive, and no-JavaScript evidence.

- [ ] **Step 6: Commit and stop at Gate B preparation**

```powershell
git add -- e2e tests/e2e-fixture-policy.test.ts src/app/dashboard/page.test.tsx src/app/dashboard/page.tsx
git commit -m "test(f5): prove residence official handoff"
```

The coordinator generates the whole-branch review package, obtains independent review with no unresolved Critical/Important finding, opens the feature PR, waits for hosted CI and mergeability, and presents F5 Human Gate B. No agent merges or changes roadmap status.
