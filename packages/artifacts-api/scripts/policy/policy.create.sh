#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?TOKEN required}"
JSON_FILE="${1:?path to json payload required}"

curl -sS -X POST "${BASE_URL}/v1/policies/drafts" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data @"${JSON_FILE}" | jq .
