# F4/F5 Review Corrections Design

**Status:** Draft for explicit user review
**Date:** 2026-07-17
**Authoritative integration base:** `codex/autonomous-f4-f8-integration@fbb7945a48d6887498da9116104422ebc565e42d`
**Correction branches:** `codex/f4-review-corrections`, then `codex/f5-review-corrections`

## Purpose

Correct the F4 saved-residence and F5 federal-officials trust, concurrency, provenance, recovery, and test-harness gaps found by independent adversarial review. Preserve the existing user outcomes and the F3-to-F4-to-F5 privacy boundary. Do not activate F6 or later work.

The implementation remains tests-first. Each bounded correction task gets one fresh implementer subagent and a separate read-only reviewer. The coordinator owns this design, the later implementation plan, roadmap state, shared-surface handoffs, PRs, CI, and Human Gates; it does not implement production code.

## Constraints that remain unchanged

- One explicitly consented encrypted home; no residence history or multiple homes.
- F3 produces provider-neutral normalized divisions and provenance. F4 persists the exact address only after consent.
- F5 receives divisions only through `getSavedResidenceDivisions(userId)` and never receives or decrypts the address.
- Exact location stays out of URLs, logs, analytics, research/search inputs, LLM prompts, and app-managed browser storage.
- Civic facts remain deterministic, source-backed, usable without AI, and explicit about partial, unavailable, stale, or conflicting evidence.
- Actual `main` remains unchanged until final Human Gate B approval.
- F4 correction feature and closeout merge before F5 receives shared dashboard, database-test, and E2E ownership.

## Decisions at a glance

| ID | Decision |
| --- | --- |
| D1 | Residence preview tokens move to `v2` and bind the authenticated user plus canonical input with a purpose-derived HMAC. No address or coordinate appears in the readable payload. |
| D2 | Address-reflection validation runs when signing and when saving, over individual fields and the aggregate display surface. It rejects an ordered address-token subsequence even when split across fields or interleaved with other words. |
| D3 | Saved-residence state uses a server-generated opaque UUID revision. GET exposes it only as a strong ETag; replace and delete use exact `If-Match` compare-and-swap. |
| D4 | An unreadable encrypted row remains owner-manageable: the owner can retry, explicitly replace, or delete it with its ETag without exposing key details. |
| D5 | Ambiguous mutation completion triggers one bounded authoritative GET, never a blind mutation retry. Confirmed success calls `router.refresh()` once so server-rendered officials stay coherent. |
| D6 | App-managed browser persistence remains forbidden. Browser autofill stays available with explicit disclosure that it is browser-controlled, not voteGPT storage. |
| D7 | Key configuration gains a read-only authenticated preflight and operator runbook; deployment must validate active and referenced legacy keys before serving F4. |
| D8 | Federal district admission uses runtime Congress.gov-plus-Clerk confirmation with generated Census apportionment data as local preflight/fallback. Runtime/Census conflict fails closed. |
| D9 | One shared Congress clock and one aggregate refresh deadline replace scattered dates, Congress numbers, and per-request timers. Independent provider calls run concurrently under the shared signal. |
| D10 | User-facing provenance uses public human-readable pages; ingestion URLs remain server-side evidence metadata. Partial House evidence never claims a verified current officeholder. |
| D11 | Invalid or future-dated cache records are repairable poison. Cross-roster Bioguide transitions are resolved atomically; Senate ordering is a neutral Bioguide order. |
| D12 | E2E requires a dedicated guarded database and cannot fall back to runtime `DATABASE_URL`. Congress credentials are blanked and live provider access is trapped. |
| D13 | PGlite migrations run in an isolated bounded test project; hosted PostgreSQL rehearses upgrading existing F1 identity/session data through the complete migration chain. |

## F4 design: saved-residence trust and consistency

### 1. Opaque `v2` input binding

The readable signed payload remains address-free:

```ts
type ResolutionTokenV2 = Readonly<{
  version: "v2";
  userId: string;
  issuedAt: string;
  expiresAt: string;
  inputBinding: string;
  resolution: ResolvedResidence;
}>;
```

