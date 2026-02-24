#!/usr/bin/env bash
set -euo pipefail

echo "[gates] typecheck"
pnpm -C packages/artifacts-api typecheck

echo "[gates] lint"
pnpm -C packages/artifacts-api lint

echo "[gates] test"
pnpm -C packages/artifacts-api test

echo "[gates] db:migrate:local"
pnpm -C packages/artifacts-api db:migrate:local

if [[ -n "${TOKEN:-}" ]]; then
  echo "[gates] smoke.leads.local.sh"
  BASE_URL="${BASE_URL:-http://localhost:3000}" TOKEN="${TOKEN}" \
    /Users/andrelove/Documents/New\ project/zbestmedia/packages/artifacts-api/scripts/smoke.leads.local.sh
else
  echo "[gates] smoke.leads.local.sh skipped (TOKEN not set)"
fi

echo "[gates] PASS"
