# Fortress Proofing (Pack 19.0)

## Commands
- Run full fortress drill:
  - `pnpm ops:drill:run --profile fortress --target prod/us-west/policy --out ops/drills/<ts>`
- Generate runbook:
  - `pnpm ops:runbook:generate --out ops/runbooks/fortress.md`
- Run readiness gate:
  - `pnpm ops:readiness:check --strict`
- Build fortress proof report:
  - `pnpm ops:fortress:report --target prod/us-west/policy --out ops/fortress_reports/<ts>`

## Drill Artifact Layout
- `drill.json`
- `steps.jsonl`
- `results.md`
- `artifacts/`

## Readiness Artifact Layout
- `ops/readiness/<timestamp>__readiness.json`
- `ops/readiness/<timestamp>__readiness.md`

## Fortress Report Contents
- latest readiness report
- latest drill report
- contracts + signature + keyring
- latest ledger checkpoint
- SLO summary