`inputBinding` is a 32-byte base64url HMAC-SHA-256 produced with a purpose-specific HKDF-derived key. Its canonical input includes the token user, issued time, input kind, and canonical address or coordinates. Including issued time prevents stable cross-token linking. Verification accepts the expected input separately, recomputes the binding in constant time, then revalidates the resolution.

The preview endpoint issues only `v2`. A `v1` token may still be displayed by an already-open client, but cannot authorize persistence; the user must run a fresh check. There is no compatibility path that saves an unbound token and no provider re-resolution at save time. Named encoded-token and private-request size limits are enforced before expensive parsing or verification; their values are derived from the bounded schema rather than repeated route literals.

### 2. Aggregate reflection rejection

The existing Unicode, punctuation, numeric-equivalence, and structured-field protections stay. A shared validator additionally:

1. canonicalizes every user-visible result field;
2. builds the ordered aggregate display surface using explicit field boundaries;
3. rejects the full normalized address token sequence when it appears in order, even if tokens cross field boundaries or unrelated tokens appear between them.

This catches both split reflection (`"123 Main"` plus `"Street"`) and interleaved reflection (`"123 verified Main Street"`). It runs before signing and again after token verification at the save boundary. Exact input never becomes part of an error, source snapshot, or diagnostic output.

### 3. Opaque revision and HTTP preconditions

The saved-residence parent gains a non-null UUID revision. Existing rows receive generated UUIDs in the ordered migration; new and replacement writes receive server-generated UUIDs. Rotation does not change the residence revision.

The external contract is:

- GET empty: `200 { status: "empty" }`, no ETag.
- GET readable: `200 { status: "saved", residence: ... }` plus a strong ETag formatted by one shared helper.
- GET unreadable: `200 { status: "recovery_required", message: ... }` plus the same kind of ETag; no key version, ciphertext, or crypto failure detail.
- POST without `If-Match`: create only. An existing row returns generic private `409`.
- POST with one exact strong `If-Match`: explicit replace. The repository updates only the owner row whose UUID revision matches, installs a fresh revision, and replaces divisions in the same transaction.
- DELETE requires one exact strong `If-Match` and deletes only the matching owner row.
- Weak validators, wildcard validators, lists, or malformed preconditions return `400`; a well-formed stale validator returns private `409`.

A stale replace or delete changes nothing. The response does not reveal the current row or current ETag. This uses `409` because that recovery contract was explicitly approved; it does not introduce a separate `412` state.

### 4. Unreadable-owner recovery

Only authenticated owner decryption/authentication failures become `recovery_required`. Database, authorization, schema, and general configuration failures remain unavailable.

From recovery state the owner may:

- retry after an operator restores the key;
- delete after destructive confirmation using the current ETag; or
- explicitly replace using a fresh `v2` preview, consent, and the current ETag.

Replacement does not decrypt the old row. The UI must say that the old address cannot be displayed and that replacement permanently overwrites it. No automatic deletion, hidden rotation, or silent replacement is allowed.

### 5. Bounded requests and authoritative reconciliation

The exact-address `/location/resolve` preview plus all private residence reads and mutations use a shared named timeout policy, AbortController cleanup, request supersession, and unmount cancellation. The proposed default is `RESIDENCE_HTTP_TIMEOUT_MS = 15_000`, chosen to exceed F3's maximum two sequential five-second provider attempts without scattering literals. Geolocation keeps its separate named ten-second policy.

For an explicit server error, the UI follows the returned state. For transport loss, timeout, or an unreadable success body after POST/DELETE, it performs exactly one bounded GET:

- save/replace is confirmed only when the authoritative address, normalized divisions, provenance, and consent match the intended committed state;
- delete is confirmed only when GET returns empty;
- a different current state becomes a conflict, clears stale consent/confirmation, and requires the user to review it;
- failed reconciliation reports an unknown state and blocks another mutation until a successful reload.

There is no automatic mutation retry. An authoritative save, replacement, or deletion—direct or reconciled—updates local private state and calls `router.refresh()` exactly once. Failure, conflict, auth loss, and unknown state call it zero times.

### 6. Browser storage and autofill

