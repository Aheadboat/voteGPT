# F4 Saved-Residence Review Corrections Implementation Plan

> **Coordinator dispatch:** This is not a whole-plan worker brief. The coordinator assigns each numbered task to one fresh implementer, pauses that implementer after RED, records the RED evidence, resumes the same implementer for GREEN, and then assigns a different read-only reviewer. No worker may execute two tasks or continue past a stop condition.

**Goal:** Close saved-residence trust, concurrency, recovery, timeout, destructive-test, and operator-readiness gaps without weakening exact-location privacy.

**Architecture:** F3 issues an address-free `v2` preview token bound to authenticated user and canonical input. F4 stores one encrypted residence behind an opaque lowercase UUID revision, exposes it only through a strong ETag, and applies create/replace/delete with exact compare-and-swap. Browser mutations use bounded cancellation and one authoritative reconciliation read. Destructive E2E runs only against an explicitly guarded database. Key preflight authenticates a stable snapshot while writers are quiesced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node crypto, Drizzle ORM, PostgreSQL/PGlite, Vitest, Testing Library, Playwright, and GitHub Actions.

## Binding task protocol

- Authoritative design: `docs/superpowers/specs/2026-07-17-f4-f5-review-corrections-design.md`.
- Work only in `codex/f4-review-corrections` and its isolated worktree. Before F4-R1, coordinator integrates approved plan head from `codex/autonomous-f4-f8-integration` and records integrated-main commit.
- Every task dispatch includes: `Required skills: invoke ponytail full, then caveman full, before exploration.`
- Exactly one fresh implementer owns one task. A different agent performs read-only review. No concurrent implementers use F4 worktree.
- Implementers and reviewers must not edit `AGENTS.md`, `ROADMAP.md`, `README.md`, this plan, foundation-contract tests, PR state, CI evidence, or roadmap status. Coordinator alone owns those surfaces.
- Implementer edits only listed files. Unexpected required file means stop and ask coordinator to revise task scope.
- RED loop for every implementation task: add smallest listed behavioral test, run exact RED command, confirm expected failure, then stop. Coordinator reruns RED and records evidence in `ROADMAP.md` before production work. Coordinator then resumes same implementer.
- GREEN loop: implement minimum code, run focused checks, commit only listed files, then stop. Coordinator reruns checks, assigns distinct reviewer, resolves findings through a separately scoped task if needed, and records reviewed GREEN before dispatching next task.
- No task changes roadmap phase or claims feature completion. F4-R11 is verification only; coordinator owns PR, Human Gate B, merge, post-merge checks, and closeout.
- Exact address and coordinates never enter URLs, logs, analytics, research/search inputs, LLM prompts, error bodies, source snapshots, or app-managed browser storage.
- Preserve one encrypted home, `saved-residence-v1` consent, AES-256-GCM envelopes, division-only `getSavedResidenceDivisions(userId)`, and account cascade behavior.
- Shared values use named policies or derivation from bounded schemas. Do not repeat token versions, byte ceilings, address limits, timeout values, batch sizes, process watchdogs, sentinel values, or validator grammar as anonymous literals.
- Applicable UI/UX DNA: UX-01, UX-02, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09. UX-03 remains inapplicable.
- Use `npm.cmd` and `npx.cmd` on Windows.
- **PowerShell native verification convention:** PowerShell 5.1 does not make failed native commands terminate through `$ErrorActionPreference`. In every fresh PowerShell session, define this before any verification block; each `Invoke-VoteGptNative` line below runs exactly one native executable and throws on a nonzero `$LASTEXITCODE`. Do not rely on ambient `PSNative` preference behavior.

  ```powershell
  function Invoke-VoteGptNative {
    param(
      [Parameter(Mandatory)][string]$FilePath,
      [Parameter(ValueFromRemainingArguments = $true)][string[]]$ArgumentList
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath exited with code $LASTEXITCODE."
    }
  }
  ```

  PowerShell cmdlets retain their explicit `-ErrorAction` behavior. The only exception is a deliberate no-match `rg` scan: `rg` uses exit 1 for its passing no-match result, so that block immediately asserts exit 1, treats exit 0 as a forbidden match, and throws on every other exit code.

## Frozen interfaces and ownership

- `src/lib/residence-policy.ts`: shared token/address/request limits, private HTTP timeout, geolocation timeout, key batch size, and rotation-process watchdog.
- `src/lib/bounded-json.ts`: stream-bounded JSON decoder; no route semantics.
- `src/lib/residence.ts`: canonical input, v2 signing/verification, public-result validation, and aggregate display-surface reflection rejection.
- `src/app/api/v1/location/resolve/route.ts`: bounded preview request and v2 issuance.
- `src/lib/saved-residence.ts`: encrypted persistence, shared canonical revision validator, CAS results, recovery, rotation, and key preflight.
- `src/app/api/v1/residence/route.ts`: bounded save input, strong ETag grammar, `If-Match`, private error mapping, and `no-store`.
- `src/components/residence-preview.tsx`: cancellation, ETag state, one-read reconciliation, recovery UI, autofill disclosure, and one `router.refresh()` after authoritative success.
- `e2e/database-guard.mjs`: pure guard plus read-only PostgreSQL marker assertion.
- `e2e/start-server.mjs`, `playwright.config.ts`, `e2e/seed-session.mjs`, `e2e/residence.spec.ts`: pass one validated E2E resource to seed, app, browser, raw inspection, and rotation.
- `integration/saved-residence-revision-migration.test.ts`: isolated F4 upgrade proof; it owns only `F4_MIGRATION_DATABASE_URL` and applies the baseline/legacy/current sequence.
- `integration/postgres-auth.test.ts`: current-schema F4 PostgreSQL contracts, including exact CAS races and lock behavior. It owns only `F4_CONTRACT_DATABASE_URL` and never shares an E2E or migration-proof database.
- `scripts/preflight-saved-residence-keys.mts`, `scripts/rotate-saved-residence-keys.mts`, `docs/operations/saved-residence-keys.md`: operator preflight/rotation contract.
- `.github/workflows/ci.yml`: distinct F4 contract and destructive E2E databases. F5 inherits these harness surfaces only after F4 closeout.

## Dependency graph

`F4-R1 policy/decoder -> F4-R2 token/reflection -> F4-R3 route wiring -> F4-R4 revision/CAS -> F4-R5 ETags -> F4-R6 pure E2E guard -> F4-R7 guarded harness -> F4-R8 client/browser -> F4-R9 key preflight -> F4-R10 CI databases -> F4-R11 verification`

Tasks are sequential. Later tasks consume reviewed interfaces and several files recur.

---

### Task F4-R1: Add named residence policies and bounded JSON decoding

**Outcome:** Limits exist once. Coordinate and v2-token grammars are bounded before signing or verification. Canonical-payload maxima are derived from those grammars; raw HTTP bodies use an explicitly named service cap rather than a falsely derived ceiling.

**Allowed files:**

- Create: `src/lib/residence-policy.ts`
- Create: `src/lib/residence-policy.test.ts`
- Create: `src/lib/bounded-json.ts`
- Create: `src/lib/bounded-json.test.ts`

**Interfaces:**

