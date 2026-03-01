# Fortress Close: Pack 8.5

## Required Env
- `ARTIFACTS_INT_DATABASE_URL` must point to a reachable Postgres instance.
- Local Docker DB path supported via `db:migrate:local`.

## Commands
```bash
export ARTIFACTS_INT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zbestmedia_artifacts"

pnpm -C packages/artifacts-api db:down || true
pnpm -C packages/artifacts-api db:up

pnpm -C packages/artifacts-api db:migrate:local
pnpm -C packages/artifacts-api db:migrate:local

export ARTIFACTS_SKIP_TEST_MIGRATE=1
pnpm -C packages/artifacts-api typecheck
pnpm -C packages/artifacts-api lint
pnpm -C packages/artifacts-api test
```

Or use the one-shot script:
```bash
bash packages/artifacts-api/scripts/fortress/fortress.close.policy.sh
```

## Pass Conditions
- Migrations succeed cleanly on two consecutive runs.
- DB integration tests run in enabled mode (`DB tests ENABLED ...`).
- No `DB tests SKIPPED ...` output due to missing DB env.
- Test migration helper skip is enabled (`ARTIFACTS_SKIP_TEST_MIGRATE=1`) because close script already ran migrations twice.
- Typecheck, lint, and test all pass.
