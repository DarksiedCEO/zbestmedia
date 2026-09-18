# Slice E local simulation operator runbook

Status: **E PENDING independent review**. This document describes the bounded local rehearsal, not a passing result. The [acceptance matrix](slice-e-acceptance-matrix.md) is the controller's evidence ledger.

The approved implementation plan §13 bounds E to assembled synthetic authentication, command, authority, evidence and database-backed FAKE worker paths; migration and backup/restore into an isolated local database; shutdown/replacement; bounded recovery; and sanitized diagnostics. No production, hosted server, live provider, finance, publication, real campaign/department workflow, capacity certification or release authority is included.

The independent D closure report gives `GREEN_FOR_SLICE_D_SIMULATION_SCOPE` only to fresh disposable provisioning of tree `7f44f58b7d96457121cf386a3216a80ffddf4fac`. It is neither an E result nor deployment approval. Source records consulted:

- Approved plan: `/Users/andrelove/Documents/Codex/2026-09-16/slice-d-planning/SLICE_D_IMPLEMENTATION_PLAN.md`, §13.
- Full closure report: `/Users/andrelove/zbc-slice-d-f1-f2-independent-review-20260917/INDEPENDENT_CLOSURE_REVIEW_REPORT.md`, especially §§5–7 and 10–11.
- [Runtime exports](../src/index.ts), [HTTP boundary](../src/http.ts), [worker](../src/worker.ts), [connection lifecycle](../src/connections.ts), [contracts](../src/contracts.ts), [existing database fixture](../test/helpers/postgres.ts), and [B operations and locking protocol](../../zbm-authority-evidence-store/README.md).

## Local prerequisites and commands

Use exactly Node `v24.21.0`, pnpm `9.15.0`, PostgreSQL `16.14`, and image `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`. The D fixture checks all three versions. Docker must be reachable by this process; use the actual local engine's `DOCKER_HOST` if needed. Do not assume a socket address, change global configuration, or use another image when the pin is unavailable.

Run from the repository root:

```sh
cd /Users/andrelove/zbc-slice-e-local-20260917/repository
node --version
pnpm --version
docker version
docker image inspect postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20
pnpm install --frozen-lockfile --offline
pnpm run prisma:generate:all
DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-simulation-command-runtime test
pnpm --filter @zbest/zbm-simulation-command-runtime typecheck
pnpm --filter @zbest/zbm-simulation-command-runtime lint
DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:1/unused' pnpm --filter @zbest/zbm-simulation-command-runtime schema:validate
```

Generate the Prisma clients after dependency installation and before the controller regression checks below. Source snapshots exclude the gitignored generated clients, and the frozen install has no postinstall hook that creates them. `pnpm run prisma:generate:all` generates the Brandgraph and Artifact Registry clients from the checked-in schemas; it does not run migrations or connect to a database. Do not copy generated clients from another candidate as a substitute for this step. Git-dependent workspace and schema checks also require the recorded baseline Git objects and a resolvable HEAD; a source-only directory is insufficient.

The schema-validation URL is a non-connecting placeholder, never a provisioning target. Integration fixtures create their own container, random credentials and mapped port; they do not accept an inherited application database URL. An unavailable image, engine or dependency is an unresolved prerequisite, not a skipped pass. Do not use `db push`.

Focused E commands below target the implemented suites: 12 system cases (E01–E07 parameterization) and two backup/migration cases. These are source case counts, not execution results. Execution and independent review remain **PENDING**; the controller must freeze the final candidate. `test -f` prevents mistaking an absent test file for evidence. Do not add `--passWithNoTests`.

```sh
test -f packages/zbm-simulation-command-runtime/test/system-assurance.integration.test.ts && DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-simulation-command-runtime exec vitest run --config vitest.config.ts test/system-assurance.integration.test.ts
test -f packages/zbm-simulation-command-runtime/test/backup-restore.integration.test.ts && DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-simulation-command-runtime exec vitest run --config vitest.config.ts test/backup-restore.integration.test.ts
```

