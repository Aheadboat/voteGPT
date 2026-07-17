# F5 Federal Officials Implementation Plan

> **For agentic workers:** execute task-by-task with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every implementation task uses `superpowers:test-driven-development`; every completion claim uses `superpowers:verification-before-completion`. The coordinator owns roadmap state, shared-surface handoff, reviews, PRs, merges, and delegated gates.

**Goal:** Show the current U.S. House member and two U.S. senators for a supported saved residence, plus public current-official profiles, with explicit provenance, freshness, vacancy, conflict, partial, stale, unsupported, and unavailable states.

**Architecture:** Server-only deterministic flow: `saved normalized divisions -> strict federal jurisdiction parser -> read-through public cache -> Congress.gov current-member/detail requests plus one narrow House Clerk current-vacancies request -> fail-closed reconciliation -> normalized domain -> server-rendered dashboard/profile views`. F5 never receives or decrypts exact residence data. It uses no AI, client-side provider call, generic provider registry, or background worker.

**Tech stack:** Next.js 16 Server Components, React 19, TypeScript, Drizzle, PostgreSQL/PGlite, native `fetch`, Vitest, Playwright.

## Gate, concurrency, and scope constraints

- The user's 2026-07-16 standing authorization and clean independent plan review satisfy delegated Gate A; F5-T1 may enter RED after this branch records the transition.
- While F4 remains active, only F5-T1 through F5-T3 may execute, and only in F5-exclusive new files.
- F5-T4 through F5-T8 remain prohibited until F4 is `DONE` on `main`, this branch integrates current `main`, and the coordinator records the shared schema/dashboard/config/test handoff.
- T1 freezes F5-local domain and provider interfaces. T2 and T3 may then run concurrently in disjoint F5-owned files.
- Address, coordinates, user ID, session data, and precise location never enter provider requests, source fixtures, logs, or cache keys.
- Congress.gov API keys stay server-side in `X-Api-Key`; no credential appears in URLs, browser code, fixtures, or errors.
- No current official, vacancy, or coverage fact is inferred from an empty/malformed response.
- F5 supports the 50 states only. DC and territories receive an explicit unsupported state with zero cache/provider work.
- No state/local officials, elections, candidates, comparison, recommendations, AI, party presentation, historical completeness, photos/contact data, background refresh, or F6 navigation.
- If an isolated task needs any deferred/shared file, stop and return to the coordinator.

## Delegated Gate A decisions

Approval accepts all of these together:

1. Congress.gov is the primary current-member/profile source; every refresh dynamically discovers the current Congress.
2. The Clerk's `Members/ViewVacancies` current-vacancies list is the sole House vacancy-status supplement. District vacancy pages are evidence links only.
3. Missing/duplicate/malformed/disagreeing evidence yields partial, conflict, unknown, unsupported, or unavailable—not inferred vacancy.
4. Cache age `<24h` is fresh, `24h <= age <72h` may fall back stale after one failed refresh, and `age >=72h` must refresh or fail closed.
5. Public profiles are derived only from a verified current roster cache and never trigger arbitrary live or historical lookup.
6. F4's frozen `getSavedResidenceDivisions(userId)` output is consumed without address decryption or F4 changes.
7. The launch scope is the 50 states; DC, AS, GU, MP, PR, and VI render explicit unsupported coverage.
8. Delegated Gate A authorizes only T1-T3 while F4 is active; T4-T8 remain deferred behind the recorded handoff.

## Domain and consumer interfaces

```ts
export type FederalDivisionInput = Readonly<
  Extract<
    ResolutionResponse,
    { status: "matched" | "partial" }
  >["divisions"][number]
>;

export type FederalJurisdiction = Readonly<{
  stateCode: string;
  district: number; // 0 is at-large
  divisionIds: readonly string[];
}>;

export type FederalJurisdictionResult =
  | Readonly<{ status: "supported"; jurisdiction: FederalJurisdiction }>
  | Readonly<{
      status: "unsupported";
      code: "DC" | "AS" | "GU" | "MP" | "PR" | "VI";
    }>
  | Readonly<{ status: "invalid" }>;

export function federalJurisdictionFromDivisions(
  divisions: readonly FederalDivisionInput[],
): FederalJurisdictionResult;
```

