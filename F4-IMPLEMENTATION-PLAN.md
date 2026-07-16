# F4 Consented Saved Residence Implementation Plan

> **For agentic workers:** execute task-by-task with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every implementation task uses `superpowers:test-driven-development`; every completion claim uses `superpowers:verification-before-completion`. The coordinator owns roadmap state, reviews, PRs, merges, and Human Gates.

**Goal:** Let a signed-in user explicitly save, replace, read, and delete one encrypted manual residence while normalized political divisions remain separately queryable for deterministic personalization.

**Architecture:** F4 extends the existing F3 preview. A successful manual preview creates a short-lived browser-only save candidate containing the entered address and F3 token. The server independently validates the user-entered address and the signed, user-bound divisions; it cannot prove they correspond or prove that the token came from a manual preview. It encrypts the address with Node `crypto`, stores normalized divisions relationally in the same transaction, and exposes owner-only residence operations plus a division-only server interface for F5. Coordinate previews are never UI save candidates, but a direct caller can replay coordinate-derived signed divisions beside an address. All runtime consumers share one process-level database promise from `src/db/index.ts`. Key rotation is an explicit resumable operator command.

**Tech stack:** Next.js 16, React 19, TypeScript, Better Auth, Drizzle, PostgreSQL/PGlite, Node `crypto`, Vitest, Playwright.

## Gate and scope constraints

- Human Gate A must approve the decisions in this plan before F4-T1 enters RED.
- F4 owns the shared schema, migration, dashboard, residence UI, configuration, and integration surfaces recorded in `ROADMAP.md`; it must not edit coordinator-owned files.
- Do not modify `src/lib/residence.ts`; consume the existing F3 token and response types unchanged.
- Manual-only save eligibility is a UI rule. The server never claims the submitted address produced the signed divisions.
- Only signed normalized divisions drive civic personalization. Exact address is owner-visible account data only.
- Exact address may exist only in the authorized request, transient encrypt/decrypt memory, encrypted columns, and authenticated owner response. It must never enter URLs, logs, analytics, browser storage, provider/search/research input, source snapshots, or LLM prompts.
- Raw latitude/longitude are never accepted or persisted by F4. Because F3 tokens omit input kind, the server cannot distinguish coordinate-derived divisions from manual-address-derived divisions.
- No new runtime dependency, generalized key-management framework, background worker, location history, multiple-home model, or hidden read-time rotation.
- If a task needs a file outside its recorded ownership, stop and return to the coordinator before editing.

## Binding product decisions

Gate A approval accepts all of these together:

1. A new explicit save atomically replaces the prior home and keeps no prior-home history.
2. The authenticated owner can view the full decrypted saved address.
3. Consent uses the exact version and copy `saved-residence-v1`; consent begins unchecked and the server records its own timestamp.
4. Manual eligibility is UI-enforced. Address and verified token-derived divisions are persisted independently; only divisions affect civic personalization.
5. Raw coordinates never persist; Gate A accepts that the server cannot detect replayed coordinate-derived divisions, while the UI never offers them as a save candidate.
6. Encryption uses a dedicated versioned environment keyring and explicit resumable batch rotation.
7. `getSavedResidenceDivisions(userId)` is the stable post-closeout F4-to-F5 interface.

## Frozen interfaces

```ts
// src/lib/saved-residence.ts
import type { ResolutionResponse } from "./residence";

type ResolvedPreviewResponse = Extract<
  ResolutionResponse,
  { status: "matched" | "partial" }
>;

export type SavedResidenceResolution = Readonly<
  Pick<
    ResolvedPreviewResponse,
    "status" | "divisions" | "source" | "coverageNotes"
  >
>;

export type SavedResidenceDivision = Readonly<
  SavedResidenceResolution["divisions"][number]
>;

export const SAVED_RESIDENCE_CONSENT_VERSION = "saved-residence-v1";

export type SaveResidenceRequest = {
  address: string;
  resolutionToken: string;
  consent: {
    accepted: true;
    version: typeof SAVED_RESIDENCE_CONSENT_VERSION;
  };
};

export type SavedResidenceView = {
  address: string;
  resolution: SavedResidenceResolution;
  consent: {
    version: typeof SAVED_RESIDENCE_CONSENT_VERSION;
    acceptedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type GetSavedResidenceResponse =
  | { status: "empty" }
  | { status: "saved"; residence: SavedResidenceView };

export type SaveResidenceResponse = {
  status: "saved";
  residence: SavedResidenceView;
  replaced: boolean;
};

export type SavedResidenceMutationResult = Omit<
  SaveResidenceResponse,
  "status"
>;

export type DeleteSavedResidenceResponse =
  | { status: "deleted" }
  | { status: "empty" };

export type SavedResidenceErrorResponse = {
  status:
    | "invalid_request"
    | "unauthenticated"
    | "forbidden"
    | "invalid_token"
    | "unavailable";
  message: string;
};

export function getSavedResidenceDivisions(
  userId: string,
): Promise<readonly SavedResidenceDivision[]>;
```

