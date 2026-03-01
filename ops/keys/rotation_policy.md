# Policy Signing Key Rotation Policy

## Zero-Downtime Sequence
1. Add new public key to keyring:
   - `pnpm ops:keys:rotate --new-kid <kid> --public-key-file <pem> --approve --reason "..."`
2. Re-sign contracts with new kid:
   - `SLO_SIGNING_KID=<kid> SLO_SIGNING_PRIVATE_KEY=... pnpm ops:contracts:sign --approve --reason "..."`
3. Verify signatures:
   - `pnpm ops:contracts:verify --strict`
   - `pnpm ops:audit:verify-signatures --strict`
4. Start writing ledger entries with new signing kid:
   - set `SLO_SIGNING_KID=<kid>`
5. Keep previous kid in keyring until audit retention window expires.
6. Remove old key from keyring only after retention expiry and verification.

## Guardrails
- Never rotate without approval and reason.
- Never remove prior kid before retention window expiry.
- Always run strict signature verification before and after rotation.