The parser never infers from `name`. It accepts exactly one state and one congressional-district division from the same scheme and jurisdiction, with no duplicates:

- OCD: exact lowercase `^ocd-division/country:us/state:([a-z]{2})$` plus the same prefix ending `/cd:(0|[1-9][0-9]?)`; output state is uppercase.
- Census: exact two-digit state FIPS plus four-digit congressional GEOID whose first two digits match and whose district suffix is `00` through `99`.
- One checked-in fixed map contains every 50-state USPS/FIPS pair plus DC, AS, GU, MP, PR, and VI solely for explicit unsupported classification. Any other OCD code or FIPS is invalid.

Unknown scheme/code, malformed or noncanonical ID, conflicting/mixed state, duplicate, missing district, or disagreement returns `invalid`. A mapped DC/territory returns `unsupported`. Both results cause zero provider/cache calls. District `0` is preserved and rendered “At-large.” T1 fixtures cover every supported/unsupported map entry plus unknown-code failures for both schemes.

Minimal public domain:

```ts
export type SourceRef = Readonly<{
  publisher: "Congress.gov" | "Office of the Clerk, U.S. House of Representatives";
  sourceType: "member" | "vacancy";
  url: string;
  retrievedAt: string;
  recordUpdatedAt: string | null;
  effectiveAt: string | null;
}>;

export type Freshness = Readonly<{
  checkedAt: string;
  refreshAfter: string;
  staleAfter: string;
  state: "fresh" | "stale" | "expired";
}>;

export type Person = Readonly<{
  id: `bioguide:${string}`;
  bioguideId: string;
  name: string;
}>;

export type Office = Readonly<{
  id: string;
  chamber: "house" | "senate";
  stateCode: string;
  district: number | null;
  title: "U.S. Representative" | "U.S. Senator";
}>;

export type Term = Readonly<{
  officeId: string;
  personId: string | null;
  congress: number;
  startYear: number | null;
  endYear: number | null;
  status: "serving" | "vacant";
}>;

export type FederalSeat =
  | Readonly<{ status: "serving"; office: Office; person: Person; term: Term; sources: readonly SourceRef[] }>
  | Readonly<{ status: "vacant"; office: Office; term: Term; sources: readonly SourceRef[] }>
  | Readonly<{ status: "unknown"; office: Office; sources: readonly SourceRef[] }>
  | Readonly<{ status: "conflict"; office: Office; person: Person; term: Term; sources: readonly SourceRef[] }>;

export type FederalOfficialsRoster = Readonly<{
  jurisdiction: FederalJurisdiction;
  house: FederalSeat;
  senate: readonly FederalSeat[];
  coverage: {
    house: "verified" | "vacant" | "partial" | "unknown";
    senate: "verified" | "partial" | "unknown";
  };
}>;

export type FederalOfficialsView = FederalOfficialsRoster & Readonly<{
  freshness: Freshness;
}>;

export type ProviderFailure =
  | "timeout"
  | "quota"
  | "auth"
  | "not_found"
  | "provider_error"
  | "malformed";

export type CongressRosterOutcome =
  | Readonly<{
      status: "available";
      currentCongress: number;
      house: readonly FederalSeat[];
      senate: readonly FederalSeat[];
    }>
  | Readonly<{ status: "unavailable"; reason: ProviderFailure }>;

export type HouseVacancyOutcome =
  | Readonly<{
      status: "available";
      currentCongress: number;
      source: SourceRef;
      vacancies: readonly { stateCode: string; district: number; source: SourceRef }[];
    }>
  | Readonly<{ status: "unavailable"; reason: ProviderFailure }>;

export type FetchCongressRoster = (
  jurisdiction: FederalJurisdiction,
  options: { apiKey: string; fetch: typeof globalThis.fetch; now: () => Date },
) => Promise<CongressRosterOutcome>;

export type FetchCurrentHouseVacancies = (
  currentCongress: number,
  options: { fetch: typeof globalThis.fetch; now: () => Date },
) => Promise<HouseVacancyOutcome>;

export declare function reconcileFederalOfficials(
  jurisdiction: FederalJurisdiction,
  congress: CongressRosterOutcome,
  clerk: HouseVacancyOutcome,
): FederalOfficialsRoster;
```

