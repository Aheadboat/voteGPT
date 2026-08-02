# Project map

## Start here

- [Contributor contract](AGENTS.md)
- [Roadmap](ROADMAP.md)
- [Project overview](README.md)
- [Temporary work registry](TEMPORARY.md)

## Capability routes

### Public shell, identity, and account

Start: [public page](src/app/page.tsx), [application layout](src/app/layout.tsx). Adjacent: [site header](src/components/site-header.tsx), [account controls](src/components/account-controls.tsx). Check: `npm.cmd test -- src/app/identity-shell.test.tsx`.

### Residence preview

Start: [preview component](src/components/residence-preview.tsx), [resolution route](src/app/api/v1/location/resolve/route.ts). Adjacent: [residence service](src/lib/residence.ts), [residence policy](src/lib/residence-policy.ts). Check: `npm.cmd test -- src/components/residence-preview.test.tsx src/app/api/v1/location/resolve/route.test.ts`.

### Saved residence

Start: [residence route](src/app/api/v1/residence/route.ts), [dashboard](src/app/dashboard/page.tsx). Adjacent: [saved-residence service](src/lib/saved-residence.ts), [service tests](src/lib/saved-residence.test.ts). Check: `npm.cmd test -- src/app/api/v1/residence/route.test.ts src/lib/saved-residence.test.ts`.

### Federal officials

Start: [officials component](src/components/federal-officials.tsx), [officials service](src/lib/federal-officials-service.ts). Adjacent: [federal policy](src/lib/federal-policy.ts), [profile component](src/components/federal-profile.tsx). Check: `npm.cmd test -- src/components/federal-officials.test.tsx src/lib/federal-officials-service.test.ts`.

### Government navigation and state officials

Start: [dashboard](src/app/dashboard/page.tsx), [government navigation](src/components/government-navigation.tsx), [State officials](src/components/state-officials.tsx). Adjacent: [State domain](src/lib/state-officials.ts), [OpenStates adapter](src/lib/openstates.ts), [State source trust policy](src/lib/state-source-policy.ts), [State cache service](src/lib/state-officials-service.ts). Check: `npm.cmd test -- src/components/government-navigation.test.tsx src/components/state-officials.test.tsx src/lib/state-officials-service.test.ts`.

### Persistence

Start: [database schema](src/db/schema.ts), [database access](src/db/index.ts). Adjacent: [latest migration](drizzle/0004_state_official_cache.sql), [State-cache integration contract](integration/state-official-cache.test.ts). Check: `npm.cmd test -- src/db/index.test.ts`.

### Verification and delivery

Start: [package scripts](package.json), [CI workflow](.github/workflows/ci.yml). Adjacent: [foundation contract](tests/foundation-contract.test.ts), [Playwright configuration](playwright.config.ts). Check: `npm.cmd test -- tests/foundation-contract.test.ts`.