```ts
export const RESIDENCE_RESOLUTION_TOKEN_VERSION = "v2";
export const RESIDENCE_HTTP_TIMEOUT_MS = 15_000;
export const GEOLOCATION_TIMEOUT_MS = 10_000;
export const SAVED_RESIDENCE_KEY_BATCH_SIZE = 100;
export const RESIDENCE_ROTATION_PROCESS_TIMEOUT_MS = 15_000;
export const MAX_RESIDENCE_ADDRESS_CHARACTERS = 300;
export const MAX_RESIDENCE_ADDRESS_UTF8_BYTES = 1_024;
export const MAX_JSON_ESCAPED_BYTES_PER_ADDRESS_CHARACTER = 6;
export const MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES: number;
export const MAX_COORDINATE_DECIMAL_PLACES = 6;
export const MAX_LATITUDE_ABSOLUTE_DEGREES = 90;
export const MAX_LONGITUDE_ABSOLUTE_DEGREES = 180;
export const MAX_LATITUDE_CANONICAL_CHARACTERS: number;
export const MAX_LONGITUDE_CANONICAL_CHARACTERS: number;
export const MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS = 8_192;
export const RESOLUTION_TOKEN_SIGNATURE_BYTES = 32;
export const MAX_RESOLUTION_TOKEN_SIGNATURE_CHARACTERS: number;
export const MAX_RESOLUTION_TOKEN_CHARACTERS: number;
export const MAX_CANONICAL_RESIDENCE_PREVIEW_PAYLOAD_BYTES: number;
export const MAX_CANONICAL_SAVED_RESIDENCE_PAYLOAD_BYTES: number;
export const RESIDENCE_PREVIEW_BODY_CAP_BYTES = 16_384;
export const SAVED_RESIDENCE_BODY_CAP_BYTES = 16_384;

export function canonicalizeResidenceCoordinate(
  value: unknown,
  maximumAbsoluteDegrees: number,
): string | null;

export function isV2ResolutionTokenGrammar(value: unknown): value is string;

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown | null>;
```

Address grammar requires both the named character and UTF-8-byte limits; neither is inferred from the other. `canonicalizeResidenceCoordinate` accepts only finite values in the named latitude/longitude range whose normalized decimal spelling has at most `MAX_COORDINATE_DECIMAL_PLACES`; it normalizes negative zero to `"0"`, strips non-significant trailing zeros, and rejects a value whose canonical decimal would differ. Its longest valid lexical form is derived from sign, named degree bound, decimal point, and named precision. `parseResidenceInput` must use these guards before provider lookup or token signing.

The wire contract continues to accept JSON numbers, not a new string-coordinate protocol. Therefore raw decimal spellings such as redundant zeroes are not falsely called a bounded canonical wire grammar: the explicit service body cap applies before parsing. After parsing, the named finite/range/precision grammar produces the only spelling used for signing and canonical-payload sizing.

`isV2ResolutionTokenGrammar` accepts exactly `v2.<base64url payload>.<base64url signature>`: three segments, ASCII base64url only, one-to-`MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS` payload characters, and exactly the base64url length derived from `RESOLUTION_TOKEN_SIGNATURE_BYTES`. F4-R2 signing rejects an encoded payload above that named maximum before returning a token; F4-R2 verification and F4-R3 save-route handling reject grammar before decoding/HMAC/persistence. `MAX_RESOLUTION_TOKEN_CHARACTERS` is derived from version, segment limits, and separators.

`MAX_CANONICAL_*_PAYLOAD_BYTES` are derived with `TextEncoder` from named grammar maxima and fixed canonical JSON framing. Their address contribution uses `MAX_RESIDENCE_ADDRESS_JSON_STRING_BYTES`, derived from the character bound and worst-case JSON escaping per UTF-16 code unit; it is not incorrectly inferred from UTF-8 bytes alone. They are **not** route body caps. Raw JSON permits arbitrary whitespace and arbitrary numeric lexical spellings that parse to the same value, so `RESIDENCE_PREVIEW_BODY_CAP_BYTES` and `SAVED_RESIDENCE_BODY_CAP_BYTES` are explicit, documented service limits. Each is asserted to be at least its derived canonical maximum, and neither may be described as derived from all legal raw requests.

- [ ] Add policy and decoder RED tests for: maximum address character length and one extra character rejection; independent maximum UTF-8 length (for example, 256 four-byte code points) and one additional byte-character rejection while still below the character bound; worst-case JSON-escaped legal address and exact derived JSON-string/canonical-payload bound; finite in-range coordinates at maximum canonical precision/lexical length and one extra decimal character rejection; negative-zero normalization; nonfinite/out-of-range rejection; token grammar at exact payload/signature length and one additional/invalid character rejection; derived canonical maxima; explicit body-cap exact valid padded JSON and cap-plus-one-byte rejection; invalid ceiling, excessive `Content-Length`, oversized stream, invalid UTF-8/JSON, trailing JSON bytes, and reader cancellation. A token that is grammar-valid but cryptographically invalid is valid only for grammar testing and must not be used as verification proof.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- src/lib/residence-policy.test.ts src/lib/bounded-json.test.ts

  Expected: modules/exports do not exist.
- [ ] Stop. Coordinator reruns and records RED in `ROADMAP.md`; no production module before that record.
- [ ] Implement named policies, bounded coordinate/token grammar helpers, and smallest decoder. Cancel reader best-effort on early rejection. Do not log body or parsing detail. Do not call either service body cap a derived maximum.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- src/lib/residence-policy.test.ts src/lib/bounded-json.test.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `fix(f4): bound residence requests`; stop for coordinator rerun and distinct review.

---

### Task F4-R2: Bind v2 previews and reject aggregate reflection in render order

**Outcome:** Preview authorizes only the same user, issue time, input kind, and canonical input; public result cannot reconstruct precise input across the actual UI surface order.

**Plan-scope guard:** This correction authorizes no F4-R2 production code, token issuance, provider call, persistence, display, analytics/report URL emission, or deployment. F4-R2 remains blocked on Human Gate A and the coordinator-recorded RED result.

**Allowed files:**

- Modify: `src/lib/residence.ts`
- Modify: `src/lib/residence.test.ts`
- Modify: `src/components/residence-preview.test.tsx`
- Modify: `tests/fixtures/residence-responses.ts`

**Interfaces:**

```ts
export type VerifyResolutionToken = (
  token: string,
  expectedInput: ResidenceInput,
  userId: string,
  secret: string,
  now: Date,
) => Extract<ResolutionOutcome, { status: "matched" | "partial" }> | null;

type ResolutionTokenV2 = Readonly<{
  version: typeof RESIDENCE_RESOLUTION_TOKEN_VERSION;
  userId: string;
  issuedAt: string;
  expiresAt: string;
  inputBinding: string;
  resolution: Extract<ResolutionOutcome, { status: "matched" | "partial" }>;
}>;
```

`inputBinding` is a 32-byte base64url HMAC-SHA-256 under a binding-specific HKDF purpose. It signs exactly this collision-free byte concatenation, where `frame(value)` is `uint32be(utf8(value).byteLength) || utf8(value)` and every tag is ASCII:

```text
frame("domain") || frame("voteGPT/resolution-input-binding")
|| frame("version") || frame("v2")
|| frame("userId") || frame(userId)
|| frame("issuedAt") || frame(issuedAt)
|| frame("inputKind") || frame(input.kind)
|| frame("canonicalInput") || frame(canonicalInput(input))
```