voteGPT code continues to write no address or token to localStorage, sessionStorage, IndexedDB, Cache API, history, URLs, or service-worker storage. The address input keeps `autocomplete="street-address"` for accessible manual entry. Adjacent copy makes the boundary honest: the user's browser may offer or retain address autofill under its own settings; voteGPT does not persist the draft on the device.

This narrows the earlier ambiguous phrase “never enters browser storage” to the enforceable app-storage contract without pretending that a web app controls browser-managed autofill.

### 7. Key deployment and rotation preflight

A read-only operator preflight authenticates every stored envelope in stable batches using the active key plus every referenced legacy version. It writes nothing and emits counts only. Missing, malformed, wrong, or unauthenticating keys fail generically. The deployment/runbook sequence is:

1. configure the active key and every database-referenced legacy key;
2. run the read-only preflight before serving F4;
3. rotate in resumable batches when required;
4. rerun preflight and grouped reference counts;
5. remove a legacy key only after no row references it;
6. restore the prior complete keyring on rollback.

`.env.example` contains names and format guidance but no secret. The operator runbook owns generation, deployment, rotation, retirement, and rollback commands. README only links to the runbook and remains coordinator-owned.

## F5 design: federal district and evidence integrity

### 1. One policy and generated-data boundary

A small federal policy module owns:

- current-Congress calculation from an injected clock snapshot;
- the aggregate refresh deadline and cache age policies;
- canonical Bioguide and official-name validation;
- public source URL construction;
- neutral Bioguide ordering; and
- Census district assessment.

The checked-in Census artifact is generated from an authoritative apportionment release, not typed by hand. It records source URL, source release/version, retrieval and generation times, content hash, effective Congress range, state/FIPS code, and representative count. Builds and tests do not require the network. A generation/check command fails when metadata, the content hash, state coverage, totals, or effective range disagree.

Policy values live behind named exports or generated metadata; Congress numbers, term years, district maxima, request ceilings, freshness ages, name limits, and timeouts are not repeated as anonymous literals.

### 2. Runtime confirmation with local fallback

For the selected supported state, runtime district evidence is the set union of:

- current House districts returned by Congress.gov; and
- current House vacancies returned by the Clerk.

The decision matrix is:

| Local Census result | Runtime result | Decision |
| --- | --- | --- |
| Selected district is invalid locally | Any | Reject before cache/provider construction. |
| Dataset is outside its effective Congress range | Any | Fail closed as unsupported evidence; do not guess. |
| Runtime set exactly equals the local apportioned set | Complete | Runtime-confirmed. |
| Every returned runtime district is local, but the union is a strict subset (including no evidence because providers are unavailable) | Unavailable/incomplete | Use the local Census result and label runtime confirmation unavailable. |
| Any returned runtime district is outside local, has the wrong at-large shape, or otherwise cannot be reconciled | Conflict | Fail closed; publish no roster for that refresh, even if another provider is unavailable. |

At-large district `00` is valid only for a one-representative state. Multi-district states accept only districts present in generated data. Conflict precedence is absolute: classify all returned evidence first, fail on any outside-local or wrong-shape value, and consider fallback only when every returned value is a strict local subset. A runtime subset never overrides local truth; a runtime conflict never silently falls back.

### 3. Shared clock, cancellation, and concurrency

Each refresh captures one `CongressSnapshot` containing checked time and current Congress. Congress and Clerk work start together under one root AbortSignal and one named aggregate deadline. After the current-Congress dependency is known, independent House/Senate lists and member details run concurrently under the same signal. Adapters retain response-size, grammar, redirect, content-type, and count bounds but own no independent timeout and perform no retry.

Every provider response, Census artifact, cache generation, term, and E2E fixture is checked against the same snapshot. Late results after abort are ignored. Runtime incompleteness uses the approved local fallback; malformed or contradictory evidence fails closed.

### 4. Public provenance and truthful presentation

`SourceRef` separates `publicUrl` from `ingestionUrl`. User-facing links use the official Biographical Directory page keyed by Bioguide ID; the Congress.gov API URL remains ingestion metadata and is never rendered as the public citation. Clerk vacancy links remain public Clerk pages.

Accessible source names include the official or office so repeated Senate links and source regions are distinguishable. Card hierarchy, spacing, and source/freshness placement remain equal.

House copy follows evidence:

