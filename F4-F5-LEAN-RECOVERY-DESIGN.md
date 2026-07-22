# F4/F5 Lean Main-Recovery Design

**Status:** Human Gate A and written specification approved on 2026-07-21.

## Outcome

Deliver F4 and then F5 on actual `main` without merging the cumulative staging branch, importing obsolete coordination prose, or implementing speculative infrastructure.

This thread remains the coordinator. It owns branch records, plans, gates, reviews, PRs, merges, verification, and closeout. Fresh bounded subagents own production-code tasks and cannot change roadmap authority.

## Recovery shape

1. A coordinator-only recovery record replaces the stale feature-branch references while keeping R2 queued and F6 inactive.
2. `codex/f4-main-recovery` starts from current dependency-complete `main` and receives a path-filtered transplant of the accepted F4 production/test state plus the completed bounded-input correction.
3. F4 receives fresh TDD evidence, review, hosted CI, Human Gate B, a feature merge to `main`, post-merge verification, and a status-only closeout merge.
4. `codex/f5-main-recovery` remains inert at the recorded recovery base. Only after F4 is `DONE` does the coordinator integrate current `main` and dispatch the accepted F5 production/test state plus a reduced final snapshot of the completed Census/policy correction.
5. F5 receives the same verification, Gate B, merge, and closeout sequence.

Old staging and correction refs remain untouched as historical evidence. Do not merge/rebase the staging branch or replay its interleaved commit history. Do not carry old F4/F5-specific `README.md` or `AGENTS.md` changes. `ROADMAP.md` receives only the authority and evidence required by the repository contract.

## F4 task graph

### F4-1 — Trust-bound preview and save

- Bind the signed preview to the user, issue time, input kind, and canonical input.
- Reject exact-location reconstruction across the rendered result as a whole.
- Bound private request bodies and validate token grammar before provider, cryptographic, persistence, logging, or response work.
- Derive limits from named grammar/policy constants; do not duplicate magic values.
- **Expected RED:** changed or cross-kind input verifies, split reflection signs, or an oversized body reaches downstream work.

### F4-2 — Atomic owner state and recovery

- Add one opaque UUID revision and strong ETag precondition for replacement and deletion.
- Use atomic compare-and-swap so stale tabs cannot overwrite or delete newer state.
- Keep unreadable encrypted rows owner-replaceable and owner-deletable without exposing failure details.
- After ambiguous response loss, perform one authoritative read; never blindly retry a mutation.
- Preserve focus, live-region, recovery, owner isolation, encryption, consent, cascading deletion, rotation, and division-only handoff behavior.
- **Expected RED:** two stale mutations both succeed, an unreadable row has no recovery action, or a committed mutation is reported as unchanged after transport loss.

### F4-3 — Guard destructive verification

- Require explicit E2E opt-in and one validated `E2E_DATABASE_URL` shared by seed, app, browser inspection, and rotation.
- Reject an E2E database that equals the ambient runtime database and require an exact match against a per-resource marker already provisioned inside the target database before any migration or write. Environment input alone cannot establish the marker.
- Use two disposable CI databases: contract/migration and marked E2E.
- Keep key-operation guidance concise; defer full-table locked-key preflight until real key retirement exists.
- **Expected RED:** missing opt-in/marker or a runtime-equivalent database can still be seeded, or CI exposes one database to both contract and destructive E2E work.

### F4-4 — Verification only

Run focused tests, deterministic full tests when host contention appears, database checks, PostgreSQL contracts, typecheck, zero-warning lint, build, guarded browser tests, audit, privacy scans, accessibility/responsive review, and independent whole-feature review. No unresolved Critical or Important finding may reach Gate B.

## F5 task graph

F5 feature work starts only after the F4 closeout merge is on `main` and integrated into the inert F5 recovery branch.

### F5-1 — Provider correctness and provenance

- Start Congress and Clerk concurrently under one injected snapshot and deadline.
- Validate national evidence before deciding complete, partial, conflict, or unavailable coverage.
- Keep provider access fetch-only and credential-free outside the fetch boundary.
- Separate stable public source links from canonical, credential-free ingestion provenance.
- Reuse the checked-in Census/policy boundary and its offline drift check; do not add a local refresh writer.
- **Expected RED:** providers serialize, use independent clocks, accept globally invalid Clerk evidence, or render an ingestion URL as a public source.

### F5-2 — Cache integrity

- Capture database time after acquiring the refresh lock.
- Preserve a valid winner, repair invalid target rows, and prevent older/equal generations from corrupting newer state.
- Keep Bioguide/profile references coherent across states before orphan deletion.
- Use the existing schema and focused two-connection PostgreSQL tests; add no speculative cache table or background job.
- **Expected RED:** a waiting writer misclassifies a valid winner, corrupt data makes refresh unrecoverable, or state-local cleanup deletes a still-referenced profile.

### F5-3 — F4 handoff acceptance

- Derive Congress/term/cache fixtures from one policy snapshot instead of hardcoded election-cycle values.
- Retain the separate contract and marked E2E databases inherited from F4; add no third upgrade database.
- Prove one authenticated page transitions `no home -> Georgia -> California -> no home` without manual reload, live provider traffic, stale cards, or exact-location leakage.
- Preserve equal presentation, adjacent provenance/freshness, honest coverage, keyboard/focus behavior, responsive behavior, and no-JavaScript public profiles.
- **Expected RED:** fixtures restate Congress years, old cards survive a residence change, or the same-page journey requires reload/provider access.

### F5-4 — Verification only

Run focused provider/cache/UI tests, PostgreSQL cache races, the offline policy check, full tests, typecheck, zero-warning lint, build, guarded browser tests, audit, and independent whole-feature review. No unresolved Critical or Important finding may reach Gate B.

The local 48-commit F5 correction range is preserved as source evidence but reduced to one reviewed final-state commit containing the inseparable provenance data, generator, policy code, and tests. Do not rebuild its reviewed policy boundary from scratch and do not import its historical amendment ceremony.

## Deliberate deferrals and deletions

- No six-database F4 topology, exhaustive symlink matrix, child-process snapshot framework, or generalized token framework.
- No F5 transport preload/observer framework, speculative PGlite project split, duplicate upgrade rehearsal, or third CI database.
- No R2 or F6 activation, visual redesign, multiple homes, residence history, KMS/RLS expansion, background refresh jobs, generalized provider registry, or new data source.
- Revisit a deferral only after a reproduced defect, a real deployment/key-retirement need, or measured test instability.

## Risks and controls

- **Path-filtered transplant omits a dependency:** compare complete source/ref diffs, run focused and full verification, and require independent review.
- **Conservative reflection rejection hides safe provider text:** keep canonical civic facts and ordinary district/percentage text allowed while rejecting reconstructed input.
- **Squashed recovery history loses task chronology:** retain old refs and PRs as immutable evidence; review the exact new diff and run new CI.
- **Dependency audit baseline:** current `main@4c5fd46` installs with two high-severity audit findings. Treat them as a separate reproduced dependency issue unless the recovery work changes the affected dependency surface.

## Human gates

- Gate A: approved for this design and written specification on 2026-07-21.
- F4 Gate B: after exact-head verification, hosted CI, mergeability, and independent review.
- F5 Gate B: separately, after F4 is `DONE` and the final F5 candidate passes the same conditions.
- Any material product, privacy, security, data-retention, vendor, credential, scope, or architecture change returns to the appropriate gate.
