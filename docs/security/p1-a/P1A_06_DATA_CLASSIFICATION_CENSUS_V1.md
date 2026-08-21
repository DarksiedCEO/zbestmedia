# P1A_06_DATA_CLASSIFICATION_CENSUS_V1

Lane: P1A-06 (Claude) — Privacy / Retention / Deletion / Data Lifecycle
Subject: DarksiedCEO/zbestmedia @ base `b0c1b2129123b941c6a350c16dae0ae3a8e076ca`
(tree `c8fe6f31288bffcf1b8c35a825c60c6a5d31703d`)

Machine-readable form: `scripts/validate-p1a-privacy.mjs` —
`BASE_PERSISTENCE_MANIFEST`, `BASE_SCHEMA_DEFECTS`, `buildBaseClassificationRegistry()`,
`buildBaseRetentionPolicySet()`. The registry construction itself passes the
fail-closed classification gates (every class declares retention, copy scopes,
erasure strategy, tenant deletion path where tenant-scoped, and field-level
classes for persisted JSON).

## Coverage honesty

**COVERAGE_UNKNOWN.** This census enumerates the two Prisma schemas present at
base (`services/artifact-registry/prisma/schema.prisma`,
`services/brandgraph/prisma/schema.prisma`). It does NOT claim exhaustiveness
over: filesystem artifacts, logs, third-party stores, CI artifacts, caches
created at runtime, or provider-side storage (the last is BLOCKED_EXTERNALLY on
P1AF-089). `BASE_PERSISTENCE_MANIFEST.exhaustive = false` is deliberate and the
census-coverage check preserves COVERAGE_UNKNOWN rather than minting a clean
verdict from a partial denominator (HS-REG-001).

## Censused surfaces (8)

| Surface | Data class | Retention class | Erasure | Tenant-scoped | Persisted JSON |
|---|---|---|---|---|---|
| artifact-registry `artifacts` | TENANT_CONTENT | RET-TENANT-CONTENT (730d, CREATED_AT) | CRYPTO_ERASE (sealed rows) | yes (workspace/brand) | payload=TENANT_CONTENT, meta=TELEMETRY, evalReport=EVIDENCE_AUDIT |
| artifact-registry `artifact_lineage_edges` | EVIDENCE_AUDIT | RET-EVIDENCE (unbounded, justified) | SCOPED_EXEMPTION (payload-free, append-only) | no | — |
| artifact-registry `event_outbox` | TENANT_CONTENT | RET-OUTBOX (30d, CREATED_AT) | TOMBSTONE | no (subject-scoped) | payload=TENANT_CONTENT |
| brandgraph `Tenant` | OPERATIONAL_PERSONAL | RET-TENANT-IDENTITY (1095d, LAST_ACTIVITY) | TOMBSTONE | yes (root) | — |
| brandgraph `Brand` | TENANT_CONTENT | RET-TENANT-CONTENT | PHYSICAL_DELETE | yes (FK cascade) | — |
| brandgraph `GraphEvent` | TENANT_CONTENT | RET-EVENTS (365d, CREATED_AT) | PHYSICAL_DELETE | yes (engine-governed; NO FK at base) | payload (String-encoded JSON) = TENANT_CONTENT |
| brandgraph `AgentManifest` | OPERATIONAL_PERSONAL | RET-AGENT-MANIFEST (400d, CREATED_AT) | PHYSICAL_DELETE | yes (FK cascade) | — |
| brandgraph `RotationAudit` | EVIDENCE_AUDIT | RET-EVIDENCE | SCOPED_EXEMPTION (append-only, preserved) | yes (exempt from erasure, justified) | — |

## Base schema defects found (recorded, NOT edited around)

Shared schema files are 03/05/06 and 04/06 seams routed via P1A-08; this lane
records the defects and routes the fixes (see
`P1A_06_CROSS_LANE_COLLISION_CONTRACTS_V1.md`).

- **BD-06-001** `brandgraph.GraphEvent`: no relation/FK to `Tenant` — tenant
  cascade deletion cannot reach GraphEvent rows. Tenant-delete residue.
  (P1AF-082.) Until the schema fix lands, tenant deletion for GraphEvent is
  engine-governed by tenantId scan and verified by the residue pass.
- **BD-06-002** `brandgraph.RotationAudit`: `onDelete: Cascade` destroys
  rotation/revocation audit history on tenant delete — contradicts append-only
  preservation (P1AF-084). Lane-declared reconciliation: SCOPED_EXEMPTION,
  pseudonymized subject references, preserved under tenant deletion.
- **BD-06-003** `artifact-registry.event_outbox`: `payload Json` rows carry no
  retention class; the relay path consults no tombstone state, so a deleted
  subject can be resurrected by a later relay (P1AF-079/P1AF-081; 05/06
  KNOWN_COLLISION; live producer-lane collision RC-05-A already issued by
  P1A-08 against P1A-05's uncommitted schema edit).
- **BD-06-004** `artifact-registry.artifacts`: `payload`/`meta`/`evalReport`
  JSON unclassified at base; `immutableAt` sealing has no declared erasure
  reconciliation (P1AF-081/P1AF-083). Lane-declared reconciliation for sealed
  rows: CRYPTO_ERASE payload, digests/lineage preserved.
- **BD-06-005** `brandgraph.GraphEvent.payload`: JSON persisted as opaque
  `String`, no field-level classification at base (P1AF-081).

## Secrets

No dedicated secret-bearing table exists in either schema at base. The
classification layer enforces, fail-closed, that any future SECRET_CREDENTIAL
class must carry bounded retention (`SECRET_IMPROPER_RETENTION`) and that
secret-like fields can never enter audit entries or tombstones
(`PROHIBITED_PAYLOAD_IN_AUDIT` / `PROHIBITED_PAYLOAD_IN_TOMBSTONE`).
COVERAGE_UNKNOWN applies to env/CI secret custody, which is P1A-01/P1A-04
territory, not re-owned here.