Controller regression commands, separate from the focused E denominator:

```sh
DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-authority-evidence-store test
DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-authenticated-command-boundary test
pnpm -r --filter '!@zbest/zbm-authority-evidence-store' --filter '!@zbest/zbm-authenticated-command-boundary' --filter '!@zbest/zbm-simulation-command-runtime' --if-present test
pnpm run test:p0-reconciliation
pnpm run lint
pnpm run typecheck
pnpm run schemas:check
pnpm run schemas:compat
pnpm run repo:doctor
```

Record exact candidate identity, command, versions, start/end time, exit code, executed/passed/failed/skipped counts and sanitized receipt/log locations. Historical D counts are not E counts. The standalone P0 rerun is not an additional set of distinct cases. Preserve failed attempts and setup failures separately. Independent review must examine the final exact candidate and its evidence.

## Provisioning and the supported migration route

Only freshly owned disposable databases are supported. The existing fixture's `Database.start(true)` demonstrates a historical **B-only** schema with representative data followed by the B bridge and repaired D; its argument is not an existing-D upgrade switch. The source sequence is:

1. Privileged bootstrap executes [B role provisioning](../../zbm-authority-evidence-store/sql/provision-roles.sql), then [D role provisioning](../sql/provision-roles.sql). These `CREATE ROLE` scripts expect a fresh role namespace.
2. Give the separate migrators disposable login credentials and their owners CREATE on the disposable database. B migrations run as `zbm_ae_migrator` with `role=zbm_ae_owner`; D migrations as `zbm_sim_migrator` with `role=zbm_sim_owner`.
3. For the B-first rehearsal only, apply `20260914_000001_authority_evidence_spine/migration.sql` as the B migration identity and record that exact historical migration with Prisma `migrate resolve --applied 20260914_000001_authority_evidence_spine`. This is fixture reconstruction of an already-applied B history, never permission to mark unexecuted SQL applied.
4. Deploy B's `20260916_000002_simulation_runtime_bridge`, then repaired D's `20260916_000001_simulation_runtime`. Preserve B data and separate `_prisma_migrations` histories under `zbm_authority_evidence` and `zbm_simulation_runtime`. Repeating deploy should apply nothing further.
5. Provision restricted logins, protected bindings, current SIMULATION grants and independent TECHNICAL_QC approval; seed the synthetic probe through owner-only `zbm_simulation_runtime.seed_probe(tenant,campaign,probe,digest)`. Login creation and credential delivery are outside the runtime API.

The fixture's actual migration invocation is Node running `node_modules/prisma/build/index.js` with `migrate deploy --schema <package schema.prisma>` and an internally constructed `DATABASE_URL` containing the appropriate `schema` and `options=-c role=...`. Prefer the fixture commands above to manually copying passwords or migration URLs into shell history. There is no package provisioning CLI.

**Existing D database upgrade is explicitly unsupported.** The F-1 repair removed a provisioning GRANT and edited the initial D migration. Removing a GRANT does not revoke already-held `zbm_ae_reader` membership, and an already-applied initial migration will not install the new observation function. Recreate old disposable databases. A persistent upgrade would require separately reviewed REVOKE and forward migration work; neither E migration rehearsal nor restore supplies that work. Do not restore an older D database and describe it as repaired.

Runtime groups must not inherit B roles, owner, migrator or bridge membership. D owner alone receives the B simulation bridge. Inspect both group memberships and individual login memberships: provisioning least privilege by group cannot prevent a separate administrator grant to a login. The fixture's `auditor_a` also has `zbm_ae_auditor` deliberately; that is not the runtime-login template. Runtime principal observation uses only D's granted `observe_runtime_principal(text,text)`, with current scoped READ and protected principal/login matching before COMMIT.

## Injected operation API

