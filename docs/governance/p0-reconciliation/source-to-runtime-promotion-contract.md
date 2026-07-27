# Source-to-Runtime Promotion Contract

An agent progresses only through evidence-backed states:

`SOURCE_PINNED → LINEAGE_VERIFIED → RECONCILED → SINGLE_TASK_DEFINED → MASTERY_SKILLS_DEFINED → CONTRACT_VALIDATED → RUNTIME_IMPLEMENTED → LOCALLY_VERIFIED → BENCHMARK_PASSED → SECURITY_REVIEWED → RELIABILITY_REVIEWED → EXACT_SHA_VERIFIED → AEGIS_CERTIFIED → SUPERVISED → LIVE_MISSION_PROVEN`

## Required handoff

Every promotion handoff must contain:

- agent ID and immutable contract version;
- `zbestmedia` repository, exact commit SHA, path, and source hash;
- `zbestmedia-ui` repository, exact commit SHA, runtime binding, and manifest ID;
- tenant and authorization boundaries;
- tool allowlist and forbidden actions;
- artifact and evidence contract;
- tests and exact-SHA CI links;
- security, reliability, Red Team, Sentinel, and independent AEGIS results when required;
- supervised mission evidence;
- failures, warnings, unresolved risks, rollback, and next owner;
- human approval identity and timestamp for any release gate.

## Fail-closed rules

- Promotion history must be the exact monotonic stage prefix; stages cannot be skipped or self-asserted.
- JSON Schema proves structure only. The trusted verifier authenticates evidence, authority, tenant/workspace binding, expiry, and revocation before promotion.
- `SPEC_ONLY` is never operational.
- Expired, missing, mismatched, or unsigned manifests cannot run.
- A browser return page cannot prove payment.
- CI cannot substitute for human review, AEGIS, supervised proof, or production evidence.
- No implementer may approve or certify its own work.
- A runtime binding with a different contract hash is rejected.
- Missing evidence produces `BLOCKED`, never inferred success.
- Revoked or superseded schemas, evidence, approvals, or artifacts invalidate downstream promotion without deleting audit history.
