# Authenticated authority inspection — Slice C

This ZBM-owned package provides an injectable Fastify 4 plugin for **authenticated authority inspection only**. It starts no listener and accepts no executable command. It consumes the unchanged Slice B authority/evidence store. It does not append evidence, modify domain state, create an outbox entry, or implement replay/idempotency.

## Setup API

```ts
import Fastify from 'fastify';
import { createBoundary, type BoundaryConfig, type BoundaryDependencies } from '@zbest/zbm-authenticated-command-boundary';

// Construct config/deps from protected, programmatic local credentials.
// No request field or inherited DATABASE_URL supplies credentials.
function configure(config: BoundaryConfig, deps: BoundaryDependencies) {
  const app = Fastify({ logger: false });
  const boundary = createBoundary(config, deps);
  app.register(boundary.plugin);
  return { app, close: () => app.close() };
}
```

`createBoundary(config, deps)` synchronously validates and snapshots configuration, constructs owned pools without making a connection, and returns only:

- `plugin: FastifyPluginAsync`
- `close: () => Promise<void>` — idempotent; also called by the plugin's Fastify `onClose` hook.

No raw pool, client, query callback, role selector or generic capability API is exported.

`config` is `{ authConfig: ServiceAuthConfig, policies: CredentialPolicy[], bindings: ConnectionBinding[] }`. Shared `@zbest/service-auth` authenticates opaque bearer tokens. Every key ID needs exactly one policy and every permitted `(keyId, tenantId)` needs exactly one binding:

```ts
type CredentialPolicy = Readonly<{
  keyId: string;
  audience: 'zbm-command-boundary/simulation';
  notBefore: string; // ISO timestamp including timezone
  expiresAt: string;
  enabled: boolean;
}>;
type ConnectionBinding = Readonly<{
  keyId: string;
  tenantId: string;
  principal: string;
  databaseLogin: string;
  credentialSlot: string;
}>;
```

**Audience and lifetime checks use protected local opaque-token metadata. They are not JWT/OIDC verified claims.** The lifetime interval includes `notBefore` and excludes `expiresAt`. Disabled credentials and nonfinite clocks fail closed. Missing/wrong audience fails startup, and authentication independently checks the literal audience.

`deps` is `{ connections: Record<string, PoolConfig>, now?: () => number, log?: (event: Readonly<Record<string, unknown>>) => void }`. `now` returns milliseconds since epoch and is used only for local credential lifetime. Each connection slot must explicitly supply **only** `host`, `port`, `user`, `password`, and `database`. All five are required, password is a nonempty string, and user must equal the mapping's login. Connection strings, SSL inputs, arbitrary options, custom streams, type parsers, callbacks, query timeouts and other PoolConfig keys are rejected. Extra unreferenced slots are rejected. This intentionally supports the approved local plain PostgreSQL topology; remote/TLS provisioning requires a separate reviewed configuration design.

Duplicate key IDs, duplicate tenants, wildcard tenants, unknown fields, missing/extra policies or bindings, invalid time intervals, shared logins/slots, and shared principals within a tenant fail with a generic startup error. There are at most sixteen identity/tenant pools. Parsed identity objects, tenant arrays, policies, mappings and safe connection copies are frozen; private maps are not exposed. Caller-owned objects and maps cannot change a running instance. Rotate credentials by constructing a new instance and draining the old one. Scoped revocation continues to use B's protected DB operations; local config is not a distributed revocation mechanism.

## HTTP contract

The only registered route is `POST /internal/simulation/authority-inspections`. It requires a single raw Authorization header containing exactly `Bearer <opaque-token>` (scheme is case-insensitive). Duplicate occurrences, arrays, comma combinations, extra whitespace/credentials and ambiguous syntax fail before body parsing and before any DB acquisition. Request IDs are generated server-side and ignore client correlation headers.

Bodies must be JSON, no larger than 16 KiB. Unknown keys are rejected at every object level. Both operations require READ, fixed purpose SIMULATION:

```json
{"kind":"SCOPE_READ","scope":{"tenantId":"tenant-a","campaignId":"campaign-a"}}
```

```json
{
  "kind":"APPROVAL_READ",
  "scope":{"tenantId":"tenant-a","campaignId":"campaign-a"},
  "approval":{
    "id":"approval-a","subjectType":"CUT","subjectId":"cut-a",
    "subjectVersion":"9007199254740993",
    "subjectSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "issuer":"EDITORIAL"
  }
}
```

Tenant IDs use the shared service-auth tenant schema. Other identifiers and versions are nonempty strings of at most 160 characters. Hashes are lowercase 64-hex. Allowed issuers are FOUNDER_CREATIVE, RIGHTS, EDITORIAL, TECHNICAL_QC, PUBLICATION and INDEPENDENT_APPEAL. FINANCE, actor/role claims, supplied approval objects, caller-selected capability, audit flags and executable commands are excluded.

Only after a completed READ transaction does the route return:

```json
{"status":"OBSERVED_ONLY","execution":"DISABLED","kind":"SCOPE_READ","requestId":"server-generated-uuid"}
```

This is no lease, transferable authority token, command acceptance/completion receipt or reusable authorization. APPROVAL_READ checks one exact reference tuple and issuer. It does not establish approval-set sufficiency, external/human issuer authenticity or that the claimed version is the current domain aggregate. Future Slice D must recheck authority and authoritative domain state within its own atomic execution/replay transaction.