`createRuntime(config, dependencies)` returns `{plugin, worker, close}`. It opens no HTTP listener. Use Fastify `inject` in the local harness. Protected C configuration supplies a token-to-key/tenant map, enabled policy with audience `zbm-command-boundary/simulation` and validity interval, and one connection binding per key/tenant. Each binding contains `keyId`, `tenantId`, `principal`, `databaseLogin`, `credentialSlot`. Dependencies map each slot to exactly `{host,port,user,password,database}`. Connection strings, SSL options, arbitrary pool hooks and request-selected credentials are unsupported. Values come from the owned local setup, not request data.

This is an embedding example, not a standalone CLI. `config`, `dependencies`, `opaqueToken` and `workerBinding` must be supplied by the local harness; the worker binding must exactly match a configured protected binding for a separately provisioned worker login. The sample command matches the existing synthetic fixture, including its pre-seeded probe/approval. Use a fresh fixture per completion mode, or a separately seeded and approved transition; changing completion changes both the proposal digest and command identity.

```ts
import Fastify from 'fastify';
import { createRuntime, type AdvanceSimulationProbeV1 } from '@zbest/zbm-simulation-command-runtime';

const runtime = createRuntime(config, dependencies);
const app = Fastify({ logger: false });
try {
  await app.register(runtime.plugin);
  await app.ready();
  const command: AdvanceSimulationProbeV1 = {
    kind: 'ADVANCE_SIMULATION_PROBE', contractVersion: 1,
    scope: { tenantId: 'tenant-a', campaignId: 'campaign-a' },
    probeId: 'probe-a', expectedVersion: '0',
    expectedPayloadSha256: 'a'.repeat(64),
    nextPayloadSha256: 'b'.repeat(64), completion: 'FAKE_RECEIPT',
    approvalIds: ['approval-a'], idempotencyKey: 'key-a',
  };
  const headers = {
    authorization: `Bearer ${opaqueToken}`, 'content-type': 'application/json',
  };
  const accepted = await app.inject({
    method: 'POST', url: '/internal/simulation/probe-commands', headers, payload: command,
  });
  // Check accepted.statusCode and its parsed body before deciding the next step.
  // A 202 is command acceptance, not proof of a successful FAKE effect.
  if (accepted.statusCode === 202) {
    const report = await runtime.worker(workerBinding)(command.scope);
    // Inspect report.reason, nextDue and parkedCount; do not unconditionally loop.
    void report;
  }
  const current = await app.inject({
    method: 'POST', url: '/internal/simulation/probe-command-results', headers,
    payload: { scope: command.scope, idempotencyKey: command.idempotencyKey },
  });
  // Inspect current.statusCode and body using the outcome rules below.
  void current;
} finally {
  try { await app.close(); } finally { await runtime.close(); }
}
```

The existing `Database.application(login)` configures only that login. A worker call needs a matching worker configuration (for example a separate worker application from the fixture), or a complete multi-identity config. Supplying an arbitrary worker binding to the executor runtime is denied. Test helper `Database.submit()` calls SQL directly and therefore does not establish assembled authentication/HTTP coverage; E must submit/read through `app.inject` where the matrix says boundary.

STATE_ONLY returns HTTP 200 and `effect.status=NOT_REQUIRED`. FAKE_RECEIPT returns HTTP 202 on acceptance/replay; command `execution=COMPLETED` describes the committed state transition only. FAKE success requires `effect.status=COMPLETED`, matching `receiptId` and terminal evidence. The result route returns the caller's own scoped result, not another principal's result by key. Unknown fields are rejected; bodies are limited to 16 KiB; versions are canonical nonnegative int64 strings and digests lowercase SHA-256. One exact independent TECHNICAL_QC approval must cover `SIMULATION_PROBE_TRANSITION_V1` using the PostgreSQL transition digest in the [runtime README](../README.md).