T1 freezes these F5-local types and function signatures. T2 supplies the Clerk adapter behind `FetchCurrentHouseVacancies`; every successful Clerk outcome includes the current-list `SourceRef` and retrieval time even when `vacancies` is empty, so absence is qualified evidence. Reconciliation returns a freshness-free `FederalOfficialsRoster`; T4 adds cache `Freshness` to produce `FederalOfficialsView`. T3 consumes normalized view fixtures only.

## Congress.gov contract

Official references: [API repository](https://github.com/LibraryOfCongress/api.congress.gov/), [member endpoint](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/MemberEndpoint.md), [coverage/update timing](https://www.congress.gov/help/coverage-dates), and [api.data.gov header-key guidance](https://api.data.gov/docs/developer-manual/).

Each refresh uses this exact sequence; the Congress number is never hardcoded:

```text
GET /v3/congress/current?format=json
GET /v3/member/congress/{congress}/{STATE}/{DISTRICT}?currentMember=true&format=json
GET /v3/member/{STATE}?currentMember=true&limit=250&format=json
GET /v3/member/{BIOGUIDE}?format=json
```

- House uses the documented current-Congress state/district endpoint. Senate uses the documented state endpoint, selects Senate summaries, then requires each detail term to match the dynamically discovered current Congress. Detail calls occur only for selected House/Senate records.
- Requests use HTTPS, locally built fixed-origin URLs, `X-Api-Key`, explicit JSON, a 5-second abort timeout, and no automatic retry.
- Each selected summary/detail pair must agree on Bioguide ID, `currentMember === true`, current Congress, chamber, state, and House district.
- Validate canonical provider origin/path/ID, required shape, timestamps not after retrieval, count/item equality, the 250 limit, expected pagination, duplicate Bioguide IDs, and duplicate seats.
- Unexpected non-null pagination, mismatch, duplicate, malformed timestamp, cross-origin URL, or provider-path mismatch makes the affected result malformed/partial. Provider prose is never shown directly.
- Internal failures are normalized to timeout, quota, auth, not-found, provider-error, or malformed.

## House Clerk vacancy contract

Only fetch [the current vacancies list](https://clerk.house.gov/Members/ViewVacancies):

```text
GET https://clerk.house.gov/Members/ViewVacancies
```

A narrow fail-closed parser first requires exactly one `Vacancies of the {ordinal} Congress` heading matching the dynamically discovered Congress. The sole active-seat marker is then a unique same-origin canonical link matching `^/members/([A-Z]{2})(00|0[1-9]|[1-9][0-9])/vacancy$` beneath that current-Congress content; `00` maps to at-large district `0`. Filled entries without that link are not active. Duplicate seats/links, malformed/unknown jurisdiction codes, or a mismatched/missing Congress heading make the entire Clerk outcome malformed.

The request uses `redirect: "error"`, `cache: "no-store"`, a 5-second whole-body abort timeout, an exact Clerk origin/path, an HTML content type, and a 1 MiB body ceiling. It never fetches a district page. Persisted district vacancy pages, HTTP 200, page existence, or stale vacancy prose never prove a current vacancy; the canonical link supplied by the current list is retained only as evidence.

Fixtures must include the current-Congress heading, active GA-13 link, and filled CA-01/GA-14 entries without active links, plus redirect/content-type/oversize/timeout/duplicate/malformed cases.

Reconciliation:

- When Clerk is available, every House serving/vacant/conflict result carries the current-list `SourceRef`; a vacancy also carries its canonical district evidence link. An empty list therefore remains visible, timestamped evidence rather than an unqualified omission.
- no verified House member + active Clerk entry -> vacant;
- verified member + no active Clerk entry -> serving;
- verified member + active Clerk entry -> visible conflict and partial coverage;
- no verified member + no active Clerk entry -> unknown, never vacant;
- Clerk unavailable/malformed + verified member -> member may display, but House coverage is partial;
- exactly two distinct validated current senators -> verified;
- one senator -> partial; zero, more than two, or duplicates -> unknown; never infer Senate vacancy.

## Cache and freshness contract

After F4's closeout and handoff, one PostgreSQL table stores public-only validated JSON snapshots:

```text
federal_official_cache
  cache_key text primary key
  payload jsonb not null
  retrieved_at timestamptz not null
  refresh_after timestamptz not null
  stale_after timestamptz not null
```

Allowed keys:

```text
roster:v1:{STATE}:{DD|AL}
profile:v2:{BIOGUIDE}
```

- `<24h`: serve fresh with zero provider calls.
- `>=24h` and `<72h`: attempt one refresh; success replaces cache; failure may serve the validated cached payload as stale.
- `>=72h`: cache is expired; refresh must succeed or return unavailable without claiming current coverage.
- Exactly 24 hours enters refresh; exactly 72 hours is expired.
- Future, non-finite, inverted, corrupt, wrong-key, or schema-invalid cache data fails closed.
- Roster refresh validates jurisdiction, current Congress, selected details, pagination, URLs, timestamps, duplicates, and Clerk reconciliation before writing.
- Profile rows are derived and transactionally written only from individually validated members in a successfully verified current roster refresh. The same transaction compares the prior roster payload, deletes every displaced profile ID, replaces current derived profiles, and writes the new roster so newer contrary evidence cannot coexist with an old “current official” profile. A public profile request never calls a provider.
- Cache contains no address, coordinates, user/session ID, provider credential, or raw provider error.
- No background refresh, distributed lock, user-keyed cache, or custom cache framework.

## Public and dashboard contracts

Public route: `/officials/federal/[bioguideId]`.

- Accept only `^[A-Z][0-9]{6}$` before cache access.
- Read only a verified-current derived profile cache row.
- Never fetch an arbitrary, historical, unknown, or cache-missing person.
- Invalid or missing profile returns not-found; stale is permitted only below 72 hours; expired/unavailable is explicit.
- Server-render name, current office/known term years, source, and freshness; usable without authentication, JavaScript, or AI.

Dashboard integration after F4 handoff:

1. Obtain a current DB-backed session and call `getSavedResidenceDivisions(session.user.id)`.
2. `[]` renders exactly “Save a voting residence to see federal officials” and performs zero cache/provider calls.
3. Pass nonempty divisions to the F5-local strict parser without decrypting address or changing F4.
4. Invalid coverage explains incomplete saved-residence coverage and performs zero calls.
5. Unsupported DC/territory renders “Federal official coverage is not available for this jurisdiction yet.” and performs zero calls.
6. Supported jurisdiction renders `In office` with one House seat and Senate coverage.

Cards use the same hierarchy, space, controls, source/freshness placement, and missing-data language. Ordering is deterministic and never based on party, popularity, or engagement.

## Task graph

| Task | Lane | Expected RED/check | Mutable files | Depends on | Done criteria |
| --- | --- | --- | --- | --- | --- |
| F5-T1 | Isolated domain, strict jurisdiction, Congress adapter | `npm.cmd test -- src/lib/federal-officials.test.ts src/lib/congress-gov.test.ts` cannot resolve absent modules | New `src/lib/federal-officials.ts`, `src/lib/congress-gov.ts`, their tests, and small `tests/fixtures/congress-*.json` files | Delegated Gate A | dynamic current Congress, exact requests/header/timeout, House + two Senate, details, at-large, OCD/Census, unsupported, URL/time/pagination/duplicate fail-closed |
| F5-T2 | Isolated Clerk vacancy and reconciliation | `npm.cmd test -- src/lib/house-clerk-vacancy.test.ts src/lib/federal-officials.test.ts` fails because adapter/evidence are absent | New `src/lib/house-clerk-vacancy.ts`, its test, `tests/fixtures/clerk-current-vacancies.html`; modify F5 domain/test only | T1 | GA-13 active, CA-01/GA-14 filled, outage/malformed/conflict matrix, no inferred vacancy |
| F5-T3 | Isolated accessible views | `npm.cmd test -- src/components/federal-officials.test.tsx src/components/federal-profile.test.tsx` cannot resolve absent views | New federal roster/profile components and tests plus `src/components/federal-officials.module.css` | T1; parallel with T2 | equal neutral cards, at-large/vacancy/conflict/stale/partial/expired/unsupported states, adjacent source/freshness, SSR/responsive semantics |
| F5-T4 | Deferred cache and service | `npm.cmd test -- src/lib/federal-officials-service.test.ts` and `npm.cmd run test:postgres -- integration/federal-official-cache.test.ts` fail on absent table/service | New service/tests/integration; shared `src/db/schema.ts`, `src/db/index.ts`, `.env.example`; one migration/meta set after F4 journal | F4 DONE + current main + handoff + T1-T2 | exact 24h/72h policy, validated read/write, atomic displaced-profile deletion/current-profile replacement, privacy keys, server-only credential |
| F5-T5 | Deferred public profile route | `npm.cmd test -- "src/app/officials/federal/[bioguideId]/page.test.tsx"` cannot resolve absent page | New `src/app/officials/federal/[bioguideId]/page.tsx` and test | T3-T4 | regex gate, verified cache only, zero provider on invalid/miss/history/expiry, no-auth/no-JS source/freshness |
| F5-T6 | Deferred dashboard integration | `npm.cmd test -- src/app/dashboard/page.test.tsx` lacks `In office` and empty/invalid/unsupported paths | Shared `src/app/dashboard/page.tsx` and test only; F4 module read-only | F4 handoff + T3-T4 | fresh user ID lookup, exact `[]` copy, strict parser, zero calls on invalid/unsupported, no decrypt, honest roster |
| F5-T7 | Deferred integrated journeys | `npm.cmd run test:e2e -- e2e/federal-officials.spec.ts` fails because journeys/seed are absent | New `e2e/federal-officials.spec.ts`; shared `e2e/seed-session.mjs` after handoff | T5-T6 | public/dashboard, no-home, at-large, vacancy, stale/unavailable/unsupported, keyboard/responsive/no-JS with fixtures only |
| F5-T8 | Deferred verification/review | any failed check or Critical/Important finding blocks | coordinator evidence only | T7 | focused/full/PostgreSQL/E2E/security/diff/manual checks and independent review pass |

Execution order:

```text
T1 -> (T2 || T3)
F4 DONE + current-main integration + coordinator handoff -> T4 -> (T5 || T6) -> T7 -> T8
```

## Required verification

T1-T3 run their focused commands and typecheck/lint as applicable. T8 runs:

```powershell
npm.cmd test
npm.cmd run db:check
npm.cmd run test:postgres
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --audit-level=low
git diff --check
```

Manual evidence covers 375px/1280px layouts, keyboard/focus, screen-reader output, reduced motion, stale/recovery/unsupported states, and JavaScript-disabled public rendering. The coordinator independently inspects the diff, reruns checks, requests review, and qualifies hosted CI/mergeability. F5 cannot approach delegated Gate B until F4 is closed and all deferred tasks are verified; it is not `DONE` until its own feature and closeout merges.

## UI/UX DNA evidence plan

- UX-01: calm factual copy; no ranking, persuasion, or urgency.
- UX-02: source and retrieved/updated/freshness state adjacent to qualified facts.
- UX-03: equal official hierarchy/order/space/controls and identical missing-data language.
- UX-04: only normalized divisions enter F5; no address/user data in provider/cache/log contracts.
- UX-05: semantic SSR, keyboard/focus/screen-reader/contrast/reduced-motion/responsive checks.
- UX-06: explicit empty, invalid, unsupported, partial, conflict, stale, expired, and unavailable recovery.
- UX-07: core official facts work without AI or JavaScript.
- UX-08: roster leads progressively to current public profile detail.
- UX-09: vacancy and completeness are never inferred; coverage labels remain honest.

## Risks and rejected alternatives

Risks accepted at delegated Gate A:

- Congress.gov may lag chamber activity; visible timestamps, Clerk reconciliation, and partial/conflict states limit overclaiming.
- Clerk HTML may change; the narrow fixture-backed parser fails closed.
- Missing credential, quota, or outage can prevent refresh; bounded stale fallback preserves only still-qualified cached data.
- Direct public profile URLs can return not-found until a verified roster has populated that derived cache.
- DC and territories are explicitly unsupported at launch rather than misrepresented as missing senators.

Rejected: Congress.gov-only vacancy inference, district-page/HTTP-status vacancy inference, full Clerk roster ingestion, generic provider registry, event store, worker, live credentialed tests as a requirement, client-side fetch, user-keyed cache, arbitrary profile lookup, party/photo/contact/biography/history expansion, state/local officials, candidates, comparison, and AI.