- Congress plus Clerk agreement may say verified current officeholder.
- Congress member evidence with Clerk unavailable says Congress.gov lists the officeholder and House vacancy evidence was unavailable at last check.
- Clerk-only or conflicting evidence describes exactly what is known and never upgrades it to verified.

Public profile and roster routes retain SSR and no-JavaScript behavior.

### 5. Cache poison recovery and Bioguide transitions

The existing cache table and lock remain; no speculative schema or index is added. Canonical validation at the cache boundary mirrors provider bounds: trimmed official names, named length limits, no C0/C1 controls, valid source matrix, canonical Senate order, current Congress, and non-future timestamps.

During a validated replacement transaction:

1. a corrupt or future target roster/profile is classified as repairable poison and removed before generation comparison;
2. valid rosters referencing every incoming or displaced Bioguide are inspected across all states, districts, and chambers;
3. a newer contradictory office generation invalidates every older referencing roster atomically;
4. an equal or newer contradictory surviving roster rejects the incoming replacement;
5. profiles are published before the roster, and an orphan profile is deleted only when no surviving roster references it;
6. any failure rolls the transaction back.

Profile reads remain fail closed. A later validated roster refresh repairs poisoned profile rows. The initial implementation may scan the small cache under the existing lock; an index or normalized reference table requires measured need.

Senators are sorted by ascending Bioguide ID before persistence and rendering. Provider response order and names do not control presentation order.

## Cross-feature and harness design

### 1. Residence-to-officials coherence

F4 owns `router.refresh()` after authoritative residence mutation. After F4 closes, F5 owns one same-page browser journey proving:

`no home -> Georgia officials -> California officials -> no home`

without a manual reload or client-side provider call. Old cards and sources disappear, new cards retain equal hierarchy/provenance/freshness, and failures do not fabricate officials.

Dashboard copy becomes honest until F6: public federal profiles can be opened without signing in when a verified link is available, while broader public office browsing is not yet available.

### 2. Dedicated destructive E2E database

E2E accepts only `E2E_DATABASE_URL`; it never reads runtime `DATABASE_URL` as a fallback. Before opening any connection, the harness performs every offline check:

- a named destructive-test opt-in must match the versioned harness sentinel;
- an ambient runtime URL must not equal the E2E URL;
- in-memory PGlite is rejected;
- a file-backed PGlite path must resolve inside the repository's dedicated ignored E2E data directory; and
- the URL/scheme and destructive-test opt-in must pass without consulting a database.

For PostgreSQL only, the harness then opens a connection for one read-only marker query. The dedicated database must already contain the expected versioned marker row. A missing or wrong marker closes the connection and fails before any migration, seed, delete, update, or insert.

Hosted CI creates a separate E2E database and marker before running the seed. The marker cannot be created by the destructive seeder itself. The one validated URL is then passed explicitly to seed, app, browser worker, raw inspection, and rotation processes.

This layered contract avoids database-name heuristics and prevents a mere environment typo from authorizing production mutation.

### 3. Fixture-only provider behavior

Playwright configuration explicitly blanks `CONGRESS_GOV_API_KEY`. The seed rejects a nonblank key independently, and server-side E2E provider construction fails if a live Congress/Clerk fetch is attempted. Browser interception alone is insufficient because these calls originate on the server.

The seed captures one test instant and derives current Congress, term years, freshness timestamps, and rollover fixtures through the shared federal clock helper. No checked-in E2E record hardcodes a Congress number or term-year pair.

### 4. Isolated migration tests

Real PGlite migration boot moves to a named Node test project with one worker, no file parallelism, and isolated file-backed resources. The ordinary unit/jsdom project does not contend with it. Existing test-local timeout inflation is removed; if the isolated project still exceeds the normal bound, the cause is measured before a policy change.

Hosted PostgreSQL gains a separate upgrade database. The rehearsal:

1. applies only the F1 identity migrations;
2. inserts representative user, account, session, and verification rows;
3. applies the complete current migration chain, including the F4 revision migration;
4. proves identity rows, relationships, expiry, authentication, foreign keys, and cascades remain correct; and
5. proves F4/F5 tables and ordered migration journal state.

