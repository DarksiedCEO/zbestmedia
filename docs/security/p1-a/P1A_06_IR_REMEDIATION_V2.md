# P1A_06_IR_REMEDIATION_V2

Remediation of the Codex independent-review verdict **INDEPENDENT_REVIEW_BLOCK**
(receipt sha256 `e75fb51b23f230146f26de152ae234a2cbe99b9d55a3c72ceaf2e153d51a375f`,
reviewer-side artifact; not locally recomputable) against prior frozen subject
`3d0486c37d64364991f6c061e2f222c6b1d5dcfe`.

Prior subject is preserved as immutable history (this commit's parent). Only
findings P1A06-IR-001..008 were fixed. No shared-surface / P1A-08-owned schema
change; no push; no merge. Every finding was independently reproduced against
the prior code before fixing, and re-driven to fail-closed after.

## Findings → fixes (all in `scripts/validate-p1a-privacy.mjs`)

- **IR-001 (Critical) eligibility forgeable.** Replaced the public unkeyed
  `digestOf` token with a **keyed HMAC** held by a `createDeletionAuthority`
  (secret ≥ 16 chars, never exported). `evaluateDeletionEligibility` now
  requires the authority and signs the full decision; `executeDeletion` /
  `verifyDeletionReceipt` / `retryDeletion` authenticate with the authority key
  via constant-time compare. A tampered decision recomputed with the public
  digest, or signed by a different key, fails `EXECUTION_REFUSED_UNAUTHENTICATED`.

- **IR-002 (High) hold-after-eligibility TOCTOU.** `executeDeletion` now
  requires the authoritative hold ledger (`HOLD_LEDGER_REQUIRED`) and **re-checks
  per-target holds at execution time**: any target now under a hold is set
  `BLOCKED_BY_HOLD` with no adapter call. The bound hold-ledger revision is
  carried inside the MAC-signed decision for audit. Precise — an unrelated
  subject's hold does not over-block.

- **IR-003 (High) empty forged receipt verifies COMPLETE.** `verifyDeletionReceipt`
  now verifies against the **authenticated eligibility** (its declared targets
  and scopes are the source of truth, never the receipt's own scopes), requires
  the receipt's `eligibilityMac` to match, and rejects missing targets/scopes
  and unproven attestations. `aggregateDeletionStatus([], [])` is `UNKNOWN`, and
  verification without an authenticated eligibility is `RECEIPT_REJECTED`
  (`ELIGIBILITY_REQUIRED`).

- **IR-004 (High) idempotency replay across tenants.** The operation key now
  binds the authenticated decision MAC plus tenant, subject, class, basis,
  target and scope, so tenant B's request cannot replay tenant A's proof —
  tenant B's adapter is actually invoked.

- **IR-005 (High) evidence conflict advisory.** `resolveDeleteEvidenceConflict`
  is now a **mandatory gate** inside `evaluateDeletionEligibility`
  (`certBindings` input): an unexpired evidence binding sets the target
  `BLOCKED_BY_EVIDENCE` and execution performs no delete, unless the class
  strategy is `CRYPTO_ERASE` (payload erased, digests preserved).

- **IR-006 (High) arbitrary decisionRef upgrades blocker.** `providerDecisionStatus`
  now **validates a founder artifact**: exact `authorityId`
  (`P1AF-089_FOUNDER_PROVIDER_DECISION_V1`), all four capabilities present,
  subject binding, and an `artifactDigest` that matches the canonical hash of
  the decisions. A bare string stays `BLOCKED_EXTERNALLY`.

- **IR-007 (Medium) retention-clock reset.** `RETENTION_CLOCK_BASES` no longer
  includes the mutable `LAST_ACTIVITY`; retention evaluation requires the
  **immutable registered anchor** and asserts the record's derived anchor still
  equals it (`RETENTION_CLOCK_RESET`). Retention-expiry eligibility requires a
  `registeredAnchor`.

- **IR-008 (Medium) payload-free bypass.** `appendAudit` enforces a strict
  allowed-key schema, rejects prohibited keys (case-insensitive, expanded set),
  and **recursively rejects any nested structure** (audit entries are flat
  scalar records). `makeTombstone` validates hash fields are sha256 hex
  (`TOMBSTONE_HASH_INVALID`), never raw identifiers.

## Evidence (re-executed this session)

- Behavior battery: **99/99** (34 unit/integration, 65 hostile, 0 skipped),
  including explicit IR-001..008 closure controls and their fail-open negatives.
- Mutation: **63 mutants, 63 killed, 0 survivors** over 43 invariant probes;
  eight IR mutants (M16–M32) verify each remediated guard is load-bearing and
  isolable (e.g. digest-matched wrong-authority / missing-capability forgeries
  isolate the IR-006 checks from the digest check).

## Honest residuals (unchanged by this remediation)

- Trust hinges on the **authority secret** and **engine seed** staying in the
  trusted domain, and on the **authoritative hold ledger** being the one passed
  to execution. Key/ledger custody is environment-owned and NOT proven here.
- P1AF-089 remains `BLOCKED_EXTERNALLY`; P1AF-070..074 remain blocked; P1AF-082
  and P1AF-084 remain `PARTIAL` pending P1A-08 schema integration; the five base
  schema defects remain routed, not fixed; census remains `COVERAGE_UNKNOWN`;
  frozen-ledger digest verification remains `UNKNOWN` within lane scope.
- No runtime, production, or live-provider claim.