`canonicalInput(input)` always receives a freshly parsed, policy-bounded `ResidenceInput`: for `address`, it is the parsed trimmed address whose UTF-8 length passed the named policy; for `coordinates`, it is `canonicalCoordinate(latitude) + "," + canonicalCoordinate(longitude)`, where `canonicalCoordinate` is `canonicalizeResidenceCoordinate` with the named latitude/longitude bound. `parseResidenceInput` rejects the input if either canonicalizer returns null. `createResolutionToken` and `verifyResolutionToken` independently reapply the same policy guard before serializing or HMAC work, so a direct runtime call cannot bypass finite/range/precision/address-byte validation. Thus an address such as `"0,0"` can deliberately share canonical-input text with coordinates `(0, 0)`, but cannot share a binding because the tagged `inputKind` frame differs. Use the payload `issuedAt` bytes at verification; readable payload contains no address or coordinates. Signature and binding use separate HKDF purposes. Decode canonical base64url digests and compare with `timingSafeEqual`.

Aggregate order is frozen to the current `ResidenceResult` UI surface. Build one explicit, boundary-preserving stream: for each division, visible `name`, rendered `type`, `id`; then source anchor visible `name` followed immediately by that anchor's `href` value at the same anchor position; then checked time, optional effective time, benchmark, vintage; then coverage notes. Static headings and labels are excluded. The component test must render a fixture, enumerate visible text segments in DOM render order, insert each source-anchor `href` at its anchor position, and assert exact equality with the validator's ordered field list; DOM `textContent` alone is insufficient. Retain the URL-only source-`href` reflection adversary as a per-field-invalid control: its reflected href fails the existing `sourceUrlsByName` allowlist before aggregate validation, so it proves early rejection but not aggregate-href behavior. Add a separate per-field-valid aggregate-only bridge vector: input address `"District Developers"`; a safe division's rendered type supplies `district`; source remains the exact allowlisted pair `Google Civic Information API` / `https://developers.google.com/civic-information`, whose href supplies `developers`. No individual rendered field contains the ordered address sequence, and `sourceUrlsByName` accepts the source pair, but the full render stream contains `district` before `developers` at the source href. Validation runs before signed-payload/result return, so rejection produces no display, analytics, or report URL emission; do not add a production emitter abstraction solely for this test. Adding/reordering a user-visible result field or its `href` requires updating validator and this test together.

- [ ] Add RED cases: canonical-equivalent address variants and coordinate variants (including negative zero) accept; direct signer/verifier calls with over-precision, nonfinite, out-of-range, or over-byte address input reject before HMAC; signer rejects a valid public result whose encoded token payload exceeds `MAX_RESOLUTION_TOKEN_PAYLOAD_CHARACTERS`; changed address/coordinates, wrong user, tampered binding, expiry, v1, and payload privacy reject. Add both address-to-coordinates and coordinates-to-address cross-kind rejection cases; include the deliberate shared-canonical-text `"0,0"`/`(0, 0)` vector so the test proves tagged input-kind binding rather than merely differing input bytes.
- [ ] Add split/interleaved tests where address tokens cross field boundaries in render order. Retain the URL-only source-`href` adversary as an early per-field-invalid rejection control. Add the `"District Developers"` aggregate-only bridge vector and assert its allowlisted source pair passes per-field validation, no individual field reflects the full sequence, and the composite visible-text-plus-`href` stream does; text order alone is insufficient. Use a correctly signed v2 payload with its valid binding for the verifier arm; do not treat signer failure as verification proof. RED proves the bridge vector signs and verifies while aggregate href inclusion is absent. GREEN proves it rejects at both signing and verification before any signed token/result can reach display, analytics, or report URL emission. After GREEN, temporarily remove only the aggregate source-`href` entry (no runtime flag, no changed source pair) and rerun this vector: signing and verification must accept; restore the entry and rerun rejection before commit. Out-of-order fragments remain a negative control.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- src/lib/residence.test.ts src/components/residence-preview.test.tsx

  Expected: verifier accepts no expected input or input-kind binding, v1 is current, cross-kind and per-field-invalid URL-only controls pass, the per-field-valid aggregate-only bridge signs/verifies while href inclusion is absent, and composite visible-text-plus-`href` render-order contract is absent.
- [ ] Stop for coordinator RED record.
- [ ] Implement the tagged v2 binding tuple and shared composite display-surface validation before signed-payload/result return. Preserve existing per-field, repeated-decoding, Unicode, punctuation, and numeric defenses. Re-run validation after token verification.
- [ ] Run GREEN plus static checks:

      Invoke-VoteGptNative npm.cmd test -- src/lib/residence.test.ts src/components/residence-preview.test.tsx
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `fix(f4): bind residence previews`; stop for separate privacy reviewer.

---

### Task F4-R3: Wire bounded v2 contracts into preview and save routes

**Outcome:** Both private JSON routes reject oversized bodies before parse/sign/verify/persistence; save verifies supplied address against v2 token. ETags remain out of scope until F4-R5.

**Allowed files:**

- Modify: `src/app/api/v1/location/resolve/route.ts`
- Modify: `src/app/api/v1/location/resolve/route.test.ts`
- Modify: `src/app/api/v1/residence/route.ts`
- Modify: `src/app/api/v1/residence/route.test.ts`
- Modify: `tests/fixtures/residence-responses.ts`

**Route-bound contract:** `/api/v1/location/resolve` passes only `RESIDENCE_PREVIEW_BODY_CAP_BYTES` to `readBoundedJson`; `/api/v1/residence` passes only `SAVED_RESIDENCE_BODY_CAP_BYTES`. These are named service caps, not derived payload maxima. After decoding and before provider lookup/signing, preview calls `parseResidenceInput`, which enforces address UTF-8/character bounds and canonical finite/range/precision coordinate grammar. After decoding and before token verification/persistence, save validates address bounds and `isV2ResolutionTokenGrammar(body.resolutionToken)`. A route never accepts a grammar-valid token as cryptographically valid; grammar only prevents expensive decode/HMAC work on malformed or over-cap input.

- [ ] Add route RED cases for: maximum legal address and coordinate grammar accepted through preview; next address character/UTF-8 byte, extra coordinate decimal character, nonfinite/range-invalid coordinates, exact token-grammar maximum, and one-extra/invalid token character rejected before provider/signing/verification; exact named body-cap padded valid JSON accepted by decoder and cap-plus-one byte rejected; excessive header, excessive streaming body, trailing bytes, v1, wrong input/user, and aggregate reflection. Assert rejected input never reaches `JSON.parse` when byte-capped, provider/signing when input grammar fails, token verification when token grammar fails, persistence, logs, or response text.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts

  Stop for coordinator record.
- [ ] Replace unbounded `request.json()` with `readBoundedJson` and the named explicit service cap for that route. Preview parses/bounds input before provider lookup and signs only v2; signing rejects an over-cap encoded token payload. Save validates address and v2 token grammar before token verification, constructs expected `ResidenceInput`, then passes it to verifier. Keep existing private status mapping and do not label service caps as derived.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `fix(f4): enforce residence boundaries`; stop for route reviewer.

---

### Task F4-R4: Add opaque revision migration, exact repository CAS, and recovery

**Outcome:** Every row has canonical lowercase opaque UUID revision. Create, replace, and delete serialize safely; rotation preserves revision; owner can manage unreadable row.

**Allowed files:**

- Modify: `src/db/schema.ts`
- Create: `drizzle/0004_saved_residence_revision.sql`
- Create: `drizzle/meta/0004_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/lib/saved-residence.ts`
- Modify: `src/lib/saved-residence.test.ts`
- Create: `integration/saved-residence-revision-migration.test.ts`
- Modify: `integration/postgres-auth.test.ts`

**Interfaces:**

