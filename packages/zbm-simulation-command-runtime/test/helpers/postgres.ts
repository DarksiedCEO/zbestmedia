import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Client, type PoolConfig } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { BoundaryConfig, BoundaryDependencies } from '@zbest/zbm-authenticated-command-boundary';
import { createRuntime } from '../../src/index';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { CommitProxy } from './commit-proxy';

export const B = 'zbm_authority_evidence';
export const D = 'zbm_simulation_runtime';
export const IMAGE = 'postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20';
export const route = '/internal/simulation/probe-commands';
export const resultRoute = '/internal/simulation/probe-command-results';
export const token = 'disposable-D-token-0123456789';
export const scope = { tenantId: 'tenant-a', campaignId: 'campaign-a' };
export const oldHash = 'a'.repeat(64), nextHash = 'b'.repeat(64);
export type Command = {
  kind: 'ADVANCE_SIMULATION_PROBE'; contractVersion: 1; scope: typeof scope;
  probeId: string; expectedVersion: string; expectedPayloadSha256: string;
  nextPayloadSha256: string; completion: 'STATE_ONLY' | 'FAKE_RECEIPT';
  approvalIds: string[]; idempotencyKey: string;
};
export type Claim = { operationId: string; epoch: string; token: string; kind: 'DISPATCH'|'RECONCILE'; dispatchNumber: number; leaseUntil: string };
export type Result = { found: boolean; commandId: string; acceptance: string; execution: string; resultingVersion: string; probeId: string; replay: boolean; effect: {status: string; parked: boolean; receiptId?: string; reason?: string} };
export function command(overrides: Partial<Command> = {}): Command {
  return { kind: 'ADVANCE_SIMULATION_PROBE', contractVersion: 1, scope: {...scope}, probeId: 'probe-a', expectedVersion: '0', expectedPayloadSha256: oldHash, nextPayloadSha256: nextHash, completion: 'FAKE_RECEIPT', approvalIds: ['approval-a'], idempotencyKey: 'key-a', ...overrides };
}
const identities = [
  {login:'executor_a', tenant:'tenant-a', caps:['READ','EXECUTE_SIMULATION'], groups:['zbm_sim_executor','zbm_sim_result_reader'], issuers:[]},
  {login:'executor_other', tenant:'tenant-a', caps:['READ','EXECUTE_SIMULATION'], groups:['zbm_sim_executor','zbm_sim_result_reader'], issuers:[]},
  {login:'executor_b', tenant:'tenant-b', caps:['READ','EXECUTE_SIMULATION'], groups:['zbm_sim_executor','zbm_sim_result_reader'], issuers:[]},
  {login:'reader_a', tenant:'tenant-a', caps:['READ'], groups:['zbm_sim_result_reader'], issuers:[]},
  {login:'auditor_a', tenant:'tenant-a', caps:['AUDIT'], groups:['zbm_sim_result_reader','zbm_ae_auditor'], issuers:[]},
  {login:'issuer_a', tenant:'tenant-a', caps:['READ','RECORD_APPROVAL'], groups:['zbm_ae_approval_writer','zbm_ae_reader'], issuers:['TECHNICAL_QC']},
  {login:'issuer_b', tenant:'tenant-b', caps:['READ','RECORD_APPROVAL'], groups:['zbm_ae_approval_writer','zbm_ae_reader'], issuers:['TECHNICAL_QC']},
  {login:'manager_a', tenant:'tenant-a', caps:['READ','AUDIT','MANAGE_TENANT','MANAGE_GRANT','RECORD_APPROVAL'], groups:['zbm_ae_authority_writer','zbm_ae_approval_writer','zbm_ae_reader','zbm_ae_auditor'], issuers:['TECHNICAL_QC']},
  {login:'worker_a', tenant:'tenant-a', caps:['READ','PROCESS_SIMULATION'], groups:['zbm_sim_worker'], issuers:[]},
  {login:'worker_b', tenant:'tenant-a', caps:['READ','PROCESS_SIMULATION'], groups:['zbm_sim_worker'], issuers:[]},
  {login:'unbound', tenant:'tenant-a', caps:[], groups:['zbm_sim_executor','zbm_sim_result_reader','zbm_sim_worker'], issuers:[]}
];