`SavedResidenceResolution` deliberately omits F3's short-lived `resolutionToken` and `expiresAt`; neither is persisted or reconstructed after save. `getSavedResidenceDivisions` accepts only a nonempty user ID obtained from a current authenticated session. It returns `[]` when no residence exists, selects only `type`, `name`, `id`, and `idScheme` in display order, never loads/decrypts ciphertext, and never returns address, token, consent, or provenance. F4 owns residence provenance/freshness display; F5 owns official-data provenance/freshness.

The exact error messages are frozen with T1: invalid request — “Review the residence details and try again.”; unauthenticated — “Sign in again before managing a saved residence.”; forbidden — “This saved residence request was not accepted.”; invalid token — “Preview your voting residence again before saving.”; unavailable — “Saved residence is temporarily unavailable. Try again later.”

Internal operations may use an injected repository for tests. T1 freezes the DTOs above before API and UI lanes start; internal behavior is:

```ts
export declare function parseSaveResidenceRequest(
  value: unknown,
): SaveResidenceRequest | null;
export declare function saveSavedResidence(
  userId: string,
  request: SaveResidenceRequest,
  verifiedResolution: SavedResidenceResolution,
  now: Date,
): Promise<SavedResidenceMutationResult>;
export declare function getSavedResidence(
  userId: string,
): Promise<SavedResidenceView | null>;
export declare function deleteSavedResidence(userId: string): Promise<boolean>;
export declare function rotateSavedResidenceKeys(): Promise<{
  rotated: number;
  skipped: number;
  remaining: number;
}>;
```

## Request, consent, and session contract

The exact POST body is:

```json
{
  "address": "123 Main Street",
  "resolutionToken": "v1...",
  "consent": {
    "accepted": true,
    "version": "saved-residence-v1"
  }
}
```

- Root and nested objects reject missing or extra keys.
- Address is a trimmed 1-300 character string. The POST schema has no latitude or longitude field, and recursive exact-shape validation rejects either field anywhere in the request.
- The client sends no timestamp. `consented_at` comes from the server clock only after token verification and successful commit.
- “Fresh auth” means a current DB-backed Better Auth session lookup for every request, not recent reauthentication UX.
- POST/DELETE validation order is same-origin, JSON content type, current session, exact body, then operation. GET requires a current session and no Origin check.
- Every success and failure includes `Cache-Control: private, no-store`.
- Failure responses are generic and never disclose token, provider, database, key version, ciphertext, or cryptographic detail.

Routes:

| Route | Success | Fail closed |
| --- | --- | --- |
| `GET /api/v1/residence` | `200 GetSavedResidenceResponse` | `401` no current session; `503` DB/key/decrypt failure, using `SavedResidenceErrorResponse` |
| `POST /api/v1/residence` | `200 SaveResidenceResponse` | `400` shape/address/consent; `401` auth; `403` origin; `422` invalid/expired/wrong-user token; `503` crypto/DB, using the frozen error DTO/copy |
| `DELETE /api/v1/residence` | `200 DeleteSavedResidenceResponse` | exact JSON `{ "confirmation": "DELETE_SAVED_RESIDENCE" }`; otherwise `400/401/403/503` with frozen error DTO/copy |

## Persistence contract

### `saved_residence`

- `user_id text PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE`
- authenticated-envelope fields: version, key version, canonical base64url IV, ciphertext, and tag
- token-derived resolution status, source name/URL, checked/effective time, optional benchmark/vintage, and JSON coverage notes
- consent version/time plus created/updated timestamps
- checks restrict envelope `v1`, resolution `matched|partial`, consent `saved-residence-v1`, and nonempty envelope fields
- no plaintext address, token, hash, latitude, or longitude column

### `saved_residence_division`

- parent FK to `saved_residence(user_id)` with cascade
- `type`, `id_scheme`, `division_id`, `name`, and `display_order`
- primary key `(user_id, type, id_scheme, division_id)`
- unique `(user_id, display_order)`
- lookup index `(id_scheme, type, division_id, user_id)`

