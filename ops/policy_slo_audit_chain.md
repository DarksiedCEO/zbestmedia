# Policy SLO Contracts + Audit Chain

## Files
- `ops/contracts/slo_contracts.json`: canonical target SLO contract map.
- `ops/contracts/slo_contracts.sig.json`: signature envelope for contracts file.
- `ops/keys/keyring.json`: public keyring (`kid -> ed25519 public key`).
- `ops/audit/ledger.jsonl`: append-only governance audit chain.

## Signing
- Sign contracts:
  - `pnpm ops:contracts:sign --approve --reason "..."` (requires `SLO_SIGNING_PRIVATE_KEY`)
- Verify contracts:
  - `pnpm ops:contracts:verify --strict`

## Ledger Verification
- Verify chain and signatures:
  - `pnpm ops:audit:verify-ledger --strict`
- Verify contract signatures only:
  - `pnpm ops:audit:verify-signatures --strict`

## Retention & Durability
- Rollover active ledger to immutable archive segment:
  - `pnpm ops:audit:rollover-ledger --approve --reason "..."`
- Export audit bundle for external review:
  - `pnpm ops:audit:export-bundle --from <iso> --to <iso> --target <target_id>`
- Immutable sink push (env-gated):
  - `pnpm ops:audit:push-immutable`
- Retention policy:
  - `ops/retention/policy.json`

## Key Rotation
- Rotation protocol:
  - `ops/keys/rotation_policy.md`
- Add a new public key and emit rotation plan:
  - `pnpm ops:keys:rotate --new-kid <kid> --public-key-file <pem> --approve --reason "..."`

## Runtime Introspection Fields
- `contracts_version`
- `contracts_signature_status`
- `ledger_head_hash`
- `ledger_verified_recently`
- `keyring_kids`
