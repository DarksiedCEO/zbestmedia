# Phase 1 Completion Gate (Monster MVP Backend)

## Required Checks
- `pnpm run repo:doctor`
- `pnpm run verify`
- `pnpm run verify:full`

## Expected Green Signals
- `repo:doctor` exits 0
  - Node >= 20
  - pnpm present
  - ESLint v8.x
  - Prisma clients generated for BrandGraph + Artifact Registry
- `verify` exits 0
  - Lint, typecheck, tests across workspaces
  - Targeted suites for artifact-registry, brandgraph, agent-lifecycle
- `verify:full` exits 0
  - Includes schema check and Prisma generation

## Artifacts to Keep
- Latest commit hash that passed all checks
- The exact command outputs (CI or local) for:
  - `pnpm run verify`
  - `pnpm run verify:full`

## What Green Means
- Backend services are stable
- Operator layer is installed
- Agent lifecycle and rotation scaffolding is functional
- Tenant scoping and deterministic graph reads are enforced

## If Not Green
- Do not begin Phase 2
- Fix the failing command and re-run all required checks
