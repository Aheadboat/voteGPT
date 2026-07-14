# voteGPT

voteGPT helps U.S. voters find current representatives, understand upcoming elections, compare verified candidates, and ask questions grounded in cited evidence.

## Status

R0 — Durable Project Contract and F1 — Development and Test Foundation are complete. F2 — Identity and Public Shell is active in RED after Human Gate A approval.

## Local identity setup

Copy `.env.example` to `.env.local` and provide every value. `BETTER_AUTH_SECRET` must be a random value of at least 32 characters; `BETTER_AUTH_URL` is the app origin; `EMAIL_SERVER` is an SMTP transport URL; and the Google values come from an OAuth web client. Use `DATABASE_URL=pglite://.data/votegpt` for local PGlite or a PostgreSQL URL. Run `npm run db:migrate` before using PostgreSQL; it refuses to run when `DATABASE_URL` is missing.

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
