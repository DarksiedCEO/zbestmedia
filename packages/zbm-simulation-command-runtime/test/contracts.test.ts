import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { BoundaryConfig, BoundaryDependencies } from '@zbest/zbm-authenticated-command-boundary';
import { commandSchema, effectSchema, resultRequestSchema, versionSchema, RuntimeError } from '../src/contracts';
import { createRuntime } from '../src/index';
import { classify, createConnections, type Connections } from '../src/connections';
import { submitCommand } from '../src/commands';
import { createWorkers } from '../src/worker';
import { safeLog } from '../src/http';

const mock = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), end: vi.fn(), pools: [] as unknown[], clients: [] as unknown[]
}));
vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  class Pool extends EventEmitter {
    constructor(readonly options: unknown) { super(); mock.pools.push(this); }
    async connect() {
      await mock.connect();
      const client = Object.assign(new EventEmitter(), {
        query: vi.fn((text: string, args?: unknown[]) => mock.query(text, args)), release: vi.fn()
      });
      mock.clients.push(client);
      return client;
    }
    end() { return mock.end(); }
  }
  return { default: { Pool }, Pool };
});
const scope = { tenantId: 'tenant-a', campaignId: 'campaign-a' };
const binding = { keyId: 'key-a', tenantId: scope.tenantId, principal: 'executor-a', databaseLogin: 'executor_a', credentialSlot: 'slot-a' };
const token = 'test-secret-token-01234567';
const command = () => ({
  kind: 'ADVANCE_SIMULATION_PROBE' as const, contractVersion: 1 as const, scope: { ...scope }, probeId: 'probe-a',
  expectedVersion: '0', expectedPayloadSha256: 'a'.repeat(64), nextPayloadSha256: 'b'.repeat(64),
  completion: 'FAKE_RECEIPT' as const, approvalIds: ['approval-a'] as [string], idempotencyKey: 'key-a'
});
const accepted = (replay = false) => ({
  found: true, commandId: '11111111-1111-4111-8111-111111111111', acceptance: 'ACCEPTED', execution: 'COMPLETED',
  resultingVersion: '1', probeId: 'probe-a', replay, effect: { status: 'PENDING', parked: false }
});
const observation = () => ({ principal: binding.principal, tenant: scope.tenantId, campaign: scope.campaignId,
  login: binding.databaseLogin });
const config = (): BoundaryConfig => ({
  authConfig: { principalsByToken: new Map([[token, { keyId: binding.keyId, tenants: [scope.tenantId] }]]) },
  policies: [{ keyId: binding.keyId, audience: 'zbm-command-boundary/simulation', enabled: true,
    notBefore: '2020-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }], bindings: [{ ...binding }]
});
const dependencies = (): BoundaryDependencies => ({ connections: { 'slot-a': {
  host: '127.0.0.1', port: 5432, user: binding.databaseLogin, password: 'db-secret-test-only', database: 'test'
} } });
const clients = () => mock.clients as Array<EventEmitter & { release: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> }>;
const rows = (value: unknown) => ({ rows: [{ value }] });
async function defaultQuery(text: string, args?: unknown[]) {
  if (text.includes('session_user')) return { rows: [{ session_user: binding.databaseLogin }] };
  if (text.includes('observe_runtime_principal')) return { rows: [{ observation: observation() }] };
  if (text.includes('submit_or_replay')) return rows(args?.[1] ? { found: false } : accepted());
  if (text.includes('read_own_result')) return rows(accepted(true));
  return { rows: [] };
}
const cleanups: Array<() => Promise<unknown>> = [];
beforeEach(() => {
  mock.query.mockReset().mockImplementation(defaultQuery);
  mock.connect.mockReset().mockResolvedValue(undefined);
  mock.end.mockReset().mockResolvedValue(undefined);
  mock.pools.length = 0; mock.clients.length = 0;
});
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  vi.useRealTimers();
});
async function application(options: FastifyServerOptions = { logger: false }, deps = dependencies(), settings = config()) {
  const runtime = createRuntime(settings, deps);
  const app = Fastify(options);
  await app.register(runtime.plugin); await app.ready();
  cleanups.push(() => app.close());
  return { app, runtime };
}
const route = '/internal/simulation/probe-commands';
const resultRoute = '/internal/simulation/probe-command-results';
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

