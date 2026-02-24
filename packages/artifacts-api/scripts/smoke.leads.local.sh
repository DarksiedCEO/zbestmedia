#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-}"

if [[ -z "${TOKEN}" ]]; then
  echo "TOKEN is required (JWT). Example:"
  echo "  TOKEN=... BASE_URL=http://localhost:3000 ./scripts/smoke.leads.local.sh"
  exit 1
fi

auth_header() {
  printf "authorization: Bearer %s" "${TOKEN}"
}

echo "[smoke] intake"
LEAD_JSON=$(curl -sS -X POST "${BASE_URL}/v1/leads/intake" \
  -H "$(auth_header)" \
  -H "content-type: application/json" \
  --data '{"source":"website","email":"smoke@acme.com","firstName":"Smoke"}')

LEAD_ID=$(node -e "console.log(JSON.parse(process.argv[1]).leadId)" "${LEAD_JSON}")
echo "leadId=${LEAD_ID}"

echo "[smoke] event pricing_view"
curl -sS -X POST "${BASE_URL}/v1/leads/${LEAD_ID}/events" \
  -H "$(auth_header)" \
  -H "content-type: application/json" \
  --data '{"type":"pricing_view","payload":{"page":"pricing"}}' >/dev/null

echo "[smoke] conversion meeting_booked"
curl -sS -X POST "${BASE_URL}/v1/leads/${LEAD_ID}/conversions" \
  -H "$(auth_header)" \
  -H "content-type: application/json" \
  --data '{"type":"meeting_booked"}' >/dev/null

echo "[smoke] get lead"
curl -sS "${BASE_URL}/v1/leads/${LEAD_ID}" -H "$(auth_header)" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (!d.lead || d.lead.id !== '${LEAD_ID}') process.exit(1);
console.log('ok lead stage=', d.lead.lifecycleStage, 'score=', d.lead.scoreTotal);
"

echo "[smoke] get score recompute"
curl -sS "${BASE_URL}/v1/leads/${LEAD_ID}/score?recompute=true" -H "$(auth_header)" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (typeof d.scoreTotal !== 'number') process.exit(1);
console.log('ok scoreTotal=', d.scoreTotal);
"

echo "[smoke] PASS"
