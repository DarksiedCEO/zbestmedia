import pg from 'pg';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { BoundaryConfig, BoundaryDependencies, ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { RuntimeError, type Scope } from './contracts';
import { verifyObservation } from './identity';

const safeConnectionSchema = z.object({
  host: z.string().min(1).refine(v => !v.includes('\0')), port: z.number().int().min(1).max(65535),
  user: z.string().min(1).refine(v => !v.includes('\0')),
  password: z.string().min(1).refine(v => !v.includes('\0')),
  database: z.string().min(1).refine(v => !v.includes('\0'))
}).strict();
const statements = {
  submit: 'SELECT zbm_simulation_runtime.submit_or_replay($1::jsonb,$2::boolean) AS value',
  result: 'SELECT zbm_simulation_runtime.read_own_result($1,$2,$3) AS value',
  claim: 'SELECT zbm_simulation_runtime.claim_effect($1,$2,$3::uuid) AS value',
  dispatch: 'SELECT zbm_simulation_runtime.dispatch_fake($1,$2,$3::uuid,$4::bigint,$5::uuid) AS value',
  handoff: 'SELECT zbm_simulation_runtime.request_reconciliation($1,$2,$3::uuid,$4::bigint,$5::uuid) AS value',
  claimReconciliation: 'SELECT zbm_simulation_runtime.claim_reconciliation($1,$2,$3::uuid) AS value',
  reconcile: 'SELECT zbm_simulation_runtime.reconcile_effect($1,$2,$3::uuid,$4::bigint,$5::uuid) AS value',
  inspect: 'SELECT zbm_simulation_runtime.inspect_worker_claim($1,$2,$3::uuid) AS value',
  nextDue: 'SELECT zbm_simulation_runtime.next_due($1,$2) AS value'
} as const;
export type Operation = keyof typeof statements;
export function classify(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === '42501') return new RuntimeError(403, 'denied');
  if (code === '22023' || code === '22P02') return new RuntimeError(400, 'invalid');
  if (code === 'P0002') return new RuntimeError(409, 'conflict');
  if (typeof code === 'string' && (code.startsWith('08') || ['57P01','57P02','57P03','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code))) {
    return new RuntimeError(503, 'unavailable', false, true);
  }
  if (error instanceof Error && ['Connection terminated unexpectedly', 'Connection terminated',
    'Client was closed and is not queryable', 'Client has encountered a connection error and is not queryable'].includes(error.message)) {
    return new RuntimeError(503, 'unavailable', false, true);
  }
  if (['40001','40P01','55P03','57014','53300','53400'].includes(String(code))) return new RuntimeError(503, 'unavailable');
  return new RuntimeError(500, 'internal');
}
const bindingKeys = ['keyId','tenantId','principal','databaseLogin','credentialSlot'] as const;
export function createConnections(config: BoundaryConfig, deps: BoundaryDependencies) {
  const bindings = config.bindings.map(binding => Object.freeze({ ...binding }));
  const pools = new Map<string, pg.Pool>();
  // Validate every entry before constructing pools. C separately validates the complete identity configuration.
  const entries = bindings.map(binding => {
    const parsed = safeConnectionSchema.safeParse(deps.connections[binding.credentialSlot]);
    if (!parsed.success || parsed.data.user !== binding.databaseLogin) throw new Error('Invalid runtime configuration');
    return { binding, connection: parsed.data };
  });
  for (const { binding, connection } of entries) {
    const options: pg.PoolConfig & { client_encoding: string } = {
      ...connection, ssl: false, options: '-c search_path=pg_catalog', application_name: 'zbm-simulation-runtime',
      client_encoding: 'UTF8', max: 2, connectionTimeoutMillis: 2000,
      statement_timeout: 5000, idle_in_transaction_session_timeout: 5000
    };
    const pool = new pg.Pool(options);
    pool.on('error', () => {});
    pools.set(binding.credentialSlot, pool);
  }
  let closed = false;
  let closing: Promise<void> | undefined;
  const cancellations = new Set<() => void>();
  const observedClients = new WeakSet<PoolClient>();
  const protect = (value: ConnectionBinding): ConnectionBinding => {
    const binding = bindings.find(candidate => bindingKeys.every(key => candidate[key] === value?.[key]));
    if (!binding) throw new RuntimeError(403, 'denied');
    return binding;
  };
  const call = async <T>(bindingInput: ConnectionBinding, scope: Scope, operation: Operation,
    parameters: unknown[], schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> => {
    const binding = protect(bindingInput);
    if (binding.tenantId !== scope.tenantId) throw new RuntimeError(403, 'denied');
    if (closed || signal?.aborted) throw new RuntimeError(503, 'unavailable', false, true);
    const pool = pools.get(binding.credentialSlot)!;
    let client: PoolClient | undefined;
    let released = false, finished = false, commitAttempted = false, cancelled = false;
    let fail!: (reason: RuntimeError) => void;
    const interrupted = new Promise<never>((_, reject) => { fail = reject; });
    const release = (destroy: boolean) => {
      if (client && !released) { released = true; client.release(destroy); }
    };
    const cancel = () => {
      if (finished) return;
      cancelled = true;
      release(true);
      fail(new RuntimeError(503, 'unavailable', commitAttempted, true));
    };
    cancellations.add(cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 20000);
    // Late acquisition is disposed even after cancellation; no abandoned pool waiter can escape ownership.
    const acquisition = pool.connect().then(value => {
      client = value;
      if (!observedClients.has(client)) { client.on('error', () => {}); observedClients.add(client); }
      client.on('error', cancel);
      if (finished || cancelled || closed || signal?.aborted) {
        client.removeListener('error', cancel);
        release(true);
        throw new RuntimeError(503, 'unavailable', false, true);
      }
      return value;
    }).catch(() => { throw new RuntimeError(503, 'unavailable', false, true); });
    try {
      await Promise.race([acquisition, interrupted]);
      const query = (sql: string, args?: unknown[]) => {
        if (cancelled || closed || signal?.aborted) throw new RuntimeError(503, 'unavailable', commitAttempted, true);
        return Promise.race([client!.query(sql, args), interrupted]);
      };
      const session = await query('SELECT session_user::text AS session_user');
      if (session.rows.length !== 1 || typeof session.rows[0].session_user !== 'string') throw new RuntimeError(500, 'internal');
      if (session.rows[0].session_user !== binding.databaseLogin) throw new RuntimeError(403, 'denied');
      await query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await query("SET LOCAL statement_timeout = '5s'");
      await query("SET LOCAL lock_timeout = '2s'");
      await query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
      const result = await query(statements[operation], parameters);
      if (result.rows.length !== 1) throw new RuntimeError(500, 'internal');
      const parsed = schema.safeParse(result.rows[0].value);
      if (!parsed.success) throw new RuntimeError(500, 'internal');
      // These are the same caller/tenant locks already held by the fixed D SQL entry point.
      const observation = await query('SELECT zbm_simulation_runtime.observe_runtime_principal($1,$2) AS observation',
        [scope.tenantId, scope.campaignId]);
      if (observation.rows.length !== 1) throw new RuntimeError(500, 'internal');
      verifyObservation(observation.rows[0].observation, binding, scope);
      commitAttempted = true;
      await query('COMMIT');
      finished = true;
      release(false);
      return parsed.data;
    } catch (error) {
      // Destroying the socket rolls back an open transaction. Never wait for ROLLBACK on an uncertain socket.
      release(true);
      if (commitAttempted) throw new RuntimeError(503, 'unavailable', true, true);
      throw classify(error);
    } finally {
      finished = true;
      clearTimeout(timer);
      cancellations.delete(cancel);
      signal?.removeEventListener('abort', cancel);
      // Retain the no-throw error consumer until pg has finished closing a destroyed socket.
      if (client && !released) release(true);
      if (client) client.removeListener('error', cancel);
    }
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    closed = true;
    for (const cancel of cancellations) cancel();
    closing = new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 2000);
      void Promise.allSettled([...pools.values()].map(pool => pool.end())).then(() => { clearTimeout(timer); resolve(); });
    });
    return closing;
  };
  return Object.freeze({ call, close, protect });
}
export type Connections = ReturnType<typeof createConnections>;
