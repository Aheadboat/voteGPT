# F4 Lean Main-Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver consented saved residence safely on actual `main`, using the accepted F4 implementation plus only the approved trust-boundary, stale-write, recovery, and destructive-test corrections.

**Architecture:** Start from current `main`, transplant only the reviewed F4 production/test tree, and retain old refs as evidence. Complete three vertical TDD tasks: bind and bound the preview/save trust boundary, add revision/ETag owner-state recovery, and guard destructive verification with two disposable databases.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Drizzle ORM, PostgreSQL/PGlite, Vitest, Testing Library, Playwright, Node 24 crypto.

## Global Constraints

- Work only in `codex/f4-main-recovery` after the coordinator recovery-record PR merges and its commit is integrated.
- This thread remains coordinator. A fresh subagent implements each task; separate subagents review specification compliance and code quality.
- Preserve explicit consent, AES-256-GCM/AAD encryption, owner isolation, account cascade, key rotation, division-only handoff, exact-location sink tests, and UX-01/02/04/05/06/07/08/09.
- Use named or derived policy constants. Do not duplicate magic limits, timeouts, token sizes, or database identifiers.
- No F5 code, R2/F6 activation, old staging coordination prose, visual redesign, generalized framework, six-database topology, or full-table locked-key preflight.
- Feature agents cannot modify `AGENTS.md`, `ROADMAP.md`, `README.md`, `F4-F5-LEAN-RECOVERY-DESIGN.md`, this plan, or coordinator-owned status tests unless their task explicitly names a focused runtime-contract hunk.

---

### Task 1: Recover the accepted F4 tree

**Files:**

- Source `36058765a32caaa10ed51551b61eb08b97364752`: `.env.example`, `drizzle/0002_saved_residence.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json`, `e2e/residence.spec.ts`, `e2e/seed-session.mjs`, `integration/postgres-auth.test.ts`, `package.json`, `playwright.config.ts`, `scripts/rotate-saved-residence-keys.mts`, `src/app/api/v1/location/resolve/route.test.ts`, `src/app/api/v1/location/resolve/route.ts`, `src/app/api/v1/residence/route.test.ts`, `src/app/api/v1/residence/route.ts`, `src/app/dashboard/page.test.tsx`, `src/app/dashboard/page.tsx`, `src/app/globals.css`, `src/app/identity-shell.test.tsx`, `src/components/account-controls.tsx`, `src/components/residence-preview.test.tsx`, `src/components/residence-preview.tsx`, `src/db/index.test.ts`, `src/db/index.ts`, `src/db/schema.ts`, `src/lib/account.test.ts`, `src/lib/residence.test.ts`, `src/lib/residence.ts`, `src/lib/saved-residence.test.ts`, `src/lib/saved-residence.ts`, and `vitest.config.mts`.
- Source `285fd9de8b52e752054a7e19cec0efa4ab65c343`: `src/lib/bounded-json.ts`, `src/lib/bounded-json.test.ts`, `src/lib/residence-policy.ts`, `src/lib/residence-policy.test.ts`.
- Coordinator-only hunk review: `tests/foundation-contract.test.ts`.

**Interfaces:**

- Consumes: current-main F3 `ResidenceInput`, `ResolutionOutcome`, signed preview route, Better Auth session lookup, and Drizzle migration chain.
- Produces: the accepted F4 baseline plus `readBoundedJson`, named residence policies, encrypted one-home repository, private residence route, account controls, rotation command, and existing browser journeys.

- [ ] **Step 1: Confirm the recovery baseline**

Run:

```powershell
git merge-base --is-ancestor 4c5fd46106013fe3a104f20de4bfcf51f2508710 HEAD
npm.cmd test
```

Expected: current recovery-record/main commit is an ancestor and the unchanged 13-file/90-test baseline passes.

- [ ] **Step 2: Apply only the listed final path states**

Generate path-filtered binary diffs from `4c5fd46..36058765` for the accepted paths and from `efab0874b67e1bfa44e26672d20a82af97d72eff..285fd9d` for the four bounded-input files. Apply those diffs with three-way context. Do not replay branch history or restore coordinator-owned files.

- [ ] **Step 3: Prove transplant boundaries**

Run:

```powershell
git diff --name-only
rg -n "F5-IMPLEMENTATION-PLAN|autonomous-f4-f8|codex/f5-review-corrections" .
npm.cmd test -- src/lib/bounded-json.test.ts src/lib/residence-policy.test.ts src/lib/residence.test.ts src/lib/saved-residence.test.ts src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts src/components/residence-preview.test.tsx
```

Expected: only listed F4/runtime-test paths appear, no stale staging authority appears, and the recovered baseline tests pass or expose only the three approved correction gaps.

- [ ] **Step 4: Commit the recovered tree**

Stage every source path listed for this task individually; never stage a directory root. Confirm `git diff --cached --name-only` matches that allowlist exactly, then run `git commit -m "feat(f4): recover saved residence"`.