/** Every instance owns a fresh container. No inherited DATABASE_URL is ever used. */
export class Database {
  container?: StartedTestContainer;
  admin!: Client;
  clients: Client[] = [];
  private password = randomBytes(24).toString('hex');
  private restartedPort?: number;
  async start(upgrade = false) {
    if (process.version !== 'v24.21.0') throw new Error('Exact Node v24.21.0 required');
    if (execFileSync('pnpm',['--version'],{encoding:'utf8'}).trim() !== '9.15.0') throw new Error('Exact pnpm 9.15.0 required');
    try {
      this.container = await new GenericContainer(IMAGE).withEnvironment({POSTGRES_PASSWORD:this.password,POSTGRES_DB:'slice_d'})
        .withExposedPorts(5432).withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/,2)).withStartupTimeout(60000).start();
      this.admin = await this.connect('postgres');
      if ((await this.admin.query('SHOW server_version')).rows[0].server_version.split(' ')[0] !== '16.14') throw new Error('PostgreSQL 16.14 required');
      await this.admin.query(readFileSync(resolve('../zbm-authority-evidence-store/sql/provision-roles.sql'),'utf8'));
      await this.admin.query(readFileSync(resolve('sql/provision-roles.sql'),'utf8'));
      await this.admin.query(`ALTER ROLE zbm_ae_migrator LOGIN PASSWORD '${this.password}'; ALTER ROLE zbm_sim_migrator LOGIN PASSWORD '${this.password}'; GRANT CREATE ON DATABASE slice_d TO zbm_ae_owner,zbm_sim_owner`);
      if (upgrade) {
        const c = await this.connect('zbm_ae_migrator');
        await c.query(readFileSync(resolve('../zbm-authority-evidence-store/prisma/migrations/20260914_000001_authority_evidence_spine/migration.sql'),'utf8'));
        this.migrate('B',['migrate','resolve','--applied','20260914_000001_authority_evidence_spine']);
        await this.admin.query(`INSERT INTO ${B}.tenants(id) VALUES ('upgrade-tenant'); INSERT INTO ${B}.campaigns(tenant_id,id) VALUES ('upgrade-tenant','upgrade-campaign')`);
      }
      this.migrate('B'); this.migrate('D');
      for (const i of identities) {
        await this.admin.query(`CREATE ROLE ${i.login} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${this.password}'`);
        await this.admin.query(`GRANT ${i.groups.join(',')} TO ${i.login}`);
      }
      await this.seed(); return this;
    } catch (e) { await this.stop(); throw e; }
  }
  migrate(owner: 'B'|'D', args = ['migrate','deploy']) {
    const user = owner === 'B' ? 'zbm_ae_migrator' : 'zbm_sim_migrator';
    const c = this.credentials(user);
    const url = new URL(`postgresql://${user}:${this.password}@${c.host}:${c.port}/slice_d`);
    url.searchParams.set('schema',owner === 'B' ? B : D);
    url.searchParams.set('options',`-c role=${owner === 'B' ? 'zbm_ae_owner' : 'zbm_sim_owner'}`);
    try {
      return execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),...args,'--schema',resolve(owner === 'B' ? '../zbm-authority-evidence-store/prisma/schema.prisma' : 'prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url.toString(),CHECKPOINT_DISABLE:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
    } catch (e) {
      const stderr = String((e as {stderr?:unknown}).stderr ?? '').split(this.password).join('[REDACTED]');
      throw new Error(`Disposable ${owner} migration failed: ${stderr}`);
    }
  }
  credentials(user: string): PoolConfig {
    if (!this.container) throw new Error('Owned container unavailable');
    return {host:this.container.getHost(),port:this.restartedPort ?? this.container.getMappedPort(5432),database:'slice_d',user,password:this.password};
  }
  async connect(user: string, override: PoolConfig = {}) {
    const c = new Client({...this.credentials(user),statement_timeout:10000,...override});
    c.on('error',()=>undefined); try { await c.connect(); } catch(e) { await c.end().catch(()=>undefined); throw e; } this.clients.push(c); return c;
  }
  async reset() {
    await Promise.all(this.clients.filter(c=>c!==this.admin).map(c=>c.end().catch(()=>undefined)));this.clients=[this.admin];
    await this.admin.query(`TRUNCATE ${D}.probes, ${B}.tenants CASCADE`); await this.seed();
  }
  async seed() {
    await this.admin.query(`INSERT INTO ${B}.tenants(id) VALUES ('tenant-a'),('tenant-b'); INSERT INTO ${B}.campaigns(tenant_id,id) VALUES ('tenant-a','campaign-a'),('tenant-a','campaign-b'),('tenant-b','campaign-c')`);
    for (const i of identities.filter(i=>i.login !== 'unbound')) {
      await this.admin.query(`INSERT INTO ${B}.caller_bindings(login,principal,tenant_id,purpose,capabilities,issuers) VALUES($1,$1,$2,'SIMULATION',$3,$4)`,[i.login,i.tenant,i.caps,i.issuers]);
      for (const cap of i.caps) await this.admin.query(`INSERT INTO ${B}.grants(id,tenant_id,scope_kind,principal,purpose,capability,valid_from,expires_at) VALUES($1,$2,'TENANT',$3,'SIMULATION',$4,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`,[i.login+'-'+cap,i.tenant,i.login,cap]);
    }
    await this.seedProbe(command()); await this.approve(command());
  }
  async seedProbe(req: Command) { await this.admin.query(`SELECT ${D}.seed_probe($1,$2,$3,$4)`,[req.scope.tenantId,req.scope.campaignId,req.probeId,req.expectedPayloadSha256]); }
  async transitionHash(req: Command): Promise<string> {
    return (await this.admin.query(`SELECT encode(sha256(convert_to(jsonb_build_array('zbm-sim-transition-v1',$1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text)::text,'UTF8')),'hex') AS hash`,[req.scope.tenantId,req.scope.campaignId,req.probeId,req.expectedVersion,req.expectedPayloadSha256,req.nextPayloadSha256,req.completion])).rows[0].hash;
  }
  async approve(req: Command, login = 'issuer_a') {
    await this.admin.query(`INSERT INTO ${B}.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at) VALUES($1,$2,$3,'SIMULATION_PROBE_TRANSITION_V1',$4,$5,$6,'TECHNICAL_QC',$7,$7,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') ON CONFLICT(tenant_id,campaign_id,id) DO UPDATE SET subject_hash=excluded.subject_hash,subject_version=excluded.subject_version`,[req.approvalIds[0],req.scope.tenantId,req.scope.campaignId,req.probeId,req.expectedVersion,await this.transitionHash(req),login]);
  }
  configuration(login = 'executor_a', principal = login): BoundaryConfig {
    const tenantId = login === 'executor_b' ? 'tenant-b' : 'tenant-a';
    return {authConfig:{principalsByToken:new Map([[token,{keyId:'service-d',tenants:[tenantId]}]])},policies:[{keyId:'service-d',audience:'zbm-command-boundary/simulation',enabled:true,notBefore:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}],bindings:[{keyId:'service-d',tenantId,principal,databaseLogin:login,credentialSlot:'d'}]};
  }
  async application(login = 'executor_a', options: {principal?:string; connections?:PoolConfig; config?:BoundaryConfig; deps?:Partial<BoundaryDependencies>; fastify?:FastifyServerOptions} = {}) {
    const runtime = createRuntime(options.config ?? this.configuration(login,options.principal ?? login),{connections:{d:options.connections ?? this.credentials(login)},...options.deps});
    const app = Fastify(options.fastify ?? {logger:false});
    await app.register(runtime.plugin); await app.ready();
    return {app,runtime,close:async()=>{await app.close();await runtime.close();}};
  }
  async submit(req = command(), login = 'executor_a'): Promise<Result> { return sql(await this.connect(login),'submit_or_replay',[req,false]); }
  async result(req = command(), login = 'executor_a'): Promise<Result> { return sql(await this.connect(login),'read_own_result',[req.scope.tenantId,req.scope.campaignId,req.idempotencyKey]); }
  async claim(login = 'worker_a'): Promise<Claim|null> { return sql(await this.connect(login),'claim_effect',[scope.tenantId,scope.campaignId,randomUUID()]); }
  async recover(login = 'worker_b'): Promise<Claim|null> { return sql(await this.connect(login),'claim_reconciliation',[scope.tenantId,scope.campaignId,randomUUID()]); }
  async dispatch(claim: Claim, login = 'worker_a') { return sql<{receiptId:string;operationId:string}>(await this.connect(login),'dispatch_fake',[scope.tenantId,scope.campaignId,claim.operationId,claim.epoch,claim.token]); }
  async handoff(claim: Claim, login = 'worker_a') { return sql(await this.connect(login),'request_reconciliation',[scope.tenantId,scope.campaignId,claim.operationId,claim.epoch,claim.token]); }
  async reconcile(claim: Claim, login = 'worker_b') { return sql<{status:string;parked:boolean;reason?:string;receiptId?:string}>(await this.connect(login),'reconcile_effect',[scope.tenantId,scope.campaignId,claim.operationId,claim.epoch,claim.token]); }
  async expire(operationId: string) { await this.admin.query(`UPDATE ${D}.effect_intents SET lease_until=clock_timestamp()-interval '1 second' WHERE operation_id=$1 AND owner_kind<>'NONE'`,[operationId]); }
  async due(operationId: string) { await this.admin.query(`UPDATE ${D}.effect_intents SET next_dispatch_at=CASE WHEN next_dispatch_at IS NOT NULL THEN clock_timestamp()-interval '1 second' END,next_reconcile_at=CASE WHEN next_reconcile_at IS NOT NULL THEN clock_timestamp()-interval '1 second' END WHERE operation_id=$1`,[operationId]); }
  async intent(operationId: string) { return (await this.admin.query(`SELECT * FROM ${D}.effect_intents WHERE operation_id=$1`,[operationId])).rows[0]; }
  async counts() {
    const result: Record<string,number> = {};
    for (const table of ['commands','probe_versions','effect_intents','effect_attempts','attempt_events','fake_operations','fake_receipts']) result[table]=Number((await this.admin.query(`SELECT count(*) FROM ${D}.${table}`)).rows[0].count);
    result.accepted=await this.evidenceCount('COMMAND_ACCEPTED'); result.completed=await this.evidenceCount('EFFECT_COMPLETED'); result.failed=await this.evidenceCount('EFFECT_FAILED'); return result;
  }
  async workerDiagnosticState() {
    // Read-only, explicit allowlist: no request bytes, credentials, approval data or owner tokens.
    return (await this.admin.query(`SELECT clock_timestamp() AS observed_at,
      (SELECT coalesce(jsonb_agg(x ORDER BY x.operation_id),'[]'::jsonb) FROM (
        SELECT operation_id,status,dispatch_claims_used,ownership_epoch::text,owner_kind,owner_login,lease_until,
          reconcile_slots_used,unsuccessful_reconciliations,expired_reconcile_claims,
          total_reconcile_claims,total_unsuccessful_reconciliations,total_expired_reconcile_claims,
          next_dispatch_at,next_reconcile_at,parked,park_reason,reason,
          extract(epoch FROM(lease_until-clock_timestamp())) AS lease_seconds_remaining
        FROM ${D}.effect_intents WHERE tenant_id='tenant-a' AND campaign_id='campaign-a'
      ) x) AS intents,
      (SELECT coalesce(jsonb_agg(x ORDER BY x.id),'[]'::jsonb) FROM (
        SELECT id,operation_id,ownership_epoch::text,dispatch_generation,reconcile_slot,event_kind,owner_login,reason,occurred_at
        FROM ${D}.attempt_events WHERE tenant_id='tenant-a' AND campaign_id='campaign-a'
      ) x) AS events,
      (SELECT count(*) FROM ${D}.fake_operations) AS fake_operations,
      (SELECT count(*) FROM ${D}.fake_receipts) AS fake_receipts,
      (SELECT coalesce(jsonb_agg(x ORDER BY x.pid),'[]'::jsonb) FROM (
        SELECT pid,usename,state,wait_event_type,wait_event,backend_start,xact_start,query_start
        FROM pg_stat_activity WHERE datname=current_database() AND application_name='zbm-simulation-runtime'
      ) x) AS runtime_backends`)).rows[0];
  }
  async evidenceCount(event: string) { return Number((await this.admin.query(`SELECT count(*) FROM ${B}.evidence WHERE stream='simulation-runtime-v1' AND canonical::jsonb->12->>'event'=$1`,[event])).rows[0].count); }
  async version(req = command()): Promise<string> { return (await this.admin.query(`SELECT version::text FROM ${D}.probes WHERE tenant_id=$1 AND campaign_id=$2 AND id=$3`,[req.scope.tenantId,req.scope.campaignId,req.probeId])).rows[0].version; }
  async revoke(capability: string, login = 'executor_a') { return bsql(await this.connect('manager_a'),'revoke_grant',['tenant-a',null,'SIMULATION',login+'-'+capability,0]); }
  async revokeApproval() { return bsql(await this.connect('manager_a'),'revoke_approval',['tenant-a','campaign-a','SIMULATION','approval-a',0]); }
  async disable(login: string) { return bsql(this.admin,'change_binding',[login,false]); }
  async suspend() { return bsql(await this.connect('manager_a'),'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]); }
  async restart() {
    await Promise.all(this.clients.map(c=>c.end().catch(()=>undefined))); this.clients=[];
    if (!this.container) throw new Error('Owned container unavailable');
    execFileSync('docker',['restart',this.container.getId()],{stdio:'pipe'});
    // Docker can reallocate an ephemeral published port on restart. Preserve the
    // same container/storage, but do not reuse Testcontainers' stale cached port.
    const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',this.container.getId()],{encoding:'utf8'})) as Record<string,{HostIp:string;HostPort:string}[]>;
    this.restartedPort=Number(ports['5432/tcp']?.[0]?.HostPort);
    if(!Number.isInteger(this.restartedPort)||this.restartedPort<1)throw new Error('Owned database mapped port unavailable after restart');
    const until=Date.now()+15000;
    while (Date.now()<until) { try { this.admin=await this.connect('postgres'); return; } catch { await new Promise(r=>setTimeout(r,25)); } }
    throw new Error('Owned database did not restart');
  }
  async stop() { await Promise.all(this.clients.map(c=>c.end().catch(()=>undefined))); this.clients=[]; if(this.container){await this.container.stop();this.container=undefined;} }
}
export async function sql<T = unknown>(c: Client, fn: string, values: unknown[]): Promise<T> {
  if(!/^[a-z_]+$/.test(fn))throw new Error('Invalid fixture SQL function');
  return (await c.query(`SELECT ${D}.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values)).rows[0].result as T;
}
export async function bsql(c: Client, fn: string, values: unknown[]) {
  if(!/^[a-z_]+$/.test(fn))throw new Error('Invalid fixture SQL function');
  return (await c.query(`SELECT ${B}.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,values)).rows[0].result;
}
export async function waitForBlock(admin: Client, waiting: Client, blocker?: Client) {
  const w = (waiting as Client & {processID:number}).processID, b = blocker && (blocker as Client & {processID:number}).processID;
  const until=Date.now()+4000;
  while(Date.now()<until) { const r=await admin.query('SELECT pg_blocking_pids($1) AS blockers',[w]); if(r.rows[0].blockers.length && (!b || r.rows[0].blockers.includes(b)))return; }
  throw new Error('Expected PostgreSQL lock barrier was not observed');
}
export async function waitUntil(admin: Client, predicate: string, params: unknown[] = [], timeout = 5000) {
  const until=Date.now()+timeout;
  while(Date.now()<until)if((await admin.query(`SELECT (${predicate}) AS ready`,params)).rows[0].ready)return;
  throw new Error('Expected database state barrier was not observed');
}
export function mustClaim(value: Claim|null): Claim { if(!value || !value.token)throw new Error('Expected a real ownership claim'); return value; }
export async function thirdClaim(db: Database) {
  for(let n=1;n<=2;n++) { const c=mustClaim(await db.claim()); if(c.dispatchNumber!==n)throw new Error('Dispatch counter mismatch'); await db.expire(c.operationId); const r=mustClaim(await db.recover()); const outcome=await db.reconcile(r); if(outcome.status!=='PENDING')throw new Error('Absence must authorize retry'); await db.due(c.operationId); }
  const c=mustClaim(await db.claim()); if(c.dispatchNumber!==3)throw new Error('Expected third dispatch'); return c;
}

/** Passive diagnostic capture before test assertions; does not alter timeouts, SQL or worker behavior. */
export async function diagnoseWorkerRun<T>(db: Database, proxy: CommitProxy, label: string, run: () => Promise<T>): Promise<T> {
  const started=performance.now(),startedUtc=new Date().toISOString(),cpu=process.cpuUsage(),utilization=performance.eventLoopUtilization();
  const delay=monitorEventLoopDelay({resolution:20});delay.enable();
  let report: T|undefined,thrown: {name:string;code?:string}|undefined;
  try { report=await run();return report; }
  catch(error){thrown={name:error instanceof Error?error.name:'Unknown',code:typeof error==='object'&&error!==null&&'code' in error?String(error.code):undefined};throw error;}
  finally {
    const elapsedMs=performance.now()-started;delay.disable();
    const diagnostic={marker:'D36_DIAGNOSTIC',label,phase:'worker-exit',startedUtc,observedUtc:new Date().toISOString(),elapsedMs,report,thrown,
      cpuMicros:process.cpuUsage(cpu),eventLoop:performance.eventLoopUtilization(utilization),
      eventLoopDelayMs:{max:delay.max/1e6,mean:Number.isFinite(delay.mean)?delay.mean/1e6:null,p99:delay.percentile(99)/1e6},proxy:proxy.diagnostics()};
    // First record is synchronous and survives even if the admin snapshot fails.
    console.info(JSON.stringify(diagnostic));
    try { console.info(JSON.stringify({marker:'D36_DIAGNOSTIC',label,phase:'durable-state',elapsedMs:performance.now()-started,state:await db.workerDiagnosticState()})); }
    catch(error){console.info(JSON.stringify({marker:'D36_DIAGNOSTIC',label,phase:'durable-state-unavailable',code:typeof error==='object'&&error!==null&&'code' in error?String(error.code):'UNKNOWN'}));}
  }
}