```ts
export type SavedResidenceRevision = string & {
  readonly __savedResidenceRevision: unique symbol;
};

export function parseSavedResidenceRevision(
  value: string,
): SavedResidenceRevision | null;

export type SavedResidenceReadResult =
  | { status: "empty" }
  | { status: "saved"; residence: SavedResidenceView; revision: SavedResidenceRevision }
  | { status: "recovery_required"; revision: SavedResidenceRevision };

export type SavedResidenceWriteResult =
  | { status: "saved"; residence: SavedResidenceView; revision: SavedResidenceRevision; replaced: boolean }
  | { status: "conflict" };

export type SavedResidenceDeleteResult =
  | { status: "deleted" }
  | { status: "conflict" };
```

Parser accepts canonical lowercase UUID v4 only. No case-insensitive flag and no lowercasing. Repository and later HTTP parser share it.

**PostgreSQL migration fixture and teardown:** `integration/saved-residence-revision-migration.test.ts` owns one distinct disposable `F4_MIGRATION_DATABASE_URL`, never `F4_CONTRACT_DATABASE_URL`. Before any R4 upgrade assertion, it verifies a clean migration journal, applies `0000_overjoyed_wiccan` -> `0001_cleanup_auth_verifications` -> `0002_saved_residence` -> `0003_federal_official_cache`, then creates its user, `saved_residence`, and division fixtures. R4 RED deliberately leaves `0004_saved_residence_revision` absent: its legacy fixture has no `revision`, and failure must identify missing ordered migration/backfill/revision-CAS behavior rather than a missing table. R4 GREEN repeats that isolated baseline and fixture, then applies `0004_saved_residence_revision` before assertions. The migration test removes every fixture it created in `afterEach`/`finally` and closes every pool in `afterAll`; it never drops or reuses an unknown database. `integration/postgres-auth.test.ts` is separate and runs only current-schema CAS/lock contracts against `F4_CONTRACT_DATABASE_URL`. Hosted CI provisions, journals, and destroys both disposable databases; F5 receives neither F4 URL.

- [ ] Add PGlite RED for migration of old row, create-only insert, replace/delete CAS, atomic divisions, absent/stale generic conflict, unreadable-owner recovery, rotation revision invariant, and non-crypto failures remaining unavailable.
- [ ] Add PostgreSQL RED with barriers for exactly four races; local execution is conditional below:
  - create/create: one saved, one conflict;
  - replace/replace from revision A: one replacement installs B, one conflict;
  - replace/delete from A: exactly one succeeds; replacement installs B only if replacement wins;
  - delete/delete from A: one deleted, one conflict, row absent. Deletion never installs or returns a revision.
- [ ] Run local RED:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts src/lib/account.test.ts

  Conditional PostgreSQL RED uses only distinct `F4_MIGRATION_DATABASE_URL`; an absent or blank URL runs no database command and records PostgreSQL proof as `hosted/explicit-resource-required`. It never falls back to `F4_CONTRACT_DATABASE_URL` or ambient `DATABASE_URL`:

      $migrationDatabaseUrl = $env:F4_MIGRATION_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrl)) {
        Write-Host 'PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $migrationDatabaseUrl
          # Test-owned setup applies only 0000..0003, verifies that baseline journal,
          # then creates the pre-revision legacy rows before its RED assertion.
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/saved-residence-revision-migration.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }

  Hosted CI must supply the dedicated migration resource, record the `0000..0003` baseline journal plus behavior-specific RED output, and prove fixture/pool teardown before destroying that disposable database.