| Observation | Local operator action |
|---|---|
| 400 BAD_REQUEST | Correct contract/content type; do not retry unchanged malformed input. |
| 401 UNAUTHENTICATED / 403 FORBIDDEN | Check protected configuration and current binding/scope/grants. Do not bypass authority or echo raw secrets/errors. |
| 409 CONFLICT | Reconcile command/key/version assumptions. A different command under an existing scoped key is not a retry. |
| 503 UNAVAILABLE with `acceptance=UNKNOWN` | COMMIT acknowledgement may be lost. Retain identical command and scoped key; look up/replay under current READ. Never use a new key to force another transition. |
| Other 503 / 500 | Preserve sanitized evidence, diagnose availability or internal failure; neither proves successful execution. |
| PENDING / LEASED / UNKNOWN_PENDING_RECONCILIATION | Inspect finite worker report and durable state; follow recovery rules below. |
| UNKNOWN_PENDING_RECONCILIATION with `parked=true` | Stop automatic invocation for that work and retain evidence. No supported reset/unpark API exists. |

Replay uses the same SIMULATION tenant, campaign, protected principal, key and canonical command. It needs current READ, active scope and binding, but not historical EXECUTE_SIMULATION or approval validity. A READ-only identity cannot retrieve somebody else's result. READ revocation, disabled binding or suspended scope denies disclosure even for accepted work. A result lookup denial is not proof that a command never committed.

## Workers, shutdown and replacement

The API is `await runtime.worker(binding)(scope)`. Each invocation is finite: at most 32 claims, 120 seconds, or three consecutive connection failures (1-second then 5-second pauses). The transport has a 20-second call watchdog, 5-second statement timeout, 2-second lock timeout, and destroys uncertain/cancelled connections. These are source constants, not CLI options. Current READ and PROCESS_SIMULATION plus restricted worker SQL membership are mandatory. Creating a new FAKE effect also rechecks original requester READ/EXECUTE_SIMULATION and the exact approval/custodian; reconciliation of committed truth does not require those historical permissions to remain valid.

Reports have `reason`, `claims`, `nextDue`, `parkedCount`. Reasons are `EMPTY`, `NOT_DUE`, `CLAIM_LIMIT`, `DEADLINE`, `UNAVAILABLE`, `UNCERTAIN`, `STOPPED`, `DENIED`, `ERROR`. EMPTY can coexist with parked work; inspect `parkedCount`. NOT_DUE gives the earliest due time. A subsequent invocation is explicit, only after due time and with current authority. UNAVAILABLE/UNCERTAIN requires transport/durable-state inspection, not blind effect retry. DENIED pauses processing until legitimately authorized; do not grant a bypass.

For graceful shutdown, retain the in-flight worker Promise, call `runtime.close()` to abort active invocations and close pools, then await that Promise and close the Fastify app. A worker already racing a failure may report a reason other than STOPPED; inspect durable truth rather than treating shutdown acknowledgement as rollback proof. `app.close()` also calls runtime close through its hook. Close is idempotent, but connection close's bounded wait is not by itself proof of zero backends: verify owned runtime sessions and sockets separately.

Replacement uses a **new runtime instance**, explicit protected connection configuration and current worker authority against the same owned database. The closed instance does not restart. After a real child crash, preserve its exit/barrier evidence and allow the durable lease (10 seconds) and due times to govern takeover. Never transfer a stale owner token to the replacement. The existing `WorkerChild` is a SQL/IPC fault fixture, not a runtime daemon or server; E's assembled replacement uses the separate RuntimeChild harness. The [system-assurance helper](../test/helpers/system-assurance.ts) adds a `RuntimeChild` with `run()` and `close()` for a real assembled runtime process; it remains a test harness. There is no built-in production process supervisor or signal handler.

Dispatch budget is at most three durable claims per intent. Reconciliation has at most three durable reservations **per dispatch generation**, independent of dispatch budget. Expired reservations and unsuccessful receipt observations have separate counters. Reconciliation checks receipts before concluding absence: matching receipts complete even after requester revocation; proven absence can schedule 1-second/5-second retries or end FAILED when authority/budget disallows another dispatch. Lease expiry alone never authorizes a new effect. Inconsistency remains UNKNOWN and parks after recovery exhaustion. A third-dispatch crash gets reconciliation, never dispatch four. Repeated invocations, competing workers and replacement must preserve these budgets and terminal/effect uniqueness.

## Consistent local backup and restore

