# Monster MVP Runbook

## Day 0 Boot
1. Install deps
   - `pnpm install`
2. Generate Prisma clients
   - `pnpm run prisma:generate:all`
3. Verify
   - `pnpm run verify`
4. Repo sanity
   - `pnpm run repo:doctor`

## DB Wiring (Postgres)
- Required env: `DATABASE_URL` for BrandGraph **only when** running `prisma db push` or runtime Postgres access.
- Optional for local tests (tests use in-memory and/or sqlite test schema).
- No migrations yet. Use:
  - `pnpm -C services/brandgraph prisma db push --schema prisma/schema.prisma`
- When ready for migrations, introduce `prisma/migrations` and switch to `prisma migrate`.
- Always run `pnpm run prisma:generate:all` after schema changes.

## CI Contract
- `pnpm run verify` is the canonical pass/fail gate.
- It runs:
  - `ci:all` (lint + typecheck + test across workspaces)
  - `test:artifact-registry`
  - `test:brandgraph`
  - `test:agent-lifecycle`

## Rotation Operations
- Rotation is code-driven via `runBrandTrinityRotationJob`.
- Inject a durable store in production.
- To force-run locally, call the job with a test store or Prisma store once `DATABASE_URL` is set.

## Failure Matrix
- ESLint mismatch
  - Run `pnpm run guard:eslint` (part of `verify`).
  - Fix: `pnpm add -D eslint@8.57.1`
- Prisma client missing
  - Fix: `pnpm run prisma:generate:all`
- Tests writing to node_modules cache
  - Ensure `cacheDir` is set in local vitest configs (already in repo).

## Command Guide
| Scenario | Command | Notes |
| --- | --- | --- |
| Fast local check | `pnpm run verify` | Lint + typecheck + tests + targeted suites |
| Full pre-release | `pnpm run verify:full` | Includes schema check + Prisma generate |
| Environment sanity | `pnpm run repo:doctor` | Detects toolchain/prisma/client issues |
