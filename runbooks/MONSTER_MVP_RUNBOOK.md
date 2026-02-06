# Monster MVP Runbook

## Day 0 Boot
1. Install deps
   - `pnpm install`
2. Generate Prisma clients
   - `pnpm -C services/brandgraph prisma generate --schema prisma/schema.prisma`
   - `pnpm -C services/artifact-registry prisma generate --schema prisma/schema.prisma`
3. Verify
   - `pnpm run verify`

## DB Wiring (Postgres)
- Required env: `DATABASE_URL` for BrandGraph.
- No migrations yet. Use:
  - `pnpm -C services/brandgraph prisma db push --schema prisma/schema.prisma`
- When ready for migrations, introduce `prisma/migrations` and switch to `prisma migrate`.

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
  - Fix: `pnpm run prisma:generate-all` (or run the two generate commands manually).
- Tests writing to node_modules cache
  - Ensure `cacheDir` is set in local vitest configs (already in repo).
