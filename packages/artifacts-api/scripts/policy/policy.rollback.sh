#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?TOKEN required}"
POLICY_ID="${1:?policy version id required}"
REASON="${2:?rollback reason required}"

jq -n --arg reason "$REASON" '{reason:$reason}' |
  curl -sS -X POST "${BASE_URL}/v1/policies/${POLICY_ID}/rollback" \
    -H "authorization: Bearer ${TOKEN}" \
    -H "content-type: application/json" \
    --data @- | jq .