describe('strict wire contracts', () => {
  it('accepts the two bounded command modes and canonical int64 strings', () => {
    expect(commandSchema.parse(command()).expectedVersion).toBe('0');
    expect(commandSchema.parse({ ...command(), completion: 'STATE_ONLY', expectedVersion: '9223372036854775807' }).completion).toBe('STATE_ONLY');
  });
  it.each(['', '-1', '+1', '01', '1.0', '1e3', ' 1', '1 ', '1\n', '0\n', '9223372036854775808', '1'.repeat(100), 'a', '\0'])('rejects version %j without throwing from refinement', value => {
    expect(versionSchema.safeParse(value).success).toBe(false);
  });
  it.each([0, 1, 9007199254740992, null, {}, []])('rejects non-string version %j', expectedVersion => {
    expect(commandSchema.safeParse({ ...command(), expectedVersion }).success).toBe(false);
  });
  it.each(['provider', 'endpoint', 'amount', 'currency', 'environment', 'principal', 'databaseLogin', 'credentialSlot', 'sql', 'callback'])('rejects unsupported top-level %s', key => {
    expect(commandSchema.safeParse({ ...command(), [key]: 'injected' }).success).toBe(false);
  });
  it.each(['', ' x', 'x ', 'x\n', 'x\r', '\0', 'a\0b', 'é', '_first', 'x/y', 'x'.repeat(161)])('rejects identifier %j in every identity position', value => {
    const source = command();
    for (const candidate of [{ ...source, probeId: value }, { ...source, idempotencyKey: value },
      { ...source, approvalIds: [value] }, { ...source, scope: { ...scope, tenantId: value } },
      { ...source, scope: { ...scope, campaignId: value } }]) expect(commandSchema.safeParse(candidate).success).toBe(false);
  });
  it.each([[], ['a','a'], ['a','b'], null])('requires exactly one approval %j', approvalIds => {
    expect(commandSchema.safeParse({ ...command(), approvalIds }).success).toBe(false);
  });
  it.each(['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(64) + '\n', 'z'.repeat(64)])('rejects digest %j', digest => {
    expect(commandSchema.safeParse({ ...command(), expectedPayloadSha256: digest }).success).toBe(false);
    expect(commandSchema.safeParse({ ...command(), nextPayloadSha256: digest }).success).toBe(false);
  });
  it('enforces key length and strict nested/result fields', () => {
    expect(commandSchema.safeParse({ ...command(), idempotencyKey: 'x'.repeat(129) }).success).toBe(false);
    expect(commandSchema.safeParse({ ...command(), scope: { ...scope, principal: 'forged' } }).success).toBe(false);
    expect(resultRequestSchema.safeParse({ scope, idempotencyKey: 'key-a', principal: 'forged' }).success).toBe(false);
  });
  it('refuses completion without receipt or parked fabricated failure', () => {
    expect(effectSchema.safeParse({ status: 'COMPLETED', parked: false }).success).toBe(false);
    expect(effectSchema.safeParse({ status: 'FAILED', parked: true }).success).toBe(false);
    expect(effectSchema.safeParse({ status: 'UNKNOWN_PENDING_RECONCILIATION', parked: true }).success).toBe(true);
  });
});