Stop for coordinator verification and independent task review.

---

### Task 2: Bind and bound the preview/save trust boundary

**Files:**

- Modify: `src/lib/residence.ts`, `src/lib/residence.test.ts`, `src/app/api/v1/location/resolve/route.ts`, `src/app/api/v1/location/resolve/route.test.ts`, `src/app/api/v1/residence/route.ts`, `src/app/api/v1/residence/route.test.ts`.
- Consume unchanged: `src/lib/bounded-json.ts`, `src/lib/residence-policy.ts`.

**Interfaces:**

```ts
export type VerifyResolutionToken = (
  token: string,
  userId: string,
  expectedInput: ResidenceInput,
  secret: string,
  now: Date,
) => Extract<ResolutionOutcome, { status: "matched" | "partial" }> | null;
```

The v2 payload contains canonical `input`, `userId`, `issuedAt`, `expiresAt`, and validated public `resolution`. The save route verifies against `{ kind: "address", address: body.address }`.

- [ ] **Step 1: Write the focused RED tests**

Add these behaviors:

```text
binds v2 tokens to user, issued time, input kind, and canonical input
rejects exact-location reconstruction split across rendered public fields
rejects invalid or oversized token grammar before verification work
rejects an oversized preview body before auth, provider, signing, logging, or response work
rejects an oversized save body and invalid token grammar before crypto or persistence
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- src/lib/bounded-json.test.ts src/lib/residence-policy.test.ts src/lib/residence.test.ts src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts
```

Expected: failures prove v1 omits input, split reflection passes, both routes call unbounded `request.json()`, and malformed token grammar reaches cryptographic parsing.

- [ ] **Step 3: Implement the minimum trust-boundary change**

- Keep `CreateResolutionToken` parameters unchanged and emit v2.
- Require `isV2ResolutionTokenGrammar` before decoding or HMAC.
- Compare the payload input with `expectedInput` after canonical parsing.
- Validate public reflection across the ordered concatenation of every rendered public field while preserving canonical civic facts, district fragments, and ordinary percentages.
- Replace both POST route `request.json()` calls with `readBoundedJson(request, RESIDENCE_PREVIEW_BODY_CAP_BYTES)` or `readBoundedJson(request, SAVED_RESIDENCE_BODY_CAP_BYTES)`.
- Fail before provider, persistence, logging, or response serialization when a bound is violated.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd test -- src/lib/bounded-json.test.ts src/lib/residence-policy.test.ts src/lib/residence.test.ts src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
git add -- src/lib/residence.ts src/lib/residence.test.ts src/app/api/v1/location/resolve/route.ts src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.ts src/app/api/v1/residence/route.test.ts
git commit -m "fix(f4): bind residence previews"
```

Stop for coordinator replay and independent task review.

---

### Task 3: Add atomic revision, ETag, and owner recovery

**Files:**

- Modify: `drizzle/0002_saved_residence.sql`, `drizzle/meta/0002_snapshot.json`, `src/db/schema.ts`, `src/lib/saved-residence.ts`, `src/lib/saved-residence.test.ts`, `integration/postgres-auth.test.ts`, `src/app/api/v1/residence/route.ts`, `src/app/api/v1/residence/route.test.ts`, `src/components/residence-preview.tsx`, `src/components/residence-preview.test.tsx`.

**Interfaces:**

```ts
export type VersionedSavedResidence = {
  residence: SavedResidenceView | null;
  revision: string;
};

export function getSavedResidence(
  userId: string,
): Promise<VersionedSavedResidence | null>;

export function saveSavedResidence(
  userId: string,
  request: SaveResidenceRequest,
  verifiedResolution: SavedResidenceResolution,
  now: Date,
  expectedRevision: string | null,
): Promise<(SavedResidenceMutationResult & { revision: string }) | null>;

