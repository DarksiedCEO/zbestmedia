#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?TOKEN required}"
POLICY_ID="${1:?policy version id required}"
ROLE="${2:?role required}"
DECISION="${3:-approved}"
NOTES="${4:-}"

jq -n --arg role "$ROLE" --arg decision "$DECISION" --arg notes "$NOTES" '{role:$role,decision:$decision} + (if $notes=="" then {} else {notes:$notes} end)' |
  curl -sS -X POST "${BASE_URL}/v1/policies/${POLICY_ID}/approve" \
    -H "authorization: Bearer ${TOKEN}" \
    -H "content-type: application/json" \
    --data @- -i
