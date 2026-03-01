# Pack 10.2 Rollout Plan

## Required Deploy Variables

### zbestmedia / policy-sdk consumers
- `NODE_ENV=production`
- `POLICY_ENFORCE_CONTRACT_VERSION=true`
- `POLICY_MIN_CONTRACT_VERSION=policy-resolve@1.0.0`

### PhantomMyst
- `POLICY_ENFORCEMENT_MODE=ENFORCE_READ_ONLY`
- `PHANTOMMYST_MIN_POLICY_CONTRACT_VERSION=policy-resolve@1.0.0`

## Environment Defaults
- `production` -> `POLICY_ENFORCE_CONTRACT_VERSION=true`
- `staging` -> `POLICY_ENFORCE_CONTRACT_VERSION=true`
- `dev/test` -> warn-only unless explicitly set to true

- `production/staging` -> `POLICY_ENFORCEMENT_MODE=ENFORCE_READ_ONLY` (default)
- `dev/test` -> `POLICY_ENFORCEMENT_MODE=SHADOW` (default)

## Staged Rollout
1. Dev: `SHADOW` + warn-only contract enforcement.
2. Staging: `ENFORCE_READ_ONLY` + hard-fail contract enforcement.
3. Production: `ENFORCE_READ_ONLY` + hard-fail contract enforcement.
4. Move to `ENFORCE_STRICT` only after 7 days stable telemetry and artifacts-api SLO health.
