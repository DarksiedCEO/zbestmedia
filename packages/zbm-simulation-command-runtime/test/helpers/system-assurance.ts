import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';
import { isDeepStrictEqual } from 'node:util';
import type { WorkerReport } from '../../src/index';
import { B, D, type Command, Database, resultRoute, route, scope, token, waitUntil } from './postgres';

export type Application = Awaited<ReturnType<Database['application']>>;

/** V8 serialization retains every field, including undefined and Date values;
 * JSON serialization would silently omit some values. Never return row bytes. */
export function rowFingerprint(row: unknown): string {
  // PostgreSQL jsonb and expected literals may enumerate identical keys in
  // different orders. Sort keys recursively, retaining all values and types.
  const canonical = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  };
  return createHash('sha256').update(serialize(canonical(row))).digest('hex');
}

/** Partial predicates keep sensitive actual/expected rows out of matcher output.
 * Full-row invariance is separately asserted with deep equality and fingerprints. */
export function hasExactFields(row: Record<string, unknown>, fields: Record<string, unknown>): boolean {
  return Object.entries(fields).every(([key, value]) => Object.prototype.hasOwnProperty.call(row, key) && isDeepStrictEqual(row[key], value));
}

class CleanupFailure extends Error {
  constructor(readonly failures: ReadonlyArray<{ action: number; kind: 'ERROR' | 'NON_ERROR' | 'CLEANUP' }>) {
    super(`System assurance cleanup failed (${failures.length} failures)`);
    this.name = 'SystemAssuranceCleanupFailure';
  }
}

/** Attempt every action, then propagate failure using fixed classes and action
 * indices only. Never retain raw rejection objects/messages/stacks/causes, which
 * can contain SQL parameters, assertion actual/expected values or credentials. */
export async function cleanup(...actions: Array<() => unknown | Promise<unknown>>): Promise<void> {
  const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
  const failures: Array<{ action: number; kind: 'ERROR' | 'NON_ERROR' | 'CLEANUP' }> = [];
  results.forEach((result, action) => {
    if (result.status === 'rejected') failures.push({ action,
      kind: result.reason instanceof CleanupFailure ? 'CLEANUP' : result.reason instanceof Error ? 'ERROR' : 'NON_ERROR' });
  });
  if (failures.length) throw new CleanupFailure(failures);
}

export function closeApplication(a: Application) {
  // Do not rely on Database.application.close's sequential app/runtime cleanup.
  return cleanup(() => a.app.close(), () => a.runtime.close());
}
export function inject(a: Application, req: Command, result = false, authenticated = true) {
  return a.app.inject({ method: 'POST', url: result ? resultRoute : route,
    headers: authenticated ? { authorization: `Bearer ${token}` } : {},
    payload: result ? { scope: req.scope, idempotencyKey: req.idempotencyKey } : req });
}

/** Independent committed joins tie HTTP command identity to state, evidence and receipt. */
export async function trace(db: Database, commandId: string) {
  return (await db.admin.query(`SELECT c.id AS command_id,c.identity_hash,
    c.resulting_version::text,c.next_payload_sha256,p.version::text,p.payload_sha256,
    v.command_id AS version_command_id,v.previous_sha256,v.next_sha256,
    e.canonical::jsonb->12 AS acceptance_evidence,
    i.operation_id,i.status,i.dispatch_claims_used,i.ownership_epoch::text,
    f.receipt_id AS operation_receipt_id,r.id AS receipt_id,r.payload_sha256 AS receipt_payload,
    f.identity_hash AS operation_hash,r.identity_hash AS receipt_hash,
    (SELECT count(*)::int FROM ${D}.effect_attempts a WHERE a.operation_id=i.operation_id) AS dispatch_attempts,
    (SELECT count(*)::int FROM ${D}.fake_operations o WHERE o.operation_id=i.operation_id) AS fake_operation_count,
    (SELECT count(*)::int FROM ${D}.fake_receipts receipt WHERE receipt.operation_id=i.operation_id) AS receipt_count,
    (SELECT count(*)::int FROM ${D}.attempt_events a WHERE a.operation_id=i.operation_id
      AND a.event_kind IN ('EFFECT_COMPLETED','EFFECT_FAILED')) AS terminal_events,
    (SELECT coalesce(jsonb_agg(ev.canonical::jsonb->12),'[]'::jsonb)
      FROM ${D}.attempt_events a JOIN ${B}.evidence ev ON ev.id=a.evidence_id
      AND ev.tenant_id=a.tenant_id AND ev.campaign_id=a.campaign_id
      WHERE a.operation_id=i.operation_id AND a.event_kind IN ('EFFECT_COMPLETED','EFFECT_FAILED')) AS terminal_evidence
    FROM ${D}.commands c
    JOIN ${D}.probes p ON (p.tenant_id,p.campaign_id,p.id)=(c.tenant_id,c.campaign_id,c.probe_id)
    JOIN ${D}.probe_versions v ON v.command_id=c.id
    JOIN ${B}.evidence e ON (e.tenant_id,e.campaign_id,e.id)=(c.tenant_id,c.campaign_id,c.evidence_id)
    LEFT JOIN ${D}.effect_intents i ON i.command_id=c.id
    LEFT JOIN ${D}.fake_operations f ON f.operation_id=i.operation_id
    LEFT JOIN ${D}.fake_receipts r ON r.operation_id=i.operation_id
    WHERE c.id=$1`, [commandId])).rows[0];
}

