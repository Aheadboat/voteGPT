# voteGPT Roadmap

This file is authoritative for product scope, feature order, gates, acceptance criteria, and progress.

## Product contract

- Audience: everyday U.S. voters.
- Public: sourced official, candidate, election, and contest pages.
- Account-gated: personalized lookup, one saved home, contextual chat, approved memory, and verified email alerts.
- UX: modern, minimal-click, mobile-first `Local | State | Federal` tabs with `In office | Elections` mode and data-driven office categories.
- UX DNA: `AGENTS.md` routes user-facing work to stable principles; visual identity remains deliberately undefined until a real application shell proves reusable patterns.
- Comparison: every verified candidate appears equally; exactly two may open side by side, otherwise users may choose any two.
- AI: optional explanation layer over published evidence. It never determines location, candidacy, incumbency, deadlines, or outcomes.
- LLM configuration: operator-managed OpenAI, Anthropic, or backend-reachable OpenAI-compatible private endpoint selected through deployment config.
- Language: English launch with i18n-ready schemas.
- API: internal application API only in v1.
- Hosting: portable containers, PostgreSQL, worker process, and Render reference deployment.

## Source strategy

- Geography: Google Civic divisions by address; Census Geocoder fallback and cross-check.
- Federal officials and records: Congress.gov and chamber-native sources.
- State legislators and records: OpenStates with official-source links.
- Elections and ballots: Google Voting Information Project plus jurisdiction-specific official sources.
- Federal campaign finance: OpenFEC, kept separate from ballot qualification.
- Candidate lifecycle: Ballotpedia proof of concept before any production dependency.
- Broad research: independent web search only after storage and derived-use rights are confirmed.

Source precedence: stage-specific official election authority → official ballot feed → FEC for finance only → licensed vendor citing an official source → campaign statement → reputable reporting. Conflicts remain visible; no last-write-wins deletion.

## Execution contract

Roadmap items move through `TODO → explicit authorization → IN PROGRESS (DISCOVER/DESIGN/PLAN) → Human Gate A → RED → GREEN → REFACTOR → VERIFIED → Human Gate B → DONE`.

- ACTIVATION: only explicit user authorization starts an item; never roll automatically into the next item.
- DESIGN/PLAN: record applicable DNA, design, testable task graph, dependencies, interfaces, parallel lanes, risks, and non-goals in the active item; extract one linked plan only if inline detail stops being readable.
- HUMAN GATE A: user approves the overall design and tests-first plan before RED or production work.
- RED: record exact test and expected failure before production code.
- GREEN: minimum code required to pass.
- REFACTOR: simplify proven code only.
- VERIFIED: focused tests, full checks, and manual accessibility/visual review when applicable.
- HUMAN GATE B: present delivered behavior, final design and deviations, evidence, and remaining risks; only explicit user approval permits DONE.
- DONE: record approval and evidence, update this file, and stop with every later item still TODO.
- At most one roadmap item may be active; zero active items is valid between explicit authorizations.
- UI/UX work: at RED record applicable UX DNA IDs and expected behavioral failures; at VERIFIED map those IDs to automated or recorded manual evidence.
- No skipped tests or arbitrary coverage percentage.
- External providers use small fixtures and contract tests; credentialed live tests remain optional.

## R0 — Durable Project Contract [DONE]

- **Outcome:** Repository has durable product, roadmap, and agent guidance before application code.
- **Dependencies:** None.
- **Verification first:** Inspect file inventory, internal links, roadmap statuses, CodeGraph block, domain-contract routing, roadmap-item workflow, human gates, and absence of scaffold files.
- **Done:** Git initialized; `README.md`, `ROADMAP.md`, and `AGENTS.md` exist; later items contain outcome, dependencies, tests-first criteria, done criteria, and non-goals; UI/UX DNA and the roadmap-item protocol are routed without another artifact; both human gates are exercised; user approves R0.
- **Non-goals:** Application scaffold, dependencies, CI, database, APIs, or extra documentation.
- **Applicable UX DNA IDs:** None; this R0 contract change routes later user-facing work but does not change an end-user interface.
- **Workflow design:** Root `AGENTS.md` owns lifecycle and delegation rules; `ROADMAP.md` owns item plans, state, and evidence; `README.md` exposes public project status. The main agent integrates changes and a separate read-only agent reviews the completed whole.
- **Workflow risks:** Over-parallelization could create file conflicts, agents could advance status without authority, and detailed plans could bury roadmap scope. Dependency/file isolation, main-agent-only status, explicit human gates, and inline-first planning control those risks.

| Task | Outcome | RED/check | Files/interfaces | Depends on | Done |
| --- | --- | --- | --- | --- | --- |
| T1 | Prove the five workflow behaviors are absent. | Five named assertions fail because their rules are missing. | Read `AGENTS.md`, `ROADMAP.md`, and `README.md`; no writes. | Human Gate A | Expected failures are observed and recorded. |
| T2 | Encode the minimal workflow and current status. | T1 assertions become green. | Modify the three existing artifacts; preserve CodeGraph, DNA, privacy, and roadmap contracts. | T1 | Focused workflow checks pass with no new project artifact. |
| T3 | Integrate, verify, independently review, and prepare Gate B. | Full R0 assertions pass and read-only review finds no unresolved Critical or Important issue. | Read all three artifacts; only the main agent may apply separately tested fixes. | T2 | Full suite is green, review is ready, and R0 remains active for Gate B. |

