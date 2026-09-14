# Z Best Clips Phase 1 Threat Model

## Protected assets

Unreleased media, identity and tax data, account-control evidence, rights grants,
approval history, campaign budgets, creator obligations, metric evidence,
publication credentials, payout credentials, audit records, and model inputs.

## Trust boundaries

Client, creator, Z Best Clips operator, CinePhantom, platform API, payment
provider, Z Best Media control plane, Finance, Legal/Rights, independent Risk,
and AEGIS are separate trust zones. Network location alone grants no trust.

| Threat | Primary control | Failure posture |
|---|---|---|
| Creator impersonates account owner | OAuth/API proof or layered expiring verification | block assignment and payout eligibility |
| Creator leaks unreleased media | individualized package, watermark, expiry, revocation | revoke access, preserve evidence, initiate legal/safety review |
| Operator publishes unapproved version | exact checksum binding plus dual approval | adapter rejects intent |
| AI invents rights or approval | advisory-only output and deterministic authority | mark blocked; never infer authority |
| Scraped or forged metrics drive payout | authorized provenance and raw hash | quarantine observation |
| Creator buys views or colludes | anomaly rules plus independent investigation | temporary hold, human decision, appeal |
| Duplicate event creates duplicate payout/post | idempotency key, unique constraint and receipt reconciliation | return prior result or unknown pending reconciliation |
| Concurrent reservations overspend pool | serializable/locked atomic reservation | reject exposure before commitment |
| Operator suppresses adverse evidence | append-only evidence and separated review | alert and stop affected lane |
| Payout timeout is recorded as paid | provider receipt and settlement reconciliation | `UNKNOWN_PENDING_RECONCILIATION` |
| Cross-tenant identifier attack | scoped authorization in repository query | deny without revealing existence |
| Insider exports identity/tax records | purpose grants, encryption, audit and alerting | revoke and investigate |
| Simulation reaches real provider | isolated credentials and endpoint allowlist | startup failure and kill switch |
| Rights expire after approval | expiry scheduler invalidates dependent approval | block publication or initiate takedown |
| Model or rule drift changes decisions | versioned models/rules, shadow evaluation and rollback | freeze promotion/finality |
| Backup exists but cannot restore | scheduled restore exercise | release blocked |
| Kill switch destroys evidence | stop effects only; append control event | preserve all historical state |

## Required adversarial tests

- Cross-tenant reads using valid foreign identifiers.
- Approval replay against a successor version.
- Double submission and concurrent budget reservation.
- Forged platform observation and altered raw evidence.
- Fraud false positive, investigator conflict and appeal reversal.
- Payment timeout, duplicate callback, reversal and reconciliation mismatch.
- Rights expiry between picture lock and publication.
- Source-link use after expiry or revocation.
- Simulation configured with a live endpoint.
- Event replay, poison event and dead-letter recovery.
- Database restore followed by evidence-integrity verification.
- Kill and resume each external-effect lane independently.

## Explicitly unproven

Operating effectiveness, California legal structure, provider behavior, platform
API sufficiency, fraud-model accuracy, false-positive rate, recovery objectives,
and production security remain unknown until their required evidence exists.