The [backup/restore helper](../test/helpers/backup-restore.ts) and [rehearsal tests](../test/backup-restore.integration.test.ts) implement the rehearsal; verification and acceptance remain **PENDING**. `Database.restart()` only restarts the same container/storage and is not a backup/restore operation. E restores the repaired fresh candidate into a **different isolated pinned container/database**, preserving B and D together.

The helper's `requireLocalImage()` requires process-local `DOCKER_HOST=unix:///Users/andrelove/.docker/run/docker.sock` and inspects the pinned image before proceeding. This is an explicit host-specific fixture requirement, not an inferred default socket. Operator commands also set `TESTCONTAINERS_RYUK_DISABLED=true` process-locally, as required by the backup helper, to prevent an unapproved reaper sidecar image pull. The execution wrapper `run.py` supplies the same setting; direct commands must supply it explicitly. For a full runtime suite including the backup suite, use:

```sh
DOCKER_HOST='unix:///Users/andrelove/.docker/run/docker.sock' TESTCONTAINERS_RYUK_DISABLED=true pnpm --filter @zbest/zbm-simulation-command-runtime test
```

If that socket/image is unavailable, report the prerequisite failure; do not redirect the rehearsal to another database. The current helper creates B-only history via `BRehearsalDatabase.startBase()`, applies the B bridge before `provisionD()`/D deploy, and creates a restore target via `new RestoredDatabase(source).startEmpty()`. These are fixture APIs, not a package operator CLI.

The current backup workflow is `await backupInto(source, restored)` with `stopBoth(source, restored)` in outer `finally`. The helper implements:

1. Require two different owned container IDs. No application/worker may be running; close source fixture clients except the snapshot owner and reject other database sessions. Privileged role/membership changes must also stay frozen throughout backup; database-session checking alone cannot police cluster DDL from another database.
2. Begin `REPEATABLE READ READ ONLY`, export a snapshot using `pg_export_snapshot()`, and keep its transaction open while dumping the database. Capture roles separately with `pg_dumpall --roles-only`. The role dump **includes disposable password verifiers**; it is sensitive, never a sanitized diagnostic.
3. Dump `slice_d` with `pg_dump --format=custom --create --snapshot=<exported snapshot>` while preserving owners and ACLs. Commit the snapshot only after capture completes. Globals have no shared MVCC snapshot; fixture-wide quiescence supplies their consistency with database state.
4. Start the target with `POSTGRES_USER=postgres` and `POSTGRES_DB=postgres`, preserving the source bootstrap identity for PostgreSQL 16 membership grantor behavior. The helper requires exactly one `CREATE ROLE postgres;` line in the role dump and verifies that the destination `postgres` role is superuser with OID 10. It replaces only that redundant declaration with a comment; every ALTER ROLE, password verifier, GRANT and GRANTED BY clause remains unchanged. Restore roles as `postgres` with `psql -X --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose`, then the database as `postgres` with `pg_restore --exit-on-error --create --dbname=postgres`. Do not use `--no-owner` or `--no-acl`, omit role restore, or rerun seed/migration helpers over the restored data.
5. Restore logins authenticate with the source's **disposable** password verifiers; the helper supplies target host/port with source fixture passwords. This is a local fixture shortcut, not credential rotation or a reusable operator credential-management workflow. There is no extra restore-admin role; the role inventory includes all non-`pg_` roles, including `postgres`.
6. Compare data and security fingerprints, migration histories/owners, evidence-chain canonical bytes/hashes and durable counters. Relation ACL comparison uses sorted effective ACL entries, substituting PostgreSQL table/sequence defaults for NULL ACLs so explicit equivalent grants compare equally; grantees, grantors, privileges and grant options are retained. This is semantic relation-permission equality, not raw ACL representation equality. Other security inventories retain their source-defined comparisons, including PostgreSQL 16 membership grantors and admin/inherit/set options. Check current authorized accesses and denials, then continue eligible work without resetting budgets or duplicating effects/receipts/terminal evidence. Restored wall-clock grant/approval validity still applies. A restored snapshot does not know about later source revocations; keep the source quiescent.
7. Delete private backup files from host and both containers in cleanup; stop both fixtures even after partial restore failure. Record sanitized fingerprints/counts and cleanup receipts, never raw dumps or verifier material.

