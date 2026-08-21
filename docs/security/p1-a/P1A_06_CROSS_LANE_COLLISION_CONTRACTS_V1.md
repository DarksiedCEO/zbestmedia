# P1A_06_CROSS_LANE_COLLISION_CONTRACTS_V1

Lane: P1A-06 (Claude). Law honored: shared authoritative files are routed via
P1A-08; producer lanes do not edit them. This lane made ZERO edits to any
shared surface. Each contract below names producer, consumer, subject file,
proposed delta, and failure mode. No contract marks any receiving lane
complete.

## CLC-06-A — artifact-registry schema: retention/tombstone columns
- Subject: `services/artifact-registry/prisma/schema.prisma` (03/05/06 seam,
  routed via P1A-08; live collision RC-05-A pending on P1A-05's uncommitted
  edit — P1A-08 sequences one merged schema change, one writer).
- Producer of this delta: P1A-06. Integrator: P1A-08. Co-consumers: P1A-03
  (evidence columns), P1A-05 (outbox columns).
- Proposed hunk (to be sequenced by P1A-08, not applied here):
  - `artifacts`: add `retention_class` (String, NOT NULL, default declared per
    census `RET-TENANT-CONTENT`), `retention_anchor` (DateTime, NOT NULL,
    immutable once written — anchor law), `deletion_state`
    (String: ACTIVE|TOMBSTONED|CRYPTO_ERASED, default ACTIVE),
    `payload_erased_at` (DateTime?).
  - `event_outbox`: add `retention_class` (default `RET-OUTBOX`),
    `tombstoned_at` (DateTime?).
  - new model `deletion_tombstones`: targetId, classId, tenantHash,
    subjectHash?, payloadDigest?, requestId, deletedAt — payload-free by
    schema (mirrors `makeTombstone` allowed keys).
- Failure mode if not integrated: outbox relay can resurrect deleted subjects
  (BD-06-003); sealed artifacts have no erasure state (BD-06-004).

## CLC-06-B — outbox relay tombstone consultation (P1A-05)
- Subject: `services/artifact-registry/src/events/*` relay path (P1A-05 lane
  code; this lane does not edit it).
- Contract: before relaying, the relay MUST consult the tombstone index and
  refuse tombstoned subjects. Reference semantics (the exact behavior both
  sides bind to): `guardOutboxRelay` in `scripts/validate-p1a-privacy.mjs` —
  throws `RELAY_BLOCKED_TOMBSTONED`; tested and mutation-hardened (M30).
- Producer: P1A-06 (semantics + tombstone store). Consumer: P1A-05 (relay).
  Version: V1. Evidence path: relay test must include the
  tombstoned-subject negative control.
- Failure mode: deleted data reappears via relay (deleted-data-reappears
  attack; 05/06 KNOWN_COLLISION in the seam register).

## CLC-06-C — brandgraph schema: GraphEvent FK + RotationAudit preservation
- Subject: `services/brandgraph/prisma/schema.prisma` (04/06 seam, routed via
  P1A-08).
- Proposed hunk:
  - `GraphEvent`: add relation `tenant Tenant @relation(fields: [tenantId],
    references: [id], onDelete: Cascade)` — closes BD-06-001 (tenant-delete
    residue). Until it lands, engine-governed scan deletion + residue pass is
    the compensating control (tested).
  - `RotationAudit`: REMOVE `onDelete: Cascade` (replace with `Restrict`) and
    document SCOPED_EXEMPTION — closes BD-06-002; revocation history is
    append-only and preserved (P1AF-084). Pseudonymization of subject
    references on tenant offboard is the declared reconciliation.
- Failure mode: either tenant residue (082) or evidence destruction (084) —
  the base schema currently has BOTH defects, one per table.

## CLC-06-D — service-auth deletion authorization (P1A-04)
- Subject: `packages/service-auth/src/index.ts` (04/06 seam, routed via
  P1A-08).
- Contract: tenant-/subject-scoped deletion requests must be authorized by the
  identity layer (who may request erasure for whom); the deletion engine's
  eligibility step is the enforcement point and already refuses cross-tenant
  and wrong-subject requests structurally. Needed from P1A-04: the identity
  assertion format binding requester → tenant/subject. Version: V1.
- Failure mode: an authenticated-but-unauthorized caller triggering another
  tenant's erasure.

## CLC-06-E — CI / CODEOWNERS registration of lane files (P1A-08)
- Subject: `.github/workflows/ci.yml`, `.github/CODEOWNERS` (P1A-08-owned
  shared surfaces; P1A-03 precedent).
- Request: register `scripts/validate-p1a-privacy.mjs`,
  `scripts/test-p1a-privacy.mjs`, `scripts/test-p1a-privacy-mutation.mjs` as
  trusted-surface files and wire both test entrypoints into CI (exit-code
  gated, no `|| true`).
- This lane did NOT self-amend either file.
