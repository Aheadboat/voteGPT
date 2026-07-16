# voteGPT

voteGPT helps U.S. voters find current representatives, understand upcoming elections, compare verified candidates, and ask questions grounded in cited evidence.

## Status

R0 — Durable Project Contract, F1 — Development and Test Foundation, F2 — Identity and Public Shell, and F3 — Residence Resolution Preview are complete on actual `main`. R1 — Concurrent Roadmap Delivery Contract is complete. The F4-F8 autonomous integration batch is staged on `codex/autonomous-f4-f8-integration`, based on `main@d5978ba830f0ee715c9162afba8963139c0fb707`; F4 is `VERIFIED` and awaits its staged feature PR's hosted CI, delegated Gate B, merge, and closeout, while F5 remains active in its admitted isolated lane pending the serialized F4 handoff. F6, F7, and F8 remain TODO in the authorized batch queue until their dependencies and admission audits pass. G1 is authorized only as F7's no-spend prerequisite. The batch branch will not merge into `main` before final human review.

## Local identity setup

Copy `.env.example` to `.env.local` and provide the identity values. `BETTER_AUTH_SECRET` must be a random value of at least 32 characters; `BETTER_AUTH_URL` is the app origin; `EMAIL_SERVER` is an SMTP transport URL; and the Google identity values come from an OAuth web client. Use `DATABASE_URL=pglite://.data/votegpt` for local PGlite or a PostgreSQL URL. Run `npm run db:migrate` before using PostgreSQL; it refuses to run when `DATABASE_URL` is missing.

`GOOGLE_CIVIC_API_KEY` is an optional server-only key for manual residence previews. When it is empty, manual lookups fall back to the U.S. Census Geocoder; device coordinates always use Census. Precise input is used only for the explicit check and is not saved by F3. Never expose this key through a `NEXT_PUBLIC_` variable.

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

- [Authoritative roadmap](./ROADMAP.md)
- [Agent and contribution rules](./AGENTS.md)