- [ ] Stop for coordinator RED record.
- [ ] Add ordered UUID migration generated from schema. Create uses `INSERT ... ON CONFLICT DO NOTHING`. Replace updates owner+expected revision, installs `randomUUID()`, and replaces divisions in one transaction. Delete removes owner+expected revision only and does not query to distinguish absent/stale.
- [ ] Classify only authenticated owner-row decrypt/key-version failures as `recovery_required`. Invalid keyring shape, stored public schema, DB, or transaction failure remains generic unavailable. Replacement/deletion do not decrypt old row.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts src/lib/account.test.ts
      Invoke-VoteGptNative npm.cmd run db:check
      $migrationDatabaseUrl = $env:F4_MIGRATION_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrl)) {
        Write-Host 'PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $migrationDatabaseUrl
          # Do not pre-apply generic current migrations: test setup applies 0000..0003,
          # creates legacy rows, then applies 0004_saved_residence_revision before assertions.
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/saved-residence-revision-migration.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }
      $contractDatabaseUrl = $env:F4_CONTRACT_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($contractDatabaseUrl)) {
        Write-Host 'Current PostgreSQL contract: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $contractDatabaseUrl
          # Current contracts use a different resource and current chain only.
          Invoke-VoteGptNative npm.cmd run db:migrate
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/postgres-auth.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

  Both migration-proof and current-contract resources remain conditional locally but mandatory in hosted CI; CI records distinct URLs, ordered migration/current-chain evidence, fixture/pool teardown, and destruction of both disposable databases.
- [ ] Commit `fix(f4): guard residence revisions`; stop for schema/repository reviewer.

---

### Task F4-R5: Expose canonical strong ETags and enforce preconditions

**Outcome:** Strong ETag is only client-visible revision. Create/replace/delete map exact CAS without existence or crypto leakage.

**Allowed files:**

- Modify: `src/lib/saved-residence.test.ts`
- Modify: `src/app/api/v1/residence/route.ts`
- Modify: `src/app/api/v1/residence/route.test.ts`

**Contract:**

- Empty GET: 200/no-store, no ETag.
- Saved/recovery GET: 200/no-store, one strong quoted ETag, no revision in JSON.
- POST without `If-Match`: create only. POST with one exact canonical strong ETag: replace.
- DELETE requires one exact canonical strong ETag plus destructive confirmation.
- Weak, wildcard, list, unquoted, uppercase/noncanonical UUID, invalid UUID, and duplicate/collapsed duplicate validators: 400 before repository call.
- Well-formed stale or absent-row DELETE/replace: same private 409, no current row/ETag.
- Successful POST returns successor ETag. Successful DELETE returns no ETag.

```ts
function formatRevisionEtag(revision: SavedResidenceRevision) {
  return `"${revision}"`;
}

function parseIfMatch(request: Request) {
  const value = request.headers.get("if-match");
  if (value === null) return { status: "absent" } as const;
  const quoted = /^"([^"]+)"$/.exec(value); // deliberately no /i
  const revision = quoted ? parseSavedResidenceRevision(quoted[1]) : null;
  return revision
    ? ({ status: "valid", revision } as const)
    : ({ status: "invalid" } as const);
}
```

- [ ] Add exact route RED matrix above and crypto-detail denial checks.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts src/app/api/v1/residence/route.test.ts

  Stop for coordinator record.
- [ ] Implement formatter/parser and mappings. Do not lowercase input, echo conflict ETag, retry mutation, or distinguish absent/stale.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts src/app/api/v1/residence/route.test.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `fix(f4): require residence etags`; stop for route/privacy reviewer.

---

### Task F4-R6: Add pure destructive-E2E guard contract

**Outcome:** Unsafe E2E configuration fails before any connection. Offline validation may use injected read-only filesystem identity checks, but remains independently testable without opening a database or mutating the filesystem.

**Allowed files:**

- Create: `e2e/database-guard.mjs`
- Create: `tests/e2e-database-guard.test.ts`

**Interfaces:**

```js
export const E2E_DESTRUCTIVE_OPT_IN_VALUE = "votegpt-destructive-e2e-v1";
export const E2E_POSTGRES_MARKER_TABLE = "_votegpt_test_database_guard";

export async function validateE2EDatabaseEnvironment(
  environment,
  repositoryRoot,
  filesystemIdentity,
) {}
export async function assertE2EPostgresMarker(validated, connect) {}
```

`filesystemIdentity` exposes only async `lstat(path)` and `realpath(path)`. Production passes the read-only functions from `node:fs/promises`; unit tests pass a fake identity map. The validation interface neither accepts nor calls a filesystem mutator.

Offline validation requires `E2E_DATABASE_URL`, exact `E2E_DESTRUCTIVE_OPT_IN`, and inequality from any nonblank ambient `DATABASE_URL`. It rejects unknown schemes, in-memory PGlite, empty paths, traversal, and any syntactically resolved file path outside `repositoryRoot/.data/e2e`. For file-backed PGlite, first establish strict syntactic containment with `node:path`/`node:url`; then use injected identity checks to canonicalize the E2E root and candidate (or its nearest existing ancestor for an uncreated final database leaf). `lstat` every existing component from `.data` through the candidate and reject any symbolic link, including a symlinked `.data/e2e` root. Reject if either canonical identity escapes the canonical E2E root, including a syntactically safe path whose `realpath` is outside it. PostgreSQL validation returns a redacted descriptor; it never returns/logs credentials and does not use filesystem identity checks. Marker assertion opens one connection, issues only a read-only `SELECT` for exact sentinel row, and always closes. Missing/wrong marker fails before migrations or mutations. Seeder cannot create marker.

- [ ] Add a pure RED matrix with an injected fake `lstat`/`realpath` map: ordinary canonical in-root PGlite accepts; a symlinked `.data/e2e` root rejects; every symlinked descendant component rejects; and a syntactically safe `pglite://.data/e2e/f4` whose canonical path is outside the E2E root rejects. Prove every rejected offline case makes zero connector calls and no filesystem mutation, while fake PostgreSQL connector cases still prove exactly one read-only `SELECT`/close on marker success and failure.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- tests/e2e-database-guard.test.ts

  Stop for coordinator record.
- [ ] Implement guard with `node:path`/`node:url` plus injected read-only `node:fs/promises` `lstat`/`realpath`; no database-name heuristics, filesystem mutation, database connection during offline validation, or new dependency.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- tests/e2e-database-guard.test.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `test(f4): guard residence e2e db`; stop for destructive-safety reviewer.

---

### Task F4-R7: Wire one validated E2E resource through wrapper, seed, app, inspection, and rotation

**Outcome:** Current residence E2E behavior runs only after guard. Every process receives same explicit validated URL; no `DATABASE_URL` fallback remains.

**Plan-scope guard:** This review correction authorizes no production, CI, database, marker, or deployment action now. F4 retains ownership; F4-R7 remains blocked on Human Gate A and coordinator-recorded RED evidence. Eventual marker provisioning is external, CI-owned, disposable, and E2E-only; neither app nor seeder may create, repair, delete, or otherwise mutate a marker.

**Allowed files:**

- Create: `e2e/start-server.mjs`
- Modify: `playwright.config.ts`
- Modify: `e2e/seed-session.mjs`
- Modify: `e2e/residence.spec.ts`
- Modify: `tests/e2e-database-guard.test.ts`
- Create: `integration/e2e-guarded-harness.test.ts`

**Required flow:**

1. Playwright config performs pure offline validation; it never defaults URL.
2. `start-server.mjs` passes validated URL explicitly to seed and Next.
3. Seeder independently validates, performs PostgreSQL marker SELECT before migration, then seeds. It never creates marker.
4. App, browser worker, raw DB inspection, and rotation use only `E2E_DATABASE_URL` supplied from validated result.
5. PGlite lives under `.data/e2e`; PostgreSQL marker is externally provisioned.
6. Rotation child retains named `RESIDENCE_ROTATION_PROCESS_TIMEOUT_MS`; timeout terminates child and reports generic failure.
7. `integration/e2e-guarded-harness.test.ts` runs the actual `node e2e/start-server.mjs` wrapper as a child, so it reaches the real seed path rather than importing or mocking the guard, wrapper, or seeder. It reads only externally supplied disposable guard-resource URLs and never provisions or changes a marker.

- [ ] Extend `tests/e2e-database-guard.test.ts` RED by reading config/wrapper/seed/spec and asserting zero fallback, one validated-variable flow, marker-before-migration ordering, and named rotation watchdog.
- [ ] Add `integration/e2e-guarded-harness.test.ts` RED. It requires three pairwise-distinct, externally provisioned, disposable PostgreSQL URLs: `F4_E2E_GUARD_MISSING_DATABASE_URL` has no exact marker table/row, `F4_E2E_GUARD_WRONG_MARKER_DATABASE_URL` has the marker table but no exact sentinel row, and `F4_E2E_GUARD_MARKED_DATABASE_URL` has the exact marker table and `votegpt-destructive-e2e-v1` row. It exercises them in fixed `missing -> wrong -> marked` order. The test fails its setup if any URL is absent, equal, or has the wrong precondition; it does no marker DDL/DML itself.
- [ ] For missing and wrong resources, snapshot all non-system schema objects, table data, sequence state, and marker state; spawn `node e2e/start-server.mjs` with a unique unused `PORT`, exact opt-in, that resource as `E2E_DATABASE_URL`, and a distinct unreachable `DATABASE_URL` tripwire. Assert nonzero marker failure, no listener on that port, no surviving child, and an identical post-exit snapshot. This proves failure before migration, fixture writes, Next launch, or any database mutation; a runtime `DATABASE_URL` fallback yields a different failure and fails the test.
- [ ] For the correctly marked resource, use the same black-box wrapper path and tripwire. Assert readiness on the unique port, known `seed-session.mjs` fixture rows after migration, then controlled child shutdown and port release. This proves that the externally marked success path still migrates, seeds, and launches without a parent-runtime fallback.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- tests/e2e-database-guard.test.ts

  Conditional local PostgreSQL RED, only after an external operator has supplied all three disposable resources in their required states:

      Invoke-VoteGptNative npm.cmd run test:postgres -- integration/e2e-guarded-harness.test.ts

  Mandatory hosted-CI evidence, after F4-R10 externally provisions the three resource states: CI runs `test:postgres -- integration/e2e-guarded-harness.test.ts` as a required job step and fails the job on a nonzero exit.

  Missing resources are not skipped or recreated: coordinator records the local evidence gap; hosted CI must produce the mandatory command's evidence.

  Stop for coordinator record.
- [ ] Wire harness. Remove hosted/runtime fallback and every raw `process.env.DATABASE_URL` read from E2E files.
- [ ] Build before any child-server or browser execution:

      Invoke-VoteGptNative npm.cmd run build

- [ ] Run the black-box marker-order GREEN with the same externally provisioned three-resource set and capture the pre/post snapshots, child output, readiness, fixture, shutdown, and port-release evidence:

      Invoke-VoteGptNative npm.cmd run test:postgres -- integration/e2e-guarded-harness.test.ts

- [ ] Run guarded existing E2E GREEN with explicit local PGlite resource:

      $env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
      $env:E2E_DATABASE_URL = "pglite://.data/e2e/f4"
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      Invoke-VoteGptNative npm.cmd run test:e2e -- e2e/residence.spec.ts

- [ ] Run focused guard tests and static checks:

      Invoke-VoteGptNative npm.cmd test -- tests/e2e-database-guard.test.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `test(f4): isolate residence e2e`; stop for harness reviewer. Confirm ports 3000/3001 clear.

---

### Task F4-R8: Add cancellable client, one-read reconciliation, recovery UI, and guarded browser proof

**Outcome:** Browser never blindly retries, never asserts unknown completion, handles unreadable row, settles a timed-out request even when its operation ignores abort, proves post-commit response-delivery loss against the guarded resource, and refreshes server-rendered consumers once after authoritative mutation.

**Allowed files:**

- Modify: `src/components/residence-preview.tsx`
- Modify: `src/components/residence-preview.test.tsx`
- Modify: `e2e/residence.spec.ts`

**Interfaces:** Saved/recovery client state carries current ETag separately from view. `requestSavedResidence(signal)` returns empty/saved/recovery/unauthenticated/error and validates required ETag. Unknown mutation state blocks another mutation until successful reload. A `TimeoutError` is a transport-loss outcome: for POST/DELETE it starts the existing same-generation, exactly-one bounded reconciliation GET without waiting for the abandoned operation or retrying the mutation. A matching authoritative GET succeeds; a conflicting, failed, or timed-out reconciliation becomes unknown and keeps mutation controls blocked. A late completion of the abandoned operation is ignored by request-generation ownership. Browser delivery-loss proof uses a one-shot, test-local controlled route proxy on the same guarded E2E resource: it forwards the original POST/DELETE to the real app, awaits an upstream successful-commit acknowledgement, then detaches only the downstream browser response and discards the upstream response without reading its body. The reconciliation GET continues unmocked to that real app; no route fulfillment may supply its state. The acknowledgement records only method, status, and request counts; never an address, token, ETag, or response body.

```ts
async function withResidenceTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
) {
  const controller = new AbortController();
  let rejectForAbort!: (reason: unknown) => void;
  const abortRace = new Promise<never>((_resolve, reject) => {
    rejectForAbort = reject;
  });
  const rejectWhenAborted = () => {
    rejectForAbort(
      controller.signal.reason ??
        new DOMException("Residence request aborted", "AbortError"),
    );
  };
  controller.signal.addEventListener("abort", rejectWhenAborted, { once: true });
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = controller.signal.aborted
    ? undefined
    : window.setTimeout(
        () =>
          controller.abort(
            new DOMException("Residence request timed out", "TimeoutError"),
          ),
        RESIDENCE_HTTP_TIMEOUT_MS,
      );
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  try {
    // The abort listener is registered before operation starts, so timeout abort
    // rejects this race even when operation ignores its signal forever.
    return await Promise.race([operationPromise, abortRace]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", forwardAbort);
    controller.signal.removeEventListener("abort", rejectWhenAborted);
  }
}
```

- [ ] Add deterministic component RED with fake timers/deferred promises: all private requests time out; a mutation operation that ignores its aborted signal and never settles still receives an aborted signal, rejects the timeout race as `TimeoutError` after `RESIDENCE_HTTP_TIMEOUT_MS`, starts exactly one bounded reconciliation GET, and—when that GET cannot authoritatively confirm the intended state—enters unknown with mutation controls blocked. Assert that resolving the original deferred mutation afterward changes nothing, no second POST/DELETE occurs, and no refresh occurs. Preserve the existing pre-aborted-parent case (operation receives an already-aborted signal) and timer, parent-forwarding-listener, and controller-abort-listener cleanup cases. Also cover superseded/unmounted late results ignored; exact `If-Match`; explicit 409; one GET and zero mutation retry after transport loss/timeout/unreadable 2xx; canonical save comparison; delete only confirmed by empty; unknown blocks mutation; refresh exactly once on direct/reconciled success and zero otherwise; recovery retry/replace/delete; autofill disclosure; no app storage writes.
- [ ] Add guarded browser RED for save, two-tab stale replace/delete, real post-commit delivery-loss reconciliation, and unreadable-row replace/delete. Do not add F5 officials-rerender journey. For separate POST and DELETE loss cases, a one-shot controlled proxy must forward the original browser mutation upstream, await a successful upstream commit acknowledgement, then detach/discard only its browser-facing response without reading the upstream body. A bare `route.abort()` before upstream continuation and a mocked/fulfilled reconciliation response are invalid. After the loss action (excluding setup reads), assert exactly one real upstream mutation, exactly one real reconciliation GET to the same guarded resource, and zero repeat mutation. The POST case ends in the authoritative saved state; the DELETE case ends empty. A deterministic proxy-discard acknowledgement/flush after reconciliation proves no stale or late direct result can change UI state, refresh count, or mutation count.
- [ ] Build **before** running browser RED, then actually run and capture expected browser failures:

      $env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
      $env:E2E_DATABASE_URL = "pglite://.data/e2e/f4"
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      Invoke-VoteGptNative npm.cmd run build
      Invoke-VoteGptNative npm.cmd test -- src/components/residence-preview.test.tsx
      Invoke-VoteGptNative npm.cmd run test:e2e -- e2e/residence.spec.ts

- [ ] Stop. Coordinator reruns unit and guarded browser RED and records both before production work.
- [ ] Implement request generation ownership, ETag state, and the timeout race above: deadline aborts with `TimeoutError` under `RESIDENCE_HTTP_TIMEOUT_MS` and rejects the caller without waiting for a non-cooperative operation; `finally` clears its timer and removes both forwarding and abort-race listeners. Route POST/DELETE timeout into one fresh bounded, same-generation reconciliation GET; never retry POST/DELETE or accept a late abandoned-operation result. In `e2e/residence.spec.ts`, implement the test-only one-shot controlled proxy: it continues the exact browser POST/DELETE to the guarded app, waits for upstream commit acknowledgement, severs only downstream delivery, and lets the one reconciliation GET continue to the real route. Never read or use the captured mutation body or `route.fulfill` as reconciliation data; retain only redacted method/status/count evidence, discard the response after acknowledgement, and prove no stale/late result changes the authoritative UI. Compare intended address, normalized divisions, provenance, coverage, consent, and valid server timestamps. Failed/conflicting/timed-out reconciliation is unknown and blocks mutation until successful reload. Add recovery controls and browser-controlled autofill copy. Call `router.refresh()` once only after authoritative success.
- [ ] Rebuild before browser GREEN, then run exact checks:

      $env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
      $env:E2E_DATABASE_URL = "pglite://.data/e2e/f4"
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      Invoke-VoteGptNative npm.cmd run build
      Invoke-VoteGptNative npm.cmd test -- src/components/residence-preview.test.tsx
      Invoke-VoteGptNative npm.cmd run test:e2e -- e2e/residence.spec.ts
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

- [ ] Commit `fix(f4): reconcile residence changes`; stop for UI/accessibility/privacy reviewer.

---

### Task F4-R9: Add deployment key preflight and operator runbook

**Outcome:** During a quiesced-writer deployment, preflight authenticates every envelope in one repeatable snapshot while preventing writes; output is count-only and rows remain unchanged.

**Allowed files:**

- Modify: `src/lib/saved-residence.ts`
- Modify: `src/lib/saved-residence.test.ts`
- Modify: `integration/postgres-auth.test.ts`
- Create: `scripts/preflight-saved-residence-keys.mts`
- Modify: `scripts/rotate-saved-residence-keys.mts`
- Create: `docs/operations/saved-residence-keys.md`
- Modify: `.env.example`

**Interface:**

```ts
export async function preflightSavedResidenceKeys(): Promise<{
  checked: number;
  references: readonly Readonly<{ keyVersion: string; count: number }>[];
}>;
```

Preflight starts `REPEATABLE READ READ ONLY`, acquires `LOCK TABLE "saved_residence" IN SHARE MODE`, then scans stable user-id batches. SHARE conflicts with INSERT/UPDATE/DELETE row-exclusive locks. Deployment must quiesce app/worker writers before invocation and keep them quiesced until preflight commits. This is a required operator release gate, not a claimed runtime/deployment-platform hook.

**PostgreSQL setup and teardown:** R9 uses only the current F4 contract chain: `0000_overjoyed_wiccan` -> `0001_cleanup_auth_verifications` -> `0002_saved_residence` -> `0003_federal_official_cache` -> `0004_saved_residence_revision`. Run that chain before `integration/postgres-auth.test.ts`; its `beforeEach` creates key/preflight rows only after migration succeeds, and its `afterEach`/`finally` removes those rows while `afterAll` closes pools. It never uses the R4 legacy-upgrade fixture as an ambient prerequisite. Hosted CI records the current-chain migration output, test output, teardown, and disposable-database destruction.

- [ ] Add RED: active+legacy authentication, missing/wrong/malformed keys, stable batches, deterministic count-only output, zero DML, idempotence, and rollback on failure.
- [ ] Add PostgreSQL RED that pauses after SHARE lock, starts writer, proves a waiting ungranted lock through `pg_locks` (not sleep), releases preflight, then proves writer completes. Verify no envelope/revision change; local execution is conditional below.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts
      $contractDatabaseUrl = $env:F4_CONTRACT_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($contractDatabaseUrl)) {
        Write-Host 'PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $contractDatabaseUrl
          # Apply current F4 chain 0000..0004 before R9 creates any fixture.
          Invoke-VoteGptNative npm.cmd run db:migrate
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/postgres-auth.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }

  An absent or blank URL runs only the unit evidence above and records `hosted/explicit-resource-required`; it never uses ambient `DATABASE_URL`. Hosted CI must provide the dedicated resource, apply `0000..0004`, and capture behavior-specific RED plus teardown evidence. Stop for coordinator record.