For audit, these are the **native command argument forms used by the helper**, not independent shell commands: container IDs, paths and snapshot come from its owned fixtures. The focused Vitest invocation is the practical execution entry.

```text
pg_dumpall -U postgres --roles-only --file /tmp/slice-e-backup/roles.sql
pg_dump -U postgres -d slice_d --format=custom --create --snapshot=<exported snapshot> --file /tmp/slice-e-backup/database.dump
psql -X -U postgres -d postgres --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose --file /tmp/slice-e-backup/roles.sql
pg_restore -U postgres --exit-on-error --create --dbname=postgres /tmp/slice-e-backup/database.dump
```

The helper runs these inside the source/target containers with `docker exec`, transfers files with `docker cp`, uses a random host temporary directory with mode 0700 and files mode 0600, and suppresses raw command diagnostics. Passwords, tokens and command payloads must not enter review logs. The restore test checks authorized continuation through restricted-role SQL calls; the separate system suite checks assembled injected authentication. These complementary checks do not claim an injected HTTP restore test. Verification and cleanup results remain PENDING evidence.

## Diagnostics, fixture shortcuts and cleanup

Runtime logging copies only `category`, generated `requestId`, and `durationMs`; failing/asynchronous sinks do not change transaction truth. HTTP errors are generic with `Cache-Control: no-store`; an uncertain acceptance adds only `acceptance=UNKNOWN`. Use `Fastify({logger:false})` for the injected harness so a general request logger does not capture Authorization or bodies. Do not log raw SQL errors, payloads, approvals, owner tokens or credential slots containing secrets.

The owner-only diagnostic helper `workerDiagnosticState()` uses an allowlist of intent counters, epochs, owner kind/login, lease/due times, parked/reason fields, event metadata, aggregate receipt/operation counts and runtime backend metadata. It is privileged local fixture inspection, not a runtime SQL privilege or public diagnostic endpoint. Scope diagnostics to owned synthetic data. Record resource IDs, child exit statuses, proxy/socket counts and backend counts without query text or secrets. A clean-looking worker report alone is not cleanup evidence.

The fixture directly inserts tenants/bindings/grants/approvals, rewrites approval hashes, truncates tables for reset, forces leases/due times, and can corrupt receipts with triggers disabled. These are test-only setup/fault controls. Operators must not use them for concurrent administration, retry scheduling, receipt repair, resetting budgets or unpark. Use B's supported locked administration functions for revocation/status changes and owner-controlled binding changes; issue new approvals through B's scoped approval interface. Initial synthetic bootstrap is a privileged trust boundary, not runtime authority.

In `finally`/suite teardown: close apps/runtimes; await child exit and close IPC; close fault proxies and SQL clients; stop source and restored containers via their owned handles. Verify no owned runtime backends, proxy sockets or children remain and record owned-container removal. Preserve failure diagnostics before teardown. Never use global Docker prune or kill unrelated containers/processes. Ryuk is explicitly disabled. Cleanup relies on owned fixture `finally` teardown plus an external final container inventory; there is no crash-proof reaper guarantee. After process loss, identify remaining owned resources from recorded IDs and clean up only those resources.

## Facts still requiring controller evidence

- The matrix maps 12 system cases and two backup/migration cases. Attach execution receipts for the frozen candidate, including restricted-role continuation after restore and the separate assembled authentication cases.
- No E command outcomes, counts, timing results, backup equality, restored privilege results or cleanup receipts are claimed. All matrix results remain PENDING until the controller supplies evidence; independent acceptance remains separate.
- No manual bootstrap CLI, service runner, credential-management service, park-reset operation, existing-D upgrade procedure or production deployment is provided. The supported local runnable entry is the fixture-backed test suite; embedding uses the API above.
