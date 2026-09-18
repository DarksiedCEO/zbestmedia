# ZBM authority and evidence persistence — Slice B

This package is an uncommitted implementation candidate for independent review. ZBM owns shared persistence; this package does not confer independent approval-issuing authority. Phase 1 remains unchanged. The baseline is `8cfe47f014ca176402a62de886d0ec7f529b68fd`.

## Boundaries and ownership

Repository references: `packages/service-auth/src/index.ts` owns service authentication (`authenticateAndAuthorize`); `packages/zbc-domain-contracts/src/index.ts` defines `AuthorityContext`, `BoundApproval`, and `EvidenceEntry`. This package does not replace either. Existing Artifact Registry and Brandgraph schemas/outbox remain untouched. The authority tables contain permission metadata, not campaign domain state. `src/index.ts` exports persistence DTOs/interfaces only; SQL is the restricted database interface.

This slice implements the approved database-login binding and coarse tenant-lock defaults. They are proposed persistence protocols tested here, not certification of future command, worker, or API behavior. No HTTP API, bearer-token handler, command acceptance, replay table, aggregate, outbox or adapter is implemented.

## Provisioning and migration

`sql/provision-roles.sql` is a privileged bootstrap artifact. It creates NOLOGIN object owner and capability roles and the migrator membership; it contains no credentials or tenant data. An ordinary migration cannot create roles. The disposable harness makes the migrator a NOSUPERUSER/NOCREATEROLE login and supplies an ephemeral password. Migration uses explicit `SET ROLE zbm_ae_owner`. The owner creates schema objects; runtime groups cannot become owner or migrator.

Run neither provisioning nor migration against an inherited, shared, developer or production database URL. `test/helpers/postgres.ts` creates its own PostgreSQL container, random credentials and URL, runs `prisma migrate deploy`, and closes its sessions/container in `finally`/`afterEach`. Testcontainers' resource reaper covers process loss. SQL credentials are not printed. PostgreSQL is pinned to `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20` (16.14). An unavailable engine is a failure, never a skipped passing suite.

Runtime groups have schema USAGE and explicitly listed function EXECUTE only. Base tables and sequences are inaccessible. Public function EXECUTE is revoked globally for owner defaults and explicitly on existing functions. Safe `search_path=pg_catalog` and schema-qualified application references prevent shadow substitution. There are no runtime owner/migrator memberships or unrestricted SQL helpers.

Bindings are owner-controlled and unique per authenticated login and tenant/principal. Fixtures establish them through bootstrap authority, followed by actual separate runtime logins with minimum capability memberships. One identity test intentionally grants an extra group to prove the binding still limits scope. This extra grant is adversarial fixture setup, not the ordinary topology.

Owner-only `provision_tenant`, `provision_campaign` and `change_binding` functions follow the same logical locks as protected use. Concurrent administrative operations must call these functions. Other provisioning changes (capabilities, issuers) must pre-acquire the target binding key, lock its row, then acquire its tenant key before updating. Immutable binding identity must never be reassigned. Initial fixture inserts happen before runtime assertions. The binding trigger is a backstop; direct owner DML is not a supported concurrent administration interface, because tuple locks can otherwise precede advisory locks. Owner/superuser access is a trust boundary, not constrained runtime authority.

## Trusted caller and scoped functions

`session_user` identifies the authenticated database login. `current_user` is deliberately not used to derive identity in SECURITY DEFINER functions. Arguments request a target and must match protected binding; GUCs, `SET ROLE`, payload principals and requested issuers cannot establish authority. A missing, inactive, wrong-scope or wrong-purpose binding denies. Purpose is SIMULATION only. Tenant-wide versus campaign-only grants are explicit, and both binding and current grant must permit the capability.

Operational capabilities are READ, AUDIT, MANAGE_TENANT, MANAGE_GRANT, RECORD_APPROVAL and APPEND_EVIDENCE. Grant management cannot enlarge a caller's protected capability/issuer ceiling. Custodial actor is derived from binding; approval actor must match it. Issuer custody is restricted to the owner's provisioned set. No generic service can impersonate a human decision maker. Finance authority is not included. External issuer authenticity remains unimplemented.

- `observe_authority`: transaction-scoped protected observation, not a token or command acceptance.
- `set_tenant_status`: expected-version status update plus evidence; REVOKED is terminal.
- `create_grant`, `revoke_grant`, `supersede_grant`: immutable grant content with status metadata and atomic evidence.
- `record_approval`, `revoke_approval`, `supersede_approval`: scoped exact subject/version/hash/issuer custody and status history.
- `read_approval`: exact current valid approval, after current READ authority.
- `append_evidence`: server sequence, immutable append or same-stream correction.
- `read_evidence`: current READ, or explicitly requested bound AUDIT, before disclosure.

