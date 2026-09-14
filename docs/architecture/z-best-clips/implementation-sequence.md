# Phase 1 Gated Implementation Sequence

## Gate 0: Authority and contract freeze

- Accept ADR-033 and ownership catalog.
- Assign stable IDs and version all commands, events and reason codes.
- Bind the contract package to an exact `zbestmedia` commit.
- Exit: independent contract review passes; no runtime claim is made.

## Gate 1: Evidence and tenancy spine

- Implement tenant/campaign authorization, append-only evidence and lineage.
- Add sensitive-data boundary and least-privilege access grants.
- Exit: negative tenant tests and evidence-integrity tests pass.

## Gate 2: Media and editorial control

- Implement custody, individualized packages, successor versions and approvals.
- Bind CinePhantom as advisory-only through versioned contracts.
- Exit: leak-containment, expired-access and stale-approval tests pass.

## Gate 3: Creator trust and assignment

- Implement verification receipts, certification, progressive trust and limits.
- Implement conflict, capacity and eligibility decisions with reason codes.
- Exit: unverified and over-limit creators cannot receive source packages.

## Gate 4: Publication and metric evidence

- Implement dual approval, publish intents, receipts and reconciliation.
- Implement authorized metric observations and calculation versioning.
- Exit: stale/duplicate intents and forged/unproven metrics fail closed.

## Gate 5: Fraud, appeals and finality

- Implement flags, quarantine, independent cases, decisions and appeal reversal.
- Enforce 14-day measurement closure and seven-day hold.
- Exit: separation-of-duties and false-positive recovery tests pass.

## Gate 6: Reward accounting simulation

- Implement ring-fenced balances, atomic reservations and balanced ledger entries.
- Exercise failure, duplicate, reversal and reconciliation paths with transfer off.
- Exit: complete simulated campaign reconciles to zero unexplained difference.

## Gate 7: Recovery, security and exact-subject assurance

- Exercise restore, kill switches, migrations, alert ownership and incident paths.
- Obtain independent security, reliability and AEGIS reviews on exact commits.
- Exit: only an approved supervised-production plan; real money remains a
  separate founder and legal gate.

## Build-order rule

No front-end control may imply an action exists before its backend authority,
state transition, evidence contract, failure behavior and denial test exist.
Frontend and backend may be designed together, but backend truth gates exposure.

