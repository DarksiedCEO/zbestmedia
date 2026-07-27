# Trusted Promotion Verification Contract

JSON Schema validates the structure of a promotion envelope. It is not an authorization authority and must never compute `LIVE_MISSION_PROVEN` by itself.

The candidate-specific verifier in `scripts/validate-p0-reconciliation.mjs` demonstrates the mandatory semantic checks. A future runtime implementation must use an independently owned trust store and reproduce these fail-closed rules.

## Trusted inputs

The verifier receives these values from trusted session and control boundaries, never from the promotion request:

- exact subject SHA and agent ID;
- tenant and workspace;
- authorized human principal IDs;
- trusted evidence issuers;
- known immutable artifact IDs and hashes;
- approved authorization, revocation, and downstream-invalidation policies;
- revoked evidence IDs, approval IDs, and schema versions;
- trusted current time.

## Promotion decision

A record is eligible only when:

1. `stageHistory` is the exact monotonic prefix ending at `promotionStatus`;
2. every required stage has one verified, unexpired evidence envelope;
3. every envelope binds the same subject SHA, agent, tenant, workspace, artifact, issuer, and validity window;
4. duplicate, revoked, expired, failed, foreign, future-dated, or pre-subject evidence is rejected;
5. tools use the closed read-only vocabulary and the trusted tenant scope;
6. live promotion has current approval from an authorized human principal;
7. approval binds the same SHA, artifacts, tenant, and workspace and postdates subject creation;
8. the schema version, evidence, approval, and governing policies are not revoked.

The producer cannot self-promote. Schema validity alone returns `STRUCTURALLY_VALID`, never `AUTHORIZED`.

## Evidence status changes

Any evidence or approval becoming `REVOKED`, `EXPIRED`, `FAILED`, unavailable, or mismatched immediately makes the promotion decision `BLOCKED`. Consumers must recompute eligibility; they may not cache a previous live decision as permanent truth.
