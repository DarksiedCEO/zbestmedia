# ZBM simulation command runtime

This package implements the synthetic `ADVANCE_SIMULATION_PROBE` boundary for local simulation. It does not implement campaign execution, publication, finance, external providers, revenue recovery, or production deployment. Builder verification is not independent approval.

Slice E is bounded assurance of the assembled injected authentication/command/FAKE-worker system, fresh supported B-to-bridge-to-repaired-D migration, isolated consistent backup/restore, shutdown/replacement, bounded recovery and sanitized diagnostics. E remains **PENDING independent review**; the D green verdict for fresh disposable tree `7f44f58b7d96457121cf386a3216a80ffddf4fac` does not certify E or an existing-D database upgrade. See the [Slice E operator runbook](docs/slice-e-operator-runbook.md) and [Slice E acceptance matrix](docs/slice-e-acceptance-matrix.md). No live, production, finance or department scope is added.

## Ownership and identity

ZBM authority/evidence remains owned by `@zbest/zbm-authority-evidence-store` (B). Authentication remains owned by `@zbest/zbm-authenticated-command-boundary` (C). D uses C's public authenticator and protected connection mapping; bearer tokens and request fields never select credentials. Opaque-token audience checks enforce local configuration, not JWT/OIDC claims.

Every checked-out database connection must match the configured `session_user`. PostgreSQL's protected binding derives principal and scope authority. Inspection is not execution authority. There is no listener or publicly pluggable effect adapter.

## Request and outcome

`createRuntime(config, dependencies)` exposes an injectable Fastify plugin, explicit `close()`, and a finite worker invocation. Routes:

- `POST /internal/simulation/probe-commands`
- `POST /internal/simulation/probe-command-results`

Commands require kind `ADVANCE_SIMULATION_PROBE`, contractVersion `1`, scope `{tenantId,campaignId}`, `probeId`, canonical int64 string `expectedVersion`, lowercase SHA-256 `expectedPayloadSha256` and `nextPayloadSha256`, completion `STATE_ONLY` or `FAKE_RECEIPT`, exactly one `approvalIds` entry, and `idempotencyKey`. Unknown fields, NULs, provider details, monetary fields and noncanonical versions are rejected. Identifiers use bounded ASCII; request bodies are limited to 16 KiB.

One current independent TECHNICAL_QC approval must cover `SIMULATION_PROBE_TRANSITION_V1`. Its proposal digest is computed by PostgreSQL, not supplied as trusted canonical text:

```sql
SELECT encode(sha256(convert_to(jsonb_build_array(
  'zbm-sim-transition-v1', tenant, campaign, probe_id,
  expected_version_text, expected_digest, next_digest, completion
)::text, 'UTF8')), 'hex');
```

The database atomically records the probe advance, command, version and B acceptance evidence, plus one intent for FAKE_RECEIPT. STATE_ONLY command completion means the state transaction committed. FAKE effect success additionally requires a matching durable receipt and terminal evidence; accepted commands do not imply successful effects.

Proposal-hash fixture vector: tenant `tenant-a`, campaign `campaign-a`, probe `probe-a`, version text `0`, expected digest of 64 lowercase `a` characters, next digest of 64 lowercase `b` characters, and completion `FAKE_RECEIPT` produce `036f465e2fa1d98e9de3303cef7311548a6b303695fb4fdc4c11c2fb1aa15255` under the PostgreSQL array definition above. The real-database replay suite checks this fixed value.

## Replay and access

Keys are scoped to SIMULATION, tenant, campaign and protected principal. Replay compares canonical bytes as well as their hash. A current READ-only lookup precedes new execution; a new transaction rechecks replay before requiring current execution authority and approval. Historical replay does not require old EXECUTE_SIMULATION or approval validity. Current READ, binding and active scope remain mandatory. Losing READ or disabling a binding denies disclosure.

A failed COMMIT acknowledgement is ambiguous. The boundary returns an unavailable/unknown outcome, destroys the connection, and does not blindly execute again. Recovery uses the same scoped key under current authority.

## Worker and FAKE truth

Workers require current READ and PROCESS_SIMULATION plus the restricted SQL worker role. PROCESS may reconcile committed truth after requester or approval revocation. Creating a new fake effect additionally requires current requester execution authority and approval. A reconciliation token cannot dispatch.

Dispatch claims are capped at three. Ownership epochs increase independently for dispatch and reconciliation. Each dispatch generation has at most three durable reconciliation reservations; expired reservations and recorded unsuccessful reconciliations are distinct. A third-dispatch crash is reconciled without a fourth dispatch. Matching receipts establish COMPLETED; authoritative absence at exhausted dispatch budget establishes FAILED; inconsistency stays UNKNOWN and eventually parks with no automatic reset.

The FAKE operation and receipt are inserted in the same database transaction after current lease, owner, epoch, token, identity and authority checks. Database completion fencing alone is not the effect boundary. Stale workers cannot insert a new effect after ownership is superseded. The worker exits on an empty/not-due queue, 32 claims, 120 seconds, or three consecutive connection failures. Explicit subsequent invocation preserves durable budgets; no background respawn occurs.

## Provisioning and privileges

Use only a disposable database for local verification. Privileged role provisioning is separate from migrations:

1. Provision B roles, then D roles using their `sql/provision-roles.sql` files.
2. Apply the historical B migration and forward B simulation bridge migration using B's migration owner.
3. Apply D migrations using D's migration owner and separate schema history.
4. Provision protected bindings, grants, approvals and owner-only synthetic probe seeds.

D runtime groups do not inherit `zbm_ae_reader` or execute any B function directly. Their only principal-observation entry is the explicitly granted D `observe_runtime_principal(text,text)` function. Its fixed-search-path SECURITY DEFINER body calls B's existing `authorize_simulation_read` bridge as the D owner; B derives the principal from `session_user` and checks current scoped READ. The result contains only principal, login, tenant and campaign. It cannot select another principal, arbitrary capability, evidence or approval. The transport compares both principal and database login before COMMIT. Provisioning still precedes migrations; no historical B SQL or B privilege grants are changed. This is an uncommitted simulation candidate reconstructed into fresh disposable databases, not an upgrade for an already-provisioned deployment: omitting an old GRANT does not revoke existing database memberships. Existing disposable databases must be recreated for this candidate; any persistent-database rollout would require separately reviewed privilege revocation and migration handling.

Runtime logins cannot become owners or migrators, mutate tables directly, fabricate receipts, or call private B/D helpers. B owns the append-only evidence chain. Runtime append-only constraints and hashes do not stop a privileged administrator from rewriting database history or disabling enforcement.

## Verification and limits

Required toolchain: Node `v24.21.0`, pnpm `9.15.0`; disposable PostgreSQL 16.14 pinned to `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`.

```sh
pnpm --filter @zbest/zbm-simulation-command-runtime test
pnpm --filter @zbest/zbm-simulation-command-runtime typecheck
pnpm --filter @zbest/zbm-simulation-command-runtime lint
pnpm --filter @zbest/zbm-simulation-command-runtime schema:validate
```

Integration fixtures generate their own restricted logins and ephemeral database addresses. They must not inherit a real database URL. Crash experiments operate only on owned disposable resources after the source candidate has been snapshotted. Complete verification also includes B/C regressions, workspace/P0, schema compatibility, repository doctor, frozen installation, source preservation and the D01–D36 matrix. Evidence outside the repository records actual commands and outcomes; this README does not certify unexecuted checks.
