# Pack 9.2 Contract Gate

## Required Env (for live contract run)
- `ARTIFACTS_CONTRACT_TEST_URL` e.g. `http://localhost:3000`
- `ARTIFACTS_CONTRACT_TEST_TOKEN` bearer token for artifacts-api auth

## Optional Env
- `ARTIFACTS_CONTRACT_POLICY_KEY` default: `performance_limits`
- `ARTIFACTS_CONTRACT_CLIENT_ID` default: `11111111-1111-4111-8111-111111111111`
- `ARTIFACTS_CONTRACT_CAMPAIGN_ID` default: `22222222-2222-4222-8222-222222222222`

## Commands
- `pnpm -r typecheck`
- `pnpm -r lint`
- `pnpm -r test`
- `pnpm -C packages/policy-sdk test` (contract test runs when env is set)

## Pass Conditions
- Resolve route emits `ETag` equal to `meta.resolution_hash`
- `If-None-Match` returns `304`
- SDK reuses cached value on `304` revalidation