Missing and foreign scoped reads/mutations deny with SQLSTATE 42501 and `Scope unavailable`, without echoing foreign attributes. Invalid input/constraint failures are not authorization grants. Grant/approval content cannot be overwritten by runtime; supersession creates a new decision and updates old status metadata atomically. Tenant/campaign keys and FKs, status/interval/hash checks and lookup indexes are represented in migration SQL and Prisma mappings. Prisma cannot express every PostgreSQL CHECK, function, trigger, privilege or NULLS NOT DISTINCT rule: the reviewed SQL migration is authoritative. Do not replace it with `db push` or schema-diff-generated SQL without review.

## Transaction and revocation protocol

Use READ COMMITTED and one authenticated principal/tenant per transaction. Scope arguments cannot select another tenant. The order is:

1. Exclusive transaction advisory binding key, then reread the binding `FOR UPDATE`.
2. Exclusive tenant key (even when the requested campaign/grant is absent), then tenant row `FOR UPDATE`.
3. Existing campaign and participating grant/approval rows `FOR UPDATE` under the already-exclusive tenant lock.
4. Evidence stream key, then allocate the next sequence and hash link.

The tenant lock serializes all campaign work, grant changes, suspension and protected reads within a tenant. No additional campaign/grant advisory key is needed under that coarser exclusive lock. Stream keys are acquired only after the tenant key. Nested helpers reuse the same binding and tenant; they never switch identity/tenant. Cross-tenant batches are unsupported. Administrative binding changes lock the target binding before its tenant. Absent tenant/campaign provisioning uses the same tenant key.

`lock_key` v1 is signed big-endian first 64 bits of SHA-256 over UTF-8 PostgreSQL 16 JSONB array text: `["zbm-ae-v1", kind, ...identity]`. Kinds are `binding`, `tenant`, `stream`; stream identity includes tenant, nullable campaign and stream. Tests compare independent SHA-256 calculations for Unicode and NULL vectors. Collisions can serialize unrelated work or cause a detected deadlock; they cannot grant permission. No `hashtext` or caller-controlled lock is exposed.

After locks, `authorize_scope` captures database `clock_timestamp()` once and returns it privately with the binding. Grant and approval validity use that protected time: `valid_from <= decision_time < expires_at`. Commit is durable mutation linearization, not a promise that a grant remains unexpired through wall-clock commit. Mutations and evidence are one transaction. Suspension/revocation denies all campaigns including reads. Only bound MANAGE_TENANT status administration and bound AUDIT observations/evidence reads bypass inactive tenant status; ordinary approval/evidence writes do not. Audit does not bypass revoked caller binding or missing/expired audit grant.

Semantic version conflicts (SQLSTATE 40001, message `Version conflict`) must not be retried automatically. This slice implements zero automatic retries, within the allowed maximum of three; deadlock/serialization/connection errors require rollback and fresh authority. It never treats an ambiguous connection outcome as success. Tests prove rollback/connection-loss release and no duplicate evidence; there is no background retry worker. Future retries must distinguish semantic conflicts and unknown commit outcomes.

## Evidence format and limitations

Version `zbm-ae-evidence-v1` canonical bytes are PostgreSQL 16 JSONB array text encoded UTF-8 in this order: version, generated UUID text, tenant, nullable campaign, stream, sequence, operation, nullable predecessor ID, prior hash, bound actor, bound custodial login, UTC timestamp with six fractional digits and `Z`, payload object. JSONB canonical object ordering, JSON null, database numeric representation and escaping are retained verbatim; do not reserialize using JavaScript JSON.stringify. The complete text is stored so SHA-256 can be recomputed independently. Initial prior hash is 64 zeroes. Correlation fields may be carried in the immutable payload; they confer no authority.

A correction has one same-scope, same-stream predecessor and the unique predecessor constraint allows one direct successor. Further corrections form a chain. The stream sequence and prior hash include every committed append/correction. Runtime cannot reset sequence, update/delete/truncate history, or replace the enforcing trigger. Tests inject a constraint failure to prove evidence and status changes roll back together.

Hashes detect changes relative to trusted earlier observations; they do not prove event truth, issuer authenticity or administrator-proof history. An owner, superuser or storage administrator can disable constraints or rewrite the whole chain. No external anchor exists here.

## Verification

Use exactly Node v24.21.0 and pnpm 9.15.0. From repository root:

```sh
pnpm --filter @zbest/zbm-authority-evidence-store run typecheck
pnpm --filter @zbest/zbm-authority-evidence-store run lint
pnpm --filter @zbest/zbm-authority-evidence-store run schema:validate
pnpm --filter @zbest/zbm-authority-evidence-store test
```

Schema validation needs a syntactically valid disposable placeholder DATABASE_URL but does not connect; tests replace any inherited URL with their generated container URL. Configure DOCKER_HOST per process if necessary, not globally. Integration tests require Docker and the pinned image; role provisioning is separate from migrations. No application database URL is accepted by the harness.

