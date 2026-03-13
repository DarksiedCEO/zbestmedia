# Aaliyah Atomic Agent Registry v1

This document mirrors the machine-readable atomic agent registry used by Agent OS.

## Governing rules
- every entry owns exactly one atomic task
- every entry declares forbidden scope
- every entry declares escalation triggers and fallback behavior
- Aaliyah remains orchestration-only
- specialist execution is prohibited unless the owning atomic agent is invoked

## Core orchestration entry
- `aaliyah`
  - task: executive orchestration and founder protection
  - ownership: COO / Operations
  - forbidden scope: specialist execution, direct dispatch, policy overrides, monitoring ownership

## Email/runtime atomic set
- `aaliyah-thread-normalizer`
- `aaliyah-intent-classifier`
- `aaliyah-urgency-scorer`
- `aaliyah-risk-scorer`
- `aaliyah-company-mode-resolver`
- `aaliyah-contact-tier-assigner`
- `aaliyah-ownership-resolver`
- `aaliyah-approval-requirement-decider`
- `aaliyah-escalation-decider`
- `aaliyah-interrupt-classifier`
- `aaliyah-draft-composer`
- `aaliyah-review-item-creator`
- `aaliyah-review-state-manager`
- `aaliyah-dispatch-eligibility-validator`
- `aaliyah-approved-draft-dispatcher`
- `aaliyah-audit-trace-recorder`
- `aaliyah-policy-compliance-validator`
- `aaliyah-memory-boundary-enforcer`
- `aaliyah-scope-drift-detector`
- `aaliyah-overlap-detector`
- `aaliyah-fallback-decider`

The machine-readable registry is the source of truth. This file exists to make the atomic structure readable during prompt and safety review.