## Database protocol and limits

Every mapping owns a dedicated `pg.Pool` with max 2, connection acquisition timeout 2 seconds, startup statement timeout 5 seconds and idle transaction timeout 5 seconds. No per-request pools are created. Startup options are fixed to `-c search_path=pg_catalog` (an empty options string would inherit PGOPTIONS in pg 8.13.1); application name and UTF8 encoding are fixed and SSL is explicitly false. Protected explicit credentials and these overrides prevent ambient PGOPTIONS/PGSSLMODE/PGAPPNAME from selecting a role, credentials, TLS mode or application identity.

On each checkout the runtime verifies `SELECT session_user::text` equals the protected mapping's `databaseLogin`, then uses the same client for:

1. `BEGIN ISOLATION LEVEL READ COMMITTED`.
2. `SET LOCAL` statement timeout 5s, lock timeout 2s and idle transaction timeout 5s.
3. Parameterized `zbm_authority_evidence.observe_authority` with tenant, campaign, SIMULATION and READ. Returned principal, scope, purpose, capability, binding version and complete structure must match.
4. For APPROVAL_READ, parameterized `read_approval` with the exact tuple, followed by strict returned-structure/tuple validation. Subject versions remain strings; no bigint-to-Number conversion occurs. The DB function owns decision-time validity checks.
5. `COMMIT`, then clean release.

`BEGIN READ ONLY` is intentionally not used because B's functions acquire row locks. Normal login provisioning uses INHERIT membership in `zbm_ae_reader`, with protected READ bindings and grants, and no writer/auditor/owner privileges. Runtime issues no SET ROLE, direct base-table reads/writes or provisioning SQL. Restricted-role enforcement and revocation ordering require real PostgreSQL verification; protocol unit doubles do not establish those guarantees.

Revocation-first lock ordering denies after revocation commits; inspection-first may finish before revocation. Observation and approval functions each use their own DB decision time. The response does not promise timeless or simultaneous multi-reference certification.

All failures attempt rollback when a transaction might be open. Identity/structure mismatches, disconnects, rollback failures and failed COMMIT destroy the checkout. **A failed COMMIT destroys the uncertain connection even when rollback succeeds.** No automatic retry occurs. Pool idle errors are consumed without serializing underlying errors or crashing the process. Closing the instance closes its owned pools only.

## Errors and operational logs

Responses from the inspection route always carry `Cache-Control: no-store`, including authentication failures and parser/body-limit/content-type errors. Error bodies contain only a generic `error` code and server-generated `requestId`:

| HTTP | Meaning |
| --- | --- |
| 400 | Invalid request, unsupported content type or body over 16 KiB |
| 401 | Missing/ambiguous/invalid bearer token or unusable local credential policy |
| 403 | Tenant denial or DB SQLSTATE 42501; missing/foreign/stale/unusable references share the same shape |
| 503 | Acquisition/connection failure, lock/statement timeout, deadlock, failed cleanup or uncertain COMMIT |
| 500 | Unexpected internal failure or protected identity/returned-structure mismatch |

Operational logs allow only server request ID, recognized operation, verified service key ID, decision category, monotonic latency and a safe SQLSTATE category. No bearer token, request headers/body, credentials, slot, SQL error or approval payload is emitted. Log callbacks receive frozen records; callback exceptions cannot alter a transaction result. Route automatic logging is silent; the embedding application must avoid parent hooks or external middleware that log request secrets. Logs are not a durable, tamper-proof evidence journal.

## Verification and scope

Unit tests live in `test/config.test.ts`, `test/http-auth.test.ts` and `test/logging.test.ts`; run them with the approved isolated Node 24.21.0/pnpm 9.15.0 toolchain. They test the public boundary with Fastify injection and use a pg transport double for protocol/fault checks; the ambient-options case additionally uses pg's actual connection parameter parser. The separate parent-owned integration tests establish real restricted-login behavior, reference custody, revocation races, limits and cleanup against disposable PostgreSQL.

This implementation and its tests are internal builder checks. Independent review remains pending. No production deployment, live adapter, money operation, human-user authentication, external approval attestation, durable denial evidence, replay executor or Slice D behavior is certified here.

## Server-only authenticator seam

`createServiceAuthenticator(config, deps)` uses the same immutable configuration
snapshot, unambiguous bearer parser and protected local opaque-token policy as the
inspection boundary. It opens no pools. `authenticateHeaders(header, rawHeaders)`
returns a frozen opaque context recorded in an instance-private WeakMap.
`resolveTenant(context, tenantId)` rejects forged/foreign contexts, rechecks current
local policy time and service tenant membership, and returns a frozen
`{keyId, tenantId, principal, databaseLogin, credentialSlot}` mapping. It exposes no
token, password, connection object or SQL callback. Startup retains the existing
explicit connection validation, including refusal of PG environment fallback.

This mapping is server routing metadata, not database execution authority. Consumers
must verify session_user and obtain current B authorization within their own
transaction. Existing `createBoundary` and its READ-only inspection route retain
their original semantics. This local policy is not JWT/OIDC verification; changing
configuration requires a new authenticator instance.
