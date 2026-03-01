# Governance Self-Check (Pack 20.0)

## Commands
- Run strict self-check:
  - `pnpm ops:governance:self-check --strict --target prod/us-west/policy`
- Read latest integrity status:
  - `pnpm ops:governance:integrity-status`

## Key Env Controls
- `GOVERNANCE_SELF_CHECK_ENABLED=true`
- `GOVERNANCE_INTEGRITY_MIN_SCORE=90`
- `GOVERNANCE_AUTO_BLOCK_ON_FAIL=true`
- `GOVERNANCE_AUTO_FREEZE_ON_CRITICAL=false`
- `GOVERNANCE_REQUIRED_IMMUTABLE_SINK=false`

## Outputs
- `ops/incidents/governance_integrity_status.json`
- `ops/incidents/*__governance_self_check.json`
- optional incident: `ops/incidents/*__incident.json`

## Runtime Snapshot Fields
- `integrity_score`
- `integrity_flags`
- `last_self_check_ts`
- `last_self_check_passed`
- `last_self_check_event_id`
- `auto_block_active`
- `auto_freeze_recommended`