/** Actual replacement OS process running the unchanged production finite worker.
 * TypeScript is transpiled in memory only; no generated files or runtime tuning.
 * IPC readiness, report, graceful exit and database socket disappearance are barriers.
 * Watchdog rejection is infrastructure failure, never evidence of permission denial.
 */
export class RuntimeChild {
  private readonly child: ChildProcess;
  private readonly exited: Promise<void>;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private sequence = 0;
  private ready: Promise<unknown>;
  private closing?: Promise<void>;
  private failure?: Error;
  private stopping = false;
  private forced?: Promise<void>;
  constructor(db: Database, readonly login: 'worker_a' | 'worker_b') {
    const source = String.raw`
      const fs=require('node:fs'),ts=require(process.env.E_TYPESCRIPT);
      require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
      }).outputText,file);
      const {createRuntime}=require(process.env.E_RUNTIME);
      let runtime,binding;
      process.on('message',async m=>{
        try {
          let value;
          if(m.kind==='init'){
            const config=m.config;config.authConfig.principalsByToken=new Map(config.authConfig.principalsByToken);
            runtime=createRuntime(config,{connections:{d:m.credentials}});binding=config.bindings[0];value={pid:process.pid};
          } else if(m.kind==='run') value=await runtime.worker(binding)(m.scope);
          else if(m.kind==='close'){await runtime.close();value={closed:true};}
          else throw new Error('Unknown IPC operation');
          process.send({id:m.id,value},()=>{if(m.kind==='close')process.disconnect();});
        }catch{process.send({id:m.id,error:true});}
      });
    `;
    this.child = spawn(process.execPath, ['--no-experimental-strip-types', '-e', source], {
      env: { ...process.env, E_TYPESCRIPT: resolve('node_modules/typescript'), E_RUNTIME: resolve('src/index.ts') },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    // 'close' also fires for failed spawn, where 'exit' may never arrive.
    this.exited = new Promise(resolveExit => this.child.once('close', () => resolveExit()));
    this.child.on('error', () => this.fail(new Error('System assurance worker child process failed')));
    this.child.on('exit', code => {
      if (!this.stopping || code !== 0) this.fail(new Error('System assurance worker child exited unexpectedly'));
    });
    this.child.on('message', raw => {
      const m = raw as { id: number; value?: unknown; error?: boolean };
      const p = this.pending.get(m.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(m.id);
      if (m.error) {
        const error = new Error('System assurance child operation failed');
        p.reject(error); this.fail(error);
      }
      else p.resolve(m.value);
    });
    const config = db.configuration(login);
    this.ready = this.request('init', { config: { ...config, authConfig: {
      ...config.authConfig, principalsByToken: [...config.authConfig.principalsByToken],
    } }, credentials: db.credentials(login) });
    // Observe early startup rejection even when the test is still doing HTTP work.
    // Keep the original rejected promise for started/run/close to propagate.
    void this.ready.catch(() => undefined);
  }
  private fail(error: Error) {
    this.failure ??= error;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(this.failure); }
    this.pending.clear();
    // A failed init/run must not wait for the test's finally to kill its process.
    // close() awaits and propagates this same cleanup result and original failure.
    void this.forceStop().catch(() => undefined);
  }
  private async waitForExit() {
    let timer: NodeJS.Timeout | undefined;
    try { await Promise.race([this.exited, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Worker did not release process resources')), 5000);
    })]); } finally { clearTimeout(timer); }
  }
  private forceStop(): Promise<void> {
    return this.forced ??= (async () => {
      await cleanup(
        async () => {
          if (this.child.pid !== undefined && this.child.exitCode === null && this.child.signalCode === null) {
            if (!this.child.kill('SIGKILL')) throw new Error('Worker force-kill was not delivered');
          }
          await this.waitForExit();
        },
        () => { if (this.child.connected) this.child.disconnect(); },
      );
    })();
  }
  private request(kind: string, fields: Record<string, unknown> = {}, timeout = 15000): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise((resolveValue, reject) => {
      const timer = setTimeout(() => this.fail(new Error('System assurance IPC barrier timeout')), timeout);
      this.pending.set(id, { resolve: resolveValue, reject, timer });
      try {
        this.child.send({ id, kind, ...fields }, error => {
          if (error) this.fail(new Error('System assurance IPC transport failed'));
        });
      } catch { this.fail(new Error('System assurance IPC send failed')); }
    });
  }
  async started(): Promise<number> { return (await this.ready as { pid: number }).pid; }
  async run(): Promise<WorkerReport> { await this.ready; return await this.request('run', { scope }, 130000) as WorkerReport; }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.stopping = true;
      try {
        if (this.failure) throw this.failure;
        if (this.child.exitCode !== null || this.child.signalCode !== null) throw new Error('Worker exited before graceful shutdown');
        await this.ready; await this.request('close');
        await this.waitForExit();
        if (this.failure) throw this.failure;
        if (this.child.exitCode !== 0) throw new Error('Worker shutdown was not clean');
      } catch (error) {
        await cleanup(() => { throw error; }, () => this.forceStop());
      }
    })();
  }
}

export async function released(db: Database, login: string) {
  await waitUntil(db.admin, 'NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1)', [login]);
}