The upgrade database is separate from ordinary PostgreSQL contract and E2E databases. CI runs upgrade, PostgreSQL contracts, non-E2E checks, then E2E.

## Ownership and execution order

1. Coordinator merges this reviewed design and the later tests-first plan into the integration branch.
2. F4 tasks run sequentially on `codex/f4-review-corrections`; each task uses a fresh implementer and separate reviewer.
3. F4 reaches VERIFIED, passes hosted CI and independent whole-feature review, returns for Human Gate B, merges, receives post-merge verification, and closes through its status-only closeout PR.
4. Coordinator integrates the F4 closeout into F5 and records the shared-surface handoff.
5. F5 federal-only tasks may be prepared earlier where interfaces are frozen, but shared dashboard/database-test/E2E tasks begin only after the handoff. Each bounded task still uses a fresh implementer and separate reviewer.
6. F5 repeats VERIFIED, CI, independent review, Human Gate B, feature merge, post-merge verification, and closeout.
7. A cumulative integration-to-actual-`main` PR is presented for the user's final approval and is never merged autonomously.

No two implementers edit the same worktree concurrently. F4 owns its current correction surfaces; F5 owns federal-only surfaces and receives explicitly listed shared surfaces only after F4 closeout.

## Error and recovery principles

- Missing authorization, invalid local district, stale revision, malformed provider/cache data, source conflict, missing E2E guard, or ineffective generated data fails closed.
- Provider absence or a strict runtime district subset may use the versioned Census fallback with explicit coverage language.
- A mutation whose completion is unknown is reconciled once; it is never asserted unchanged without an authoritative read.
- Cache corruption is repaired only by a newly validated complete snapshot inside one transaction.
- User-facing errors remain calm, generic where security requires it, and explicit about the next safe action.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Conservative aggregate reflection rejects unusual safe provider prose. | Mutation-prove split/interleaved attacks and keep canonical source text controls; fail closed at this privacy boundary. |
| `v1` preview expires during deploy. | Require one fresh check; never add an unsafe compatibility save path. |
| UUID CAS migration or rotation changes revision accidentally. | PGlite/PostgreSQL migration tests, concurrent writer tests, and an invariant that rotation leaves revision unchanged. |
| Abort/reconciliation races create duplicate messages or refreshes. | One owner per request generation, timer cleanup, late-result suppression, and exact call-count tests without sleeps. |
| Census data becomes stale after reapportionment. | Generated provenance, effective-Congress range, hash checks, and fail-closed behavior outside the range. |
| Runtime provider slowness increases local-fallback frequency. | One aggregate deadline, concurrent independent calls, truthful fallback state, no retry amplification. |
| Cross-roster scan grows. | Keep the correct table-locked scan for current scale; add an index/reference table only after measurement. |
| E2E credentials point at the wrong database. | Dedicated variable, inequality check, opt-in sentinel, path containment or pre-provisioned DB marker, and separate CI databases. |

## Non-goals

- F6 state/local officials, navigation, or broad public office browsing.
- Multiple homes, residence history, household sharing, offline mutation queues, or background synchronization.
- KMS/RLS redesign, hidden read-time rotation, or automatic legacy-key retirement.
- Live provider smoke tests in standard CI, retries, background federal refresh, or a new cache schema without measured need.
- Visual redesign, new AI behavior, candidate work, or a generalized workflow framework.

## Recommended Human Gate A choices

The design recommends these exact choices for approval:

1. **Public member source:** use the official Biographical Directory page keyed by Bioguide ID; retain Congress.gov API URLs only as ingestion metadata.
2. **Autofill:** keep `street-address` for accessibility and disclose that browser-managed autofill is outside voteGPT's app-storage boundary.
3. **Private residence timeout:** use one named 15-second HTTP policy, derived from the existing two-stage F3 provider budget; do not scatter numeric literals.
4. **Unreadable residence:** allow explicit ETag-guarded replacement as well as retry and deletion.
5. **E2E guard:** require both a versioned opt-in and a database/path marker; an environment sentinel alone is insufficient.

After the user approves or revises this design, the coordinator will write the separate tests-first implementation plan and complete task graph. RED and production work remain blocked until that plan is also reviewed at Human Gate A.