- [ ] Implement preflight and generic CLI. Rotation/preflight consume shared batch policy. Preserve named rotation-process watchdog used by E2E.
- [ ] Write exact runbook commands: generate, configure active+all referenced legacy keys, quiesce writers, repeatable-read locked preflight, serve only after success, batch rotation, reference counts, retirement at zero, rollback to prior complete keyring, and failure recovery. `.env.example` contains empty server-only names/format only.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- src/lib/saved-residence.test.ts
      $contractDatabaseUrl = $env:F4_CONTRACT_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($contractDatabaseUrl)) {
        Write-Host 'PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $contractDatabaseUrl
          # Apply current F4 chain 0000..0004 before R9 creates any fixture.
          Invoke-VoteGptNative npm.cmd run db:migrate
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/postgres-auth.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative git diff --check

  An absent or blank URL runs only the unit/static evidence and records `hosted/explicit-resource-required`; hosted CI must apply `0000..0004`, run the dedicated PostgreSQL proof, and capture fixture/pool teardown before destroying its disposable database.
- [ ] Commit `ops(f4): preflight residence keys`; stop for operator/security reviewer.
- [ ] Coordinator note: do not edit `README.md` here. F4 closeout PR must add one README link to `docs/operations/saved-residence-keys.md` alongside roadmap closeout.

---

### Task F4-R10: Provision distinct hosted F4 contract and destructive E2E databases

**Outcome:** Hosted CI keeps upgrade proof, current contracts, and destructive E2E in distinct disposable databases. It externally provisions every marker state needed by the black-box proof; no app or seeder provisions a marker.

**Coordinator-dispatched allowed files:**

- Modify: `.github/workflows/ci.yml`
- Create: `tests/ci-e2e-database-contract.test.ts`

**CI resources:**

- Administrative PostgreSQL service database: provisioning only.
- All six application-facing URLs below are pairwise distinct.
- `votegpt_f4_migration`, exported only as `F4_MIGRATION_DATABASE_URL`, owns the R4 baseline -> legacy fixture -> `0004_saved_residence_revision` upgrade proof. It is never a current contract, destructive E2E, or F5 resource.
- `votegpt_f4_contract`, exported as `F4_CONTRACT_DATABASE_URL` and mapped to `DATABASE_URL` only for current-schema migration/contract/non-E2E checks; it never receives the R4 legacy baseline fixture.
- `votegpt_e2e`, exported only as `E2E_DATABASE_URL`, never equal to ambient `DATABASE_URL`.
- Marker table `_votegpt_test_database_guard` with exact row `votegpt-destructive-e2e-v1`, created by CI before browser step.
- `votegpt_f4_e2e_guard_missing`, exported only as `F4_E2E_GUARD_MISSING_DATABASE_URL`, is disposable and has no marker table or exact marker row.
- `votegpt_f4_e2e_guard_wrong`, exported only as `F4_E2E_GUARD_WRONG_MARKER_DATABASE_URL`, is disposable and has the marker table but a deliberately nonmatching row.
- `votegpt_f4_e2e_guard_marked`, exported only as `F4_E2E_GUARD_MARKED_DATABASE_URL`, is disposable and has the exact marker row before the black-box child starts.

- [ ] Add RED contract test reading workflow, `integration/saved-residence-revision-migration.test.ts`, and `integration/e2e-guarded-harness.test.ts`. Prove all six URLs are pairwise distinct; migration URL is consumed only by the upgrade proof; current contract URL never contains a legacy fixture; guard URLs are E2E-only and never substituted into ambient `DATABASE_URL`; CI, not app/seeder, establishes missing/wrong/marked states; and black-box harness uses them in `missing -> wrong -> marked` order after external provisioning and before browser E2E. Require CI order: isolated migration test applies `0000..0003` -> legacy fixture -> `0004` on migration URL -> current contract `0000..0004` -> `integration/postgres-auth.test.ts` -> non-E2E/build -> black-box harness -> browser. Preserve opt-in, no seeder marker creation, and no F5 reuse.
- [ ] Run RED:

      Invoke-VoteGptNative npm.cmd test -- tests/ci-e2e-database-contract.test.ts

  Stop for coordinator evidence record.
- [ ] Update workflow: create migration-proof, current-contract, browser-E2E, and three guard databases through the administrative connection. CI first runs `integration/saved-residence-revision-migration.test.ts` with only `F4_MIGRATION_DATABASE_URL`; that test applies `0000..0003`, creates the legacy fixture, then applies `0004` before its assertions. CI then applies `0000..0004` and runs `integration/postgres-auth.test.ts` with only `F4_CONTRACT_DATABASE_URL`. CI alone leaves `guard_missing` unmarked, installs only a nonmatching marker row in `guard_wrong`, and installs the exact marker row in `guard_marked` and `votegpt_e2e`; app and seeder receive no marker-creation authority. Then run non-E2E checks/build, `integration/e2e-guarded-harness.test.ts` with its three explicit guard URLs, then browser E2E with only explicit opt-in/`E2E_DATABASE_URL`. Preserve order: isolated migration proof -> current contract -> non-E2E/build -> `missing -> wrong -> marked` black-box harness -> browser. Destroy all six databases after evidence; F5 receives no F4 database URL.
- [ ] Run GREEN:

      Invoke-VoteGptNative npm.cmd test -- tests/ci-e2e-database-contract.test.ts
      Invoke-VoteGptNative npm.cmd run check
      Invoke-VoteGptNative git diff --check

  Mandatory hosted-CI evidence records isolated migration proof, distinct current-contract proof, and all three guard states:

      npm run test:postgres -- integration/e2e-guarded-harness.test.ts

- [ ] Commit `ci(f4): isolate destructive e2e`; stop for distinct CI/security reviewer.

---

### Task F4-R11: Verify exact F4 candidate

**Outcome:** Exact head is ready for feature PR review and Human Gate B. No production edits in this task.

**Allowed files:** None. Fresh verifier is read-only. Coordinator alone records evidence and manages PR.

- [ ] Prove latest approved integration head is ancestor of F4 HEAD:

      Invoke-VoteGptNative git merge-base --is-ancestor codex/autonomous-f4-f8-integration HEAD
- [ ] Run focused suites:

      Invoke-VoteGptNative npm.cmd test -- src/lib/residence-policy.test.ts src/lib/bounded-json.test.ts src/lib/residence.test.ts src/lib/saved-residence.test.ts src/lib/account.test.ts src/app/api/v1/location/resolve/route.test.ts src/app/api/v1/residence/route.test.ts src/components/residence-preview.test.tsx tests/e2e-database-guard.test.ts tests/ci-e2e-database-contract.test.ts

- [ ] Run full local verification sequentially:

      Invoke-VoteGptNative npm.cmd test
      Invoke-VoteGptNative npm.cmd run typecheck
      Invoke-VoteGptNative npm.cmd run lint
      Invoke-VoteGptNative npm.cmd run build
      Invoke-VoteGptNative npm.cmd run db:check

- [ ] Run R4 upgrade proof only against distinct `F4_MIGRATION_DATABASE_URL`; when absent or blank, record `hosted/explicit-resource-required` and do not substitute `F4_CONTRACT_DATABASE_URL` or ambient `DATABASE_URL`. The isolated test applies `0000_overjoyed_wiccan` -> `0001_cleanup_auth_verifications` -> `0002_saved_residence` -> `0003_federal_official_cache`, creates its legacy fixture, then applies `0004_saved_residence_revision` before assertions:

      $migrationDatabaseUrl = $env:F4_MIGRATION_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrl)) {
        Write-Host 'Migration PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $migrationDatabaseUrl
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/saved-residence-revision-migration.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }

- [ ] Run current PostgreSQL contract only against `F4_CONTRACT_DATABASE_URL`; when absent or blank, record `hosted/explicit-resource-required` and do not run migration or contract tests. When present, first apply current F4 chain `0000_overjoyed_wiccan` -> `0001_cleanup_auth_verifications` -> `0002_saved_residence` -> `0003_federal_official_cache` -> `0004_saved_residence_revision`, then create normal contract fixtures and prove four CAS races, rotation invariant, account cascade, and preflight lock:

      $contractDatabaseUrl = $env:F4_CONTRACT_DATABASE_URL
      if ([string]::IsNullOrWhiteSpace($contractDatabaseUrl)) {
        Write-Host 'PostgreSQL proof: hosted/explicit-resource-required.'
      } else {
        try {
          $env:DATABASE_URL = $contractDatabaseUrl
          # Current chain 0000..0004 must exist before normal contract fixtures.
          Invoke-VoteGptNative npm.cmd run db:migrate
          Invoke-VoteGptNative npm.cmd run test:postgres -- integration/postgres-auth.test.ts
        } finally {
          Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
        }
      }

  Hosted CI captures separate baseline/legacy/`0004` migration-proof and `0000..0004` current-contract journals, both test outputs, fixture/pool teardown, and destruction of both disposable F4 databases. Missing either local resource cannot satisfy this evidence; neither resource is an E2E or F5 handoff database.

