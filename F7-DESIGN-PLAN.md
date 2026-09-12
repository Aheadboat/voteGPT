# F7 — Elections and Deterministic Candidate Validity

Human Gate A candidate, 2026-09-12. Design approval is pending. No F7 feature RED tests, production implementation, source corpus, or production data approval exists.

> For agentic workers: after explicit Human Gate A approval, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task by task. Read this plan and the active F7 record in `ROADMAP.md`. Every feature-design dispatch must include: `Required skills: invoke ponytail full, then caveman full, before exploration.`

**Goal:** Upcoming contests and candidates display exact source-backed status, with append-only evidence and independent intent, filing, ballot, outcome, and finance tracks.

**Architecture:** Reviewed normalized official records enter one transactional evidence ledger. Deterministic projection supplies two public pages and the existing dashboard Elections view. Page reads make no provider or AI calls.

**Stack:** Existing Next.js/React, TypeScript, Drizzle, PostgreSQL/PGlite, Vitest and Playwright. No new dependency, national crawler, generic workflow engine, public write API, or worker is needed.

**Authority:** `ROADMAP.md` owns scope and gates. Activation [PR #30](https://github.com/Aheadboat/voteGPT/pull/30) merged as `bfd1fd17a37f74990d62f2553dc767d5369cbf5f`, integrated into `codex/f7-elections-candidate-validity` in `C:/Users/Aheadboat/Desktop/voteGPT/.worktrees/f7-elections-candidate-validity`. Original dependency base: `8bf9efb37a1e07d40aaea7a9caca12ab327c942a`. G1 is DONE; its NO-GO vendor decision and official-source fallback remain binding. Admission is N/A; F7 alone is active.

## Decisions presented at Human Gate A

Approve or amend this engineering design, the task graph below, reviewed operator imports, and a proposed 24-hour current-verification window. The proposed first corpus is California's November 3, 2026 general-election federal/state candidate contests supported by the official list, subject to source-specific rights approval and full row review. This is bounded initial coverage, not a claim of national completeness or permission to remove roadmap scope.

Gate A authorizes engineering and permitted source diligence only. It does not approve presently unresolved source rights, real-data publication, vendor actions, or Gate B. Before real source material is retained or imported, the coordinator must present the source-specific evidence and obtain any required rights/access decision. Before publication, the exact normalized package, coverage inventory, reviewer receipt, and refresh owner must be approved. If these prerequisites cannot be met, F7 remains blocked at that task; an empty shell or synthetic fixture cannot satisfy completion.

## Existing boundaries

- `src/app/dashboard/page.tsx` already normalizes government level/mode and returns an Elections placeholder. Replace that branch without changing In office behavior.
- `src/components/government-navigation.tsx` already supplies native links and keyboard tabs. Broaden accessible labels to Government information and Information view; preserve focus and keyboard behavior.
- `src/lib/government-navigation.ts` has no Elections category. Keep categories absent; the index groups records by sourced election/stage/office labels without adding a category framework.
- `getSavedResidenceDivisions` returns public division identifiers without decrypting the saved residence. Elections consumes only those identifiers; existing auth, encryption, residence, and official-provider implementations stay unchanged.
- The schema contains identity/residence and mutable official caches. F7 adds its own ledger, not a new use of those caches. G1's evaluation module and synthetic sample are not production validity sources.
- Public federal profiles demonstrate anonymous server rendering. Add `/elections` and `/elections/contests/[contestId]`, with a discoverable home-page link. No separate candidate profile or comparison page in F7.

## Official-source evidence and limits

The following pages were checked read-only on 2026-09-12. They inform source mappings; they do not constitute approval of a production corpus.

| Evidence | Verified fact and bounded use |
| --- | --- |
| [FEC ballot access](https://www.fec.gov/help-candidates-and-committees/registering-candidate/gaining-ballot-access/) | State laws/procedures govern appearance on ballots. Keep federal finance registration separate from election filing and ballot qualification. |
| [Texas candidacy filing guidance](https://www.sos.texas.gov/elections/laws/candidacy.shtml) | Its filing review, eligibility, withdrawal, and ballot-effect rules demonstrate distinct concepts. Do not apply Texas rules to other jurisdictions; admit only reviewed source-specific mappings. |
| [EAC results, canvass and certification](https://www.eac.gov/election-officials/election-results-canvass-and-certification) | Reported results and final certified results differ. F7 requires a direct operative official outcome designation; it does not calculate winners or losses from totals. |
| [California general-election page](https://www.sos.ca.gov/elections/upcoming-elections/general-election-november-3-2026) and [linked certified list](https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf) | A concrete upcoming official source exists. The PDF exceeded the discovery reader's size limit; no rows, district inventory, or completeness were verified. |
| [California certification release](https://www.sos.ca.gov/administration/news-releases-and-advisories/2026-news-releases-and-advisories/california-secretary-state-shirley-n-weber-phd-certifies-candidate-list-november-3-2026-general-election) and [primary Statement of Vote](https://www.sos.ca.gov/elections/prior-elections/statewide-election-results/primary-election-june-2-2026/statement-vote) | Source review found differing Senate-parity descriptions. Do not infer coverage from press-release prose. Resolve the operative district/contest inventory before admission. Local-office coverage requires county sources. |
| [California use conditions](https://www.ca.gov/legal/conditions-of-use/) and [Copyright Office facts/expression guidance](https://www.copyright.gov/help/faq/faq-protect.html) | The portal's general ownership statement includes exceptions and department-specific terms. These pages do not clear the proposed SOS capture, redisplay, or retention contract. Source-specific approval remains open. |

Initial production admission must identify each candidate contest, every candidacy/line within it, the exact election/stage/district/term, and unavailable scope. Judicial retention questions or any other unmapped contest form must be named for a coordinator scope decision, not silently treated as candidate races or omitted under a completeness claim. No candidate-contact list, residence address, tax return, biography, photograph, campaign statement, or raw PDF becomes a stored application artifact.

## Records and deterministic interpretation

Use explicit relational identity and typed evidence. No national person registry or fuzzy identity matching.

| Table | Responsibility |
| --- | --- |
| `election` | Stable application ID and issuer-scoped official election key. |
| `election_stage` | Election FK and scoped stage key; regular/special belongs to the election, while primary/general/runoff/other is sourced stage metadata. |
| `election_contest` | Stage FK and source contest key. Office, district, term, seats, and contest form are sourced metadata. |
| `election_candidacy` | Contest FK and reviewed source identity key. Name alone cannot merge people or stages. |
| `election_ballot_line` | Candidacy FK and source nomination/ballot-line key. Cross-filing remains explicit. |
| `election_import_batch` | Package digest, schema/policy version, review receipt reference, and accepted timestamp. |
| `election_evidence` | Append-only typed metadata snapshots and status assertions, exactly one subject FK, provenance, and import FK. |
| `election_evidence_supersession` | Explicit replacement/correction links between assertions of the same subject and claim scope, with a reviewed reason. |

Keep metadata in one typed snapshot per subject rather than a generic field/event engine. Metadata includes public labels, exact division identifiers, timezone and election date, coverage inventory, and explicit successor/advancement destination references where supported. Critical missing/conflicting identity, stage, office, or jurisdiction blocks publication of that verified record. A verified identity with disputed status stays visible with a conflict explanation.

Identity uniqueness includes an explicit reviewed revision key when correcting a previously admitted mapping. The original application ID, official key and parent chain stay intact; the new revision receives a new application ID. Retirement evidence hides the erroneous identity from current verified listings and preserves an audit link, without transferring candidacy status to the replacement.

Each assertion records source URL/type/authority, source label and original official term, document digest and exact locator, `retrieved_at`, reviewer `verified_at`, nullable `effective_at` plus its real precision/unknown reason, and `current_until`. Never invent midnight precision for a date-only official fact. Validate chronology, bounded strings/arrays, schema keys, source authority, subject identity, and nonfuture review times at import and persisted-data read boundaries.

Effective applicability is separate from review freshness. An instant-precision operative interval is start-inclusive/end-exclusive. Future-effective evidence remains visible as scheduled evidence and cannot change the current projection or retire a predecessor early. For date-only evidence, use only a reviewed source-specific date/timezone rule; without a supported start-of-day meaning, withhold a current claim during that date and admit it only after that local civil date has ended. A date-only expiry without a supported end-of-day meaning stops current display at the start of the expiry date. Preserve date precision in display; these conservative applicability bounds are not invented legal timestamps. Unknown effective time is historical/unknown unless the approved mapping explicitly supports an official current snapshot as of the recorded human verification; that basis supports only the verification window, not a guessed earlier effective date, and cannot override a known future effect. Missing timezone/rule leaves applicability unknown.

Supersession becomes operative only when its replacement has applicable, source-supported effect. Once a valid correction has become operative, stale/expired replacement evidence yields stale/unknown current status; it must not resurrect the retired predecessor. Corrections to identity create a new immutable identity revision and explicit retirement evidence for the erroneous record, without copying status to another subject. T1 tests exact time boundaries, future replacements, same-day/date-only/unknown applicability, supported snapshot bases, and no predecessor resurrection.

| Track | Supported assertions | Restrictions |
| --- | --- | --- |
| Intent | declared, withdrawn | Direct admitted official evidence only; neither determines ballot appearance. |
| Election filing | filed, pending, accepted | Receipt/acceptance cannot certify ballot qualification. |
| Ballot | qualification pending/certified/removed/disqualified; separate appearance listed-for-ballot/printed/write-in-eligible/not-on-ballot | Each assertion requires its own source mapping. Certification does not prove physical printing. No effect is inherited across party lines. |
| Outcome | advanced, won, lost | Explicit operative official disposition only. No arithmetic, candidate-count inference, or eligibility inherited from another stage. |
| Finance | filed | FEC and admitted campaign-finance records support this track only. |

Unknown, conflict, and stale are verification states, not invented legal statuses. Preserve original official terms alongside normalized labels. `withdrawn_still_on_ballot` is a display label requiring direct current authority evidence of continued appearance after withdrawal. A new withdrawal plus an older listing instead displays the separately dated facts and uncertainty. Disqualification likewise does not prove removal; write-in eligibility does not imply a printed name. Advancement never creates the next-stage candidacy.

Authority is fixed by reviewed jurisdiction, stage, source role, and claim kind; a `.gov` suffix alone is insufficient. Follow the roadmap's stage-specific source precedence for presentation while retaining admissible conflicts. FEC cannot supply ballot claims. Vendor/campaign/reporting imports remain disabled. A court order needs an explicit operative-order mapping for its exact scope, not a general court-text parser.

Unsuperseded contradictory admissible assertions produce conflict with both sources visible. Neither timestamp nor fetch order resolves disagreement. Identical assertions corroborate. Reviewed corrections may explicitly supersede the same subject/claim scope; retain both records and reject cycles, cross-scope links, dangling references, or unauthorized supersession. Disappearance from a source never proves withdrawal, removal, loss, or absence of an election.

## Freshness, import, and publication

The proposed application freshness ceiling is 24 hours after a human verification, or an earlier source/policy expiration. This is a product rule requiring Gate A approval, not an official-source service guarantee. At expiry, retain visibly dated historical evidence but withhold a current confirmed qualification/outcome label. A status remains historical evidence regardless of polling success. Unknown states receive no fabricated `verified_at`.

No automatic worker is added. A named operator and backup must perform and record the agreed rechecks before production release. New human review can append renewed evidence; fetching identical bytes, reimporting a package, or viewing a page cannot renew verification time. Policy withdrawal/expiry must make affected assertions unavailable for current verified display without deleting their permitted audit history.

`scripts/import-election-evidence.mts` accepts one normalized election package from an explicit local path. It never downloads source documents. No page-render fetch, arbitrary URL resolver, redirect handler, source crawler, or new provider credential is needed. Approved source capture and row review happen outside the importer, using a permitted method; retain only permitted normalized facts, necessary original terms, locators, and digest references. A document digest records the reviewed capture; it does not independently prove official truth.

The application-owned source policy fixes exact HTTPS hosts/path scopes, authorities, claim mappings, election/contest scope, access and retention approval references/expiry. A package cannot supply or override those permissions. Reject credential-bearing URLs, unapproved/query-bearing URLs, location parameters, unknown fields, raw content, contacts, addresses, and unsupported schemes. Source URLs are validated display/provenance links, not fetch instructions.

Retention admission must be compatible with indefinite retention of the precise normalized facts, necessary original terms, locators, and review receipts in both the immutable ledger and repository history. Expiring permission for current redisplay can be handled by suppression only when continued audit/repository retention remains permitted. Finite-retention, erasure-on-termination, removal-required, or unknown retention terms fail admission before capture, import, or commit and return to the coordinator for a plan/source decision. F7 does not add a purge subsystem or pretend suppression removes historical copies.

An independently reviewed release receipt binds the exact normalized package SHA-256, source-policy version, source documents/locators, complete admitted-contest inventory, reviewer identity, verification times, and approval reference. The first receipt and package enter the reviewed feature diff as `data/elections/ca-2026-general.approval.json` and `data/elections/ca-2026-general.reviewed.json`. The production source module loads only explicitly admitted release receipts from protected, reviewed deployment artifacts. The CLI accepts a receipt ID, never an incoming approval file or a self-declared approval boolean. New daily receipts require the same independent review and protected release-artifact update. This is a trusted-operator review process, not cryptographic proof against a malicious database administrator. Do not claim automated legal/source verification. The repository checks the trusted receipt, package digest and admitted policy together; a package cannot grant itself permission.

Dry-run validates without writes. Apply writes identities, assertions, correction links, and batch receipt atomically. Default bounds: one election/package, 2 MiB normalized JSON, 1,000 candidacies, 10,000 assertions, and 20 document references. Reject the entire package on overflow, missing reviewed candidates/lines, invalid identity, unsupported source, digest/receipt mismatch, or broken correction graph. Do not truncate a roster. If the fully reviewed first corpus exceeds these bounds, return to the coordinator for an explicit plan amendment before raising them or splitting a completeness boundary.

Production rejects synthetic packages; test fixtures cannot be promoted through an environment flag. T5 demonstrates the real approved package only in a disposable validation database before Gate B. Applying data to a deployed production database is a separate explicit release action, not implied by this Gate A candidate or a passing test.

## Persistence and interfaces

Migration `drizzle/0005_election_evidence.sql` plus its generated snapshot/journal and `src/db/schema.ts` implement the tables. Restrictive FKs and database checks protect relationships, required provenance, exactly one subject, and unique digests. Identity IDs, official source keys, parent FKs and import receipts are immutable after insertion; no reparent/update/delete/truncate can reattribute existing assertions. Corrections use explicit new identity revisions and retirement evidence instead. Triggers reject identity/import/evidence/supersession UPDATE, DELETE, and TRUNCATE, including cascaded attempts. Ordinary application SQL cannot erase or reattribute history; a database administrator remains a trusted boundary.

Validate complete references/authority/cycles inside the transaction. Serialize imports by locking the one election identity row; concurrent distinct assertions survive as evidence, with conflict visible. The same package digest is an idempotent no-op, including timestamps. Read graph data in one read-only repeatable-read transaction so metadata and status cannot come from different import generations. Decode persisted JSON through the same trust checks before producing a view. No current official cache or residence migration changes.

Freeze these concrete seams in F7-T1; DTO/type definitions belong to `src/lib/elections.ts`. A `ValidatedPackage` is returned only by validation; the repository accepts unknown input and revalidates trust-sensitive values against application-owned policy and approved receipts inside apply rather than treating a TypeScript type as authority. Policy, trusted receipts, and clock are injected by the production source module, not the package or public request; tests supply isolated fixtures.

```ts
validateElectionPackage(input: unknown, policy: ElectionSourcePolicy, now: Date): ValidatedPackage | PackageRejection;
projectContest(graph: ElectionGraph, now: Date): ContestView | UnverifiedContest;
electionScopeFromDivisions(divisions: readonly SavedResidenceDivision[], level: GovernmentLevel): ElectionScopeResult;
createElectionRepository(database, { policy, approvedReceipts, now }): {
  importReviewedPackage(input: unknown, receiptId: string): Promise<ImportResult>;
  readContest(id: string): Promise<ElectionGraph | null>;
  readUpcoming(scope: ElectionReadScope, now: Date): Promise<ElectionGraph[]>;
};
createElectionService({ repository, now }): {
  getContest(id: string): Promise<ContestResult>;
  getUpcoming(scope: ElectionReadScope): Promise<ElectionIndexResult>;
};
```

`EvidenceState<T>` is verified with value/evidence/`verified_at`, conflict with all incompatible sourced assertions, stale with dated previous assertions, or unknown with nullable last-check time. `ElectionReadScope` contains an explicit public jurisdiction/level or validated public division IDs, never a user ID, address, GPS, ciphertext, or provider URL. Missing/invalid/unsupported scope and storage failure are typed results. No public developer API is added.

## User experience

The public index groups upcoming contests by sourced election/stage with coverage limits adjacent. Contest detail presents equal candidate rows, independent tracks, ballot lines, original official terms, source links, and verification times. Use deterministic date/office ordering for contests and name/explicit-ID ordering for candidates. No party, engagement, finance amount, or perceived viability affects space, order, controls, or prominence. No candidate score, prediction, endorsement, recommendation, or preselection exists.

For index inclusion, compare the source-stated election civil date with today's civil date in its reviewed jurisdiction timezone: retain future dates and the election date itself; exclude past dates from the upcoming index while keeping direct historical detail available. This is a browse filter, not a statement that polls remain open. Unknown/conflicting date or timezone cannot establish upcoming inclusion; show the scoped unavailable explanation. T1/T4 test local midnight, differing UTC dates, DST, and missing-date/timezone boundaries.

Lead with contest facts and current verification state; native `details` reveals evidence history and line details. Conflict warnings remain visible when disclosure is closed. History is bounded/paginated without hiding conflicting current assertions. Define stable invalid-ID/not-found and missing-database/unavailable states; escape all source text. Public reads are dynamic and uncached so expired verification cannot survive as current HTML. They work anonymously and without JavaScript or AI configuration.

Dashboard Elections uses only exact supported division schemes/IDs from `getSavedResidenceDivisions`. Missing residence offers the existing save flow and public browse link. Unknown local boundaries or incomplete divisions explain unavailable/partial coverage without suggesting a district from city, ZIP, county, or a name. Do not decrypt residence, call official/location providers, or put personalized division IDs into public links/telemetry. Public links use contest IDs, not a residence query.

Preserve In office behavior, tab semantics, native links, manual activation, visible focus, and reduced motion. Home copy links to browsing and describes actual bounded availability. Office labels come from admitted records; unsupported Elections categories remain absent.

## Tests-first task graph

F7-D1 code/interface discovery, F7-D2 primary-source diligence, and coordinator UI/integration review are complete read-only. Their falsifiable check is that every roadmap criterion maps below and no production row is claimed from an unread source. Implementation tasks remain unstarted.

For each T1–T6 implementation slice: write the named smallest behavioral test; run and confirm its expected missing behavior; coordinator records RED in ROADMAP; write minimum production code; rerun focused checks; refactor only green code; return exact evidence and diff for independent review. No skipped/quarantined tests or arbitrary coverage target.

| Task / outcome | Expected RED and concrete assertions | Allowed files / interfaces | Depends on / focused checks / done criteria |
| --- | --- | --- | --- |
| F7-T1 — Interpret a sourced contest without inventing status | FEC-only and accepted election filing leave ballot unknown; withdrawal plus old listing has no continued-ballot label; conflicting assertions yield conflict; a primary outcome leaves general-stage qualification unknown; one party line never qualifies another; future supersession erases current evidence early or expired replacement resurrects its predecessor. Cover every required status, special election, stage, ballot line, write-in and cross-filing case. | New `src/lib/elections.ts`, `src/lib/elections.test.ts`, `tests/fixtures/elections/domain.ts`; fixed types/DTOs and projector above. | Gate A. `npm.cmd test -- src/lib/elections.test.ts`. All cases, malformed input, exact-boundary/date-only/unknown/snapshot applicability, identities, source roles, supersession, stale states and permutation-invariant projection pass. Fixtures explicitly synthetic. |
| F7-T2 — Preserve corrections and read one coherent contest | Raw update/delete/truncate or parent cascade destroys evidence; raw SQL/import reparenting or source-key mutation changes an assertion's identity; invalid/cyclic supersession passes; failure leaves partial batch; replay renews time; concurrent read mixes versions. | New `src/lib/election-repository.ts`, its test, `integration/election-evidence.test.ts`; schema, migration 0005 and generated migration metadata. Repository seam only; no other data-domain edits. | T1. `npm.cmd test -- src/lib/election-repository.test.ts`; `npm.cmd run test:postgres -- integration/election-evidence.test.ts`; `npm.cmd run db:check`. PGlite/PostgreSQL rollback, identity/receipt/evidence immutability, constraints, idempotency, lock/concurrency and consistent-read proof pass. |
| F7-T3 — Admit only reviewed normalized official evidence | Synthetic/unknown-source/self-approved package reaches apply; receipt digest/policy mismatch accepted; finite-retention/removal-required/unknown retention terms pass; extra PII/raw fields survive; incomplete roster partially commits; dry-run writes; repeated package changes verified_at. | New `src/lib/election-source-policy.ts`, `src/lib/election-import.ts`, their tests, `scripts/import-election-evidence.mts`, `tests/election-import-command.test.ts`, small import fixtures. Source policy sole owner here. | T1; apply integrates T2. `npm.cmd test -- src/lib/election-source-policy.test.ts src/lib/election-import.test.ts tests/election-import-command.test.ts`. Typed safe rejections, zero source fetches, trusted receipt boundary, retention compatibility, expiry and atomic apply pass. No credential or public write route. |
| F7-T4 — Browse equal source-backed contests publicly and from saved divisions | Public routes absent/auth-gated; a status lacks its source/time; stale/conflict hidden; rows differ by party; exact residence/provider calls enter Elections; invalid scope implies complete coverage. | New `src/lib/election-service.ts`/test, `src/components/elections.tsx`, CSS/test, both public routes/tests; modify dashboard/tests, navigation accessible labels/tests, home/tests. Use T1 view DTOs; existing residence/official implementations remain read-only. | T1 DTO; repository service integration after T2. `npm.cmd test -- src/lib/election-service.test.ts src/components/elections.test.tsx src/app/elections src/app/dashboard/page.test.tsx src/components/government-navigation.test.tsx src/app/page.test.tsx src/app/identity-shell.test.tsx`. All read/recovery/privacy/anonymous/no-AI/native-link behavior passes. |
| F7-T5 — Demonstrate the first real reviewed corpus | Unread/omitted candidacy or line, wrong district inventory, unsupported mapping, expiry, absent rights/receipt, or finite/removal-required repository retention makes corpus admission fail. Negative controls must actually alter one condition. | After source-specific decision: `data/elections/ca-2026-general.reviewed.json`, `data/elections/ca-2026-general.approval.json`, source-policy entry, `tests/election-corpus.test.ts`. No raw PDF/contact artifact. | Source rights/access decision; T2/T3; source-policy writes serialized after T3. `npm.cmd test -- tests/election-corpus.test.ts`, dry-run and disposable import/read proof. Independent every-row/complete-contest audit, admitted scope, real-source provenance, indefinite ledger/repository retention approval, operator/backup and freshness procedure recorded. No production apply in this task. Failure blocks F7 completion rather than shrinking scope. |
| F7-T6 — Verify the integrated journey and gate packet | Browser has old placeholder, inaccessible evidence/focus, stale-as-current state, synthetic-production leak, or unsupported-local completeness. Existing journey regressions remain detectable. | New `e2e/elections.spec.ts`; modify `e2e/government-navigation.spec.ts` only for obsolete Elections expectations and F7 journeys, isolated `e2e/seed-session.mjs` support; `PROJECT-MAP.md`, `TEMPORARY.md` as applicable. Coordinator alone updates ROADMAP/README/foundation guard and gate evidence. | T2–T5. Focused suites, `npm.cmd run check`, `npm.cmd run db:check`, `npm.cmd run test:postgres`, `npm.cmd run test:e2e`, `git diff --check`. Hosted disposable PostgreSQL/Chromium proof and manual checks below; independent review has no unresolved Critical/Important finding. Feature PR CI/review and Gate B remain required before merge. |

Parallel lanes begin only after T1 contracts settle: T2 owns schema/migration/repository; T3 owns policy/import/CLI; T4 owns view components/routes and service. T4 can test its DTO presentation before T2 finishes, but service integration waits for T2. No production fake repository or placeholder adapter is added. The feature lead exclusively owns shared `elections.ts` changes and serializes interface changes. T5 alone owns real-package/source-policy integration after T3. T6 follows integration. No agent edits another worktree or coordinator-owned file.

The coordinator records RED, independently reruns returned tests, reviews diffs, owns authoritative records/PRs/CI/gates/merges, and does not implement feature production code. The feature lead owns only approved F7 production/test/map surfaces. Shared CI, unrelated generated artifacts, existing G1 sources, the parent roadmap board, and every later item stay outside these lanes.

## UX evidence and completion conditions

| DNA | Required evidence |
| --- | --- |
| UX-01 | Neutral factual copy assertions; no urgency, persuasion, or preference-driven display. |
| UX-02 | Each asserted status, original term, metadata date, and history entry has adjacent source and real verification time; unknown times remain unknown. |
| UX-03 | Equal candidate structure, controls, missing-data language and ordering policy, including independent, nonpartisan, write-in and cross-filed cases. |
| UX-04 | Address/GPS sentinel tests in URLs/logs/telemetry/source packages; zero decryption/location-provider/official-provider calls from Elections; exact division matching only. |
| UX-05 | Semantics plus keyboard and screen-reader checks, focus visibility, contrast, reduced motion, no-JavaScript navigation, and recorded 375px/1280px visual review. |
| UX-06 | Loading/navigation, empty admitted inventory, no residence, unsupported/partial coverage, unavailable store, malformed persisted record, invalid ID, conflict and stale states with safe next actions. |
| UX-07 | Public index/detail and deterministic statuses work with no AI configuration/network calls. No dossier path for unknown people. |
| UX-08 | Contest facts first, native disclosure for supporting history, current conflicts never hidden, minimal choices. |
| UX-09 | Exact admitted/excluded scope visible; no source result never means no election/candidates; real corpus required and synthetic fixtures never publication evidence. |

Use provisioned hosted E2E databases. Preserve `E2E database requires explicit destructive opt-in.` locally; do not bypass it. Run real PostgreSQL concurrency/immutability proof in CI. Update PROJECT-MAP for new routes/import surfaces and require TEMPORARY has no open entries before VERIFIED and through Gate B.

Gate B presents delivered behavior, final design/deviations, all task/UX/source/rights evidence, manual checks, real-corpus validation, remaining limits, successful feature CI, independent review, and GitHub mergeability. Approval authorizes feature merge only. Coordinator then verifies main, refreshes CodeGraph, merges the ROADMAP/README-only closeout PR with CI, and confirms DONE on main. No automatic F8 activation.

## Tradeoffs and remaining risks

- Reviewed imports impose recurring human work and may expire before recheck; the application then shows stale/unverified data. Operator ownership and source rights remain release prerequisites.
- Source-specific vocabulary, operative corrections, and identity review can be wrong. Record original terms, precise scope, independent row review, and visible conflicts; do not substitute AI judgment.
- An append-only ledger costs more storage than a cache. It preserves the required audit history; no generic event bus, materialized-cache layer, or retention automation is added.
- Reject vendor enablement, national crawling, G1 synthetic truth, a single lifecycle enum, timestamp-based conflict resolution, inferred outcomes, inherited stage eligibility, fuzzy identity, and a generic admin/workflow system.
- Non-goals remain F8 comparison, dossiers/broad research, AI status decisions, inferred winners, campaigns/vendor access, unsupported historical/nationwide local completeness, new residence/provider behavior, production deployment, and later-item activation.

The next decision is Human Gate A for this design and task graph. Source-specific rights and real-data release decisions remain explicit later prerequisites; neither is silently inferred from design approval.