describe('protected authentication, configuration and HTTP', () => {
  it('authenticates before parsing malformed JSON', async () => {
    const { app } = await application();
    const response = await app.inject({ method: 'POST', url: route, headers: { 'content-type': 'application/json' }, payload: '{bad' });
    expect(response.statusCode).toBe(401); expect(response.headers['cache-control']).toBe('no-store');
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it.each([route, resultRoute])('authenticates before oversized bodies on %s', async url => {
    const { app } = await application();
    const response = await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: 'x'.repeat(20000) });
    expect(response.statusCode).toBe(401); expect(mock.connect).not.toHaveBeenCalled();
  });
  it('rejects duplicate bearer values and wrong tenants before acquiring a connection', async () => {
    const { app } = await application();
    expect((await app.inject({ method: 'POST', url: route, headers: { ...headers, authorization: [`Bearer ${token}`, `Bearer ${token}`] as unknown as string }, payload: command() })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: route, headers, payload: { ...command(), scope: { ...scope, tenantId: 'other' } } })).statusCode).toBe(403);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it('rejects invalid/oversized authenticated bodies and unsupported media', async () => {
    const { app } = await application();
    for (const payload of ['{bad', 'x'.repeat(20000), JSON.stringify({ ...command(), provider: 'live' })]) {
      expect((await app.inject({ method: 'POST', url: route, headers, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: route, headers: { ...headers, 'content-type': 'text/plain' }, payload: '{}' })).statusCode).toBe(400);
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it('returns accepted only after commit and no-store results', async () => {
    const { app } = await application();
    const response = await app.inject({ method: 'POST', url: route, headers, payload: command() });
    expect(response.statusCode).toBe(202); expect(response.json()).toMatchObject(accepted());
    const result = await app.inject({ method: 'POST', url: resultRoute, headers, payload: { scope, idempotencyKey: 'key-a' } });
    expect(result.statusCode).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
    expect(mock.query.mock.calls.filter(([text]) => text === 'COMMIT')).toHaveLength(3);
  });
  it('returns STATE_ONLY as 200', async () => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => {
      if (text.includes('submit_or_replay') && !args?.[1]) return rows({ ...accepted(), effect: { status: 'NOT_REQUIRED', parked: false } });
      return defaultQuery(text, args);
    });
    const { app } = await application();
    expect((await app.inject({ method: 'POST', url: route, headers, payload: { ...command(), completion: 'STATE_ONLY' } })).statusCode).toBe(200);
  });
  it('suppresses enabled parent logging and emits only safe sink fields', async () => {
    let output = '';
    const sink = vi.fn();
    const { app } = await application({ logger: { level: 'trace', stream: { write: (line: string) => { output += line; } },
      serializers: { req: request => ({ headers: request.headers, body: request.body, url: request.url }) } } }, { ...dependencies(), log: sink });
    await app.inject({ method: 'POST', url: route, headers, payload: command() });
    mock.query.mockRejectedValue(Object.assign(new Error(`SELECT ${token} db-secret-test-only`), { code: '42501' }));
    const response = await app.inject({ method: 'POST', url: resultRoute, headers, payload: { scope, idempotencyKey: 'key-a' } });
    expect(response.statusCode).toBe(403);
    expect(output).toBe('');
    expect(sink).toHaveBeenCalled();
    for (const [event] of sink.mock.calls) expect(Object.keys(event).sort()).toEqual(['category','durationMs','requestId']);
    expect(JSON.stringify(sink.mock.calls) + response.body).not.toContain(token);
    expect(response.body).not.toContain('SELECT');
  });
  it('cannot let throwing/rejecting log sinks rewrite success', async () => {
    safeLog(() => { throw new Error('log secret'); }, 'accepted', randomUUID(), 0);
    safeLog(() => Promise.reject(new Error('log secret')), 'accepted', randomUUID(), 0);
    const { app } = await application(undefined, { ...dependencies(), log: () => { throw new Error('sink failed'); } });
    expect((await app.inject({ method: 'POST', url: route, headers, payload: command() })).statusCode).toBe(202);
  });
  it('snapshots routing, secrets, and credential policy against caller mutation', async () => {
    const settings = config(), deps = dependencies();
    const { app, runtime } = await application(undefined, deps, settings);
    Object.assign(settings.bindings[0], { principal: 'mutated' });
    Object.assign(settings.policies[0], { enabled: false });
    settings.authConfig.principalsByToken.clear();
    deps.connections['slot-a'].password = 'changed';
    expect((await app.inject({ method: 'POST', url: route, headers, payload: command() })).statusCode).toBe(202);
    expect(() => runtime.worker({ ...binding, principal: 'mutated' })).toThrow(RuntimeError);
    expect((mock.pools[0] as { options: { password: string } }).options.password).toBe('db-secret-test-only');
  });
  it.each(['connectionString','options','ssl','stream','types','application_name'])('rejects connection override %s', field => {
    const deps = dependencies(); Object.assign(deps.connections['slot-a'], { [field]: 'forged' });
    expect(() => createRuntime(config(), deps)).toThrow('Invalid boundary configuration');
    expect(mock.pools).toHaveLength(0);
  });
  it.each(['host','port','user','password','database'])('requires explicit connection field %s', field => {
    const deps = dependencies(); delete (deps.connections['slot-a'] as Record<string, unknown>)[field];
    expect(() => createRuntime(config(), deps)).toThrow('Invalid boundary configuration');
  });
});

describe('transaction lifetime, identity and replay truth', () => {
  const database = () => { const result = createConnections(config(), dependencies()); cleanups.push(result.close); return result; };
  it('fixes pool limits, encoding, timeouts and environment-independent options', () => {
    database();
    expect((mock.pools[0] as { options: unknown }).options).toMatchObject({
      max: 2, ssl: false, connectionTimeoutMillis: 2000, client_encoding: 'UTF8',
      options: '-c search_path=pg_catalog', statement_timeout: 5000, idle_in_transaction_session_timeout: 5000
    });
  });
  it('classifies pg transport failures that lack SQLSTATE', () => {
    expect(classify(new Error('Connection terminated unexpectedly'))).toMatchObject({ statusCode: 503, connectionFailure: true });
  });
  it('uses exactly two independent transactions for new keys', async () => {
    await submitCommand(database(), binding, command());
    expect(clients()).toHaveLength(2);
    for (const client of clients()) {
      expect(client.query.mock.calls[0][0]).toContain('session_user');
      expect(client.query.mock.calls[client.query.mock.calls.length - 1]?.[0]).toBe('COMMIT');
      expect(client.release).toHaveBeenCalledWith(false);
    }
    expect(mock.query.mock.calls.filter(([text]) => text.includes('submit_or_replay')).map(call => call[1][1])).toEqual([true, false]);
  });
  it('exact historical replay ends after the READ phase', async () => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => text.includes('submit_or_replay') ? rows(accepted(true)) : defaultQuery(text, args));
    expect((await submitCommand(database(), binding, command())).replay).toBe(true);
    expect(clients()).toHaveLength(1);
  });
  it('accepts replay found by the second phase without a restart', async () => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => text.includes('submit_or_replay') && !args?.[1] ? rows(accepted(true)) : defaultQuery(text, args));
    expect((await submitCommand(database(), binding, command())).replay).toBe(true);
    expect(clients()).toHaveLength(2);
  });
  it('destroys mismatched session identity before BEGIN', async () => {
    mock.query.mockResolvedValue({ rows: [{ session_user: 'other_login' }] });
    await expect(submitCommand(database(), binding, command())).rejects.toMatchObject({ statusCode: 403 });
    expect(mock.query.mock.calls).toHaveLength(1); expect(clients()[0].release).toHaveBeenCalledWith(true);
  });
  it.each(['principal','login','tenant','campaign'])('rolls back mismatched protected %s without committing', async field => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => text.includes('observe_runtime_principal')
      ? { rows: [{ observation: { ...observation(), [field]: 'wrong' } }] } : defaultQuery(text, args));
    await expect(submitCommand(database(), binding, command())).rejects.toMatchObject({ statusCode: 403 });
    expect(mock.query.mock.calls.some(([text]) => text === 'COMMIT')).toBe(false);
    expect(clients()[0].release).toHaveBeenCalledWith(true);
  });
  it('lost COMMIT reply is UNKNOWN and never automatically resubmits', async () => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => {
      if (text === 'COMMIT') throw Object.assign(new Error('lost SQL secret'), { code: 'ECONNRESET' });
      return defaultQuery(text, args);
    });
    const { app } = await application();
    const response = await app.inject({ method: 'POST', url: route, headers, payload: command() });
    expect(response.statusCode).toBe(503); expect(response.json()).toMatchObject({ acceptance: 'UNKNOWN' });
    expect(clients()).toHaveLength(1); expect(clients()[0].release).toHaveBeenCalledWith(true);
    expect(mock.query.mock.calls.some(([text]) => text === 'ROLLBACK')).toBe(false);
    expect(response.body).not.toContain('secret');
  });
  it('unknown on mutation COMMIT leaves exactly one mutation attempt', async () => {
    let commits = 0;
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => {
      if (text === 'COMMIT' && ++commits === 2) throw new Error('reply lost');
      return defaultQuery(text, args);
    });
    await expect(submitCommand(database(), binding, command())).rejects.toMatchObject({ uncertain: true, statusCode: 503 });
    expect(mock.query.mock.calls.filter(([text]) => text.includes('submit_or_replay'))).toHaveLength(2);
  });
  it.each([['42501',403],['22023',400],['22P02',400],['P0002',409],['40001',503],['40P01',503],['55P03',503],['57014',503],['ECONNRESET',503],['XX000',500]])('maps SQLSTATE %s without raw error leakage', (code, statusCode) => {
    const error = classify(Object.assign(new Error('SELECT password'), { code }));
    expect(error.statusCode).toBe(statusCode); expect(error.message).not.toContain('SELECT');
  });
  it('validates SQL response identity before COMMIT', async () => {
    mock.query.mockImplementation(async (text: string, args?: unknown[]) => text.includes('submit_or_replay') ? rows({ ...accepted(true), resultingVersion: '2' }) : defaultQuery(text, args));
    await expect(submitCommand(database(), binding, command())).rejects.toMatchObject({ statusCode: 500 });
    expect(mock.query.mock.calls.some(([text]) => text === 'COMMIT')).toBe(false);
  });
  it('deadline destroys a checked-out blackholed connection', async () => {
    vi.useFakeTimers();
    mock.query.mockImplementation(() => new Promise(() => {}));
    const db = database(), controller = new AbortController();
    const result = db.call(binding, scope, 'nextDue', [], z.unknown(), controller.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await result).toMatchObject({ statusCode: 503 });
    expect(clients()[0].release).toHaveBeenCalledWith(true);
  });
  it('late pool acquisition is destroyed after cancellation', async () => {
    let connect!: () => void;
    mock.connect.mockImplementation(() => new Promise<void>(resolve => { connect = resolve; }));
    const db = database(), controller = new AbortController();
    const result = db.call(binding, scope, 'nextDue', [], z.unknown(), controller.signal).catch(error => error);
    controller.abort(); await result;
    connect(); await new Promise(resolve => setImmediate(resolve));
    expect(clients()[0].release).toHaveBeenCalledWith(true);
  });
  it('close is idempotent and bounded even if pool shutdown hangs', async () => {
    vi.useFakeTimers(); mock.end.mockImplementation(() => new Promise(() => {}));
    const db = database(), first = db.close();
    expect(db.close()).toBe(first);
    await vi.advanceTimersByTimeAsync(2001); await first;
    await expect(db.call(binding, scope, 'nextDue', [], z.unknown())).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('finite worker orchestration (SQL is the durable budget authority)', () => {
  function workerDatabase(handler: (operation: string, args: unknown[], signal?: AbortSignal) => unknown | Promise<unknown>) {
    const call = vi.fn(async (_binding, _scope, operation: string, args: unknown[], schema: z.ZodType, signal?: AbortSignal) => schema.parse(await handler(operation, args, signal)));
    const database = { call, protect: () => ({ ...binding }), close: async () => {} } as unknown as Connections;
    const workers = createWorkers(database, undefined);
    cleanups.push(async () => workers.close());
    return { call, workers, run: workers.worker(binding) };
  }
  const makeClaim = (kind: 'DISPATCH' | 'RECONCILE', args: unknown[]) => ({
    operationId: '22222222-2222-4222-8222-222222222222', epoch: '3', token: args[2], kind,
    dispatchNumber: 3, leaseUntil: '2099-01-01T00:00:00Z'
  });
  it('prefers reconciliation and can complete generation three without dispatch', async () => {
    let recovered = false;
    const { run, call } = workerDatabase((operation, args) => {
      if (operation === 'claimReconciliation') { if (recovered) return null; recovered = true; return makeClaim('RECONCILE', args); }
      if (operation === 'reconcile') return { status: 'COMPLETED', parked: false, receiptId: randomUUID() };
      if (operation === 'claim') return null;
      if (operation === 'nextDue') return { nextDue: null, parkedCount: 0 };
      throw new Error('Unexpected operation');
    });
    expect(await run(scope)).toMatchObject({ reason: 'EMPTY', claims: 1 });
    expect(call.mock.calls.map(call => call[2]).slice(0,2)).toEqual(['claimReconciliation','reconcile']);
    expect(call.mock.calls.some(call => call[2] === 'dispatch')).toBe(false);
  });
  it('dispatches only its claimed identity then hands ownership to recovery', async () => {
    let dispatched = false;
    const { run, call } = workerDatabase((operation, args) => {
      if (operation === 'claimReconciliation') return null;
      if (operation === 'claim') { if (dispatched) return null; dispatched = true; return makeClaim('DISPATCH', args); }
      if (operation === 'dispatch') return { receiptId: randomUUID(), operationId: args[2] };
      if (operation === 'handoff') return null;
      if (operation === 'nextDue') return { nextDue: null, parkedCount: 0 };
      throw new Error('Unexpected operation');
    });
    expect(await run(scope)).toMatchObject({ reason: 'EMPTY', claims: 1 });
    const dispatch = call.mock.calls.find(call => call[2] === 'dispatch')!;
    const handoff = call.mock.calls.find(call => call[2] === 'handoff')!;
    expect(dispatch[3]).toEqual(handoff[3]); expect(dispatch[3][3]).toBe('3');
  });
  it('known dispatch denial requests PROCESS recovery rather than inventing FAILED', async () => {
    let claimed = false;
    const { run, call } = workerDatabase((operation, args) => {
      if (operation === 'claimReconciliation') return null;
      if (operation === 'claim') { if (claimed) return null; claimed = true; return makeClaim('DISPATCH', args); }
      if (operation === 'dispatch') throw new RuntimeError(403, 'denied');
      if (operation === 'handoff') return null;
      return { nextDue: '2099-01-01T00:00:00Z', parkedCount: 0 };
    });
    expect(await run(scope)).toMatchObject({ reason: 'NOT_DUE' });
    expect(call.mock.calls.some(call => call[2] === 'handoff')).toBe(true);
  });
  it('stops on uncertain dispatch and leaves durable lease to SQL recovery', async () => {
    const { run, call } = workerDatabase((operation, args) => {
      if (operation === 'claimReconciliation') return null;
      if (operation === 'claim') return makeClaim('DISPATCH', args);
      throw new RuntimeError(503, 'unavailable', true, true);
    });
    expect(await run(scope)).toMatchObject({ reason: 'UNCERTAIN', claims: 1 });
    expect(call.mock.calls.map(call => call[2])).toEqual(['claimReconciliation','claim','dispatch']);
  });
  it('resolves ambiguous claim by its original token without repeating the claim', async () => {
    vi.useFakeTimers(); let original: unknown;
    const { run, call } = workerDatabase((operation, args) => {
      if (operation === 'claimReconciliation') { original = args[2]; throw new RuntimeError(503, 'unavailable', true, true); }
      if (operation === 'inspect') return { found: true, operationId: randomUUID(), epoch: '9', token: args[2], kind: 'RECONCILE', current: true, terminal: false };
      throw new Error('Unexpected operation');
    });
    const result = run(scope); await vi.advanceTimersByTimeAsync(1001);
    expect(await result).toMatchObject({ reason: 'UNCERTAIN', claims: 1 });
    expect(call.mock.calls.map(call => call[2])).toEqual(['claimReconciliation','inspect']);
    expect(call.mock.calls[1][3][2]).toBe(original);
  });
  it('stops after three consecutive connection failures, with no fabricated durable count', async () => {
    vi.useFakeTimers();
    const { run, call } = workerDatabase(() => { throw new RuntimeError(503, 'unavailable', false, true); });
    const result = run(scope); await vi.advanceTimersByTimeAsync(6001);
    expect(await result).toMatchObject({ reason: 'UNAVAILABLE', claims: 0 });
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('does not reset consecutive failures on an empty recovery hint', async () => {
    vi.useFakeTimers();
    const { run, call } = workerDatabase(operation => {
      if (operation === 'claimReconciliation') return null;
      throw new RuntimeError(503, 'unavailable', false, true);
    });
    const result = run(scope); await vi.advanceTimersByTimeAsync(6001);
    expect(await result).toMatchObject({ reason: 'UNAVAILABLE', claims: 0 });
    expect(call).toHaveBeenCalledTimes(6);
  });
  it('caps each invocation at 32 SQL housekeeping/ownership claims', async () => {
    const { run, call } = workerDatabase(() => ({ parked: true, operationId: randomUUID() }));
    expect(await run(scope)).toMatchObject({ reason: 'CLAIM_LIMIT', claims: 32 });
    expect(call).toHaveBeenCalledTimes(32);
  });
  it('aborts in-flight work at the monotonic deadline', async () => {
    vi.useFakeTimers(); let aborted = false;
    const { run } = workerDatabase((_operation, _args, signal) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => { aborted = true; reject(new RuntimeError(503, 'unavailable', false, true)); });
    }));
    const result = run(scope); await vi.advanceTimersByTimeAsync(120001);
    expect(await result).toMatchObject({ reason: 'DEADLINE' }); expect(aborted).toBe(true);
  });
  it('close aborts current work and prevents future invocations', async () => {
    const { run, workers } = workerDatabase((_operation, _args, signal) => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new RuntimeError(503, 'unavailable', false, true)));
    }));
    const result = run(scope); workers.close();
    expect(await result).toMatchObject({ reason: 'STOPPED' });
    expect(await run(scope)).toMatchObject({ reason: 'STOPPED' });
  });
  it('denies cross-tenant scope before work and ends immediately on empty queue', async () => {
    const { run, call } = workerDatabase(operation => operation === 'nextDue' ? { nextDue: null, parkedCount: 2 } : null);
    await expect(run({ ...scope, tenantId: 'other' })).rejects.toMatchObject({ statusCode: 403 });
    expect(call).not.toHaveBeenCalled();
    expect(await run(scope)).toMatchObject({ reason: 'EMPTY', parkedCount: 2, claims: 0 });
  });
});