Parent upsert, old-child deletion, and new-child insertion occur in one transaction. Any failure preserves the complete prior residence. Direct residence deletion and existing account deletion remove both tables through cascades.

`src/db/index.ts` owns one process-level promise per non-memory connection string. The existing `createDatabase(DATABASE_URL)` call in cached Better Auth and every residence consumer therefore receive the same PostgreSQL pool or file-backed PGlite instance without changing `src/lib/auth.ts`; `pglite://memory` remains fresh for isolated tests. Failed initialization evicts the cached promise so a later call can recover. Tests prove auth and residence consumers share one file-backed PGlite database. The rotation command reuses one connection for its process. No request or row creates a new pool.

## Encryption and rotation contract

- AES-256-GCM; exactly 32 decoded key bytes; fresh 12-byte IV; 16-byte tag; canonical base64url.
- AAD contains a canonical fixed-purpose record with envelope version, key version, and user ID.
- Decrypt rejects malformed/cross-user/tampered/unknown-version/unknown-key envelopes without detailed output.
- `BETTER_AUTH_SECRET` is never reused.

Environment:

```text
RESIDENCE_ENCRYPTION_ACTIVE_KEY=2026-07
RESIDENCE_ENCRYPTION_KEYS=[{"version":"2026-07","key":"<43-character base64url key>"}]
```

- Version grammar: `^[a-z0-9][a-z0-9._-]{0,31}$`.
- The key list is an exact-object JSON array; versions are unique; each key is canonical base64url and 32 bytes; the active version must exist.
- Address read/replacement/rotation fails closed if a stored row references a missing key. Residence/account deletion and division-only reads remain possible without decryption.

Rotation preflights every referenced key, processes stable `user_id` batches, decrypts/authenticates each old envelope, re-encrypts with a fresh IV/tag, and updates with full-envelope compare-and-swap predicates. A zero-row update means a concurrent replacement and is safely skipped. Already committed rows stay rotated if a later row fails; rerunning resumes remaining rows. Output contains counts only. A legacy key may be retired only after `remaining === 0` and a grouped database check confirms zero rows use it.

## UI contract

- The saved-home account state appears before the preview.
- A successful manual `matched|partial` preview creates eligibility; a device preview never does.
- Consent starts unchecked. Copy: “Save this residence to my account. voteGPT will encrypt the address and use these matched political divisions for personalization until I delete or replace it.”
- Saving warns that an existing home will be replaced and no history retained.
- Saved view shows owner address, divisions, source/freshness, coverage notes, consent time, and delete action.
- Delete confirmation explains that address and divisions are removed while the account remains.
- Account deletion copy states that the saved home is permanently removed.

Immediately clear the eligible candidate and reset consent after any address edit, device action, new preview attempt/result, client-observed expiry, server `422`, successful save/replacement, or saved-home deletion. Only a new successful manual preview recreates eligibility.

Required states: loading, empty, saved, save pending, replaced, expired, unauthenticated, network/server unavailable, deletion confirm/pending/error/success, partial coverage, and unknown freshness. Errors state whether prior data remained unchanged and provide one safe recovery action.

Accessibility evidence covers semantic regions/headings, native controls, explicit labels, status announcements, disabled duplicate actions, focus recovery, no color-only meaning, reduced motion, keyboard order, long-value wrapping, and 375x812 plus 1280x720 layouts.

## Task graph

