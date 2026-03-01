#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?TOKEN required}"
POLICY_KEY="${1:?policyKey required}"
CLIENT_ID="${2:-}"
CAMPAIGN_ID="${3:-}"

QS="policyKey=${POLICY_KEY}"
if [[ -n "${CLIENT_ID}" ]]; then QS="${QS}&clientId=${CLIENT_ID}"; fi
if [[ -n "${CAMPAIGN_ID}" ]]; then QS="${QS}&campaignId=${CAMPAIGN_ID}"; fi

curl -sS "${BASE_URL}/v1/policies/resolve?${QS}" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" | jq .