- **Human Gate A evidence:** User approved the workflow design, explicit-authorization transition, task decomposition, dependency-aware subagents, and two human gates on 2026-07-13.
- **RED evidence:** `ux-dna-is-routable` failed because the router and `UX-01`–`UX-09` were absent; `ux-dna-is-injected-into-tdd` failed because the lifecycle did not require applicable UX DNA IDs.
- **Review RED evidence:** `ux-dna-route-covers-all-user-facing-work` failed on the narrow router; `location-privacy-defines-transient-provider-boundary` failed on the unspecified provider boundary; `ux-dna-evidence-is-reproducible` failed on missing applicability and commands; `public-journey-is-anonymous` failed because the README journey began with sign-in.
- **Workflow RED evidence:** `roadmap-activation-requires-explicit-authorization`, `human-gate-a-approves-design-and-plan`, `task-graph-controls-parallel-subagents`, `human-gate-b-controls-done`, and `active-plan-stays-inline-until-needed` failed because the corresponding workflow rules were absent.
- **Workflow review RED evidence:** `r0-plan-records-overall-design-and-risks`, `r0-task-graph-satisfies-own-contract`, and `non-implementation-task-uses-falsifiable-check` failed because R0's first plan did not satisfy its own durable planning fields.
- **Closure RED evidence:** `r0-closes-only-after-human-gate-b` failed before the authorized transition because R0 and README still reported the active Gate B state; `r0-done-has-no-stale-active-claim` then failed because earlier workflow evidence still described that superseded state.
- **Verification commands:** `rg --files -uu -g '!.git/**'`; `rg -n "Roadmap item protocol|Human Gate A|Task graph and delegation|Human Gate B|Domain contracts|UI and UX DNA|UX-0[1-9]|applicable UX DNA IDs" AGENTS.md ROADMAP.md`; `git status --short --branch`. PowerShell assertions cover exact CodeGraph preservation, links, statuses and required fields, unique DNA IDs, routing, human gates, privacy boundaries, and scaffold absence.
- **UX-DNA VERIFIED evidence:** All six named contract checks and the full PowerShell R0 acceptance suite passed on 2026-07-13; Git reports only the three requested artifacts on `main`.
- **Workflow VERIFIED evidence:** All focused workflow and self-application checks and the full PowerShell R0 acceptance suite passed on 2026-07-13; independent read-only review found no remaining Critical, Important, or Minor issues. This evidence supported Human Gate B.
- **Human Gate B evidence:** User explicitly approved R0 on 2026-07-13 after reviewing delivered behavior, final design, deviations, verification evidence, and remaining risks. Every later item remains `TODO` pending separate authorization.
- **Closure VERIFIED evidence:** Closure checks and the full final-state R0 acceptance suite passed on 2026-07-13; R0 is `DONE`, zero items are active, all later items remain `TODO`, and Git reports only the three requested artifacts.

## F1 — Development and Test Foundation [DONE]