Test matrix: migration covers B-INF-01 through B-MIG-02 (the pre-feature readiness receipt is separate evidence); caller-binding covers B-ID-01–03; privileges B-PRV-01–03; tenancy-grants B-TEN-01–02/B-GRT-01; approvals B-APR-01–02; evidence B-EVD-01–03; authority-races B-RACE-01–07. Race tests use observed PostgreSQL blockers rather than sleep-based winners. Exact executed/passed/failed/skipped totals belong in the execution report, not an assumed historic denominator.

Dependencies use the existing Vitest baseline, Testcontainers 10.18.0, pg 8.13.1 and Prisma 5.22.0. The package-local @types/node 20.19.31 and one resolution invocation with `--config.dedupe-peer-dependents=false` preserve every existing lockfile importer/package/snapshot binding. No workspace override or persistent pnpm configuration is added. A subsequent ordinary frozen install must leave the lockfile byte-identical.

## Deferred C–E and release gates

Pooled service delegation and HTTP-user authentication need separate design. A future replay read must recheck current retrieval permission, not rely on historical execute permission. State-only command completion requires durable state/evidence/replay commit. Effect-intent acceptance is not effect success: success requires a durable receipt; uncertainty remains UNKNOWN_PENDING_RECONCILIATION. Worker completion fencing alone cannot prevent stale adapter invocation. Future FAKE operation storage must enforce operation identity, deduplication and current fence within its atomic simulated-effect transaction.

Finance balances, atomic budget reservation, ledger/settlement, live adapters, real money and Gate 6 are excluded. Builder tests are not independent AEGIS review or production certification. Independent review and new authorization are required before integration, commit, push, PR, merge or deployment.

## Simulation bridge (forward extension)

`20260916_000002_simulation_runtime_bridge` follows the unchanged historical migration.
Provision the new NOLOGIN `zbm_ae_simulation_bridge` role before migration, and grant it
only to the trusted simulation object owner. Runtime logins must never be members.
The migration extends allowed binding/grant capabilities with `EXECUTE_SIMULATION`
and `PROCESS_SIMULATION`; it grants neither capability to any existing identity.
The prior B review does not certify this extension.

The six bridge functions are B-owned SECURITY DEFINER functions with fixed
`pg_catalog` search paths and no PUBLIC/runtime EXECUTE. Lock preparation returns
`caller`/`requester` protected records and `locked:true, authorized:false`.
COMMAND/DISPATCH prepare distinct binding keys in C-collation login order before
the tenant key/rows and grants. Approval rows are locked in sorted ID order.
If an approval's custodian changes to an unprepared identity, execution fails;
no binding lock can be newly acquired after this scope's tenant lock.
Supported B administration serializes on these keys. Direct privileged DML that
ignores the existing admin lock protocol is not a supported concurrent operation.

`authorize_simulation_transition` checks all grants, protected bindings and exactly
one independent TECHNICAL_QC approval at a shared `decisionTime` sampled after all
blocking authority locks. Subject type is `SIMULATION_PROBE_TRANSITION_V1`;
versions are canonical nonnegative int64 strings, including values above 2^53.
COMMAND requires the session caller to be the requester with READ+EXECUTE_SIMULATION.
DISPATCH requires current worker READ+PROCESS_SIMULATION and original requester
READ+EXECUTE_SIMULATION plus current exact approval/custodian validity. Its returned
principal/login identify the worker, never an impersonated original requester.
Time validity is at the locked decision point, not guaranteed at wall-clock commit.

READ requires only current READ and active SIMULATION scope. PROCESS requires
current READ+PROCESS_SIMULATION. Neither resolves historical approvals/custodians
or requires old execute authority. The D owner separately enforces its worker SQL
role. `assess_simulation_dispatch` first checks current PROCESS then returns a
boolean diagnostic about old authority using plain SELECTs under the tenant lock;
it takes no historical binding locks and conveys no execution authority.

`append_simulation_evidence` requires prepared caller/tenant locks and current
session-derived COMMAND/PROCESS capability; only COMMAND_ACCEPTED is in the COMMAND
family. The PROCESS family is DISPATCH_CLAIMED, RECONCILE_CLAIMED, RECONCILE_EXPIRED,
RECONCILE_UNRESOLVED, RETRY_SCHEDULED, EFFECT_COMPLETED, EFFECT_FAILED and RECOVERY_PARKED.
Only event/commandId/operationId/reason/ownershipEpoch/dispatchNumber/requesterPrincipal/
identityHash are accepted, with event and commandId required. Actor/login come from
session_user, and records use B's immutable canonical chain in simulation-runtime-v1.
D's trusted owner must enforce prior exact approval acceptance in the same COMMAND
transaction and valid ownership/terminal uniqueness for PROCESS; this owner bridge
is not a standalone runtime mutation API and cannot validate D's private lease rows.
