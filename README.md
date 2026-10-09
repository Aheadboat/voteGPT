# voteGPT

voteGPT helps U.S. voters find current representatives, understand upcoming elections, compare verified candidates, and ask questions grounded in cited evidence.

## Status

R0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, F3 — Residence Resolution Preview, F4 — Consented Saved Residence, and F5 — Federal Officials are complete on `main` through their required closeout merges. R1 — Concurrent Roadmap Delivery Contract is complete. R2 — Repository Context and Hygiene Contract is complete. F6 — State Officials and Government-Level Navigation is complete on `main` through [feature PR #24](https://github.com/Aheadboat/voteGPT/pull/24) and its required status-only closeout. G1 — Candidate-Data Vendor Proof of Concept is complete on `main` through [feature PR #28](https://github.com/Aheadboat/voteGPT/pull/28) and required status-only [closeout PR #29](https://github.com/Aheadboat/voteGPT/pull/29); its durable decision remains `NO-GO (reopenable)`. F7 — Elections and Deterministic Candidate Validity is active in `RED` using the documented official-source fallback. Human Gate A is approved; implementation is authorized with lean, risk-based integration testing. California candidate-list and supporting-source use, bounded roster coverage, and statewide-only initial personalization are approved. Exact-package and real-data release decisions remain pending, and Human Gate B is required before merge. F8 and every later item remain `TODO` and inactive, and G1-T5/T6 external vendor actions remain unapproved.

R3 — Login and Address Search Recovery is complete through [feature PR #31](https://github.com/Aheadboat/voteGPT/pull/31) and required status-only [closeout PR #33](https://github.com/Aheadboat/voteGPT/pull/33); DONE takes effect when that closeout merges to main. Its bounded scope is Google/SSO recovery and optional address autocomplete. No deployment, new service credentials, or F7 changes are included. See [R3 scope and verification](ROADMAP.md).

## Local identity setup

Copy `.env.example` to `.env.local` and provide the identity values. `BETTER_AUTH_SECRET` must be a random value of at least 32 characters; `BETTER_AUTH_URL` is the app origin. Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` together for Google sign-in, and/or `EMAIL_SERVER` (an SMTP transport URL) and `EMAIL_FROM` together for email-link sign-in. Google-only deployments do not require SMTP. Only configured methods are shown; incomplete pairs are unavailable. Register the Google OAuth callback as `<BETTER_AUTH_URL>/api/auth/callback/google` with your Google OAuth web client. Keep secrets server-side. Use `DATABASE_URL=pglite://.data/votegpt` for local PGlite or a PostgreSQL URL. Run `npm run db:migrate` before using PostgreSQL; it refuses to run when `DATABASE_URL` is missing.

`GOOGLE_CIVIC_API_KEY` is an optional server-only key for manual residence previews. When it is empty, manual lookups fall back to the U.S. Census Geocoder; device coordinates always use Census. Precise input is used only for the explicit check and is not saved by F3. Never expose this key through a `NEXT_PUBLIC_` variable.

## Optional address suggestions

Manual address entry and the explicit Google/Census residence check continue to work without autocomplete. To enable autocomplete availability, set server-only `PHOTON_BASE_URL` to an operator-selected HTTPS Photon origin or path prefix, with no credentials, query, or fragment. The app appends `api/`. It is deliberately empty by default. Prefer an owned or appropriately provisioned service for production. The public `https://photon.komoot.io/` service permits reasonable low-volume evaluation but has no availability guarantee; review the [official Photon policy](https://github.com/komoot/photon) and provide aggregate upstream capacity/rate controls before production use.

Users explicitly enable address suggestions before typing is sent to the configured provider. Requests go through an authenticated same-origin POST endpoint, after four characters and a 500 ms debounce. Results are at most five full U.S. address guesses with OpenStreetMap attribution. The adapter uses Photon’s built-in typo-tolerant search, limits response size to 64 KiB, and times out after three seconds. Each instance limits an account to 30 requests/minute with a bounded 1,000-account counter; the counter retains no addresses, queries, or IPs. This per-instance limit is not a distributed production quota.

Suggestions are guesses, not validated residences or district assignments. Selecting one fills the field; the user must still choose **Check residence** and separately consent to saving. Escape, keyboard selection, loading/empty/error states, stale-response cancellation, and offline recovery remain available. No map SDK, new account, or paid service is provisioned by this change.

OAuth tests use deterministic provider fixtures; a real Google sign-in requires deployment credentials and a credentialed smoke test. Address tests use synthetic fixtures and do not prove a particular live Photon deployment's accuracy or availability.

## Primary journeys

1. Browse sourced officials, candidates, elections, and contests anonymously; sign in only to resolve or save a residence for personalized results.
2. Compare every verified candidate on equal terms, then open contextual chat over published evidence.

## Product promise

- Structured civic records remain source of truth; AI explains them but never determines districts, candidacy, or outcomes.
- Every displayed fact includes provenance and freshness.
- Personalized lookup, saved residence, chat, memory, and alerts require an account and explicit consent where applicable.
- Coverage gaps are visible. The product never claims complete nationwide local coverage without evidence.

## Non-goals for v1

- Candidate rankings, endorsements, ideological matching, or voting recommendations.
- Political ads or paid candidate placement.
- Public developer API, SMS, browser push, end-user API keys, or user-laptop LLM access.
- AI-generated candidate validity or election results.

## Project guidance

- [Current-code project map](PROJECT-MAP.md)
- [Temporary-work registry](TEMPORARY.md)
- [Authoritative roadmap](./ROADMAP.md)
- [Agent and contribution rules](./AGENTS.md)
