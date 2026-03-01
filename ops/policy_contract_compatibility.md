# Policy Contract Compatibility

## Current Contract
- Artifacts API contract: `policy-resolve@1.0.0`
- Header source: `x-policy-contract-version` on `GET /v1/policies/resolve`

## Consumer Requirements
- policy-sdk minimum contract: `policy-resolve@1.0.0`
- policy-sdk enforcement toggle:
  - `POLICY_ENFORCE_CONTRACT_VERSION=true` -> fail when server contract is missing/invalid/older
  - `POLICY_ENFORCE_CONTRACT_VERSION=false` -> warn only
- PhantomMyst minimum contract: `PHANTOMMYST_MIN_POLICY_CONTRACT_VERSION=policy-resolve@1.0.0`

## Upgrade Order
1. Deploy `artifacts-api` with new contract header/version first.
2. Upgrade `policy-sdk` minimum contract version.
3. Upgrade PhantomMyst live contract gate minimum version.

## CI Expectations
- zbestmedia policy-sdk contract tests verify resolve + ETag + 304 behavior.
- PhantomMyst contract runner always executes stub test.
- PhantomMyst live contract test executes when:
  - `ARTIFACTS_CONTRACT_TEST_URL` is set
  - `ARTIFACTS_CONTRACT_TEST_TOKEN` is set