export function deleteSavedResidence(
  userId: string,
  expectedRevision: string,
): Promise<"deleted" | "empty" | "precondition_failed">;
```

Outer `null` means absent; inner `residence: null` means an owner row exists but cannot be decrypted. Revisions are canonical UUIDs and HTTP exposes them only as strong `ETag: "<uuid>"` values.

- [ ] **Step 1: Write the focused RED tests**

Add:

```text
atomically rejects stale replacement and deletion revisions
keeps an unreadable owner row replaceable and deletable without decrypting it
allows only one of two stale residence mutations across PostgreSQL connections
returns strong ETags and requires matching If-Match for replacement and deletion
reconciles one authoritative GET after ambiguous save or delete without retrying mutation
offers focused replacement and deletion recovery for an unreadable saved residence
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- src/lib/saved-residence.test.ts src/app/api/v1/residence/route.test.ts src/components/residence-preview.test.tsx
npm.cmd run test:postgres -- integration/postgres-auth.test.ts
```

Expected: stale requests both succeed, no revision/ETag exists, unreadable rows lose recovery controls, and transport loss is falsely described as unchanged.

- [ ] **Step 3: Implement the vertical owner-state seam**

- Add one non-null UUID `revision` column to the still-unmerged F4 migration and schema.
- Create with no precondition only when no owner row exists; never overwrite implicitly.
- Replace/delete with `user_id` plus expected revision inside the existing transaction and issue a fresh UUID only after successful replacement.
- Preserve revision during key rotation.
- Map missing/weak/mismatched `If-Match` to a generic precondition response without existence or crypto leakage.
- Return a generic recovery state plus ETag for an unreadable owner row; allow replace/delete without decrypting the old address.
- In the client, retain the ETag and perform exactly one authoritative GET after ambiguous save/delete response loss. Never retry the mutation. Block another mutation until reconciliation completes, refresh server-rendered consumers once after confirmed success, and preserve focus/live-region behavior.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm.cmd test -- src/lib/saved-residence.test.ts src/app/api/v1/residence/route.test.ts src/components/residence-preview.test.tsx
npm.cmd run test:postgres -- integration/postgres-auth.test.ts
npm.cmd run db:check
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Stage only the exact files named by this task, confirm `git diff --cached --name-only` matches that allowlist, then commit with `fix(f4): protect residence revisions`.

Stop for coordinator replay and independent task review.

---

### Task 4: Guard destructive E2E and verify the candidate

**Files:**

- Create: `e2e/database-guard.mjs`, `tests/e2e-database-guard.test.ts`.
- Modify: `playwright.config.ts`, `e2e/seed-session.mjs`, `e2e/residence.spec.ts`, `scripts/rotate-saved-residence-keys.mts`, `.github/workflows/ci.yml`, `.env.example`.
- Coordinator-only focused hunk: `tests/foundation-contract.test.ts`.

**Interface:**

```js
export async function requireE2eDatabase(
  environment = process.env,
  readTargetMarker,
) {
  // Return the validated E2E_DATABASE_URL only after a read-only target check.
}
```

Required environment contract: `E2E_DESTRUCTIVE_OPT_IN=1`, explicit `E2E_DATABASE_URL`, and a per-resource unpredictable `E2E_DATABASE_MARKER`. The guard captures ambient `DATABASE_URL` before assignment, rejects normalized equality, then performs one read-only query against the target database's externally provisioned marker table and requires an exact marker match. Application, migration, seed, and rotation code cannot create or repair this marker.

- [ ] **Step 1: Write RED guard and CI tests**

Add:

```text
requires explicit opt-in, URL, and externally supplied marker
rejects an E2E database equal to the ambient runtime database
rejects a missing or mismatched target-resident marker before migration or write
returns one validated URL for seed, app, browser, and rotation
keeps contract and destructive E2E databases separate in CI
```

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/e2e-database-guard.test.ts tests/foundation-contract.test.ts
```

Expected: missing opt-in/marker still permits seed setup, runtime-equivalent URLs and environment-only markers are accepted, and CI exposes one database to contract and destructive E2E work.

- [ ] **Step 3: Implement one fail-closed guard**

- Validate opt-in, explicit URL, ambient inequality, safe repo-local PGlite containment when applicable, and the same exact target-resident marker for every supported E2E database backend before any migration or write.
- Make Playwright, seed, browser inspection, and rotation consume the same validated URL.
- Keep two disposable CI databases only: contract/migration and marked E2E. Generate a unique marker for the E2E resource, provision its marker table outside application/migration/seeder code for PostgreSQL or PGlite, verify it read-only through the guard, and destroy both resources after their jobs.
- Add only empty example variables and concise key-operation notes; do not add secrets or a full deployment-preflight service.

- [ ] **Step 4: Run focused GREEN**

```powershell
npm.cmd test -- tests/e2e-database-guard.test.ts tests/foundation-contract.test.ts
npm.cmd run db:check
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

- [ ] **Step 5: Run exact-candidate verification**

```powershell
npm.cmd test
npm.cmd run test:postgres
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd audit --json
```

If default-parallel tests show PGlite host contention, rerun `npm.cmd test -- --maxWorkers=1` and record both outcomes. The audit must introduce no finding beyond the recorded current-main baseline of two high-severity findings; any changed affected dependency returns to coordinator review. Run guarded Chromium against a marked disposable database, confirm ports 3000/3001 clear, perform privacy scans, and record authenticated keyboard/focus/recovery checks at 375x812 and 1280x720.

- [ ] **Step 6: Commit and stop at Gate B preparation**

Stage only the exact files named by this task, confirm `git diff --cached --name-only` matches that allowlist, then commit with `test(f4): guard destructive residence checks`.

The coordinator generates the whole-branch review package, obtains independent review with no unresolved Critical/Important finding, opens the feature PR, waits for hosted CI and mergeability, and presents F4 Human Gate B. No agent merges or changes roadmap status.
