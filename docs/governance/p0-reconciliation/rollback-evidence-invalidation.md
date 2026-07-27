# Rollback, Evidence Revocation, and Downstream Invalidation

## Candidate rollback

The source rollback target for this candidate is the exact base:

`816c3a7c199e3c6bc4e482435eed60c1fcf0a11c`

Before merge, rollback means closing the PR and preserving its commits. After merge, rollback requires a new, reviewed revert commit; history must not be rewritten and historical evidence must not be deleted.

## Schema supersession

Every contract records `schemaVersion` and `supersedesSchemaVersion`. Consumers must reject a schema version listed by the trusted revocation policy. A superseding version does not erase the older record; it makes the older version ineligible for new promotion decisions.

## Evidence and approval revocation

Revocation records are append-only and identify:

- revoked evidence or approval ID;
- exact subject SHA and artifact IDs;
- issuer and revoking authority;
- reason and timestamp;
- replacement ID when one exists.

Revoked, expired, failed, missing, or foreign evidence cannot satisfy a gate. `NOT_REQUESTED`, `REJECTED`, `REVOKED`, and `EXPIRED` are not approval.

## Downstream invalidation

Consumers must:

1. resolve the current schema and revocation policy before each promotion decision;
2. revalidate all evidence and approval bindings;
3. change any invalidated promotion to `BLOCKED`;
4. prevent new execution, tool grants, or operational claims;
5. preserve the former decision and its evidence in audit history;
6. emit an invalidation event naming the subject, prior state, failed gate, policy version, and correlation ID.

Cached authorization must have a bounded lifetime no longer than the earliest evidence or approval expiry. A repository revert does not retract downstream copies by itself; downstream invalidation is mandatory.

## Recovery evidence

Rollback is not considered proven until an independent reviewer verifies the revert candidate, revocation records, consumer invalidation behavior, and preserved audit history at an exact SHA.