| Task | Outcome | Expected RED | Mutable files | Depends on | Done criteria |
| --- | --- | --- | --- | --- | --- |
| F4-T1 | Contract and authenticated encryption | `npm.cmd test -- src/lib/saved-residence.test.ts` cannot resolve absent module | Create `src/lib/saved-residence.ts` and `src/lib/saved-residence.test.ts` | Gate A | Exact request/response/error DTOs and copy, recursive consent parser, strict keyring, AES-GCM/AAD, tamper/wrong-user/key/version failures pass |
| F4-T2 | One atomic encrypted home plus division-only handoff | `npm.cmd test -- src/db/index.test.ts src/lib/saved-residence.test.ts` fails because tables/repository are absent | `src/db/schema.ts`, `src/db/index.ts`, `src/db/index.test.ts`, saved-residence module/tests, `drizzle/0002_saved_residence.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json` | T1 | shared process DB promise, PostgreSQL/PGlite parity, failed replacement preserves old parent/children, cascades, two-user ordered handoff, division read/delete work without keyring/decrypt, `db:check` |
| F4-T3 | Safe rotation and account cascade | `npm.cmd test -- src/lib/saved-residence.test.ts src/lib/account.test.ts` fails because rotation/cascade cases are absent | saved-residence module/tests, `src/lib/account.test.ts`, `integration/postgres-auth.test.ts`, `package.json`, new `scripts/rotate-saved-residence-keys.mts` | T2 | key preflight, batching, full CAS, resume, count-only output, account/direct deletion; no dependency added |
| F4-T4 | Private owner API | `npm.cmd test -- src/app/api/v1/residence/route.test.ts` cannot resolve route | New `src/app/api/v1/residence/route.ts` and test; `.env.example` | T1 DTOs; T2 repository | exact frozen bodies/order, DB-backed auth, two-user GET/delete isolation, origin/JSON, token/user/expiry, zero provider work, no-store, generic failures |
| F4-T5 | Accessible consent/account UI | `npm.cmd test -- src/components/residence-preview.test.tsx src/app/dashboard/page.test.tsx src/app/identity-shell.test.tsx` fails on missing save/account behavior | `src/components/residence-preview.tsx`, its test, `src/components/account-controls.tsx`, dashboard page/test, `src/app/identity-shell.test.tsx`, `src/app/globals.css` | T1 DTOs | manual eligibility, all invalidations, replace/delete/recovery, focus/keyboard/responsive checks, exact address absent from URLs and browser storage |
| F4-T6 | Integrated lifecycle and privacy evidence | `npm.cmd run test:e2e -- e2e/residence.spec.ts` fails because saved flow/config is absent | `e2e/seed-session.mjs`, `e2e/residence.spec.ts`, `playwright.config.ts` | T3-T5 | save/reload/replace/rotate/delete/account cascade; raw coordinates absent; coordinate-derived replay risk recorded; exact address absent from URLs/logs/storage/provider calls/raw DB; accessibility evidence |
| F4-T7 | Verified feature candidate | any required check/review finding blocks | no production files; coordinator evidence only | T6 | focused/full/PostgreSQL/E2E/security/diff checks pass and independent review has no Critical/Important finding |

### Parallel lanes

F4-T1 runs first and freezes interfaces. Then:

- Persistence lane: T2 then T3.
- UI lane: T5 may use the frozen DTO/API contract while persistence proceeds.
- API lane: T4 starts after T2 repository signatures settle.
- Integration lane: T6 starts only after T3, T4, and T5.

No worker crosses these ownership boundaries. Integration order is `T1 -> (T2 || T5) -> (T3 || T4) -> T6 -> T7`.

## Required verification

Focused commands are recorded per task. F4-T7 runs:

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

The coordinator independently inspects the whole diff, reruns proportionate checks, requests read-only review, qualifies hosted CI and mergeability, and presents Human Gate B. F4 is not `DONE` until its feature merge, post-merge checks, and ROADMAP/README-only closeout PR merge.

## UI/UX DNA evidence plan

- UX-01: calm consent, replacement, deletion, and recovery copy.
- UX-02: source and checked/effective time beside the saved residence.
- UX-04: manual candidate boundary, explicit consent, owner-only decrypt, encryption and sink-absence tests.
- UX-05: primary semantic, keyboard, screen-reader, focus, contrast, reduced-motion, and responsive flow.
- UX-06: explicit loading, empty, partial, expiry, replacement, deletion, and failure recovery.
- UX-07: deterministic signed divisions and relational reads; no AI dependency.
- UX-08: preview first, consent second, destructive confirmation on request.
- UX-09: honest partial/unknown coverage and freshness language.
- UX-03 is not applicable because F4 presents no candidates or officials.

## Risks and rejected alternatives

Risks retained for Gate A:

- F3 does not cryptographically bind the separately submitted address or input kind to the signed divisions. A direct caller can pair an address with coordinate-derived divisions or make their display address disagree with their own personalization, but cannot persist raw coordinates, alter another user, or forge unsigned divisions.
- A combined database and application-key compromise can reveal addresses.
- Owner display necessarily places the address in authenticated browser memory.
- Legacy keys remain required until rotation proves zero old rows.
- Rotation must not overwrite a concurrent replacement.

Rejected as unnecessary or harmful now: re-resolving on save, changing F3 token format, GPS persistence/reverse geocoding, deterministic/searchable encryption, plaintext/hash address columns, `BETTER_AUTH_SECRET` reuse, JSON-only divisions, hidden GET rotation, KMS/provider abstraction, RLS, consent history, multiple homes, household sharing, maps, analytics, and AI/search use.
