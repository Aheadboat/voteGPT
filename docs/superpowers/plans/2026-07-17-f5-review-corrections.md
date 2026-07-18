# F5 Federal-Officials Review Corrections Implementation Plan

> **Coordinator dispatch contract:** Execute this plan through one fresh implementer per named task. Each brief must copy the task's allowed files, interfaces, expected RED or falsifiable check, focused commands, and stop condition. Implementers must not edit this plan, `ROADMAP.md`, or another task's files. After each task, the coordinator inspects the diff, reruns its evidence, and stops for a different read-only reviewer before dispatching the next task.

**Goal:** Make federal-official lookup correct at congressional-district boundaries, bounded under provider failure, globally coherent in cache, publicly sourceable, and safe to verify against isolated databases.

**Architecture:** One request snapshot owns Congress, provider timing, cache timing, and fixture timing. Generated Census policy validates districts before provider work; complete Congress.gov plus Clerk evidence can confirm it, while unavailable or explicitly incomplete runtime evidence may fall back to Census and malformed or contradictory evidence fails closed. F4 closes a destructive E2E-guard interface; after closeout, F5 receives only its named E2E surfaces and owns separate F5 contract, upgrade, and marked E2E resources. F5 adds an independently tested child-process network trap and its own isolated CI verification.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node 24 fetch/AbortController/child_process, Drizzle ORM, PostgreSQL/PGlite, Vitest 4 projects, Testing Library, Playwright, and GitHub Actions.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-07-17-f4-f5-review-corrections-design.md`.
- Work only in `codex/f5-review-corrections` and its isolated worktree.
- Required feature-design dispatch line: `Required skills: invoke ponytail full, then caveman full, before exploration.`
- Coordinator owns `AGENTS.md`, `ROADMAP.md`, `README.md`, `tests/foundation-contract.test.ts`, status records, branch integration, PR state, and Human Gates.
- Tasks F5-R1 through F5-R3 are federal-only and may execute before F4 closes. They remain sequential in one worktree.
- F5-R4 and later stop until F4's feature merge, post-merge checks, closeout merge, and coordinator-owned integration into F5.
- Before F5-R3, coordinator provisions a distinct disposable F5 contract PostgreSQL database. It must differ from runtime, F4 contract, upgrade, and E2E databases. Only the focused F5 cache command receives it as `DATABASE_URL`.
- F4 owns and closes the pure destructive guard, validated wrapper, Playwright/seed/residence wiring, marker `_votegpt_test_database_guard` with sentinel `votegpt-destructive-e2e-v1`, and its own CI separation. F5 receives only the named E2E boundary at handoff, creates/owns `F5_CONTRACT_DATABASE_URL`, `POSTGRES_UPGRADE_DATABASE_URL`, and `E2E_DATABASE_URL`, and never runs F4-only PostgreSQL tests or resources.
- F5-R1 owns one named federal-policy surface and its definition tests. `src/lib/federal-policy.generated.ts` contains deterministic Census facts only (effective Congress range, state/FIPS/district/nonlaunch data, and totals). `src/lib/federal-policy.ts` owns every handwritten behavioral export: Congress calendar arithmetic, cache timing, request/page/detail limits, response/body/count/content-type/redirect bounds, provider host/URL/query rules, timeout phases, and official-name/Bioguide/provider-field constraints. Consumers import those exports or their helpers; they never restate a policy literal.
- F5-R1 also owns a checked-in deterministic policy-literal audit. F5-R2 writes its adapter-consumption RED cases against that audit and makes it green; F5-R11 reruns the actual test after all owners land. Its explicit allowlist may admit provider metadata, generated source, and boundary-test fixtures, but never an adapter or service production exception.
- One aggregate provider deadline owns cancellation. Adapters accept its `AbortSignal`, create no timers/controllers, and perform no retry.
- Exact residence never enters F5 provider calls, logs, cache payloads, source URLs, public links, analytics, search/research inputs, or LLM prompts. F5 receives normalized divisions only.
- Malformed, out-of-policy, or contradictory provider/cache evidence fails closed. Census fallback is allowed only when every observed runtime district is locally valid and runtime evidence is unavailable or explicitly incomplete.
- Production behavior tasks use RED -> GREEN -> focused verification -> independent review. F5-R8 is a verification-only migration rehearsal and must not manufacture a fake RED. F5-R11 changes no production or test file.
- No task adds a cache schema, cache index, retry layer, background refresh, client-side federal fetch, event bus, or new dependency.
- Applicable UI/UX DNA: UX-01, UX-02, UX-03, UX-05, UX-06, UX-07, UX-08, UX-09; UX-04 applies to the divisions-only boundary.
- Use `npm.cmd` and `npx.cmd` on this Windows host.
- Windows native-command safety: do not set or rely on `$PSNativeCommandUseErrorActionPreference`; Windows PowerShell 5.1 does not provide it, and `$ErrorActionPreference` does not make native-command failures terminating. Every R3/R8/R9/R11 provisioning or verification PowerShell block defines `Invoke-VoteGptNative`, routes each native invocation through it, and treats a missing required PostgreSQL client executable as blocked local verification, never GREEN.

## File Responsibility Map

- `data/census/*`, `scripts/generate-federal-policy.mts`, and `src/lib/federal-policy.generated.ts` own checked-in official inputs, hashes, and deterministic Census data; generated output never owns handwritten behavior or provider policy.
- `src/lib/federal-provider-host-policy.mjs` and its `src/lib/federal-provider-host-policy.d.mts` declaration are R1's sole Node-loadable owner of federal provider host literals and the derived E2E-blocked subset. `src/lib/federal-policy.ts`, `src/lib/federal-policy.test.ts`, and `tests/federal-policy-literal-audit.test.ts` consume that artifact and own handwritten federal-policy exports, definition tests, and the deterministic literal-audit manifest. They own Congress snapshots/arithmetic, district/jurisdiction assessment, canonical names/Bioguide IDs, cache ages, provider deadline phases, all request/response bounds, provider URL/field rules, and credential-safe canonical Congress provenance.
- `src/lib/congress-gov.ts` consumes policy URL builders/validators and bounds for one current-Congress request, one complete current-member state roster, chamber split, and selected-member detail batch. It has a fetch-only provider-adapter boundary: its only network primitive is preloaded `globalThis.fetch`.
- `src/lib/house-clerk-vacancy.ts` consumes policy URL builders/validators and bounds while validating the whole national Clerk response against generated voting-state and named nonlaunch-jurisdiction policy before filtering the selected state. It has the same fetch-only provider-adapter boundary.
- `src/lib/federal-officials.ts` owns reconciliation outcomes, evidence completeness, union relation, and `SourceRef`.
- `src/lib/federal-officials-service.ts` owns one refresh snapshot, concurrent provider launch, the existing cache lock, post-lock database clock, global Bioguide coherence, and deterministic publication.
- Inherited F4 E2E surfaces: `e2e/database-guard.mjs`, `tests/e2e-database-guard.test.ts`, `e2e/start-server.mjs`, `playwright.config.ts`, `e2e/seed-session.mjs`, `e2e/residence.spec.ts`, `.github/workflows/ci.yml`, and `tests/ci-e2e-database-contract.test.ts`. F5 PostgreSQL selection is exactly `integration/postgres-auth.test.ts` and `integration/federal-official-cache.test.ts`; `integration/saved-residence-revision-migration.test.ts` and `integration/e2e-guarded-harness.test.ts` remain F4-only and are not handed over.
- F5-R4's `e2e/trap-live-providers.mjs` consumes the R1 Node-loadable blocked-host subset and blocks only preloaded global `fetch` in the Next child; it never owns host literals or a second provider client. `e2e/provider-trap-test-observer.mjs` is test-only deterministic R4 instrumentation. `e2e/fixture-policy.mts` remains only for one-snapshot fixture derivation.
- `vitest.config.mts` and `src/db/index.test.ts` own ordinary/PGlite isolation and removal of the PGlite test's local timeout. `e2e/residence.spec.ts` retains a separately named process-kill bound owned by F4.
- `integration/postgres-upgrade.test.ts` and `vitest.postgres-upgrade.config.mts` own existing-data upgrade proof only.
- `e2e/federal-officials.spec.ts` owns the same-page `no home -> GA-13 -> CA-01 -> no home` acceptance journey.

## Migration Ownership

- Existing F1 baseline: `drizzle/0000_overjoyed_wiccan.sql`, `drizzle/0001_cleanup_auth_verifications.sql`, and matching journal entries.
- Existing later chain: `drizzle/0002_saved_residence.sql` and `drizzle/0003_federal_official_cache.sql` with matching snapshots/journal entries.
- F4 correction owns its saved-residence UUID-revision migration, snapshot, and `_journal.json` update. Handoff records the exact tag before F5 shared work begins.
- F5 creates no migration. Cache hardening uses the existing cache table/lock; upgrade rehearsal reads the checked-in journal without changing any SQL or metadata.

## Dependency and Handoff Graph

`F5-R1 generated policy -> F5-R2 provider/reconciliation -> F5-R3 cache coherence -> F4 closeout handoff`

`handoff -> F5-R4 child trap -> F5-R5 fixture clock -> F5-R6 provenance -> F5-R7 PGlite isolation -> F5-R8 PostgreSQL upgrade -> F5-R9 third CI database -> F5-R10 same-page UI/E2E -> F5-R11 integration/verification/PR/Gate B`

Every arrow is a serial gate. No two implementers edit the F5 worktree concurrently.

---

### Task F5-R1: Generate the Census and Congress Policy Boundary

**Outcome:** Every voting-state district is assessed from checked-in official data; Congress/term values come from one injected snapshot; and every handwritten provider or validation bound/allowlist has one named, tested export.

**Files:**

- Create: `data/census/2020-apportionment.csv`
- Create: `data/census/state.txt`
- Create: `data/census/2020-apportionment.metadata.json`
- Create: `scripts/generate-federal-policy.mts`
- Create: `tests/generate-federal-policy.test.ts`
- Create: `tests/federal-policy-literal-audit.test.ts`
- Create: `src/lib/federal-policy.generated.ts`
- Create: `src/lib/federal-provider-host-policy.mjs`
- Create: `src/lib/federal-provider-host-policy.d.mts`
- Create: `src/lib/federal-policy.ts`
- Create: `src/lib/federal-policy.test.ts`
- Modify: `src/lib/federal-officials.ts`
- Modify: `src/lib/federal-officials.test.ts`

**Official inputs and checked-in metadata contract:**

- `https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment.csv`
- `https://www2.census.gov/geo/docs/reference/state.txt`
- `data/census/2020-apportionment.metadata.json` is a checked-in provenance record. Its `sources` array contains exactly one record for each URL above; every record contains its `url`, full official `officialRelease` and `officialVersion`, full RFC 3339 UTC `retrievedAt` timestamp (not a calendar date), `upstreamSha256`, and `canonicalSha256`.
- Metadata also contains a full RFC 3339 UTC `generatedAt` timestamp; `effectiveCongress` with valid inclusive `first`/`last` values; exactly 50 unique `votingStates` entries of `{ code, fips, representativeCount }`; `totalVotingStates: 50`; `totalRepresentativeCount: 435`; and the exact known nonlaunch jurisdictions (`DC`, `AS`, `GU`, `MP`, `PR`, `VI`). State codes and FIPS codes are unique, every representative count is a positive integer, and the per-state sum equals the recorded total.
- Normal generation/check is offline. Only explicit `node scripts/generate-federal-policy.mts --refresh` may download or refresh checked-in source/provenance timestamps. `--check` canonicalizes UTF-8 BOM/line endings in memory, validates every metadata field and invariant, and fails on source/hash/output drift without rewriting timestamps or output.

**Produces:**

```ts
export type CongressSnapshot = Readonly<{
  checkedAt: string;
  currentCongress: number;
  startYear: number;
  endYear: number;
}>;

export type CensusDistrictAssessment =
  | Readonly<{ status: "valid"; maximumDistrict: number; atLarge: boolean }>
  | Readonly<{ status: "invalid"; maximumDistrict: number }>
  | Readonly<{ status: "policy_expired" }>;

export type ClerkJurisdictionAssessment =
  | Readonly<{ status: "voting_state"; maximumDistrict: number }>
  | Readonly<{ status: "known_nonlaunch"; allowedDistricts: readonly [0] }>
  | Readonly<{ status: "unknown" }>;

export function createCongressSnapshot(now: Date): CongressSnapshot | null;
export function assessCensusDistrict(
  stateCode: string,
  district: number,
  congress: number,
): CensusDistrictAssessment;
export function assessClerkJurisdiction(
  stateCode: string,
): ClerkJurisdictionAssessment;
export function normalizeOfficialName(value: string): string | null;
export function isCanonicalOfficialName(value: string): boolean;
export function isBioguideId(value: string): boolean;
export function bioguidePublicUrl(value: string): string | null;
export function compareBioguideIds(left: string, right: string): number;

// Generated authoritative Census data only. Handwritten behavior below must
// consume this data rather than restating its Congress range or district facts.
import { FEDERAL_CENSUS_DATA } from "./federal-policy.generated";
import {
  FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS,
  FEDERAL_PROVIDER_HOSTS,
} from "./federal-provider-host-policy.mjs";
export { FEDERAL_CENSUS_DATA };
export { FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS };

export const FEDERAL_MILLISECONDS_PER_SECOND = 1_000;
export const FEDERAL_MILLISECONDS_PER_MINUTE =
  60 * FEDERAL_MILLISECONDS_PER_SECOND;
export const FEDERAL_MILLISECONDS_PER_HOUR =
  60 * FEDERAL_MILLISECONDS_PER_MINUTE;

// Handwritten calculation epoch, not generated Census data or a provider fact.
export const CONGRESS_EPOCH_FIRST_NUMBER = 1;
export const CONGRESS_EPOCH_START_YEAR_UTC = 1789;
export const CONGRESS_EPOCH_START_INSTANT_UTC =
  "1789-03-04T00:00:00.000Z";
export const CONGRESS_TERM_LENGTH_YEARS = 2;
export const CONGRESS_TURNOVER_MONTH_INDEX = 0;
export const CONGRESS_TURNOVER_DAY_OF_MONTH = 3;
export const CONGRESS_TURNOVER_HOUR_UTC = 17;
export const CONGRESS_CALENDAR_POLICY = Object.freeze({
  epoch: Object.freeze({
    firstCongressNumber: CONGRESS_EPOCH_FIRST_NUMBER,
    startYearUtc: CONGRESS_EPOCH_START_YEAR_UTC,
    startInstantUtc: CONGRESS_EPOCH_START_INSTANT_UTC,
  }),
  termLengthYears: CONGRESS_TERM_LENGTH_YEARS,
  turnoverUtc: Object.freeze({
    monthIndex: CONGRESS_TURNOVER_MONTH_INDEX,
    dayOfMonth: CONGRESS_TURNOVER_DAY_OF_MONTH,
    hour: CONGRESS_TURNOVER_HOUR_UTC,
  }),
  effectiveRange: FEDERAL_CENSUS_DATA.effectiveCongress,
});

export const FEDERAL_CACHE_REFRESH_AGE_MS =
  24 * FEDERAL_MILLISECONDS_PER_HOUR;
export const FEDERAL_CACHE_STALE_AGE_MS =
  72 * FEDERAL_MILLISECONDS_PER_HOUR;
export const FEDERAL_CACHE_POLICY = Object.freeze({
  refreshAgeMs: FEDERAL_CACHE_REFRESH_AGE_MS,
  staleAgeMs: FEDERAL_CACHE_STALE_AGE_MS,
  futureTimestampToleranceMs: 0,
});

export const CONGRESS_STATE_MEMBER_LIST_LIMIT = 250;
export const CONGRESS_STATE_MEMBER_MAX_PAGES = 1;
export const CONGRESS_MEMBER_DETAIL_BATCH_LIMIT =
  CONGRESS_STATE_MEMBER_LIST_LIMIT;
export const CLERK_NATIONAL_VACANCY_LIST_LIMIT =
  FEDERAL_CENSUS_DATA.totalRepresentativeCount +
  FEDERAL_CENSUS_DATA.nonlaunchJurisdictions.length;
export const FEDERAL_PROVIDER_RESPONSE_MAX_BYTES = 1_048_576;
export const FEDERAL_PROVIDER_FETCH_REDIRECT_MODE = "error" as const;
export const FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST = Object.freeze({
  congress: Object.freeze(["application/json"] as const),
  clerk: Object.freeze(["text/html"] as const),
});
export const FEDERAL_PROVIDER_RESPONSE_POLICY = Object.freeze({
  maxBodyBytes: FEDERAL_PROVIDER_RESPONSE_MAX_BYTES,
  redirect: FEDERAL_PROVIDER_FETCH_REDIRECT_MODE,
  contentTypes: FEDERAL_PROVIDER_CONTENT_TYPE_ALLOWLIST,
  congress: Object.freeze({
    stateMemberListLimit: CONGRESS_STATE_MEMBER_LIST_LIMIT,
    maxStateMemberPages: CONGRESS_STATE_MEMBER_MAX_PAGES,
    maxMemberDetailRequests: CONGRESS_MEMBER_DETAIL_BATCH_LIMIT,
  }),
  clerk: Object.freeze({
    maxNationalVacancyRows: CLERK_NATIONAL_VACANCY_LIST_LIMIT,
  }),
});

export const FEDERAL_PROVIDER_PHASE_BUDGET_MS =
  5 * FEDERAL_MILLISECONDS_PER_SECOND;
export const CONGRESS_CRITICAL_PATH_PHASES = 3;
export const FEDERAL_NETWORK_POLICY = Object.freeze({
  phaseBudgetMs: FEDERAL_PROVIDER_PHASE_BUDGET_MS,
  congressCriticalPathPhases: CONGRESS_CRITICAL_PATH_PHASES,
});
export const FEDERAL_REFRESH_DEADLINE_MS =
  FEDERAL_PROVIDER_PHASE_BUDGET_MS * CONGRESS_CRITICAL_PATH_PHASES;

export const FEDERAL_PROVIDER_HOST_ALLOWLIST = FEDERAL_PROVIDER_HOSTS;
export const FEDERAL_PROVIDER_URL_POLICY = Object.freeze({
  congress: Object.freeze({
    origin: `https://${FEDERAL_PROVIDER_HOST_ALLOWLIST.congressApi}`,
    allowedHost: FEDERAL_PROVIDER_HOST_ALLOWLIST.congressApi,
    pathPrefix: "/v3/",
    currentCongressPath: "/v3/congress/current",
    stateMemberPathTemplate: "/v3/member/{stateCode}",
    memberDetailPathTemplate: "/v3/member/{bioguideId}",
    query: Object.freeze({
      format: Object.freeze({ key: "format", value: "json" }),
      currentMember: Object.freeze({ key: "currentMember", value: "true" }),
      limitKey: "limit",
      apiKey: "api_key",
    }),
  }),
  clerk: Object.freeze({
    origin: `https://${FEDERAL_PROVIDER_HOST_ALLOWLIST.clerk}`,
    allowedHost: FEDERAL_PROVIDER_HOST_ALLOWLIST.clerk,
    nationalVacancyPath: "/Members/ViewVacancies",
    vacancyDetailPathTemplate: "/members/{stateCode}{districtCode}/vacancy",
  }),
  bioguide: Object.freeze({
    origin: `https://${FEDERAL_PROVIDER_HOST_ALLOWLIST.bioguidePublic}`,
    allowedHost: FEDERAL_PROVIDER_HOST_ALLOWLIST.bioguidePublic,
    memberPathTemplate: "/search/bio/{bioguideId}",
  }),
});

export const FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS = 160;
export const BIOGUIDE_ID_LENGTH = 7;
export const BIOGUIDE_ID_PATTERN = /^[A-Z]\d{6}$/;
export const FEDERAL_OFFICIAL_FIELD_POLICY = Object.freeze({
  stateCodePattern: /^[A-Z]{2}$/,
  officialName: Object.freeze({
    maxCodePoints: FEDERAL_OFFICIAL_NAME_MAX_CODE_POINTS,
    normalizeUnicode: "NFC",
    rejectC0C1AndBidiControls: true,
  }),
  bioguideId: Object.freeze({
    length: BIOGUIDE_ID_LENGTH,
    pattern: BIOGUIDE_ID_PATTERN,
  }),
  congressCurrent: Object.freeze({
    requiredKeys: Object.freeze(["number", "startYear", "endYear", "url"]),
  }),
  congressMember: Object.freeze({
    requiredKeys: Object.freeze([
      "bioguideId",
      "name",
      "state",
      "district",
      "url",
    ]),
    chambers: Object.freeze(["House", "Senate"] as const),
  }),
  clerkVacancy: Object.freeze({
    requiredKeys: Object.freeze(["stateCode", "districtCode", "publicUrl"]),
  }),
});

export function congressCurrentUrl(apiKey: string): URL;
export function congressStateMemberListUrl(
  stateCode: string,
  apiKey: string,
): URL;
export function congressMemberDetailUrl(
  bioguideId: string,
  apiKey: string,
): URL;
export function canonicalCongressIngestionUrl(value: URL | string): string | null;
export function clerkNationalVacancyUrl(): URL;
export function clerkVacancyPublicUrl(
  stateCode: string,
  district: number,
): string | null;
export function isAllowedCongressApiUrl(value: string): boolean;
export function isAllowedClerkPublicUrl(value: string): boolean;

export const FEDERAL_POLICY_LITERAL_AUDIT = Object.freeze({
  epochLiteralValues: Object.freeze([
    CONGRESS_EPOCH_FIRST_NUMBER,
    CONGRESS_EPOCH_START_YEAR_UTC,
    CONGRESS_EPOCH_START_INSTANT_UTC,
  ]),
  productionFiles: Object.freeze([
    "src/lib/federal-officials.ts",
    "src/lib/congress-gov.ts",
    "src/lib/house-clerk-vacancy.ts",
    "src/lib/federal-officials-service.ts",
  ]),
  allowlistedPaths: Object.freeze({
    "src/lib/federal-policy.ts": "named_handwritten_policy_owner",
    "src/lib/federal-provider-host-policy.mjs": "node_loadable_provider_host_owner",
    "src/lib/federal-policy.generated.ts": "generated_census_data",
    "data/census/2020-apportionment.csv": "official_source",
    "data/census/state.txt": "official_source",
    "data/census/2020-apportionment.metadata.json": "provider_metadata",
    "scripts/generate-federal-policy.mts": "generated_source",
    "tests/generate-federal-policy.test.ts": "boundary_test",
    "src/lib/federal-policy.test.ts": "boundary_test",
    "src/lib/congress-gov.test.ts": "boundary_test",
    "src/lib/house-clerk-vacancy.test.ts": "boundary_test",
    "src/lib/federal-officials.test.ts": "boundary_test",
    "src/lib/federal-officials-service.test.ts": "boundary_test",
  }),
});
```

`src/lib/federal-provider-host-policy.mjs` is the sole literal owner and must be importable by bare `process.execPath` without Next, TypeScript, or a custom loader:

```js
export const FEDERAL_PROVIDER_HOSTS = Object.freeze({
  congressApi: "api.congress.gov",
  clerk: "clerk.house.gov",
  bioguidePublic: "bioguide.congress.gov",
});

export const FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS = Object.freeze([
  FEDERAL_PROVIDER_HOSTS.congressApi,
  FEDERAL_PROVIDER_HOSTS.clerk,
]);
```

`src/lib/federal-provider-host-policy.d.mts` declares those frozen exports for TypeScript without repeating a hostname. `src/lib/federal-policy.ts` derives its host allowlist and every provider origin from the MJS exports; R4 imports the same blocked subset directly from MJS. No adapter, trap, observer, or test hardcodes a blocked hostname. The literal audit permits the MJS owner only and rejects a second production owner.

The `congress*Url(apiKey)` result is request-only: it goes directly to `fetch` and must never become a provider outcome, cache field, `SourceRef`, thrown error/cause, log context, or serialized value. `canonicalCongressIngestionUrl()` is the sole named boundary for durable/reportable Congress provenance: it validates the policy-defined HTTPS host/path/query shape, strips `api_key`, preserves only policy-allowed nonsecret query fields in deterministic order, and returns `null` for an invalid value. Diagnostics use that credential-free canonical value or a static provider label when canonicalization fails; they never interpolate or retain the raw request URL.


- [ ] **Step 1: Write policy and generator RED tests**

Cover missing/empty official release or version, missing/malformed full `retrievedAt` or `generatedAt`, wrong source URL, changed/missing upstream or canonical hash, duplicate/missing source record, duplicate/missing voting state or FIPS code, territory incorrectly counted among voting states, non-integer/zero seats, total-state count other than 50, per-state sum or recorded total other than 435, invalid effective Congress range, and missing/extra/duplicate nonlaunch jurisdiction. Assert every voting-state record has code, FIPS, and representative count, and that `generatedAt` is required in checked-in metadata but absent from generated TypeScript. Run `--check` twice against unchanged inputs and assert byte-identical TypeScript output.

Cover all 50 voting states: at-large accepts district `0` only; multi-seat accepts `1..N`; reject `N+1`, negative, fractional, `NaN`, `99`, unknown state, DC, and territory for selected voting-office lookup. Cover Clerk classification for all voting states, six named nonlaunch jurisdictions, and unknown codes.

Assert the named epoch maps `1789-03-04T00:00:00.000Z` to Congress `1`, `2023-01-03T17:00:00.000Z` to Congress `118`, and `2025-01-03T17:00:00.000Z` to Congress `119`. Freeze immediately before, at, and after the named January 3 17:00 UTC rollover: `2025-01-03T16:59:59.999Z` is 118, the boundary is 119, and `2025-01-03T17:00:00.001Z` stays 119. Assert no raw epoch year, first-Congress number, or rollover date appears in `createCongressSnapshot`. Also cover leap years, invalid dates, expired policy, Unicode normalization, C0/C1/bidi controls, canonical Bioguide syntax, public URL generation, and bytewise ID ordering.

Assert every handwritten policy export above is immutable and has its stated owner: generated Census range/totals/nonlaunch data drive assessment; named epoch first-number/start-year/start-instant plus named term/turnover policy exclusively drive `createCongressSnapshot`; named cache ages drive freshness; named phase/deadline exports drive cancellation; named response/page/detail/body/count/content-type/redirect exports drive provider bounds; the Node-loadable host artifact plus derived URL/query helpers drive all provider URLs; and named name/Bioguide/field exports drive validation. Assert `CONGRESS_STATE_MEMBER_LIST_LIMIT === 250` and that `congressStateMemberListUrl()` serializes its `limit` query from that constant, not a raw string.

Spawn bare `process.execPath` with no TypeScript/Next loader and dynamically import `src/lib/federal-provider-host-policy.mjs`. Assert the frozen host map and blocked subset load successfully, the subset is derived from the named Congress/Clerk fields, and the TypeScript facade's host allowlist/origins equal the MJS values. Read the facade source and reject every blocked-host literal there; the MJS source is the only permitted literal owner. R4 later repeats that ownership proof for its trap and observer after those files exist.

With a supplied sentinel Congress key, assert the request builder carries it only on the fetch URL; `canonicalCongressIngestionUrl()` strips `api_key`, preserves the policy-allowed endpoint and nonsecret query shape deterministically, and rejects unexpected credentials or query fields. Assert the canonical helper and its static-provider fallback are the only diagnostic/provenance values exposed by the policy contract.

Create `tests/federal-policy-literal-audit.test.ts`. It imports the policy exports and Node-loadable host artifact, derives every forbidden raw number/string/regular-expression token from them (including every value in `FEDERAL_POLICY_LITERAL_AUDIT.epochLiteralValues`), walks the fixed sorted F5 production-file inventory in `FEDERAL_POLICY_LITERAL_AUDIT`, and fails on a token outside its path/reason allowlist. It must also reject an adapter/service allowlist entry or a second production host-literal owner. It is deterministic Node test code, not a shell `rg` assertion. Provider metadata, generated Census/source files, the one MJS host owner, and explicit boundary tests are the only non-owner allowlist classes. R2 runs this test RED before changing consumers and GREEN after removing all adapter-local policy literals; R4 adds its own static trap/observer ownership proof because those files do not exist at R1; R11 reruns this same file.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/generate-federal-policy.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts
```

Expected: generator/policy exports do not exist and the existing district parser still accepts anonymous `0..99` bounds.


- [ ] **Step 3: Implement deterministic generation**

Parse official files by header name. On `--refresh`, write the full checked-in provenance contract: each official source release/version, URL, full retrieval timestamp, upstream/canonical hashes; metadata-only `generatedAt`; inclusive effective Congress range; every voting state code/FIPS/representative count; the 50-state/435-representative totals; and exact nonlaunch jurisdictions. Validate all metadata, source, state/FIPS, count, total, and range invariants before generating sorted immutable TypeScript. Keep policy behavior handwritten; generated code contains policy data only. Never emit `generatedAt` into `src/lib/federal-policy.generated.ts`; `--check` reads and validates the checked-in metadata but does not recompute or write its timestamps, so repeated checks leave runtime TypeScript byte-stable.

- [ ] **Step 4: Implement policy facade and replace owned anonymous values**

Create the MJS host artifact and declaration first. Put every provider hostname literal there once, derive its E2E-blocked subset from the named Congress/Clerk fields, and keep it importable by bare Node. Use generated Congress validity and jurisdiction tables as data only; keep the Congress calculation epoch, term/turnover arithmetic, cache timing, provider bounds, URL/query rules, field validation, and credential-safe Congress provenance handwritten in the named facade exports above. `createCongressSnapshot` rejects pre-epoch instants and derives `currentCongress`, `startYear`, and `endYear` only from `CONGRESS_EPOCH_FIRST_NUMBER`, `CONGRESS_EPOCH_START_YEAR_UTC`, `CONGRESS_EPOCH_START_INSTANT_UTC`, and the named term/turnover policy; generated `effectiveCongress` may only gate whether that computed snapshot remains supported. It must not contain raw `1789`, `1`, or a rollover date. The facade imports the host artifact and derives every host allowlist/origin from it; it does not restate a hostname. Implement the request/provenance split there: API-key-bearing URLs are fetch-only, while `canonicalCongressIngestionUrl()` creates deterministic credential-free evidence/diagnostic text. Replace R1-owned district caps, Congress arithmetic, cache ages, name rules, and Bioguide rules. Implement the deterministic literal audit and its explicit allowlist now, but leave R2 adapter consumers untouched so its RED proves the inherited local literals; do not add a broad shell scan or a permanent adapter exception.

- [ ] **Step 5: Run GREEN**

```powershell
npm.cmd test -- tests/generate-federal-policy.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts
node scripts/generate-federal-policy.mts --check
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: checked-in metadata contains full official release/version, canonical and upstream hashes, full retrieval and generated timestamps, effective Congress range, all 50 state-code/FIPS/representative-count entries, 50/435 total invariants, and exact nonlaunch jurisdictions. `generatedAt` exists only in metadata, never in runtime TypeScript; repeated `--check` runs preserve byte-identical generated TypeScript. Bare Node imports the frozen host artifact without a loader; only that artifact contains a provider hostname literal, and the facade derives its host allowlist/origins from it. Every voting-state cap and named nonlaunch jurisdiction passes; each named policy owner/helper is defined and tested; a supplied Congress key is request-only while canonical provenance is credential-free/deterministic; and no file outside the allowed list changes. The reusable global audit intentionally receives its first GREEN in R2, once its consumer files have been converted.

- [ ] **Step 6: Commit and stop**

```powershell
git add data/census scripts/generate-federal-policy.mts tests/generate-federal-policy.test.ts tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.generated.ts src/lib/federal-provider-host-policy.mjs src/lib/federal-provider-host-policy.d.mts src/lib/federal-policy.ts src/lib/federal-policy.test.ts src/lib/federal-officials.ts src/lib/federal-officials.test.ts
git commit -m "fix(f5): generate federal policy"
```

Stop for coordinator evidence replay and a fresh official-data/domain reviewer.

---

### Task F5-R2: Share One Snapshot, Deadline, and Explicit Runtime Evidence Matrix

**Outcome:** Congress.gov and Clerk start together under one deadline; provider completeness and failure class are explicit; only complete exact union confirms Census; both provider adapters use preloaded `globalThis.fetch` as their sole network primitive.

**Files:**

- Modify: `src/lib/federal-policy.ts`
- Modify: `src/lib/federal-policy.test.ts`
- Modify: `src/lib/federal-officials.ts`
- Modify: `src/lib/federal-officials.test.ts`
- Modify: `src/lib/congress-gov.ts`
- Modify: `src/lib/congress-gov.test.ts`
- Modify: `src/lib/house-clerk-vacancy.ts`
- Modify: `src/lib/house-clerk-vacancy.test.ts`
- Modify: `src/lib/federal-officials-service.ts`
- Modify: `src/lib/federal-officials-service.test.ts`

**Consumes:** `CongressSnapshot`, generated Census/jurisdiction assessment, `CONGRESS_CALENDAR_POLICY`, `FEDERAL_CACHE_POLICY`, `CONGRESS_STATE_MEMBER_LIST_LIMIT`, `FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS`, all named response/body/count/content-type/redirect bounds, `FEDERAL_PROVIDER_URL_POLICY` plus its request URL builders, validators, and `canonicalCongressIngestionUrl()`, `FEDERAL_OFFICIAL_FIELD_POLICY`, and `FEDERAL_REFRESH_DEADLINE_MS` from F5-R1. R2 consumes these exports in every URL construction and provider/cache validation path; it defines none of them locally. Its only outbound interface is `globalThis.fetch`, which R4 preloads before Next loads either adapter.

**Produces:**

```ts
export type ProviderAvailabilityFailure =
  | "missing_credentials"
  | "auth"
  | "quota"
  | "timeout"
  | "provider_error";

export type ProviderInvalidFailure = "malformed" | "conflict";
export type RuntimeUnionRelation =
  | "exact"
  | "strict_subset"
  | "outside_local"
  | "wrong_shape";

export type CongressRosterOutcome =
  | Readonly<{
      status: "available";
      completeness: "complete" | "incomplete";
      snapshot: CongressSnapshot;
      houseDistricts: readonly number[];
      house: readonly FederalSeat[];
      senate: readonly FederalSeat[];
    }>
  | Readonly<{
      status: "unavailable";
      reason: ProviderAvailabilityFailure;
    }>
  | Readonly<{ status: "invalid"; reason: ProviderInvalidFailure }>;

export type ClerkVacancyOutcome =
  | Readonly<{
      status: "available";
      completeness: "complete";
      selectedStateDistricts: readonly number[];
      sourceListUrl: string;
    }>
  | Readonly<{
      status: "unavailable";
      reason: Exclude<ProviderAvailabilityFailure, "missing_credentials">;
    }>
  | Readonly<{ status: "invalid"; reason: ProviderInvalidFailure }>;

export type FederalDistrictEvidence = Readonly<{
  congressCompleteness: "complete" | "incomplete" | "unavailable";
  clerkCompleteness: "complete" | "unavailable";
  unionRelation: RuntimeUnionRelation;
  decision: "runtime_confirmed" | "census_fallback" | "conflict";
}>;
```

**Decision matrix:**

| Congress status | Clerk status | Union relation | Decision |
| --- | --- | --- | --- |
| complete | complete | exact | `runtime_confirmed` |
| incomplete/unavailable | complete/unavailable | exact or strict subset | `census_fallback`; label runtime confirmation unavailable |
| complete | complete | strict subset | `conflict`; completeness claim contradicts local full set |
| any | any | outside local or wrong shape | `conflict`; no fallback |
| invalid/malformed from either provider | any | any | `conflict`; no fallback |

Exact set alone is insufficient: both providers must be complete. Conflict precedence applies before availability fallback.

- [ ] **Step 1: Write scheduling, completeness, national-Clerk, and matrix RED tests**

Use deferred promises/fake timers. Prove Congress and Clerk start before either settles, every fetch sees the same signal, the root deadline aborts current/state/detail/Clerk work, timer/listeners clear, no request begins after abort, and late completion is ignored. Congress uses `congressCurrentUrl()`, one `congressStateMemberListUrl(state, apiKey)`, and `congressMemberDetailUrl()`; assert the roster URL's `limit` query equals `String(CONGRESS_STATE_MEMBER_LIST_LIMIT)` and therefore the named `250` value, validates the named one-page/count bounds, splits chambers, and runs selected member details concurrently.

Supply a sentinel Congress key and capture the raw `fetch` argument. Assert only that request argument contains the key: successful provider outcomes/service handoffs, failure errors and causes, captured diagnostic/log contexts, and any intermediate serializable data contain either the R1 canonical credential-free URL or a static provider label, never the supplied key or raw authenticated URL.

Feed Clerk one mixed national response containing valid `GA-13`, `CA-01`, `AK-00`, `DC-00`, and `PR-00`. Validate every row against its own voting-state or known-nonlaunch policy before selecting GA. Then separately prove unknown `ZZ`, `CA-99`, `GA-00`, malformed DC/territory district, duplicate vacancy, bad national grammar, and out-of-bound response fail the whole provider result. No invalid row outside the selected state may be ignored.

Cover every matrix row, including: exact union with Clerk unavailable remains fallback; complete providers plus strict subset is conflict; locally valid strict subset with Congress incomplete is fallback; outside-local wins over another provider's timeout; Congress mismatch and malformed detail fail closed; serving member plus complete vacancy for the same seat conflicts; Senate order is ascending Bioguide ID.

Add adapter-consumption RED cases in `congress-gov.test.ts`, `house-clerk-vacancy.test.ts`, and `federal-officials-service.test.ts`: read each adapter source and require its federal-policy import plus the approved URL helpers/validators; reject an adapter-local Congress/Clerk/Bioguide host, path/query fragment, `limit=250` or raw `250` page bound, body/count/content-type/redirect bound, timeout/timer, name/Bioguide regex, or provider-field allowlist. For the two provider adapters only, also reject static `import`, `require`, or dynamic `import()` of `node:http`, `node:https`, `node:net`, `node:tls`, `http`, `https`, `net`, `tls`, or `undici`, and reject direct `request`, `get`, `connect`, `createConnection`, `setGlobalDispatcher`, `Agent`, `Client`, `Pool`, or `Dispatcher` calls. Runtime-test the same boundary: replace `globalThis.fetch` with a tracked fake before a fresh dynamic import of each adapter, exercise every Congress/Clerk request path with fixtures, and assert every outbound request reaches that fake; restore the global after each test. The test must derive hosts from the R1 artifact and must not add a test-local host literal. Run `tests/federal-policy-literal-audit.test.ts` as the deterministic cross-file RED; its failure must name the unauthorized production path/token, not rely on a human interpreting search output.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts
```

Expected: adapters still own local timeout/URL/validation literals, the deterministic audit names those violations, the service serializes provider launch, completeness/union relation are absent, and Clerk filters before validating the national response.

- [ ] **Step 3: Implement caller-owned cancellation and provider outcomes**

Create snapshot/controller once in the service, start both provider promises synchronously, set one `FEDERAL_REFRESH_DEADLINE_MS` timer, and clear it in `finally`. Adapters receive `signal`, perform no retry/timer, and use only F5-R1 exports for response body size, list/detail counts, content types, redirect mode, names, Bioguide IDs, provider record fields, request URL construction, canonical provenance, and incoming provider URL validation. Each adapter calls preloaded `globalThis.fetch` directly; do not inject, construct, import, or call an Undici/client/`http`/`https`/`net`/`tls` transport. Build the roster request with `CONGRESS_STATE_MEMBER_LIST_LIMIT` interpolated through `congressStateMemberListUrl()`; pass its API-key-bearing value only to `fetch`, immediately derive `canonicalCongressIngestionUrl()` for every durable/reportable handoff, and use only that canonical value or a static provider label in errors/logs. Do not write `limit=250`, `250`, a provider host, or an API path/query literal in an adapter or service. Map availability versus invalid failures without catch-all fallback.

- [ ] **Step 4: Implement national Clerk validation and B-with-A fallback**

Validate all Clerk rows first, then filter the selected voting state. Build union from Congress current House districts plus selected-state Clerk vacancies. Classify relation against generated local full set before applying the table. Publish `runtime_confirmed` only for complete+complete+exact; publish labeled `census_fallback` only for unavailable/incomplete evidence whose observed values are local; return conflict for every invalid or contradictory case.

- [ ] **Step 5: Run GREEN**

```powershell
npm.cmd test -- tests/federal-policy-literal-audit.test.ts src/lib/federal-policy.test.ts src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: one root deadline bounds all phases; every completeness/failure/union combination has deterministic evidence; every provider URL/bound/allowlist and credential-safe provenance boundary comes from R1; both provider adapters reject direct-transport imports/calls and route every exercised request through the tracked preloaded `globalThis.fetch`; the named `CONGRESS_STATE_MEMBER_LIST_LIMIT` produces the request's `limit=250`; the supplied Congress key exists only at the fetch boundary, never in outcome/error/log/serializable data; and the actual deterministic audit passes with no adapter/service production exception.

- [ ] **Step 6: Commit and stop**

```powershell
git add src/lib/federal-policy.ts src/lib/federal-policy.test.ts src/lib/federal-officials.ts src/lib/federal-officials.test.ts src/lib/congress-gov.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.ts src/lib/federal-officials-service.test.ts
git commit -m "fix(f5): reconcile federal evidence"
```

Stop for coordinator evidence replay and a fresh provider/concurrency reviewer.

---

### Task F5-R3: Lock Cache Writes Before Capturing Database Time

**Outcome:** A writer that waits behind a valid winner preserves that winner; future/corrupt poison is repairable; Bioguide identity and orphan deletion are globally coherent.

**Files:**

- Modify: `src/lib/federal-officials-service.ts`
- Modify: `src/lib/federal-officials-service.test.ts`
- Modify: `integration/federal-official-cache.test.ts`

**Consumes:** Canonical F5-R1 validators and F5-R2 roster/evidence types. Uses existing federal cache schema and lock; creates no migration or index.

**Transaction order:**

```ts
await acquireFederalCacheLock(tx);
const databaseNow = await readClockTimestamp(tx); // SELECT clock_timestamp()
const current = await readAndValidateGlobalCacheState(tx, databaseNow);
```

`clock_timestamp()` is captured after the lock. `transaction_timestamp()` is forbidden here because a loser transaction may start, wait for a winner, then see the winner's committed timestamp as falsely future relative to the loser's transaction start.

- [ ] **Step 1: Write lock-order, post-lock-clock, winner, poison, and global-reference RED tests**

Use two real PostgreSQL connections with barriers. Start loser transaction first, let winner acquire lock and commit, then release loser. Assert loser acquires lock, captures a later `clock_timestamp()`, reads winner, preserves it, and returns it. Assert no target/global cache read happens before the lock.

Also cover future incoming rejection; corrupt/future stored target repair; newer winner versus older incoming; equal-time identical payload; equal-time contradictory payload; same Bioguide across states; removal from one state while another references it; final global orphan deletion; unrelated corrupt/future roster cleanup; rollback after partial profile/roster work; newer contradictory office generation invalidating older references; equal/newer surviving contradiction rejecting older incoming; deterministic winner reread.

- [ ] **Step 2: Run unit RED**

```powershell
function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

Invoke-VoteGptNative -Label "F5-R3 unit RED" -FilePath "npm.cmd" -NativeArguments @("test", "--", "src/lib/federal-officials-service.test.ts")
```

Expected: database time is captured before lock or from transaction start, the waited-for winner can be classified as future/overwritten, and orphan scans are state-local.

- [ ] **Step 3: Provision a distinct pre-handoff F5 contract database and run integration RED**

```powershell
$ErrorActionPreference = "Stop"

function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

if ([string]::IsNullOrWhiteSpace($env:VOTEGPT_TEST_POSTGRES_BASE_URL)) { throw "VOTEGPT_TEST_POSTGRES_BASE_URL is required." }
$f5Run = [guid]::NewGuid().ToString("N")
$f5Db = "votegpt_f5_contract_$f5Run"
$f5Base = $env:VOTEGPT_TEST_POSTGRES_BASE_URL.TrimEnd("/")
if ($f5Base -notmatch '^postgresql://[^/]+@(?:127\.0\.0\.1|localhost):[0-9]+$') { throw "VOTEGPT_TEST_POSTGRES_BASE_URL must target local PostgreSQL without a database path." }
$f5Admin = "$f5Base/postgres"
$requiredPostgresTools = @("createdb", "dropdb")
$missingPostgresTools = @(
  foreach ($tool in $requiredPostgresTools) {
    if ($null -eq (Get-Command -Name $tool -CommandType Application -ErrorAction SilentlyContinue)) {
      $tool
    }
  }
)
if ($missingPostgresTools.Count -gt 0) {
  throw "Local PostgreSQL verification is blocked: missing required client executable(s): $($missingPostgresTools -join ', '). Do not report GREEN."
}
$env:F5_CONTRACT_DATABASE_URL = "$f5Base/$f5Db"
Invoke-VoteGptNative -Label "createdb $f5Db" -FilePath "createdb" -NativeArguments @("--maintenance-db=$f5Admin", $f5Db)
try {
  $env:DATABASE_URL = $env:F5_CONTRACT_DATABASE_URL
  Invoke-VoteGptNative -Label "contract migration" -FilePath "npm.cmd" -NativeArguments @("run", "db:migrate")
  Invoke-VoteGptNative -Label "F5-R3 integration RED" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres", "--", "integration/federal-official-cache.test.ts")
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:F5_CONTRACT_DATABASE_URL -ErrorAction SilentlyContinue
  Invoke-VoteGptNative -Label "dropdb $f5Db" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$f5Admin", $f5Db)
}
```

Expected: focused concurrency assertions fail for the pre-lock clock/winner behavior, while no runtime, F4 contract, upgrade, or E2E database is touched. If `createdb` or `dropdb` is unavailable, the prerequisite throws before database creation: local integration verification is blocked and is not GREEN.

- [ ] **Step 4: Implement lock-first validation and global coherence**

Acquire existing cache lock before any mutable cache read. Capture one post-lock `clock_timestamp()`. Reject incoming `retrievedAt > databaseNow`; delete corrupt/future stored rows; preserve a valid newer winner committed during the wait; conditionally publish profiles before roster; reread authoritative winner; scan all surviving rosters before deleting a profile; roll back on valid contradiction or DB failure.

- [ ] **Step 5: Run GREEN against a fresh distinct contract database**

```powershell
$ErrorActionPreference = "Stop"

function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

if ([string]::IsNullOrWhiteSpace($env:VOTEGPT_TEST_POSTGRES_BASE_URL)) { throw "VOTEGPT_TEST_POSTGRES_BASE_URL is required." }
$f5GreenRun = [guid]::NewGuid().ToString("N")
$f5GreenDb = "votegpt_f5_contract_$f5GreenRun"
$f5GreenBase = $env:VOTEGPT_TEST_POSTGRES_BASE_URL.TrimEnd("/")
if ($f5GreenBase -notmatch '^postgresql://[^/]+@(?:127\.0\.0\.1|localhost):[0-9]+$') { throw "VOTEGPT_TEST_POSTGRES_BASE_URL must target local PostgreSQL without a database path." }
$f5GreenAdmin = "$f5GreenBase/postgres"
$requiredPostgresTools = @("createdb", "dropdb")
$missingPostgresTools = @(
  foreach ($tool in $requiredPostgresTools) {
    if ($null -eq (Get-Command -Name $tool -CommandType Application -ErrorAction SilentlyContinue)) {
      $tool
    }
  }
)
if ($missingPostgresTools.Count -gt 0) {
  throw "Local PostgreSQL verification is blocked: missing required client executable(s): $($missingPostgresTools -join ', '). Do not report GREEN."
}
$env:F5_CONTRACT_DATABASE_URL = "$f5GreenBase/$f5GreenDb"
Invoke-VoteGptNative -Label "createdb $f5GreenDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$f5GreenAdmin", $f5GreenDb)
try {
  Invoke-VoteGptNative -Label "F5-R3 unit GREEN" -FilePath "npm.cmd" -NativeArguments @("test", "--", "src/lib/federal-officials-service.test.ts")
  $env:DATABASE_URL = $env:F5_CONTRACT_DATABASE_URL
  Invoke-VoteGptNative -Label "contract migration" -FilePath "npm.cmd" -NativeArguments @("run", "db:migrate")
  Invoke-VoteGptNative -Label "F5-R3 integration GREEN" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres", "--", "integration/federal-official-cache.test.ts")
  Remove-Item Env:DATABASE_URL
  Invoke-VoteGptNative -Label "typecheck" -FilePath "npm.cmd" -NativeArguments @("run", "typecheck")
  Invoke-VoteGptNative -Label "lint" -FilePath "npm.cmd" -NativeArguments @("run", "lint")
  Invoke-VoteGptNative -Label "diff check" -FilePath "git" -NativeArguments @("diff", "--check")
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:F5_CONTRACT_DATABASE_URL -ErrorAction SilentlyContinue
  Invoke-VoteGptNative -Label "dropdb $f5GreenDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$f5GreenAdmin", $f5GreenDb)
}
```

Expected: loser preserves waited-for winner, poison never publishes, cross-state references prevent deletion, final orphan removal succeeds, and the F5 contract database is removed. If required PostgreSQL clients are unavailable, verification is blocked before database creation and cannot be reported GREEN.

- [ ] **Step 6: Commit and stop at handoff**

```powershell
git add src/lib/federal-officials-service.ts src/lib/federal-officials-service.test.ts integration/federal-official-cache.test.ts
git commit -m "fix(f5): harden federal cache"
```

Stop for coordinator evidence replay and a fresh cache/database reviewer. Do not dispatch F5-R4.

---

### Handoff Gate: Integrate Closed F4 Harness and Residence Behavior

**Outcome:** F5 receives one reviewed F4 closeout commit and proves the inherited destructive boundary before touching shared files.

**Coordinator-only checks:**

- [ ] Confirm F4 feature PR received Human Gate B approval, merged to `codex/autonomous-f4-f8-integration`, and passed focused/full/PostgreSQL/E2E post-merge checks.
- [ ] Confirm F4 closeout PR merged and authoritative roadmap state records `DONE`.
- [ ] Confirm inherited files exist: `e2e/database-guard.mjs`, `tests/e2e-database-guard.test.ts`, `e2e/start-server.mjs`, `playwright.config.ts`, `e2e/seed-session.mjs`, `e2e/residence.spec.ts`, `.github/workflows/ci.yml`, and `tests/ci-e2e-database-contract.test.ts`.
- [ ] Confirm marker table `_votegpt_test_database_guard`, sentinel `votegpt-destructive-e2e-v1`, required `E2E_DESTRUCTIVE_OPT_IN`, required `E2E_DATABASE_URL`, and no runtime fallback are tested.
- [ ] Record exact F5 handoff ownership: transferred F4 E2E verification remains `tests/e2e-database-guard.test.ts`, `e2e/residence.spec.ts`, and `tests/ci-e2e-database-contract.test.ts`; F5 PostgreSQL invocation is exactly `integration/postgres-auth.test.ts` plus `integration/federal-official-cache.test.ts`. `integration/saved-residence-revision-migration.test.ts`, `integration/e2e-guarded-harness.test.ts`, `F4_CONTRACT_DATABASE_URL`, and every `votegpt_f4_*` resource remain F4-only/not handed over. F5 owns `F5_CONTRACT_DATABASE_URL` -> `votegpt_f5_contract`, `POSTGRES_UPGRADE_DATABASE_URL` -> `votegpt_f5_upgrade`, and marked `E2E_DATABASE_URL` -> `votegpt_e2e`.
- [ ] Inspect command/env construction and prove seed, wrapper/app source, Playwright worker, raw inspection, and rotation all consume the validated `E2E_DATABASE_URL`; only the spawned Next child receives `DATABASE_URL=<validated E2E_DATABASE_URL>`.
- [ ] Confirm the prior critical worker-inspection finding is resolved by inherited tests: no Playwright config assignment or worker process can read ambient `DATABASE_URL` as its E2E source.
- [ ] Confirm `e2e/residence.spec.ts` retains a named bounded kill timer for its rotation child and no anonymous `20_000` process bound.
- [ ] Record the exact F4 UUID-revision migration tag/snapshot/journal entry. F5 does not edit them.
- [ ] Integrate the exact F4 closeout head into `codex/f5-review-corrections`, record the integrated commit through coordinator workflow, prove it is an ancestor of F5 HEAD, and rerun F5-R1..R3 focused suites plus inherited F4 guard/residence tests.
- [ ] Transfer shared ownership of `package.json`, dashboard files, inherited E2E files, `vitest.config.mts`, `src/db/index.test.ts`, PostgreSQL integration files, `.env.example`, and CI files to the F5 sequence.

**Stop condition:** Conflict or failing inherited evidence goes to a dedicated conflict agent. F5 does not patch around an unclosed F4 behavior change.

---

### Task F5-R4: Preload the Provider Trap into the Spawned Next Child

**Outcome:** In the spawned Next child, the R2 provider adapters are fetch-only and this preload blocks every `string`, `URL`, or `Request` fetch input for the R1-derived Congress/Clerk host subset before its captured delegate runs. Direct transport use is an R2 contract failure, not an untested bypass; the proof is deterministic, so offline/DNS failure cannot satisfy it.

**Files:**

- Create: `e2e/trap-live-providers.mjs`
- Create: `e2e/provider-trap-test-observer.mjs`
- Create: `tests/e2e-provider-trap.test.ts`
- Modify: `e2e/start-server.mjs`

**Consumes:** F4's already-validated start wrapper and E2E database descriptor, R1's `src/lib/federal-provider-host-policy.mjs` blocked-host export, and R2's verified fetch-only provider-adapter contract. This task does not edit/reimplement the guard, seed policy, Playwright config, fixture clock, adapter transport boundary, or host policy.

**Child invocation:**

```js
const trapUrl = pathToFileURL(
  resolve(workspaceRoot, "e2e/trap-live-providers.mjs"),
).href;

spawn(process.execPath, [
  "--import",
  trapUrl,
  nextCliPath,
  "start",
  "--hostname",
  "127.0.0.1",
], childOptions);
```

The absolute preload is attached to the Next child itself, not only the Playwright/wrapper process. The R4 test observer is loaded only in its standalone proof child; it never replaces or weakens this direct `--import <absolute-trap-url>` contract for the spawned Next child.

- [ ] **Step 1: Write wrapper-argument and real-subprocess RED tests**

Export a pure `buildNextChildInvocation()` from the wrapper. Assert executable equals `process.execPath`, arguments contain direct `--import` followed by the absolute file URL to the trap before Next CLI, and child env still maps only validated E2E URL to `DATABASE_URL`. Do not accept a relative preload, `NODE_OPTIONS`, wrapper-only import, or an observer import as a substitute for the actual Next-child trap.

Do not use a localhost socket observer as evidence about official-host traffic: it cannot observe a remote connection attempt. Instead, create `e2e/provider-trap-test-observer.mjs`, a test-only first preload for a separate real probe child. Pass its unique OS-temporary audit path in `F5_PROVIDER_TRAP_AUDIT_FILE` and its exact `http://127.0.0.1:<ephemeral-port>` control origin in `F5_PROVIDER_TRAP_LOOPBACK_ORIGIN`. The test invokes that child as `process.execPath --import <absolute observer URL> --import <absolute trap URL> <probe>` so the observer runs at the exact delegate boundary the trap will capture. The observer must replace pre-trap `globalThis.fetch` with a recorded, fail-closed delegate that records only `fetch-delegate` before it can call native `fetch` or an Undici dispatcher; allow only the exact loopback control origin to reach captured native fetch; and install fail-closed record-and-throw hooks for `node:http.request`, `node:https.request`, `node:net.connect`, `node:net.createConnection`, and `node:tls.connect`. Hooks record only their fixed path-kind label and throw `E2E provider transport is blocked.`; they never serialize URLs, headers, queries, or request bodies. This observer is proof instrumentation only, not a production transport trap.

Import `FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS` from R1's MJS artifact in the test and derive every provider target from it. For each derived host, probe fetch with a `string`, `URL`, and `Request` input carrying `api_key=f5-provider-trap-key`, `residence=f5-provider-trap-residence`, and `Authorization: Bearer f5-provider-trap-token`. Each must exit nonzero with exact `E2E provider access is blocked.` and leave zero `fetch-delegate`/transport audit events. A missing or late trap must instead hit the controlled delegate and leave `fetch-delegate`, so an offline/DNS failure cannot falsely pass. Separately probe each direct transport path against each derived host: it must hit its observer hook, emit only its path-kind audit label, and return the generic secret-free transport error. That negative matrix proves the test harness catches a forbidden bypass; R2's static and fresh-import runtime tests prove actual adapters never use it. Start a temporary loopback HTTP server and assert `string`, `URL`, and `Request` fetch controls all succeed through the same trap preload. Read R2 adapter, R4 trap, observer, and test sources; reject a blocked-host literal outside R1's MJS owner. Assert probe stdout, stderr, and audit omit all three sentinels and never serialize a URL, header, key, query, or residence value.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/e2e-provider-trap.test.ts
```

Expected: trap module and absolute `process.execPath --import` child invocation do not exist.

- [ ] **Step 3: Implement the minimum preload trap and child invocation**

At preload time, import `FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS` directly from R1's MJS artifact, capture current Node global `fetch`, and install one wrapper. Normalize a `string`, `URL`, or `Request` input to its hostname; if it is in the imported subset, reject with `new Error("E2E provider access is blocked.")` before calling the captured delegate. Delegate every other input unchanged, including localhost. Do not restate a hostname, instantiate a separate Undici dispatcher, or add a production `http`/`https`/`net`/`tls` trap: R2 owns and proves the fetch-only adapter boundary, while this task owns its preloaded enforcement in the actual Next child. Keep provider errors URL-, header-, query-, key-, and residence-free. Modify wrapper spawn arguments exactly as specified. Do not add browser routing or duplicate F4 database validation.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd test -- tests/e2e-provider-trap.test.ts tests/e2e-database-guard.test.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: every derived blocked host rejects all three fetch input forms only with the generic trap error and zero delegate/transport audit events; an offline/DNS failure fails the test instead. Every direct transport probe reaches its controlled generic observer error and no Internet connection. Every loopback fetch form succeeds through the same trap preload. Static/fresh-import R2 evidence rejects all direct adapter transports, the R4 ownership scan finds no second host literal, inherited guard tests remain green, and no real Internet request is required.

- [ ] **Step 5: Commit and stop**

```powershell
git add e2e/trap-live-providers.mjs e2e/provider-trap-test-observer.mjs tests/e2e-provider-trap.test.ts e2e/start-server.mjs
git commit -m "test(f5): trap live providers"
```

Stop for coordinator evidence replay and a fresh child-process/network-boundary reviewer.

---

### Task F5-R5: Derive All Federal E2E Fixtures from One Snapshot

**Outcome:** Seed data has no hardcoded Congress, term-year pair, or cache-age arithmetic; Congress credentials are blank at every E2E boundary.

**Files:**

- Create: `e2e/fixture-policy.mts`
- Create: `tests/e2e-fixture-policy.test.ts`
- Modify: `e2e/seed-session.mjs`
- Modify: `playwright.config.ts`

**Consumes:** F5-R1 `createCongressSnapshot`/cache policy, F5-R4 inherited preloaded wrapper, and F4 validated E2E descriptor.

**Produces:**

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

- [ ] **Step 1: Write single-clock and credential-boundary RED tests**

Supply one finite Date and assert Congress, term bounds, fresh/stale/expired timestamps, roster/profile times, and rollover fixtures derive from the same instant and named policy. Cover the exact refresh/stale boundary and Congress transition. Scan seeded fixture objects for literal Congress `119`, fixed `2025/2027` term values, and repeated age arithmetic. Assert seed rejects nonblank `CONGRESS_GOV_API_KEY`; Playwright passes blank key to wrapper/Next child.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/e2e-fixture-policy.test.ts
```

Expected: seed contains fixed Congress/term/cache values and has no shared fixture clock.

- [ ] **Step 3: Implement fixture clock and refactor seed values**

Capture one Date at seed entry, call `createFederalFixtureClock`, and derive every federal cache/term record from it. Keep deterministic names, Bioguide IDs, GA/CA jurisdictions, and source fixtures. Reject nonblank Congress key before database mutation; set blank key in Playwright web-server env. Do not change the guard or trap.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd test -- tests/e2e-fixture-policy.test.ts tests/e2e-provider-trap.test.ts tests/e2e-database-guard.test.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: one supplied instant determines every fixture time and the server cannot receive a live Congress credential.

- [ ] **Step 5: Commit and stop**

```powershell
git add e2e/fixture-policy.mts tests/e2e-fixture-policy.test.ts e2e/seed-session.mjs playwright.config.ts
git commit -m "test(f5): derive federal fixtures"
```

Stop for coordinator evidence replay and a fresh fixture/credential reviewer.

---

### Task F5-R6: Separate Public Evidence from Ingestion Provenance

**Outcome:** Every user link targets a stable human-readable official page; fetched endpoints remain credential-free server-only metadata.

**Files:**

- Modify: `src/lib/federal-officials.ts`
- Modify: `src/lib/federal-officials.test.ts`
- Modify: `src/lib/congress-gov.ts`
- Modify: `src/lib/congress-gov.test.ts`
- Modify: `src/lib/house-clerk-vacancy.ts`
- Modify: `src/lib/house-clerk-vacancy.test.ts`
- Modify: `src/lib/federal-officials-service.ts`
- Modify: `src/lib/federal-officials-service.test.ts`
- Modify: `src/components/federal-officials.tsx`
- Modify: `src/components/federal-officials.test.tsx`
- Modify: `src/components/federal-profile.tsx`
- Modify: `src/components/federal-profile.test.tsx`
- Modify: `src/app/officials/federal/[bioguideId]/page.test.tsx`
- Modify: `src/app/dashboard/page.test.tsx`
- Modify: `e2e/seed-session.mjs`
- Modify: `integration/federal-official-cache.test.ts`

**Produces:**

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
```

Congress `publicUrl` remains `bioguidePublicUrl(id)`. Its `ingestionUrl` is the deterministic credential-free canonical equivalent of the fetched Congress API endpoint: same policy-allowed origin/path/nonsecret query, never `api_key` or another credential. The raw authenticated request URL is fetch-only. Clerk `publicUrl` remains the validated human-readable detail URL present in the fetched list row; Clerk `ingestionUrl` remains the exact validated national list URL actually fetched. No synthetic detail ingestion URL and no fake detail fetch are allowed.

- [ ] **Step 1: Write source-matrix, fetched-URL, cache, and rendered-link RED tests**

Reject swapped hosts, HTTP, credentials (including `api_key`), fragments, unexpected queries, encoded host/path tricks, public/API mismatch, noncanonical Bioguide ID, Clerk detail public URL paired with any ingestion URL other than the fetched list, and cache payload with legacy `url`. With a supplied sentinel Congress key and captured fetch/error/logger paths, assert the raw key appears only in the fetch argument: persisted cache payload (including JSON), `SourceRef` and any reportable `SourceRef`, thrown error/cause, diagnostic/log context, rendered data/markup, and route/prop serialization contain neither the key nor an authenticated URL. Assert Congress `ingestionUrl` equals the R1 canonical credential-free endpoint; assert every rendered `href` equals `publicUrl`; `ingestionUrl` never appears in client markup/serialized props; external links use safe `rel`; accessible names identify official/office; retrieval/effective timestamps stay adjacent to the fact. Assert Clerk adapter performs one list fetch only.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx src/app/officials/federal/[bioguideId]/page.test.tsx src/app/dashboard/page.test.tsx
```

Expected: `SourceRef` has one legacy `url`, an authenticated Congress request can persist/render/serialize, and Clerk cannot distinguish public detail from fetched list provenance.

- [ ] **Step 3: Migrate source contract atomically**

Change producers, validators, cache payloads, seed fixtures, routes, and components in one commit. At the Congress fetch boundary, convert the raw request URL through R1's canonical helper before any outcome, cache payload, `SourceRef`, error/cause, log context, or serializable value is created; if it cannot be canonicalized, use only a static provider label for diagnostics and fail closed. Persist/validate only credential-free Congress `ingestionUrl` values, while retaining Congress Bioguide and Clerk public URLs exactly as specified above. Do not support dual legacy/new shapes; invalid legacy cache safely misses and refreshes/falls back by existing freshness policy. Preserve SSR, no-JS profile behavior, seat hierarchy, and neutral ordering.

- [ ] **Step 4: Run GREEN**

```powershell
npm.cmd test -- src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx src/app/officials/federal/[bioguideId]/page.test.tsx src/app/dashboard/page.test.tsx
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: only public official pages render; deterministic credential-free fetched-endpoint provenance remains validated server-side; and a supplied Congress key is absent from cache payloads, `SourceRef`, errors/logs, rendered data, and serialized data.

- [ ] **Step 5: Commit and stop**

```powershell
git add src/lib/federal-officials.ts src/lib/federal-officials.test.ts src/lib/congress-gov.ts src/lib/congress-gov.test.ts src/lib/house-clerk-vacancy.ts src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials-service.ts src/lib/federal-officials-service.test.ts src/components/federal-officials.tsx src/components/federal-officials.test.tsx src/components/federal-profile.tsx src/components/federal-profile.test.tsx 'src/app/officials/federal/[bioguideId]/page.test.tsx' src/app/dashboard/page.test.tsx e2e/seed-session.mjs integration/federal-official-cache.test.ts
git commit -m "fix(f5): publish official sources"
```

Stop for coordinator evidence replay and a fresh provenance/UI reviewer.

---

### Task F5-R7: Isolate PGlite Migration Tests

**Outcome:** Ordinary tests regain parallel execution; every real PGlite migration boot runs once in a named single-worker Node project without local timeout inflation.

**Files:**

- Modify: `vitest.config.mts`
- Create: `tests/vitest-projects.test.ts`
- Modify: `src/db/index.test.ts`

**Project assignment:**

```ts
const pgliteMigrationTests = [
  "src/db/index.test.ts",
  "src/lib/account.test.ts",
  "src/auth.test.ts",
  "src/lib/saved-residence.test.ts",
  "src/app/api/v1/residence/route.test.ts",
] as const;
```

`ordinary-jsdom` excludes exactly those files and uses default worker/file parallelism. `pglite-migrations` includes exactly them, uses `node`, `maxWorkers: 1`, and `fileParallelism: false`.

- [ ] **Step 1: Write project-assignment and timeout RED tests**

Parse exported Vitest config and assert each PGlite file appears in exactly one project, ordinary tests remain in ordinary project, only PGlite project serializes, and setup files match environment. Read `src/db/index.test.ts` and assert its migration-retry case has no third `20_000` timeout argument.

Assert inherited `e2e/residence.spec.ts` still contains its named rotation child-kill bound; this task must not remove or modify that independent process safety bound.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- tests/vitest-projects.test.ts
```

Expected: one global jsdom config serializes all tests and `src/db/index.test.ts` contains a local `20_000` timeout.

- [ ] **Step 3: Implement projects and remove only PGlite test inflation**

Use Vitest 4 inline projects. Move PGlite files to the single-worker Node project. Remove the third timeout argument from `src/db/index.test.ts:76-109`. Do not edit `e2e/residence.spec.ts` and do not raise any project timeout without a measured failure and separate approval.

- [ ] **Step 4: Run GREEN and compare test counts**

```powershell
npm.cmd test -- tests/vitest-projects.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: every pre-change test plus new tests executes once, PGlite files serialize, ordinary tests may parallelize, and E2E rotation remains bounded by its named kill policy.

- [ ] **Step 5: Commit and stop**

```powershell
git add vitest.config.mts tests/vitest-projects.test.ts src/db/index.test.ts
git commit -m "test(f5): isolate pglite suites"
```

Stop for coordinator evidence replay and a fresh test-infrastructure reviewer.

---

### Task F5-R8: Add a Falsifiable PostgreSQL Existing-Data Rehearsal

**Outcome:** A disposable database containing F1 identity/session data is actually upgraded through the checked-in current chain, with data/auth/schema/journal evidence. This task adds verification infrastructure only.

**Files:**

- Create: `integration/postgres-upgrade.test.ts`
- Create: `vitest.postgres-upgrade.config.mts`
- Modify: `package.json`

**Verification contract:**

- Local R8 provisioning is coordinator-controlled. Its only database input is `VOTEGPT_TEST_POSTGRES_BASE_URL`, which must parse as a `postgresql` URL for `localhost` or `127.0.0.1`, with no database path, query, or fragment.
- Before provisioning, `DATABASE_URL`, `F4_CONTRACT_DATABASE_URL`, `F5_CONTRACT_DATABASE_URL`, `E2E_DATABASE_URL`, and `POSTGRES_UPGRADE_DATABASE_URL` must be absent or blank. The coordinator creates exactly one `votegpt_f5_upgrade_<GUID-N>` database from the validated base, exports `POSTGRES_UPGRADE_DATABASE_URL` only after creation, and never passes runtime, contract, or E2E URLs to the verifier.
- The verifier reads only `POSTGRES_UPGRADE_DATABASE_URL`; it has no fallback to `DATABASE_URL`, either contract URL, or `E2E_DATABASE_URL`. The coordinator's `finally` removes that generated environment value and drops only its generated database identifier, including after a rehearsal failure.
- No E2E destructive opt-in, `_votegpt_test_database_guard` table, or marker row belongs in the upgrade database. The marker remains E2E-only.
- Hosted CI keeps its separate job-scoped `votegpt_f5_upgrade` resource from F5-R9. The workflow, not an ambient caller, maps that exact synthetic service URL only to the upgrade step; it remains distinct from the F5 contract and E2E resources and cannot substitute a runtime database.
- Test builds an OS-temporary migration directory containing exact F1 files `0000_overjoyed_wiccan.sql`, `0001_cleanup_auth_verifications.sql`, and a trimmed copy of `_journal.json`.
- Test applies F1, inserts representative user/account/session/verification rows, applies the unmodified full checked-in migration directory, and proves data bytes, relations, expiry, authentication, foreign keys, cascades, saved-residence revision, federal cache schema, and journal order.
- Test creates/deletes only application schemas in its dedicated disposable database and removes its OS temporary directory in `finally`.
- Test never edits migration SQL, snapshots, or journal. Any actual migration failure opens a separate bounded migration-correction task with its own RED/review; the verifier does not rewrite production schema.

- [ ] **Step 1: Record the falsifiable check without manufacturing RED**

Do not run an expected-fail command merely because the verifier file is absent. The falsifiable outcome is the completed old-data-to-current migration against a real disposable database. A pass proves the chain; a failure records exact migration/catalog/data evidence and stops this task.

- [ ] **Step 2: Add verifier/config and package commands**

Add one Node/single-worker Vitest include. Add exactly:

```json
{
  "federal-policy:generate": "node scripts/generate-federal-policy.mts",
  "federal-policy:check": "node scripts/generate-federal-policy.mts --check",
  "test:postgres-upgrade": "vitest run --config vitest.postgres-upgrade.config.mts"
}
```

Use Drizzle migrator and checked-in files; do not reproduce current schema SQL in the test. Resolve the connection only from `POSTGRES_UPGRADE_DATABASE_URL`; do not read, copy, or fall back to runtime, contract, or E2E URL inputs.

- [ ] **Step 3: Provision and run the coordinator-controlled real rehearsal**

Start from a clean URL environment. This command rejects caller-supplied upgrade/runtime/contract/E2E URLs, validates a local no-database base, generates the only upgrade URL, and checks every native command explicitly. It never creates the E2E guard marker:

```powershell
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:VOTEGPT_TEST_POSTGRES_BASE_URL)) {
  throw "VOTEGPT_TEST_POSTGRES_BASE_URL is required."
}

$forbiddenUrlInputs = @(
  "DATABASE_URL",
  "F4_CONTRACT_DATABASE_URL",
  "F5_CONTRACT_DATABASE_URL",
  "E2E_DATABASE_URL",
  "POSTGRES_UPGRADE_DATABASE_URL"
)
foreach ($name in $forbiddenUrlInputs) {
  if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name must be absent before F5-R8 provisions its own upgrade database."
  }
}

$upgradeBase = $env:VOTEGPT_TEST_POSTGRES_BASE_URL.Trim().TrimEnd("/")
try {
  $upgradeBaseUri = [System.Uri]$upgradeBase
} catch {
  throw "VOTEGPT_TEST_POSTGRES_BASE_URL must be a PostgreSQL URL."
}
if (
  $upgradeBaseUri.Scheme -ne "postgresql" -or
  $upgradeBaseUri.Host -notin @("localhost", "127.0.0.1") -or
  $upgradeBaseUri.AbsolutePath -notin @("", "/") -or
  -not [string]::IsNullOrEmpty($upgradeBaseUri.Query) -or
  -not [string]::IsNullOrEmpty($upgradeBaseUri.Fragment)
) {
  throw "VOTEGPT_TEST_POSTGRES_BASE_URL must target local PostgreSQL without a database path, query, or fragment."
}

function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

$requiredPostgresTools = @("createdb", "dropdb")
$missingPostgresTools = @(
  foreach ($tool in $requiredPostgresTools) {
    if ($null -eq (Get-Command -Name $tool -CommandType Application -ErrorAction SilentlyContinue)) {
      $tool
    }
  }
)
if ($missingPostgresTools.Count -gt 0) {
  throw "Local PostgreSQL verification is blocked: missing required client executable(s): $($missingPostgresTools -join ', '). Do not report GREEN."
}

$upgradeRun = [guid]::NewGuid().ToString("N")
$upgradeDb = "votegpt_f5_upgrade_$upgradeRun"
$upgradeAdmin = "$upgradeBase/postgres"
$upgradeUrl = "$upgradeBase/$upgradeDb"

try {
  Invoke-VoteGptNative -Label "createdb $upgradeDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$upgradeAdmin", $upgradeDb)
  $env:POSTGRES_UPGRADE_DATABASE_URL = $upgradeUrl

  Invoke-VoteGptNative -Label "PostgreSQL upgrade rehearsal" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres-upgrade")
  Invoke-VoteGptNative -Label "typecheck" -FilePath "npm.cmd" -NativeArguments @("run", "typecheck")
  Invoke-VoteGptNative -Label "lint" -FilePath "npm.cmd" -NativeArguments @("run", "lint")
  Invoke-VoteGptNative -Label "diff check" -FilePath "git" -NativeArguments @("diff", "--check")
} finally {
  Remove-Item Env:POSTGRES_UPGRADE_DATABASE_URL -ErrorAction SilentlyContinue
  Invoke-VoteGptNative -Label "dropdb $upgradeDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$upgradeAdmin", $upgradeDb)
}
```

Expected: only generated `votegpt_f5_upgrade_<GUID-N>` receives schema work; F1 rows/auth survive byte-for-byte, all current migration tags appear once/in order, F4 revision and F5 cache constraints exist, no E2E marker exists there, and `finally` drops that generated database. If a required PostgreSQL client is unavailable, the preflight blocks local verification before `createdb`; do not report GREEN. If a checked command fails, stop and report the actual failing migration/invariant; do not call the rehearsal complete.

- [ ] **Step 4: Commit verification infrastructure and stop**

```powershell
git add integration/postgres-upgrade.test.ts vitest.postgres-upgrade.config.mts package.json
git commit -m "test(f5): rehearse postgres upgrade"
```

Stop for coordinator evidence replay and a fresh migration/database reviewer.

---

### Task F5-R9: Replace the Contract Resource and Add the F5 Upgrade Database

**Outcome:** Hosted/local CI-equivalent verification uses a distinct F5 contract database, F5 upgrade database, and marked E2E database; marker exists only in E2E; execution order is explicit.

**Ownership:** Coordinator dispatches this task to a fresh CI implementer. Feature implementers do not edit CI.

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `tests/ci-upgrade-database-contract.test.ts`
- Modify: `tests/ci-e2e-database-contract.test.ts`

**Consumes:** Transferred F4 E2E guard/wrapper/seed/Playwright/CI-test surfaces plus the F5-R8 upgrade command. F5 keeps the marked E2E structure and owns its F5 contract, upgrade, and E2E resources; it neither receives an F4 contract resource nor selects `integration/saved-residence-revision-migration.test.ts` or `integration/e2e-guarded-harness.test.ts`.

**CI contract:**

- `F5_CONTRACT_DATABASE_URL` -> `votegpt_f5_contract`.
- `POSTGRES_UPGRADE_DATABASE_URL` -> `votegpt_f5_upgrade`.
- `E2E_DATABASE_URL` -> `votegpt_e2e`.
- Exact `E2E_DESTRUCTIVE_OPT_IN=votegpt-destructive-e2e-v1`.
- `_votegpt_test_database_guard` and sentinel row exist only in E2E; seeder never creates them.
- Order: upgrade rehearsal -> contract migration/PostgreSQL tests -> non-E2E policy/test/type/lint/build -> Playwright install -> guarded E2E.
- Each step receives only required URLs. Contract commands map `DATABASE_URL` from `F5_CONTRACT_DATABASE_URL`; only spawned Next child maps `DATABASE_URL` from validated E2E URL.
- F5 contract PostgreSQL selection is exactly `npm.cmd run test:postgres -- integration/postgres-auth.test.ts integration/federal-official-cache.test.ts`; it has no F4 URL/resource variable/name or F4-only integration test selection.
- After all database-consuming migrations/tests and before teardown, a fatal `psql` ownership proof checks that F5 contract and upgrade databases have neither the guard table nor the named sentinel, while E2E has exactly one row named `votegpt-destructive-e2e-v1` in that table. The checked command labels and SQL must name only the resource, never a URL or credential.

- [ ] **Step 1: Write workflow-structure RED tests**

In `tests/ci-e2e-database-contract.test.ts`, parse YAML and require exact F5 contract/E2E names and URL variables, three-way URL inequality, E2E-only marker, exact opt-in, no E2E fallback, inherited Node/npm/Chromium constraints, no predecessor contract-resource identifier, and a credential-redacted post-E2E/pre-teardown guard-ownership step that receives all three database URLs. In `tests/ci-upgrade-database-contract.test.ts`, require the exact F5 upgrade name/URL, one PostgreSQL service, policy drift check, upgrade -> F5-only contract test selection -> non-E2E -> guarded E2E -> guard-ownership ordering, checked `psql` assertions for absent contract/upgrade guard state plus exactly one named E2E sentinel row, and rejection of every CI variable beginning `F4_`, every resource/database name beginning `votegpt_f4_`, and F4-only test selection (`integration/saved-residence-revision-migration.test.ts`, `integration/e2e-guarded-harness.test.ts`).

- [ ] **Step 2: Run RED**

```powershell
function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

Invoke-VoteGptNative -Label "F5-R9 workflow RED" -FilePath "npm.cmd" -NativeArguments @("test", "--", "tests/ci-upgrade-database-contract.test.ts", "tests/ci-e2e-database-contract.test.ts")
```

Expected: inherited workflow still exposes the predecessor contract resource and lacks the F5 contract replacement, F5 upgrade database, ordered rehearsal, and post-test guard-ownership proof.

- [ ] **Step 3: Replace the contract resource and add the ordered upgrade step**

In `.github/workflows/ci.yml`, replace the predecessor contract database declaration/URL with the exact F5 values above, add the F5 upgrade database and rehearsal, and preserve the inherited E2E guard/marker commands. Create all three databases through the PostgreSQL service admin database. Create marker table/row only after E2E database creation. Its contract PostgreSQL step is exactly `npm run test:postgres -- integration/postgres-auth.test.ts integration/federal-official-cache.test.ts`; never select F4-only integration tests or declare/use an F4 URL/resource name. Keep credentials synthetic/job-scoped. Do not create another PostgreSQL service.

Immediately after guarded E2E and before job teardown, add a `Verify guard ownership` step that receives only the three job-scoped database URLs. Use `set -euo pipefail`, disable command tracing, and run each `psql` with `-X -q -v ON_ERROR_STOP=1`; do not echo a URL or credential. The step must fail the job on either assertion failure:

```bash
set -euo pipefail
set +x

assert_guard_absent() {
  psql "$1" -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public._votegpt_test_database_guard WHERE marker = $1'
      INTO named_sentinel_count
      USING 'votegpt-destructive-e2e-v1';
  END IF;
  IF guard_table IS NOT NULL OR named_sentinel_count <> 0 THEN
    RAISE EXCEPTION 'guard table or named sentinel must be absent';
  END IF;
END
$$;
SQL
}

assert_exact_e2e_guard() {
  psql "$1" -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  total_row_count bigint := 0;
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NULL THEN
    RAISE EXCEPTION 'E2E guard table is missing';
  END IF;
  EXECUTE 'SELECT count(*), count(*) FILTER (WHERE marker = $1) FROM public._votegpt_test_database_guard'
    INTO total_row_count, named_sentinel_count
    USING 'votegpt-destructive-e2e-v1';
  IF total_row_count <> 1 OR named_sentinel_count <> 1 THEN
    RAISE EXCEPTION 'E2E guard must contain exactly one named sentinel row';
  END IF;
END
$$;
SQL
}

assert_guard_absent "$F5_CONTRACT_DATABASE_URL"
assert_guard_absent "$POSTGRES_UPGRADE_DATABASE_URL"
assert_exact_e2e_guard "$E2E_DATABASE_URL"
```

- [ ] **Step 4: Run GREEN and an exact local CI-equivalent sequence**

Use controlled GUID names and explicit local PostgreSQL base. Before any `createdb`, require the `createdb`, `dropdb`, and `psql` application commands; a missing client blocks local verification and is never GREEN. The `finally` block removes env and drops only those three generated databases:

```powershell
$ErrorActionPreference = "Stop"

function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

if ([string]::IsNullOrWhiteSpace($env:VOTEGPT_TEST_POSTGRES_BASE_URL)) { throw "VOTEGPT_TEST_POSTGRES_BASE_URL is required." }
$ciRun = [guid]::NewGuid().ToString("N")
$ciBase = $env:VOTEGPT_TEST_POSTGRES_BASE_URL.TrimEnd("/")
if ($ciBase -notmatch '^postgresql://[^/]+@(?:127\.0\.0\.1|localhost):[0-9]+$') { throw "VOTEGPT_TEST_POSTGRES_BASE_URL must target local PostgreSQL without a database path." }
$ciAdmin = "$ciBase/postgres"
$requiredPostgresTools = @("createdb", "dropdb", "psql")
$missingPostgresTools = @(
  foreach ($tool in $requiredPostgresTools) {
    if ($null -eq (Get-Command -Name $tool -CommandType Application -ErrorAction SilentlyContinue)) {
      $tool
    }
  }
)
if ($missingPostgresTools.Count -gt 0) {
  throw "Local PostgreSQL verification is blocked: missing required client executable(s): $($missingPostgresTools -join ', '). Do not report GREEN."
}
$contractDb = "votegpt_f5_contract_$ciRun"
$upgradeDb = "votegpt_f5_upgrade_$ciRun"
$e2eDb = "votegpt_e2e_$ciRun"
$env:F5_CONTRACT_DATABASE_URL = "$ciBase/$contractDb"
$env:POSTGRES_UPGRADE_DATABASE_URL = "$ciBase/$upgradeDb"
$env:E2E_DATABASE_URL = "$ciBase/$e2eDb"
$env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
$assertGuardAbsentSql = @'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public._votegpt_test_database_guard WHERE marker = $1'
      INTO named_sentinel_count
      USING 'votegpt-destructive-e2e-v1';
  END IF;
  IF guard_table IS NOT NULL OR named_sentinel_count <> 0 THEN
    RAISE EXCEPTION 'guard table or named sentinel must be absent';
  END IF;
END
$$;
'@
$assertExactE2eGuardSql = @'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  total_row_count bigint := 0;
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NULL THEN
    RAISE EXCEPTION 'E2E guard table is missing';
  END IF;
  EXECUTE 'SELECT count(*), count(*) FILTER (WHERE marker = $1) FROM public._votegpt_test_database_guard'
    INTO total_row_count, named_sentinel_count
    USING 'votegpt-destructive-e2e-v1';
  IF total_row_count <> 1 OR named_sentinel_count <> 1 THEN
    RAISE EXCEPTION 'E2E guard must contain exactly one named sentinel row';
  END IF;
END
$$;
'@
function Assert-GuardOwnership {
  param(
    [Parameter(Mandatory)] [string] $ContractUrl,
    [Parameter(Mandatory)] [string] $UpgradeUrl,
    [Parameter(Mandatory)] [string] $E2eUrl
  )

  Invoke-VoteGptNative -Label "assert no E2E guard in F5 contract database" -FilePath "psql" -NativeArguments @($ContractUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertGuardAbsentSql)
  Invoke-VoteGptNative -Label "assert no E2E guard in F5 upgrade database" -FilePath "psql" -NativeArguments @($UpgradeUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertGuardAbsentSql)
  Invoke-VoteGptNative -Label "assert exact E2E guard sentinel" -FilePath "psql" -NativeArguments @($E2eUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertExactE2eGuardSql)
}

try {
  Invoke-VoteGptNative -Label "createdb $contractDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$ciAdmin", $contractDb)
  Invoke-VoteGptNative -Label "createdb $upgradeDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$ciAdmin", $upgradeDb)
  Invoke-VoteGptNative -Label "createdb $e2eDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$ciAdmin", $e2eDb)
  Invoke-VoteGptNative -Label "create E2E marker table" -FilePath "psql" -NativeArguments @($env:E2E_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", 'CREATE TABLE public._votegpt_test_database_guard (marker text PRIMARY KEY);')
  Invoke-VoteGptNative -Label "insert E2E marker" -FilePath "psql" -NativeArguments @($env:E2E_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", "INSERT INTO public._votegpt_test_database_guard(marker) VALUES ('votegpt-destructive-e2e-v1');")

  Invoke-VoteGptNative -Label "PostgreSQL upgrade rehearsal" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres-upgrade")

  $env:DATABASE_URL = $env:F5_CONTRACT_DATABASE_URL
  Invoke-VoteGptNative -Label "contract database check" -FilePath "npm.cmd" -NativeArguments @("run", "db:check")
  Invoke-VoteGptNative -Label "contract migration" -FilePath "npm.cmd" -NativeArguments @("run", "db:migrate")
  Invoke-VoteGptNative -Label "F5 contract PostgreSQL tests" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres", "--", "integration/postgres-auth.test.ts", "integration/federal-official-cache.test.ts")
  Remove-Item Env:DATABASE_URL

  Invoke-VoteGptNative -Label "federal policy check" -FilePath "npm.cmd" -NativeArguments @("run", "federal-policy:check")
  Invoke-VoteGptNative -Label "unit tests" -FilePath "npm.cmd" -NativeArguments @("test")
  Invoke-VoteGptNative -Label "typecheck" -FilePath "npm.cmd" -NativeArguments @("run", "typecheck")
  Invoke-VoteGptNative -Label "lint" -FilePath "npm.cmd" -NativeArguments @("run", "lint")
  Invoke-VoteGptNative -Label "build" -FilePath "npm.cmd" -NativeArguments @("run", "build")
  Invoke-VoteGptNative -Label "Playwright Chromium install" -FilePath "npx.cmd" -NativeArguments @("playwright", "install", "chromium")
  Invoke-VoteGptNative -Label "guarded E2E" -FilePath "npm.cmd" -NativeArguments @("run", "test:e2e")
  Assert-GuardOwnership -ContractUrl $env:F5_CONTRACT_DATABASE_URL -UpgradeUrl $env:POSTGRES_UPGRADE_DATABASE_URL -E2eUrl $env:E2E_DATABASE_URL
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:F5_CONTRACT_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:POSTGRES_UPGRADE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:E2E_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:E2E_DESTRUCTIVE_OPT_IN -ErrorAction SilentlyContinue
  Invoke-VoteGptNative -Label "dropdb $e2eDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$ciAdmin", $e2eDb)
  Invoke-VoteGptNative -Label "dropdb $upgradeDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$ciAdmin", $upgradeDb)
  Invoke-VoteGptNative -Label "dropdb $contractDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$ciAdmin", $contractDb)
}
```

Then run:

```powershell
function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

Invoke-VoteGptNative -Label "F5-R9 workflow GREEN" -FilePath "npm.cmd" -NativeArguments @("test", "--", "tests/ci-upgrade-database-contract.test.ts", "tests/ci-e2e-database-contract.test.ts")
Invoke-VoteGptNative -Label "diff check" -FilePath "git" -NativeArguments @("diff", "--check")
```

Expected: generated `votegpt_f5_contract_*`, `votegpt_f5_upgrade_*`, and `votegpt_e2e_*` databases are distinct; F5 contract runs only `integration/postgres-auth.test.ts` and `integration/federal-official-cache.test.ts`, with no F4 URL/resource or F4-only test selection; every command passes in hosted order; fatal post-test `psql` checks prove the guard table/named sentinel are absent from contract and upgrade while E2E contains exactly one named sentinel row; all three databases are removed. Missing required PostgreSQL clients block local verification before database creation; they cannot produce a GREEN result.

- [ ] **Step 5: Commit and stop**

```powershell
git add .github/workflows/ci.yml tests/ci-upgrade-database-contract.test.ts tests/ci-e2e-database-contract.test.ts
git commit -m "ci: isolate upgrade database"
```

Stop for coordinator evidence replay and a fresh no-context CI/destructive-safety reviewer.

---

### Task F5-R10: Prove Truthful Same-Page Residence-to-Officials Transitions

**Outcome:** One authenticated dashboard moves `no home -> GA-13 -> CA-01 -> no home` through F4 mutations and server rerender, without manual reload, provider network, stale cards, or overstated evidence.

**Files:**

- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/page.test.tsx`
- Modify: `src/components/federal-officials.tsx`
- Modify: `src/components/federal-officials.test.tsx`
- Modify: `e2e/seed-session.mjs`
- Modify: `e2e/federal-officials.spec.ts`

**Truthful state copy:**

- No saved residence: save one before officials can be determined.
- Complete Congress+Clerk agreement: may state verified current officeholder.
- Congress member plus unavailable Clerk: state Congress.gov lists member and vacancy evidence was unavailable at last check.
- Census fallback/incomplete runtime: label local district validity and runtime confirmation limit.
- Conflict: sources disagree; show no serving/vacant assertion.
- Stale: show last checked and public official links.
- Expired/unavailable: show no cached officeholder and one safe next action.
- No AI claim, recommendation, party prominence, or unequal House/Senate treatment.

- [ ] **Step 1: Write component and one-page Playwright RED tests**

Seed one authenticated user with no home plus GA/CA federal cache rows derived by F5-R5 and migrated by F5-R6. Intercept only F3 residence-resolution endpoint with signed GA-13/CA-01 previews. On the same page: assert no-home/zero cards; save GA-13 and wait for F4 authoritative success/`router.refresh()`; assert GA House plus two senators/public links; replace with CA-01; assert every GA name/source disappears and CA roster/stale label appears; delete; assert all cards disappear and no-home returns.

Record navigation/reload events and assert no manual reload. Assert exact addresses/tokens/revisions never enter URL, storage, log-visible DOM, or federal requests. Assert every network hostname is localhost; server-side official-host calls are independently trapped by F5-R4. Add component cases for complete agreement, Clerk unavailable, Census fallback, conflict, stale, expired, unavailable, keyboard order, accessible source names, equal card hierarchy, 375px/1280px, reduced motion, and no-JS public profile.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd test -- src/app/dashboard/page.test.tsx src/components/federal-officials.test.tsx
npm.cmd run test:e2e -- e2e/federal-officials.spec.ts
```

Expected: shared journey/fixture lifecycle or evidence copy does not yet meet every transition and old cards/sources may survive.

- [ ] **Step 3: Implement minimum server-rendered UI/fixture changes**

Reuse F4 ETag/reconciliation/`router.refresh()` flow. Do not add client federal fetch/event bus. Keep dashboard server-rendered. Render evidence decision/completeness/conflict/freshness with public sources and equal seat treatment. Seed one no-home identity and derived GA/CA cache records.

- [ ] **Step 4: Run GREEN and focused accessibility/privacy checks**

```powershell
npm.cmd test -- src/app/dashboard/page.test.tsx src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx
npm.cmd run test:e2e -- e2e/federal-officials.spec.ts e2e/residence.spec.ts
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: all four states appear on one page without manual reload/provider traffic, precise location stays inside residence boundary, and UI evidence remains truthful/equal.

- [ ] **Step 5: Commit and stop**

```powershell
git add src/app/dashboard/page.tsx src/app/dashboard/page.test.tsx src/components/federal-officials.tsx src/components/federal-officials.test.tsx e2e/seed-session.mjs e2e/federal-officials.spec.ts
git commit -m "fix(f5): refresh district officials"
```

Stop for coordinator evidence replay and a fresh UI/accessibility/privacy reviewer.

---

### Task F5-R11: Integrate, Verify, Review, and Present Human Gate B

**Outcome:** Exact reviewed head contains current integration branch, passes isolated full verification/hosted CI, has no unresolved Critical/Important finding, and is presented without merging.

**Allowed changes:** No production, test, plan, roadmap, README, migration, or CI file. Coordinator alone integrates branch, provisions disposable resources, pushes exact head, opens/updates PR, and records external evidence through the authoritative workflow.

- [ ] **Step 1: Integrate current authoritative head**

Fetch `codex/autonomous-f4-f8-integration`, integrate it into F5, and prove:

```powershell
function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

Invoke-VoteGptNative -Label "F4 integration ancestor check" -FilePath "git" -NativeArguments @("merge-base", "--is-ancestor", "origin/codex/autonomous-f4-f8-integration", "HEAD")
Invoke-VoteGptNative -Label "diff check" -FilePath "git" -NativeArguments @("diff", "--check")
$worktreeStatus = Invoke-VoteGptNative -Label "worktree status" -FilePath "git" -NativeArguments @("status", "--short")
if ($worktreeStatus) { throw "Feature worktree must be clean." }
```

Expected: ancestor check exits `0`; no conflict/uncommitted file. Conflict goes to a dedicated conflict task and renewed focused/full review.

- [ ] **Step 2: Run deterministic named-policy/dedup audit now that all owners landed**

```powershell
function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

Invoke-VoteGptNative -Label "named policy literal audit" -FilePath "npm.cmd" -NativeArguments @("test", "--", "tests/federal-policy-literal-audit.test.ts")
```

Expected: the real deterministic audit derives forbidden tokens from the named F5-R1 exports, including epoch first-number/start-year/start-instant values, checks its fixed sorted production inventory, and passes only the explicit provider-metadata/generated-source/boundary-test allowlist. It specifically proves no adapter/service local host, URL/query, timeout, response/body/count, name/Bioguide/field, Congress epoch/calendar/cache, or `250` literal remains; `CONGRESS_STATE_MEMBER_LIST_LIMIT` is the sole owner and `congressStateMemberListUrl()` supplies `limit=250`. Any failure identifies path/token and returns to its owning task through a fresh bounded correction agent; R11 does not edit it.

- [ ] **Step 3: Run complete isolated verification**

```powershell
$ErrorActionPreference = "Stop"

function Invoke-VoteGptNative {
  param(
    [Parameter(Mandatory)] [string] $Label,
    [Parameter(Mandatory)] [string] $FilePath,
    [Parameter(Mandatory)] [string[]] $NativeArguments
  )

  & $FilePath @NativeArguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

if ([string]::IsNullOrWhiteSpace($env:VOTEGPT_TEST_POSTGRES_BASE_URL)) { throw "VOTEGPT_TEST_POSTGRES_BASE_URL is required." }
$verifyRun = [guid]::NewGuid().ToString("N")
$verifyBase = $env:VOTEGPT_TEST_POSTGRES_BASE_URL.TrimEnd("/")
if ($verifyBase -notmatch '^postgresql://[^/]+@(?:127\.0\.0\.1|localhost):[0-9]+$') { throw "VOTEGPT_TEST_POSTGRES_BASE_URL must target local PostgreSQL without a database path." }
$verifyAdmin = "$verifyBase/postgres"
$requiredPostgresTools = @("createdb", "dropdb", "psql")
$missingPostgresTools = @(
  foreach ($tool in $requiredPostgresTools) {
    if ($null -eq (Get-Command -Name $tool -CommandType Application -ErrorAction SilentlyContinue)) {
      $tool
    }
  }
)
if ($missingPostgresTools.Count -gt 0) {
  throw "Local PostgreSQL verification is blocked: missing required client executable(s): $($missingPostgresTools -join ', '). Do not report GREEN."
}
$verifyContractDb = "votegpt_f5_contract_$verifyRun"
$verifyUpgradeDb = "votegpt_f5_upgrade_$verifyRun"
$verifyE2eDb = "votegpt_e2e_$verifyRun"
$env:F5_CONTRACT_DATABASE_URL = "$verifyBase/$verifyContractDb"
$env:POSTGRES_UPGRADE_DATABASE_URL = "$verifyBase/$verifyUpgradeDb"
$env:E2E_DATABASE_URL = "$verifyBase/$verifyE2eDb"
$env:E2E_DESTRUCTIVE_OPT_IN = "votegpt-destructive-e2e-v1"
$assertGuardAbsentSql = @'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public._votegpt_test_database_guard WHERE marker = $1'
      INTO named_sentinel_count
      USING 'votegpt-destructive-e2e-v1';
  END IF;
  IF guard_table IS NOT NULL OR named_sentinel_count <> 0 THEN
    RAISE EXCEPTION 'guard table or named sentinel must be absent';
  END IF;
END
$$;
'@
$assertExactE2eGuardSql = @'
DO $$
DECLARE
  guard_table regclass := to_regclass('public._votegpt_test_database_guard');
  total_row_count bigint := 0;
  named_sentinel_count bigint := 0;
BEGIN
  IF guard_table IS NULL THEN
    RAISE EXCEPTION 'E2E guard table is missing';
  END IF;
  EXECUTE 'SELECT count(*), count(*) FILTER (WHERE marker = $1) FROM public._votegpt_test_database_guard'
    INTO total_row_count, named_sentinel_count
    USING 'votegpt-destructive-e2e-v1';
  IF total_row_count <> 1 OR named_sentinel_count <> 1 THEN
    RAISE EXCEPTION 'E2E guard must contain exactly one named sentinel row';
  END IF;
END
$$;
'@
function Assert-GuardOwnership {
  param(
    [Parameter(Mandatory)] [string] $ContractUrl,
    [Parameter(Mandatory)] [string] $UpgradeUrl,
    [Parameter(Mandatory)] [string] $E2eUrl
  )

  Invoke-VoteGptNative -Label "assert no E2E guard in F5 contract database" -FilePath "psql" -NativeArguments @($ContractUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertGuardAbsentSql)
  Invoke-VoteGptNative -Label "assert no E2E guard in F5 upgrade database" -FilePath "psql" -NativeArguments @($UpgradeUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertGuardAbsentSql)
  Invoke-VoteGptNative -Label "assert exact E2E guard sentinel" -FilePath "psql" -NativeArguments @($E2eUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $assertExactE2eGuardSql)
}

try {
  Invoke-VoteGptNative -Label "createdb $verifyContractDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$verifyAdmin", $verifyContractDb)
  Invoke-VoteGptNative -Label "createdb $verifyUpgradeDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$verifyAdmin", $verifyUpgradeDb)
  Invoke-VoteGptNative -Label "createdb $verifyE2eDb" -FilePath "createdb" -NativeArguments @("--maintenance-db=$verifyAdmin", $verifyE2eDb)
  Invoke-VoteGptNative -Label "create E2E marker table" -FilePath "psql" -NativeArguments @($env:E2E_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", 'CREATE TABLE public._votegpt_test_database_guard (marker text PRIMARY KEY);')
  Invoke-VoteGptNative -Label "insert E2E marker" -FilePath "psql" -NativeArguments @($env:E2E_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", "INSERT INTO public._votegpt_test_database_guard(marker) VALUES ('votegpt-destructive-e2e-v1');")

  Invoke-VoteGptNative -Label "PostgreSQL upgrade rehearsal" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres-upgrade")
  $env:DATABASE_URL = $env:F5_CONTRACT_DATABASE_URL
  Invoke-VoteGptNative -Label "contract database check" -FilePath "npm.cmd" -NativeArguments @("run", "db:check")
  Invoke-VoteGptNative -Label "contract migration" -FilePath "npm.cmd" -NativeArguments @("run", "db:migrate")
  Invoke-VoteGptNative -Label "F5 contract PostgreSQL tests" -FilePath "npm.cmd" -NativeArguments @("run", "test:postgres", "--", "integration/postgres-auth.test.ts", "integration/federal-official-cache.test.ts")
  Remove-Item Env:DATABASE_URL
  Invoke-VoteGptNative -Label "federal policy check" -FilePath "npm.cmd" -NativeArguments @("run", "federal-policy:check")
  Invoke-VoteGptNative -Label "unit tests" -FilePath "npm.cmd" -NativeArguments @("test")
  Invoke-VoteGptNative -Label "typecheck" -FilePath "npm.cmd" -NativeArguments @("run", "typecheck")
  Invoke-VoteGptNative -Label "lint" -FilePath "npm.cmd" -NativeArguments @("run", "lint")
  Invoke-VoteGptNative -Label "build" -FilePath "npm.cmd" -NativeArguments @("run", "build")
  Invoke-VoteGptNative -Label "guarded E2E" -FilePath "npm.cmd" -NativeArguments @("run", "test:e2e")
  Assert-GuardOwnership -ContractUrl $env:F5_CONTRACT_DATABASE_URL -UpgradeUrl $env:POSTGRES_UPGRADE_DATABASE_URL -E2eUrl $env:E2E_DATABASE_URL
  Invoke-VoteGptNative -Label "diff check" -FilePath "git" -NativeArguments @("diff", "--check")

  $busyPorts = Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue
  if ($busyPorts) { throw "Ports 3000/3001 must be clear after E2E." }
  $worktreeStatus = Invoke-VoteGptNative -Label "worktree status" -FilePath "git" -NativeArguments @("status", "--short")
  if ($worktreeStatus) { throw "Feature worktree must be clean." }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:F5_CONTRACT_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:POSTGRES_UPGRADE_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:E2E_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:E2E_DESTRUCTIVE_OPT_IN -ErrorAction SilentlyContinue
  Invoke-VoteGptNative -Label "dropdb $verifyE2eDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$verifyAdmin", $verifyE2eDb)
  Invoke-VoteGptNative -Label "dropdb $verifyUpgradeDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$verifyAdmin", $verifyUpgradeDb)
  Invoke-VoteGptNative -Label "dropdb $verifyContractDb" -FilePath "dropdb" -NativeArguments @("--if-exists", "--force", "--maintenance-db=$verifyAdmin", $verifyContractDb)
}
```

Expected: all commands exit `0`; `votegpt_f5_contract_*`, `votegpt_f5_upgrade_*`, and marked `votegpt_e2e_*` are distinct; F5 contract runs only `integration/postgres-auth.test.ts` and `integration/federal-official-cache.test.ts`, with no F4 URL/resource or F4-only test selection; fatal post-test `psql` checks prove guard table/named sentinel absence in contract and upgrade plus exactly one named E2E sentinel row; teardown drops only those generated databases; ports 3000/3001 are clear; no skipped/quarantined test; generated output matches; worktree clean. If required PostgreSQL clients are absent, preflight blocks local verification before any database is created; do not report GREEN.

- [ ] **Step 4: Dispatch whole-feature adversarial review**

Dispatch at least two fresh no-context read-only reviewers: one for district/provider/cache/database/security correctness; one for UI/provenance/privacy/test realism. Give exact base/head and design/plan paths. Resolve each Critical/Important finding through a new bounded tests-first task with a fresh implementer and different reviewer, then repeat Steps 1-4. R11 itself remains no-edit.

- [ ] **Step 5: Publish exact reviewed head and wait for hosted evidence**

Push `codex/f5-review-corrections`, open feature PR targeting `codex/autonomous-f4-f8-integration`, wait for every hosted check, verify PR head equals reviewed local head, and confirm GitHub `MERGEABLE/CLEAN`.

- [ ] **Step 6: Present Human Gate B and stop**

Present delivered behavior, final design/deviations, Census source hashes, focused/full/upgrade/contract/E2E/hosted-CI evidence, UI/UX-DNA mapping, adversarial-review disposition, and residual risks/non-goals.

**Stop condition:** Wait for explicit Human Gate B approval. Do not merge, close out, activate F6, or change roadmap status.
