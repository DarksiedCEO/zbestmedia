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

echo "[gates] PASS"