- **Outcome:** Runnable Next.js/strict-TypeScript app with trustworthy local and CI test loop.
- **Dependencies:** R0 approved.
- **User outcome:** A visitor sees a small, honest product-promise page; an operator can probe deterministic process health; a contributor gets one reproducible local/CI verification contract.
- **Applicable UX DNA IDs:** UX-01, UX-05, UX-07, UX-08, and UX-09. UX-02 has no displayable civic fact yet; UX-03 has no candidate presentation; UX-04 has no identity or location input; UX-06 has no asynchronous user state or recovery flow.
- **Design:** Manually assemble the smallest Next.js 16 App Router application under `src/` with strict TypeScript, npm, Node 24 LTS, a committed lockfile, synchronous Server Components, plain feature-local CSS, Vitest/Testing Library, and Chromium Playwright. Do not import a starter example or establish reusable visual identity.
- **Runtime interface:** `GET /api/health` returns HTTP 200, a JSON content type, `Cache-Control: no-store`, and exactly `{"status":"ok"}`. It performs no database, provider, or credential checks.
- **Landing interface:** `/` renders without client JavaScript, uses one `main` landmark and ordered headings, states `voteGPT is in development. Civic coverage is not available yet.`, links `How voteGPT works` to `#principles`, and explains that sources stay visible, freshness stays explicit, and AI may explain evidence but does not determine civic facts.
- **Verification interface:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e` are independently named checks; `npm run typecheck` generates framework-owned route types before raw `tsc`, while `npm run check` composes the four non-E2E checks. Playwright starts the production build and uses `http://127.0.0.1:3000`.
- **CI interface:** GitHub Actions on pushes and pull requests uses Node 24, `npm ci`, `npm run check`, `npx playwright install --with-deps chromium`, and `npm run test:e2e`, with no skipped tests, retries, allowed failures, credentials, or environment values.
- **Tests first:** Add only the test/tool configuration needed to execute each RED; then observe the missing health route, landing page, anchor navigation, workflow, and environment contract before adding their production/configuration counterparts.
- **Done:** Fresh clone passes `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`; GitHub Actions mirrors local checks; `.env.example` contains names only.
- **UX evidence plan:** UX-01 maps to exact calm-copy assertions and manual editorial review; UX-05 to semantic queries, keyboard focus, contrast, and 375px/1280px responsive checks; UX-07 to JavaScript-disabled Playwright; UX-08 to the same-page disclosure link; UX-09 to the asserted unavailable-coverage statement.
- **Parallel lanes:** None proposed. T4 is file-independent after T1, but the work is small and shares dependency/build state; sequential execution avoids coordination overhead and keeps every RED attributable.
- **Dependencies and risks:** Package and Chromium downloads require network access after Gate A; the lockfile and Node 24 major pin control drift. Playwright owns a fixed loopback server and disables server reuse in CI. This Windows host must invoke `npm.cmd`/`npx.cmd` because PowerShell blocks the `.ps1` shims, while durable user and CI commands remain portable `npm`/`npx`. The first public push exposes every tracked file, so a staged-diff and credential-value inspection is mandatory before publication.
- **GitHub publication:** User approved public `Aheadboat/voteGPT` on 2026-07-13. The repository now exists at `https://github.com/Aheadboat/voteGPT`, `origin` is `git@github.com:Aheadboat/voteGPT.git`, `main` tracks `origin/main`, and live Actions verification is part of T6 evidence below.
- **Non-goals:** Database, auth, provider registry, worker, containers, Tailwind, component library, design system, Storybook, formatter mandate, arbitrary coverage percentage, custom error pages, or additional product routes.
- **Human Gate A evidence:** User explicitly approved the overall design, tests-first task graph, sequential execution, public GitHub publication, and live CI verification on 2026-07-13. RED and dependency installation are authorized; Human Gate B still controls `DONE`.
- **UX RED expectations:** UX-01 and UX-09 fail until the calm product promise and explicit unavailable-coverage statement exist; UX-05 fails until semantic landmarks, heading order, responsive layout, contrast, and visible keyboard focus exist; UX-07 fails until the page and native navigation work without client JavaScript; UX-08 fails until the disclosure link exposes the principles section without another product route.
- **T1 RED evidence:** `npm.cmd test -- src/app/api/health/route.test.ts` failed on 2026-07-13 with Vite import resolution for missing `./route`; the runner and setup loaded successfully, so the failure is attributable to the absent health behavior.
- **T1 GREEN/REFACTOR evidence:** The focused health test passes 1/1; `npm.cmd run typecheck` and `npm.cmd run lint` pass without warnings. Vite's obsolete path-resolution plugin was removed in favor of its native `resolve.tsconfigPaths`. npm audit initially exposed GHSA-qx2v-qp2m-jg93 through Next.js's exact PostCSS 8.4.31 dependency; `package.json` now overrides only PostCSS to the advisory's patched 8.5.10, `npm.cmd audit --json` reports zero vulnerabilities, and later build/E2E verification will check compatibility.
- **T2 RED evidence:** `npm.cmd test -- src/app/page.test.tsx` failed on 2026-07-13 with Vite import resolution for missing `./page`; the failure is attributable to the absent landing behavior, not the test harness.
- **T2 GREEN/REFACTOR evidence:** The focused landing test and full Vitest suite pass 2/2; strict typecheck and zero-warning lint pass. Next.js 16.2.10 completes an optimized production build with `/` statically rendered and `/api/health` dynamic, confirming the PostCSS 8.5.10 override is build-compatible.
- **T3 RED evidence:** With the T2 production build and Chromium available, `npm.cmd run test:e2e` exited 1 on 2026-07-14. Both JavaScript-enabled and JavaScript-disabled tests timed out while locating the absent `How voteGPT works` link, after the heading and metadata assertions passed. The unrestricted run terminated its Next.js process tree and released port 3000; an earlier sandbox-only hang was traced to blocked Windows `taskkill` cleanup rather than application behavior.
- **T3 GREEN/REFACTOR evidence:** The native `#principles` link and visible focus treatment are implemented; the optimized build passes and Playwright passes 2/2 in JavaScript-enabled and disabled contexts. Direct Next.js startup avoids an unnecessary npm server wrapper, a 10-second action timeout keeps missing controls actionable, and deleting the host-only `NO_COLOR` variable before Playwright spawns children removes its conflicting `FORCE_COLOR` warnings. Full Vitest, strict typecheck, and zero-warning lint remain green.
- **T4 RED evidence:** `npm.cmd test -- tests/foundation-contract.test.ts` exited 1 on 2026-07-14 with exactly two expected behavioral failures: `.github/workflows/ci.yml` and `.env.example` do not exist. The package-script assertion passed, proving the local verification interface is already present and isolating RED to the missing CI and safe-configuration contracts.
- **T4 GREEN/REFACTOR evidence:** The focused foundation contract passes 3/3 after adding a value-free `.env.example` and a least-privilege GitHub Actions workflow with every required command exactly once and in dependency order. `npm.cmd run check` passes all 5 Vitest tests, strict typecheck, zero-warning lint, and the optimized production build; Chromium passes both JavaScript-enabled and disabled E2E paths 2/2.
- **T5 clean local evidence:** From the committed lockfile candidate, `npm.cmd ci` installed 446 packages and reported zero vulnerabilities; `npm.cmd audit --json` independently reported zero vulnerabilities at every severity. Each named command then passed independently: 3 Vitest files with 5 tests, strict TypeScript, zero-warning ESLint, the optimized Next.js build, and 2 Chromium E2E tests. The composed `npm.cmd run check` also passed from the clean dependency state.
- **T5 UX-DNA evidence:** UX-01 and UX-09 are covered by exact-copy tests plus editorial review of the calm development and unavailable-coverage language. UX-05 is covered by the semantic DOM tests and manual 375×812 and 1280×720 browser checks: no horizontal overflow or overlap, the desktop breakpoint resolves to two columns, all content remains readable, browser logs contain no warnings or errors, and keyboard focus produces a visible 3px outline with 4px offset. Measured text contrast ranges from 5.56:1 to 14.63:1 and the focus outline is 6.47:1 against the page; no motion is present. UX-07 passes in the JavaScript-disabled production E2E context. UX-08 passes through the native `#principles` disclosure contract and production E2E navigation. The explicit unavailable-coverage assertion supplies UX-09 evidence.
- **T5 review RED evidence:** Independent read-only review found no Critical issues and two Important contract mismatches. First, `npm.cmd test -- tests/foundation-contract.test.ts` then failed 1/4 on 2026-07-14 because the new empty-variable policy test referenced the intentionally absent `findUnsafeEnvironmentEntries`, proving the existing test could not distinguish a safe empty declaration from a configured value. Second, the official Next.js 16.2.10 contract requires generated `next-env.d.ts` to be ignored and standalone typecheck to run `next typegen` first; a separate RED follows before that configuration changes.
- **T5 type-generation RED evidence:** After the empty-variable policy reached GREEN, the focused foundation contract failed exactly 2/5 on 2026-07-14: `typecheck` was still raw `tsc --noEmit`, and `.gitignore` lacked `/next-env.d.ts`. The other three contract tests passed, isolating RED to the two generated-type lifecycle mismatches confirmed by the official framework documentation.
- **T5 review GREEN/REFACTOR evidence:** The environment contract now permits only empty uppercase declarations and rejects values or invalid names. `npm run typecheck` runs `next typegen && tsc --noEmit`, `.gitignore` owns the generated `next-env.d.ts`, and `git check-ignore` confirms it cannot enter the initial commit. Review hardening also added ordered-heading proof, exact executable CI-step validation with no conditions or allowed failures, and a production-server health probe covering status, raw body, JSON content type, and cache header. The focused unit/contract checks pass 6/6, Chromium passes 3/3, and follow-up read-only review reports zero unresolved Critical or Important issues and a publish-ready verdict.
- **T6 publication and VERIFIED evidence:** The complete 22-file staged snapshot passed `git diff --cached --check`, token/private-key scanning, credential-assignment scanning, and value-free `.env.example` inspection before root commit `c8ac3b4` (`feat: establish development foundation`). Fresh pre-commit `npm.cmd run check` passed 3 files and 7 tests, generated route types, strict TypeScript, zero-warning lint, and the optimized build; `npm.cmd run test:e2e` passed 3/3; `npm.cmd audit --json` reported zero vulnerabilities. The public push created `Aheadboat/voteGPT` with default branch `main`. [GitHub Actions run 29355592841](https://github.com/Aheadboat/voteGPT/actions/runs/29355592841) completed successfully in 59 seconds with `npm ci`, the full non-E2E check, Chromium installation, and all 3 E2E tests. At that checkpoint F1 was VERIFIED but remained not `DONE` pending explicit Human Gate B approval.
- **Final design deviations and tradeoffs:** Next.js's pinned vulnerable transitive PostCSS was overridden only to patched 8.5.10 and verified by build, E2E, audit, and hosted CI. Framework-owned `next-env.d.ts` is generated by `next typegen` and ignored, following current Next.js guidance. Playwright starts Next directly instead of through an npm wrapper so Windows process cleanup is deterministic, and removes only the host's conflicting `NO_COLOR` variable. Visual choices remain F1-local; no reusable design system was inferred.
- **Human Gate B evidence:** User explicitly approved F1 on 2026-07-14 after reviewing delivered behavior, final design and deviations, local and hosted test evidence, UX-DNA evidence, and remaining risks and non-goals. F2 and every later item remain `TODO` pending separate authorization.
- **Closure VERIFIED evidence:** Final-state assertions passed on 2026-07-14 with F1 `DONE`, zero active items, and F2–F14 still `TODO`. Fresh `npm.cmd run check` passed 3 files and 7 tests, route type generation, strict TypeScript, zero-warning lint, and the optimized build; `npm.cmd run test:e2e` passed 3/3; `npm.cmd audit --json` reported zero vulnerabilities.

| Task | Outcome | Expected RED or falsifiable check | Files and interfaces | Depends on | Done |
| --- | --- | --- | --- | --- | --- |
| T1 — Health and harness | Strict toolchain plus deterministic health behavior. | After test configuration exists, `npm.cmd test -- src/app/api/health/route.test.ts` fails because `./route` is missing. | Create `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `vitest.setup.ts`, `src/app/api/health/route.test.ts`, and then `src/app/api/health/route.ts`. `npm run typecheck` generates the ignored framework-owned `next-env.d.ts` before TypeScript validation. Produces the six npm check scripts and exact `GET()` response contract above. | Gate A | Focused route test passes; TypeScript is strict; lockfile and Node 24 constraint are committed inputs. |
| T2 — Honest landing baseline | Server-rendered product promise with explicit unavailable coverage. | `npm.cmd test -- src/app/page.test.tsx` fails because `./page` is missing. | Create `src/app/layout.tsx`, `src/app/page.test.tsx`, `src/app/page.tsx`, and `src/app/globals.css`. Produces the exact heading, status, principles, metadata, and semantic landmarks above, but no disclosure link yet. | T1 | Focused landing test passes with calm future-tense copy and no unsupported civic fact. |
| T3 — Boot and navigation | Production server boots and native navigation works with and without JavaScript. | After building T2, `npm.cmd run test:e2e` fails because the `How voteGPT works` link is absent. | Create `playwright.config.ts` and `e2e/landing.spec.ts`; modify `src/app/page.tsx` and `src/app/globals.css` only to add the `#principles` link and visible focus treatment. Produces Chromium production-server and JavaScript-disabled contracts. | T2 | Playwright reaches `/`, activates the link, reaches `#principles`, and sees its heading in both JavaScript modes. |
| T4 — CI and safe configuration | GitHub workflow mirrors the local contract and no example value can be mistaken for a credential. | `npm.cmd test -- tests/foundation-contract.test.ts` fails because `.github/workflows/ci.yml` and `.env.example` are missing. | Create `tests/foundation-contract.test.ts`, `.github/workflows/ci.yml`, and `.env.example`. The contract parses package scripts, asserts the four CI commands, and permits only comments, blanks, or empty `UPPER_SNAKE_CASE=` entries; F1 contains only a no-variables-required comment. | T3 | Focused contract test passes and the workflow contains every required command exactly once in dependency order. |
| T5 — Local verification and UX review | Reproduce a clean contributor loop and collect DNA evidence before publication. | Falsifiable check: `npm.cmd ci`, all five standard commands, `npm.cmd run check`, and an independent read-only review must pass; 375×812 and 1280×720 checks must show no overflow, obscured content, missing focus, contrast failure, or JavaScript dependency. | Read all F1 files; use the in-app browser for keyboard, responsive, visual, and recovery-scope checks. Only the main agent may apply a separately tested fix. | T4 | Local checks are green, each applicable UX ID has evidence, and review finds no unresolved Critical or Important issue. |
| T6 — Public GitHub and live CI | Publish the verified foundation and prove the hosted workflow. | Preflight observed on 2026-07-13: `gh repo view Aheadboat/voteGPT` cannot resolve, no `origin` exists, and `main` has no commit. Final checks require `visibility=PUBLIC`, the expected `origin`, and a successful Actions conclusion. | Inspect the complete staged diff and credential-like values; create the initial commit; run `gh repo create Aheadboat/voteGPT --public --source . --remote origin --push`; inspect and, if necessary, repair the resulting Actions run without widening F1. Update only `ROADMAP.md` and `README.md` with final evidence and `VERIFIED`/Gate B state. | T5 | Public repository exists at the approved owner/name, `main` is pushed, live CI passes, durable evidence is current, and F1 is ready for Human Gate B but not `DONE`. |

## F2 — Identity and Public Shell [IN PROGRESS (RED)]

- **Outcome:** Public profiles remain browseable while personalized pages require email-link or Google sign-in.
- **Dependencies:** F1.
- **User outcome:** Visitors keep anonymous access to public content; sign-in is requested only when they open the dashboard; signed-in users can sign out or permanently delete their account.
- **Applicable UX DNA IDs:** UX-01, UX-04, UX-05, UX-06, UX-07, UX-08, and UX-09. UX-02 has no displayable civic fact yet; UX-03 has no candidate presentation.
- **Approach:** Pin stable Better Auth with its official Drizzle adapter, use database sessions, Drizzle's PostgreSQL schema and generated SQL migrations, `node-postgres` for deployed PostgreSQL, and PGlite only for deterministic local/test execution. Use Better Auth's magic-link plugin with hashed, atomically consumed tokens, generic SMTP through Nodemailer in production, and an injected fake sender locally/tests. Disable session cookie caching so logout and deletion revocation remain immediate.
- **Access design:** Add one public site header, a custom `/sign-in` page, and a route-local guard on `/dashboard`. Do not add a global proxy: `/`, `/api/health`, and later public profile routes remain anonymous by default. The dashboard rechecks the database session beside protected data.
- **Identity design:** Email links are single-use, hashed at rest, and database-backed. Google requests only `openid email`; Better Auth may link an existing same-email account only when Google confirms the email as verified. Forced/trusted-provider linking and different-email linking stay disabled. Provider credentials, SMTP configuration, Better Auth secret, database URL, session tokens, verification values, and OAuth tokens stay server-side; IP tracking is disabled because F2 has no need to persist approximate location.
- **Deletion design:** An authenticated server action requires the typed confirmation `DELETE`, rechecks a fresh session, invokes Better Auth's hard-delete path, verifies cascading accounts and sessions plus matching verification cleanup, clears the current cookie, and returns an explicit deleted-account state. No soft-delete record or identity history is added.
- **Runtime interfaces:** `GET|POST /api/auth/[...all]` mounts Better Auth's Next.js handler; `/sign-in` offers email link and Google; `/dashboard` redirects anonymous requests to `/sign-in` with a same-origin return target. Configuration names are `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `EMAIL_SERVER`, and `EMAIL_FROM`; `.env.example` keeps values empty.
- **Tests first:** Anonymous public access, protected-dashboard redirect, one-use email-link database session, verified Google database session and safe same-email linking, unverified-Google rejection, logout revocation, deletion cascades, missing/expired/error recovery, and server-only configuration.
- **Parallel lanes:** None proposed. The vertical tasks share Better Auth configuration, session schema, and shell behavior; sequential work is smaller and avoids integration churn.
- **Risks:** Better Auth's magic-link plugin stores plain tokens by default, so F2 must explicitly configure and test hashed storage. OAuth cannot be live-tested without credentials; use a small deterministic provider fixture and keep an optional credentialed smoke test outside required verification. PGlite can hide driver differences; run the same auth contract through `node-postgres` against a PostgreSQL service in hosted CI.
- **Done:** Better Auth and minimal PostgreSQL/Drizzle persistence pass session and authorization tests; local/test email uses a fake; credentials remain server-side; account-deletion foundation exists; applicable UX DNA evidence is recorded.
- **Non-goals:** Saved residence, civic providers, chat, or alerts.

| Task | Outcome | Expected RED or falsifiable check | Files and interfaces | Depends on | Done |
| --- | --- | --- | --- | --- | --- |
| T1 — Email identity slice | A one-use email link creates a revocable database session on the minimal auth schema. | `npm.cmd test -- src/auth.test.ts` fails because the Better Auth handler, schema, migration, magic-link plugin, and fake sender do not exist. | Modify `package.json`, `package-lock.json`, `.env.example`, and `.gitignore`; create `drizzle.config.ts`, generated `drizzle/*`, `src/db/schema.ts`, `src/db/index.ts`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/auth.test.ts`, and `src/app/api/auth/[...all]/route.ts`. Produces Better Auth's handler/client/session interfaces and PostgreSQL migration contract. | Gate A | Focused integration test applies the migration to PGlite, stores only a hash, consumes a captured link once, observes a database session, rejects reuse/expiry, and exposes no secret client value. |
| T2 — Public shell and Google access | Public content stays anonymous while sign-in and dashboard flows expose only the required identity choices. | `npm.cmd test -- src/app/identity-shell.test.tsx` and `npm.cmd run test:e2e -- e2e/identity.spec.ts` fail because the site header, sign-in page, protected dashboard, recovery copy, and Google path are absent. | Modify `src/app/layout.tsx`, `src/app/page.tsx`, and `src/app/globals.css`; create `src/app/identity-shell.test.tsx`, `src/app/sign-in/page.tsx`, `src/app/dashboard/page.tsx`, `src/components/site-header.tsx`, and `e2e/identity.spec.ts`; extend `src/lib/auth.ts` only for Google and verified-email linking. Produces public `/`, custom `/sign-in`, and protected `/dashboard`. | T1 | Anonymous `/` and health remain usable; dashboard validates the server session and redirects safely; verified fake-Google callback creates/reuses the correct account and session; unverified Google and cross-origin return targets fail closed. |
| T3 — Logout and deletion | Users can revoke the current session or permanently remove the minimal account record and every auth child. | `npm.cmd test -- src/account.test.ts` fails because logout/deletion actions and cascade behavior do not exist. | Create `src/account.ts` and `src/account.test.ts`; modify `src/app/dashboard/page.tsx` and `src/lib/auth.ts` only for fresh-session deletion and actions. Produces authenticated `deleteCurrentAccount("DELETE")`, Better Auth sign-out/hard-delete calls, and explicit post-action state. | T2 | Logout invalidates the database session immediately; deletion rejects missing/wrong confirmation, stale sessions, and anonymous calls, then removes user, accounts, sessions, and matching verification records atomically. |
| T4 — Contract and UX verification | F2 is reproducible without live provider credentials and its public/auth boundaries remain accessible and honest. | Falsifiable check: migration consistency, the auth suite against hosted PostgreSQL, `npm.cmd run check`, `npm.cmd run test:e2e`, value-free environment inspection, and 375×812/1280×720 keyboard/visual checks must all pass. | Modify `tests/foundation-contract.test.ts` and `.github/workflows/ci.yml` to include `drizzle-kit check`, a PostgreSQL service, and migration application before the existing checks; inspect all F2 files and rendered states. No feature expansion. | T3 | Local PGlite and hosted `node-postgres` contracts are green; every applicable UX ID maps to automated or recorded manual evidence; no skipped test, configured secret, public-route regression, or unresolved Critical/Important issue remains. |

- **Human Gate A evidence:** User explicitly approved the Better Auth design, tests-first task graph, sequential execution, risks, dependencies, and non-goals on 2026-07-14.
- **T1 RED evidence:** `npm.cmd test -- src/auth.test.ts` failed on 2026-07-14 because the exact Better Auth, Drizzle, PostgreSQL, mail, and PGlite dependencies were absent; Vitest and the Node test environment loaded successfully, so the failure is attributable to the missing approved identity stack.

## F3 — Residence Resolution Preview [TODO]

- **Outcome:** Signed-in user enters an address or grants one-shot location and sees matched political divisions without saving raw input.
- **Dependencies:** F2.
- **Tests first:** Known address/coordinates, malformed input, ambiguity, denied geolocation, no match, upstream timeout, authorized server-to-provider transport, and absence of location from client-visible URLs, persistence, analytics, logs, or research queries.
- **Done:** `POST /api/v1/location/resolve` returns a short-lived signed resolution; manual address is primary; device flow warns current location may not be voting residence; raw input is discarded after resolution and not persisted.
- **Non-goals:** Saved home, officials, elections, map, or reverse-geocoded background tracking.

## F4 — Consented Saved Residence [TODO]

- **Outcome:** User explicitly saves one home for personalization and can delete it.
- **Dependencies:** F3.
- **Tests first:** Consent required, authorized decrypt only, separately queryable divisions, cascading deletion, and encryption-key rotation.
- **Done:** Versioned AES-256-GCM encryption, one-home constraint, consent version/time, and account controls pass; exact location never reaches logs, URLs, analytics, search, or LLM inputs; GPS is never stored.
- **Non-goals:** Multiple homes, household sharing, or location history.

## F5 — Federal Officials [TODO]

- **Outcome:** User sees current House and Senate officials with provenance and freshness.
- **Dependencies:** F3.
- **Tests first:** Golden district fixture, senators, at-large seat, vacancy, stale/incomplete provider data, and mandatory source/retrieval time.
- **Done:** Minimal `Person`, `Office`, `Term`, `SourceRef`, and `Freshness` records; Congress.gov adapter; public profiles; federal `In office` dashboard; graceful cached/error state when provider fails.
- **Non-goals:** State/local officials, elections, candidate comparison, or AI.

## F6 — State Officials and Government-Level Navigation [TODO]

- **Outcome:** Accessible `Local | State | Federal` tabs and sourced state legislative officials.
- **Dependencies:** F5.
- **Tests first:** Keyboard/focus/deep-link/screen-reader tab behavior, multi-member body, vacancy, current-official presentation, and unavailable-local-coverage state.
- **Done:** OpenStates adapter, `In office | Elections` mode, office-category chips, and verified-only local panel pass; federal/state coverage promise is test-backed; local gaps are explicit.
- **Non-goals:** Claim of complete nationwide local coverage or candidate research.

## G1 — Candidate-Data Vendor Proof of Concept [TODO]

- **Outcome:** Evidence-backed go/no-go decision before national candidate work.
- **Dependencies:** F6 and official comparison samples.
- **Tests first:** Evaluation harness covers 100 official federal/state/local records including primary/general, nonpartisan, write-in, cross-filed, withdrawn, and disqualified cases.
- **Done:** Every vendor record has provenance, zero false `Confirmed on ballot` labels, at least 95% recall in tested scope, acceptable redisplay/caching/derived-use/correction/deletion/alert rights, and separate approval for production quote; otherwise vendor remains disabled.
- **Non-goals:** Lowering verification rules to make vendor pass or committing to production spend without approval.

## F7 — Elections and Deterministic Candidate Validity [TODO]

- **Outcome:** Upcoming contests and candidates display exact source-backed legal status.
- **Dependencies:** G1 completed with approved vendor or documented public-source fallback.
- **Tests first:** FEC filing not ballot qualification; declared/filed/accepted/pending/certified/withdrawn/withdrawn-still-on-ballot/removed/disqualified/advanced/won/lost; conflicts; special elections; stages; ballot lines; write-ins; cross-filing.
- **Done:** Election, stage, contest, candidacy, and append-only evidence records exist; intent/filing/ballot/outcome/finance tracks stay separate; every status shows source and `verified_at`; LLM cannot change status.
- **Non-goals:** AI validity decisions, inferred winners, or unsupported historical completeness.

## F8 — Neutral Candidate Comparison [TODO]

- **Outcome:** Fast comparison without assuming Democrat versus Republican.
- **Dependencies:** F7.
- **Tests first:** Equal two-candidate layout; all-candidate visibility and any-two selection; nonpartisan, independent, multi-member, uncontested, and ticket cases; equal issue order/length/evidence labels; no preselection; accessible mobile layout.
- **Done:** Structured sourced comparison works without AI and treats every verified candidate equally.
- **Non-goals:** Rankings, endorsements, candidate matching, engagement sorting, or recommendations.

## G2 — Research Rights and Editorial Gate [TODO]

- **Outcome:** Broad research cannot launch without legal data rights and editorial control.
- **Dependencies:** F8.
- **Tests first:** Gate checks storage/derived-use rights, source-selection/correction policy, assigned editor, and sensitive-claim review states.
- **Done:** All checks documented and feature flag may enable research; failure keeps research disabled.
- **Non-goals:** Automated sensitive-claim publication or unrestricted web crawling.

## F9 — On-Demand Contest Research [TODO]

- **Outcome:** First request for any verified candidate produces one equal-depth cached snapshot for every candidate in that contest.
- **Dependencies:** G2 passed.
- **Tests first:** Validation before search, unknown-person block, concurrent dedupe, evidence-ID validation, uncited-claim rejection, 72-hour staleness, status invalidation, atomic race publication, high-risk review, SSRF/redirect/prompt-injection/size controls.
- **Done:** Ordinary supported claims may auto-publish; sensitive claims require human review; raw pages expire after 24 hours; reports show sources, freshness, and model/prompt version.
- **Non-goals:** Per-popularity refresh, private-person dossiers, controversy scores, or mixed-age candidate snapshots.

## F10 — Grounded Contextual Chat [TODO]

- **Outcome:** Profile or comparison opens cited chat over published evidence.
- **Dependencies:** F9.
- **Tests first:** No precise location in request; every factual answer cites supplied evidence; unsupported/stale response fails honestly; voting-choice question returns neutral comparison; provider failure leaves facts usable.
- **Done:** App-owned generation/stream boundary, deterministic fake, first hosted provider, canonical conversation history, and 30-day deletion pass; chat never performs fresh candidate-validity decisions.
- **Non-goals:** Provider-native web search, recommendations, or ungrounded general political answers.

## F11 — OpenAI, Anthropic, and Private-Local Portability [TODO]

- **Outcome:** Deployment config selects OpenAI, Anthropic, or backend-reachable OpenAI-compatible private model.
- **Dependencies:** F10.
- **Tests first:** Shared streaming/structured/citation/cancellation/failure contract, malformed-output fail-closed behavior, no invented evidence IDs/URLs, zero cloud calls from `local-private`, and summary-only invalidation on provider change.
- **Done:** All three paths satisfy contract; keys, model IDs, and base URLs stay server-side.
- **Non-goals:** End-user keys, user-laptop tunnel, mid-stream provider switching, or provider-specific UI.

## F12 — User-Approved Account Memory [TODO]

- **Outcome:** Assistant proposes useful typed memory that user must review before saving.
- **Dependencies:** F10 and F11 verification complete.
- **Tests first:** Allowlist enforcement, rejection of party support/vote intent/ideology/sentiment/inferred demographics/persuasion data, bookmark neutrality, and complete export/delete.
- **Done:** Only followed issue/office, explanation style, accessibility/language preference, bookmark, and alert preference may persist after explicit approval.
- **Non-goals:** Automatic chat summaries, hidden embeddings, candidate-support inference, or ranking personalization.

## F13 — Verified Email Alerts [TODO]

- **Outcome:** Opted-in users receive sourced ballot, deadline, and election reminders.
- **Dependencies:** F4, F7, and F12.
- **Tests first:** Event dedupe, idempotent retry, stale/conflicting/unverified suppression, local-time seven-day/one-day reminders, unsubscribe, and account deletion.
- **Done:** Email-only alerts include source and last-checked time; delivery audit and user controls pass.
- **Non-goals:** SMS, browser push, marketing email, or inferred-interest alerts.

## F14 — Launch Hardening [TODO]

- **Outcome:** Public release matches tested coverage, privacy, accessibility, reliability, and editorial claims.
- **Dependencies:** F1–F13 complete or explicitly removed from launch scope.
- **Tests first:** Privacy/account-deletion audit, WCAG 2.2 AA checks, outage/stale-cache drills, correction workflow, rate/cost caps, backup/restore, deployment health, and coverage-matrix reconciliation.
- **Done:** Automated and manual launch checklist passes on portable container deployment with PostgreSQL and worker process; public claims match durable evidence.
- **Non-goals:** Adding new product features during hardening or hiding failed launch criteria.

## Durable non-goals

- Public developer API.
- Political ads or paid candidate placement.
- Ideological rankings, candidate matching, or voting recommendations.
- SMS, browser push, end-user API keys, or user-laptop LLM bridge.
- Complete nationwide local coverage without a verified source and tested coverage matrix.
- Extra roadmap/ADR/project-management artifacts until these files become insufficient in demonstrated use.
