#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ARTIFACTS_INT_DATABASE_URL:-}" ]]; then
  echo "ERROR: ARTIFACTS_INT_DATABASE_URL not set. Fortress close requires DB integration enabled."
  exit 1
fi

run_migrate_with_retry() {
  local attempts=0
  local max_attempts=5
  until pnpm -C packages/artifacts-api db:migrate:local; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -ge "${max_attempts}" ]]; then
      echo "ERROR: db:migrate:local failed after ${max_attempts} attempts"
      return 1
    fi
    sleep $((attempts * 2))
  done
}

echo "==> Reset local DB"
pnpm -C packages/artifacts-api db:down || true
pnpm -C packages/artifacts-api db:up

echo "==> Migrations (idempotency pass #1)"
run_migrate_with_retry

echo "==> Migrations (idempotency pass #2)"
run_migrate_with_retry

echo "==> Gates (DB integration ON)"
export ARTIFACTS_SKIP_TEST_MIGRATE=1
pnpm -C packages/artifacts-api typecheck
pnpm -C packages/artifacts-api lint
pnpm -C packages/artifacts-api test

echo "==> Fortress close COMPLETE"
