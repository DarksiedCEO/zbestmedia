#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?TOKEN required}"
POLICY_ID="${1:?policy version id required}"

curl -sS -X POST "${BASE_URL}/v1/policies/${POLICY_ID}/submit" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" -d '{}' -i
