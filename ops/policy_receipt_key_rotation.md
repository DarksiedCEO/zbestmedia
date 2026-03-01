# Policy Receipt Key Rotation (Zero-Downtime)

This procedure rotates policy receipt signing from one `kid` to another without breaking live traffic.

## Prerequisites
- Current server signer: `POLICY_RECEIPT_HMAC_KID=k1`
- Current server key: `POLICY_RECEIPT_HMAC_KEY=<k1-secret>`
- Clients verify with `POLICY_RECEIPT_HMAC_KEYS_JSON`

## Rotation Sequence
1. Generate new secret `k2`.
2. Update all SDK consumers to trust both keys:
   - `POLICY_RECEIPT_HMAC_KEYS_JSON={"k1":"<k1-secret>","k2":"<k2-secret>"}`
3. Deploy consumers first and verify no receipt verification failures.
4. Switch artifacts-api signer:
   - `POLICY_RECEIPT_HMAC_KID=k2`
   - `POLICY_RECEIPT_HMAC_KEY=<k2-secret>`
5. Verify telemetry:
   - receipt verification passes with `kid=k2`
   - no `RECEIPT_SIGNATURE_UNKNOWN_KID` or `RECEIPT_SIGNATURE_INVALID`
6. Wait for cache/TTL window to expire for older `k1` receipts.
7. Remove `k1` from consumers:
   - `POLICY_RECEIPT_HMAC_KEYS_JSON={"k2":"<k2-secret>"}`

## Rollback
- If verification errors increase after step 4:
  - revert server to `k1` signer immediately
  - keep dual-key consumer map until stable

## Expected Signals
- During dual-key window: both `k1` and `k2` verify.
- After `k1` removal: old `k1` receipts fail in enforce mode (expected).
