# P1AF-089_FOUNDER_DECISION_PACKET_V1

Lane: P1A-06 (Claude). Status: **BLOCKED_EXTERNALLY — founder decision required.**
No provider has been guessed; nothing below pre-selects a vendor.

## What P1AF-089 says (frozen ledger, verbatim scope)

> Provider selection for e-signature, payment, transactional email, and
> document storage is a founder prerequisite; retention/deletion obligations
> that depend on the provider cannot be finalized before it.

## What is blocked until you decide

- **P1AF-089** (this row, lane P1A-06): provider-dependent retention/deletion
  clauses — how long provider-side copies live, how erasure is proven at the
  provider, and whether provider deletion APIs count as deletion evidence.
- **P1AF-070..074** (lane P1A-05, Codex): payment webhooks, billing
  duplication fail-closed domain, browser-return non-proof, provider-event
  evidence mandates, automatic receipts/delivery evidence. P1A-08's
  integration resolution routes this block here.

Everything provider-INdependent in P1A-06 is already built and tested and does
not wait on this decision (classification, retention, deletion engine, holds,
tombstones, audit, cache TTL, evidence reconciliation, document lifecycle).

## The four decisions required (one per capability)

For each capability, the decision is: **named provider + data-residency
posture + erasure mechanism accepted as evidence.**

1. **E-signature** — decide: provider; whether signed-document storage lives at
   the provider or in `artifact-registry`; whether provider deletion API output
   is accepted as deletion evidence or documents must be crypto-erased locally.
2. **Payment** — decide: provider; retention of payment events/receipts
   (P1A-05 needs signed webhooks + replay protection from the same choice);
   whether provider is the system of record for payment evidence or the outbox
   receipt chain is.
3. **Transactional email** — decide: provider; retention of send/delivery logs
   (delivery evidence for P1AF-074) vs. suppression-list persistence, which
   holds recipient personal data.
4. **Document storage** — decide: provider (or local `artifact-registry` only);
   backup/replica erasure semantics (this fixes the BACKUP/REPLICA scope
   adapters' real implementations, which today are contract-modeled only).

## Decision format (what unblocks the lanes)

A digest-bound founder artifact (same pattern as the freeze/release
authorities) containing, per capability:

```json
{
  "artifactId": "P1AF-089_FOUNDER_PROVIDER_DECISION_V1",
  "decisions": {
    "esignature":         { "provider": "<name>", "dataResidency": "<provider|local|hybrid>", "erasureEvidence": "<api-receipt|crypto-erase|contractual>" },
    "payment":            { "provider": "<name>", "eventRetentionDays": 0, "systemOfRecord": "<provider|outbox>" },
    "transactionalEmail": { "provider": "<name>", "deliveryLogRetentionDays": 0, "suppressionListRetention": "<bounded|provider-managed>" },
    "documentStorage":    { "provider": "<name>", "backupErasureSemantics": "<provider-api|cycle-out|crypto-erase>" }
  }
}
```

`providerDecisionStatus(founderDecision)` in `scripts/validate-p1a-privacy.mjs`
flips P1AF-089 to DECIDED only when a `decisionRef` exists; until then any
attempt to finalize a provider-dependent obligation fails closed with
`BLOCKED_EXTERNALLY` (tested + mutation-hardened).

## What this packet is not

Not a recommendation of any vendor, not a cost analysis, not a contract
review. If you want a vendor evaluation before deciding, that is a separate
founder-commissioned task (procurement), not a lane deliverable.
