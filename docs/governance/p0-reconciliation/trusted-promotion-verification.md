# Trusted Promotion Verification Contract

JSON Schema validates the structure of a promotion envelope. It is not an authorization authority and must never compute `LIVE_MISSION_PROVEN` by itself.

The candidate-specific verifier in `scripts/validate-p0-reconciliation.mjs` demonstrates the mandatory semantic checks. A future runtime implementation must use an independently owned trust store and reproduce these fail-closed rules.

## Trusted inputs

The verifier receives these values from trusted session and control boundaries, never from the promotion request:

- exact subject SHA and agent ID;
- reviewed specification and runtime repository commit bindings;
- authenticated agent-specific specification and runtime binding records;
- tenant and workspace;
- authorized human principal IDs;
- authenticated evidence records keyed by immutable evidence ID;
- authenticated human approval records keyed by immutable approval ID;
- trusted evidence issuers and authoritative systems;
- known immutable artifact IDs and hashes;
- approved authorization, revocation, and downstream-invalidation policies;
- revoked evidence IDs, approval IDs, and schema versions;
- trusted current time.

## Promotion decision

A record is eligible only when:

1. `stageHistory` is the exact monotonic prefix ending at `promotionStatus`;
2. every required stage has one verified, unexpired evidence envelope;
3. the complete specification and runtime binding objects exactly match authenticated, agent-specific trust-store records;
4. specification and runtime commits resolve to the reviewed commits in trusted context;
5. specification, runtime, and evidence artifacts resolve to trusted immutable hashes;
6. every supplied evidence envelope exactly matches its authenticated trust-store record and binds the same subject SHA, agent, tenant, workspace, artifact, issuer, system, and validity window;
7. duplicate, revoked, expired, failed, foreign, future-dated, or pre-subject evidence is rejected;
8. tools use the closed read-only vocabulary and the trusted tenant scope;
9. live promotion has a current approval envelope that exactly matches an authenticated approval-ledger record from an authorized human principal;
10. approval binds the same SHA and the complete set of specification, runtime, and evidence artifacts, plus the same tenant and workspace, and postdates subject creation;
11. the schema version, evidence, approval, and governing policies are not revoked.

The CI candidate SHA is independently compared with the checked-out Git `HEAD`; an environment variable is never accepted as identity evidence by itself.

The producer cannot self-promote. Schema validity alone returns `STRUCTURALLY_VALID`, never `AUTHORIZED`.

## Evidence status changes

Any evidence or approval becoming `REVOKED`, `EXPIRED`, `FAILED`, unavailable, or mismatched immediately makes the promotion decision `BLOCKED`. Consumers must recompute eligibility; they may not cache a previous live decision as permanent truth.