- [ ] Run marker-order black-box verification only with the three externally provisioned guard resources in fixed `missing -> wrong -> marked` order. Never substitute `F4_CONTRACT_DATABASE_URL`, `E2E_DATABASE_URL`, or ambient `DATABASE_URL`; absence of any guard URL records `hosted/explicit-resource-required` locally. Hosted CI must supply all three states and capture missing/wrong unchanged snapshots plus marked migration, fixture, readiness, shutdown, and port-release evidence:

      $guardResourceUrls = @(
        $env:F4_E2E_GUARD_MISSING_DATABASE_URL,
        $env:F4_E2E_GUARD_WRONG_MARKER_DATABASE_URL,
        $env:F4_E2E_GUARD_MARKED_DATABASE_URL
      )
      if (@($guardResourceUrls | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
        Write-Host 'Marker-order proof: hosted/explicit-resource-required.'
      } else {
        Invoke-VoteGptNative npm.cmd run test:postgres -- integration/e2e-guarded-harness.test.ts
      }

- [ ] Run focused guarded residence E2E against separate dedicated E2E resource with exact opt-in; confirm save/reconcile/recovery journeys:

      $env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
      $env:E2E_DATABASE_URL = "pglite://.data/e2e/f4"
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
      Invoke-VoteGptNative npm.cmd run test:e2e -- e2e/residence.spec.ts

- [ ] Then retain that explicit validated dedicated E2E resource, exact opt-in, and no ambient `DATABASE_URL` for the complete guarded suite. Expect landing, identity, federal, and residence journeys where applicable; confirm ports 3000/3001 clear after the full suite:

      Invoke-VoteGptNative npm.cmd run test:e2e
- [ ] Run working-tree scans, including untracked files:

      & rg.exe -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**' --glob '!playwright-report/**' --glob '!test-results/**' 'console\.|URLSearchParams|searchParams|localStorage|sessionStorage|indexedDB|caches\.|history\.' src/app/api/v1/location/resolve/route.ts src/app/api/v1/residence/route.ts src/lib/residence.ts src/lib/saved-residence.ts src/components/residence-preview.tsx
      if ($LASTEXITCODE -eq 0) { throw 'Unexpected location storage or URL-state match.' }
      if ($LASTEXITCODE -ne 1) { throw "rg exited with code $LASTEXITCODE." }
      & rg.exe -n --pcre2 --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**' --glob '!**/*.test.*' --glob '!e2e/**' '(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])' src scripts docs .env.example
      if ($LASTEXITCODE -eq 0) { throw 'Unexpected token-shaped value.' }
      if ($LASTEXITCODE -ne 1) { throw "rg exited with code $LASTEXITCODE." }
      Invoke-VoteGptNative rg.exe -n --hidden 'E2E_DESTRUCTIVE_OPT_IN_VALUE|votegpt-destructive-e2e-v1|Buffer\.alloc\(32' e2e .github tests playwright.config.ts

  Expected: first two scans return exit 1 with no output. Third command allowlist is only guard constant, guard tests, E2E deterministic key construction, CI workflow, and CI contract test. Any other match blocks Gate B.
- [ ] Run the final native diff check, verify clean worktree, and inspect exact diff:

      Invoke-VoteGptNative git diff --check
- [ ] Dispatch fresh no-context adversarial reviewer. Critical/Important finding becomes new bounded tests-first task with fresh implementer/reviewer.
- [ ] Coordinator pushes reviewed head, opens F4 PR to `codex/autonomous-f4-f8-integration`, waits for hosted checks, and confirms mergeable/clean.
- [ ] Present Human Gate B. Do not merge before explicit approval.

**Stop condition:** Gate B packet includes final design, deviations, focused/full/PostgreSQL/CI evidence, separate focused-residence and full-suite guarded E2E evidence, UX-DNA map, independent review, and residual risks. After approval and feature merge, coordinator performs post-merge verification and a closeout PR changing only `ROADMAP.md` and `README.md`; README must link saved-residence key runbook. F5 shared files remain blocked until closeout merge places F4 `DONE` on authoritative integration branch.
