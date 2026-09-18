import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import { Database, S, blockedBy, call } from './helpers/postgres';

const db = new Database();
const t = 'tenant-a', c = 'campaign-a', hash = 'a'.repeat(64);
let executor: Client, worker: Client, reader: Client, auditor: Client, unbound: Client;
let upgradePreserved = false;
const signatures = {
  lock_simulation_scope: 't text,c text,operation text,requester_login text,approval_ids text[]',
  authorize_simulation_transition: 't text,c text,operation text,requester_login text,subject_id text,subject_version text,subject_hash text,approval_ids text[]',
  authorize_simulation_read: 't text,c text',
  authorize_simulation_process: 't text,c text',
  assess_simulation_dispatch: 't text,c text,requester_login text,subject_id text,subject_version text,subject_hash text,approval_ids text[]',
  append_simulation_evidence: 't text,c text,operation text,event jsonb'
};
async function bridge(client: Client, fn: keyof typeof signatures, values: unknown[]) {
  const result = await client.query(`SELECT task1_bridge.${fn}(${values.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, values);
  return result.rows[0].result;
}
const transition = (client = executor, op = 'COMMAND', requester = 'writer_a', ids: unknown = ['approval-a'], version = '9007199254740993', digest = hash) =>
  bridge(client, 'authorize_simulation_transition', [t,c,op,requester,'probe-a',version,digest,ids]);
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({code: '42501'});

beforeAll(async () => {
  await db.start(false);
  await db.admin.query(readFileSync('sql/provision-roles.sql', 'utf8'));
  await db.admin.query('GRANT CREATE ON DATABASE slice_b TO zbm_ae_owner');
  await db.admin.query(readFileSync('prisma/migrations/20260914_000001_authority_evidence_spine/migration.sql','utf8'));
  await db.admin.query('RESET ROLE');
  await db.seed();
  const before = (await db.admin.query(`SELECT jsonb_agg(to_jsonb(b) ORDER BY login) AS records FROM ${S}.caller_bindings b`)).rows[0].records;
  await db.admin.query(readFileSync('prisma/migrations/20260916_000002_simulation_runtime_bridge/migration.sql','utf8'));
  await db.admin.query('RESET ROLE');
  const after = (await db.admin.query(`SELECT jsonb_agg(to_jsonb(b) ORDER BY login) AS records FROM ${S}.caller_bindings b`)).rows[0].records;
  upgradePreserved = JSON.stringify(before) === JSON.stringify(after);
  // Test-only owner wrappers model the D owner; runtime logins never join the bridge role.
  await db.admin.query('CREATE ROLE task1_owner NOLOGIN; GRANT zbm_ae_simulation_bridge TO task1_owner; CREATE SCHEMA task1_bridge AUTHORIZATION task1_owner');
  for (const [name, args] of Object.entries(signatures)) {
    const result = name === 'assess_simulation_dispatch' ? 'boolean' : name === 'append_simulation_evidence' ? 'text' : 'jsonb';
    const types = args.split(',').map(a => a.split(' ').slice(1).join(' ')).join(',');
    const names = args.split(',').map(a => a.split(' ')[0]).join(',');
    await db.admin.query(`CREATE FUNCTION task1_bridge.${name}(${args}) RETURNS ${result} LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT ${S}.${name}(${names}) $$;
      ALTER FUNCTION task1_bridge.${name}(${types}) OWNER TO task1_owner;
      REVOKE ALL ON FUNCTION task1_bridge.${name}(${types}) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION task1_bridge.${name}(${types}) TO writer_a,campaign_a,reader_a,auditor_a,unbound,reader_b`);
  }
  await db.admin.query('GRANT USAGE ON SCHEMA task1_bridge TO writer_a,campaign_a,reader_a,auditor_a,unbound,reader_b');
  [executor,worker,reader,auditor,unbound] = await Promise.all(['writer_a','campaign_a','reader_a','auditor_a','unbound'].map(l => db.connect(l)));
});
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  for (const client of [executor,worker,reader,auditor,unbound]) await client.query('ROLLBACK');
  await db.admin.query(`UPDATE ${S}.tenants SET status='ACTIVE'; UPDATE ${S}.campaigns SET status='ACTIVE',environment='SIMULATION';
    UPDATE ${S}.caller_bindings SET active=true;
    UPDATE ${S}.caller_bindings SET capabilities=ARRAY['READ','EXECUTE_SIMULATION'],issuers=ARRAY['TECHNICAL_QC'] WHERE login='writer_a';
    UPDATE ${S}.caller_bindings SET capabilities=ARRAY['READ','PROCESS_SIMULATION'],issuers='{}' WHERE login='campaign_a';
    UPDATE ${S}.caller_bindings SET capabilities=ARRAY['READ'],issuers=ARRAY['TECHNICAL_QC'] WHERE login='reader_a';
    UPDATE ${S}.grants SET status='ACTIVE',changed_at=NULL,successor_id=NULL,valid_from=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()+interval '1 day';
    TRUNCATE ${S}.approvals; TRUNCATE ${S}.evidence`);
  for (const [login,cap] of [['writer_a','EXECUTE_SIMULATION'],['campaign_a','PROCESS_SIMULATION']]) {
    await db.admin.query(`INSERT INTO ${S}.grants(id,tenant_id,scope_kind,principal,purpose,capability,valid_from,expires_at)
      VALUES($1,$2,'TENANT',$3,'SIMULATION',$4,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day') ON CONFLICT DO NOTHING`, [login+'-'+cap,t,login,cap]);
  }
  await db.admin.query(`INSERT INTO ${S}.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at)
    VALUES('approval-a',$1,$2,'SIMULATION_PROBE_TRANSITION_V1','probe-a','9007199254740993',$3,'TECHNICAL_QC','reader_a','reader_a',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')`, [t,c,hash]);
});

test('forward migration preserves old bindings and does not implicitly grant new capabilities', () => { expect(upgradePreserved).toBe(true); });
test('bridge is NOLOGIN, owner-only, fixed search_path, and private helpers are inaccessible', async () => {
  expect((await db.admin.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='zbm_ae_simulation_bridge'")).rows[0].rolcanlogin).toBe(false);
  for (const client of [executor,worker,reader,auditor,unbound]) {
    await denied(call(client,'authorize_simulation_read',[t,c]));
    await denied(client.query('SET ROLE zbm_ae_simulation_bridge'));
    await denied(client.query(`SELECT * FROM ${S}.caller_bindings`));
  }
  const records = (await db.admin.query(`SELECT p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
    has_function_privilege('unbound',p.oid,'EXECUTE') public_access,has_function_privilege('task1_owner',p.oid,'EXECUTE') bridge_access
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND (p.proname LIKE '%simulation%' OR p.proname='append_internal')`, [S])).rows;
  for (const r of records) {
    expect(r.owner).toBe('zbm_ae_owner'); expect(r.public_access).toBe(false); expect(r.proconfig).toEqual(['search_path=pg_catalog']);
    if (r.proname in signatures) { expect(r.prosecdef).toBe(true); expect(r.bridge_access).toBe(true); }
    else expect(r.bridge_access).toBe(false);
  }
});
test('READ/AUDIT, unbound, cross-tenant and impersonated requester cannot execute', async () => {
  for (const client of [reader,auditor,unbound,await db.connect('reader_b')]) await denied(transition(client,'COMMAND'));
  await denied(transition(executor,'COMMAND','reader_a')); await denied(transition(executor,'DISPATCH','missing'));
  await denied(bridge(auditor,'authorize_simulation_read',[t,c]));
  await denied(bridge(reader,'authorize_simulation_read',['tenant-b','campaign-c']));
});
test('COMMAND and DISPATCH derive current actor, preserve >2^53 version and separate PROCESS', async () => {
  expect(await transition()).toMatchObject({principal:'writer_a',login:'writer_a'});
  expect(await transition(worker,'DISPATCH')).toMatchObject({principal:'campaign_a',login:'campaign_a'});
  expect(await bridge(worker,'authorize_simulation_process',[t,c])).toMatchObject({principal:'campaign_a'});
  await denied(transition(worker,'COMMAND','campaign_a')); await denied(transition(executor,'DISPATCH'));
});
test.each([[],['approval-a','approval-a'],['approval-a','surplus'],['missing'],[null],null])('rejects incomplete/duplicate/surplus approval set %j', async ids => {
  await denied(transition(executor,'COMMAND','writer_a',ids));
});
test.each([
  ['wrong subject', "subject_id='other'"], ['wrong type', "subject_type='CUT'"], ['wrong version', "subject_version='3'"],
  ['wrong digest', "subject_hash=repeat('b',64)"], ['wrong issuer', "issuer='RIGHTS'"],
  ['revoked', "status='REVOKED',changed_at=clock_timestamp()"],
  ['expired', "expires_at=clock_timestamp()-interval '1 second'"], ['future', "valid_from=clock_timestamp()+interval '1 hour'"],
  ['custody mismatch', "actor='writer_a'"], ['same principal', "actor='writer_a',custodial_login='writer_a'"]
])('rejects %s approval', async (_name, update) => {
  await db.admin.query(`UPDATE ${S}.approvals SET ${update}`); await denied(transition());
});
test.each(["active=false", "issuers='{}'"])('rejects invalid issuer binding %s', async update => {
  await db.admin.query(`UPDATE ${S}.caller_bindings SET ${update} WHERE login='reader_a'`); await denied(transition());
});
test.each(['01','-1','9223372036854775808'])('rejects malformed or overflowing subject version %s', async version => {
  await denied(transition(executor,'COMMAND','writer_a',['approval-a'],version));
});
test('READ and PROCESS do not consult revoked execute, approval, or disabled historical custodian', async () => {
  await db.admin.query(`UPDATE ${S}.grants SET status='REVOKED',changed_at=clock_timestamp() WHERE capability='EXECUTE_SIMULATION';
    UPDATE ${S}.approvals SET status='REVOKED',changed_at=clock_timestamp(); SELECT ${S}.change_binding('reader_a',false)`);
  expect(await bridge(executor,'authorize_simulation_read',[t,c])).toMatchObject({principal:'writer_a'});
  expect(await bridge(worker,'authorize_simulation_process',[t,c])).toMatchObject({principal:'campaign_a'});
  expect(await bridge(worker,'assess_simulation_dispatch',[t,c,'writer_a','probe-a','9007199254740993',hash,['approval-a']])).toBe(false);
  await denied(transition()); await denied(transition(worker,'DISPATCH'));
  await bridge(executor,'lock_simulation_scope',[t,c,'COMMAND','missing',['missing']]);
});
test('PROCESS and diagnostic remain usable after requester binding disable; worker revocation denies them', async () => {
  await db.admin.query(`SELECT ${S}.change_binding('writer_a',false)`);
  await denied(bridge(executor,'authorize_simulation_read',[t,c]));
  expect(await bridge(worker,'assess_simulation_dispatch',[t,c,'writer_a','probe-a','9007199254740993',hash,['approval-a']])).toBe(false);
  await db.admin.query(`SELECT ${S}.change_binding('campaign_a',false)`);
  await denied(bridge(worker,'authorize_simulation_process',[t,c]));
  await denied(bridge(worker,'assess_simulation_dispatch',[t,c,'writer_a','probe-a','9007199254740993',hash,['approval-a']]));
});
test.each(['tenant','campaign','environment','read-grant','process-grant'])('current %s failure denies relevant access without AUDIT bypass', async kind => {
  if (kind==='tenant') await db.admin.query(`UPDATE ${S}.tenants SET status='SUSPENDED' WHERE id=$1`,[t]);
  else if (kind==='campaign') await db.admin.query(`UPDATE ${S}.campaigns SET status='SUSPENDED' WHERE tenant_id=$1 AND id=$2`,[t,c]);
  else if (kind==='environment') await db.admin.query(`UPDATE ${S}.campaigns SET environment='LOCAL' WHERE tenant_id=$1 AND id=$2`,[t,c]);
  else await db.admin.query(`UPDATE ${S}.grants SET status='REVOKED',changed_at=clock_timestamp() WHERE capability=$1`,[kind==='read-grant'?'READ':'PROCESS_SIMULATION']);
  await denied(bridge(worker,'authorize_simulation_process',[t,c]));
  if (kind!=='process-grant') await denied(bridge(executor,'authorize_simulation_read',[t,c]));
});
test('lock preparation tolerates missing historical approvals but cannot acquire new identities after tenant', async () => {
  await executor.query('BEGIN');
  expect(await bridge(executor,'lock_simulation_scope',[t,c,'COMMAND','writer_a',['missing']])).toMatchObject({locked:true,authorized:false});
  expect(await bridge(executor,'authorize_simulation_read',[t,c])).toMatchObject({principal:'writer_a'});
  await denied(transition()); await executor.query('ROLLBACK');
});
test('binding locks are sorted before tenant, and PROCESS does not lock requester/custodian', async () => {
  const blocker=await db.connect('postgres');
  await blocker.query('BEGIN');
  await blocker.query(`SELECT pg_advisory_xact_lock(${S}.lock_key(jsonb_build_array('zbm-ae-v1','binding','reader_a')))`);
  const pending=transition(worker,'DISPATCH');
  try {
    await blockedBy(db.admin,worker,blocker);
    const pid=(worker as Client & {processID:number}).processID;
    const held=async (kind:string,id:string) => (await db.admin.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND granted AND locktype='advisory' AND objsubid=1 AND classid=((${S}.lock_key(jsonb_build_array('zbm-ae-v1',$2::text,$3::text)) >> 32)&4294967295)::oid AND objid=(${S}.lock_key(jsonb_build_array('zbm-ae-v1',$2::text,$3::text))&4294967295)::oid) AS held`,[pid,kind,id])).rows[0].held;
    expect(await held('binding','campaign_a')).toBe(true); expect(await held('binding','writer_a')).toBe(false); expect(await held('tenant',t)).toBe(false);
    await bridge(executor,'authorize_simulation_read',[t,c]);
  } finally { await blocker.query('ROLLBACK'); }
  await pending;
  await blocker.query('BEGIN');
  await blocker.query(`SELECT pg_advisory_xact_lock(${S}.lock_key(jsonb_build_array('zbm-ae-v1','binding','reader_a')))`);
  try { await bridge(worker,'authorize_simulation_process',[t,c]); } finally { await blocker.query('ROLLBACK'); }
});
test.each(['grant','approval'])('final decision time is after blocked %s row expires', async kind => {
  const blocker=await db.connect('postgres');
  const table=kind==='grant'?'grants':'approvals';
  const where=kind==='grant'?"capability='EXECUTE_SIMULATION'":"id='approval-a'";
  await db.admin.query(`UPDATE ${S}.${table} SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE ${where}`);
  await blocker.query('BEGIN'); await blocker.query(`SELECT 1 FROM ${S}.${table} WHERE ${where} FOR UPDATE`);
  const pending=transition().then(() => ({code:'unexpected-success'}),e => e);
  try {
    await blockedBy(db.admin,executor,blocker);
    // Observed row-lock barrier plus database-clock expiry; a delay alone is not the proof.
    while (!(await db.admin.query(`SELECT bool_and(clock_timestamp()>=expires_at) AS expired FROM ${S}.${table} WHERE ${where}`)).rows[0].expired) await new Promise(r=>setTimeout(r,10));
  } finally { await blocker.query('ROLLBACK'); }
  expect(await pending).toMatchObject({code:'42501'});
});
test('owner bridge evidence uses DB actor, strict event families, chain hashes and required preparation', async () => {
  const event={event:'COMMAND_ACCEPTED',commandId:'command-a'};
  await denied(bridge(executor,'append_simulation_evidence',[t,c,'COMMAND',event]));
  await executor.query('BEGIN'); await transition();
  const eid=await bridge(executor,'append_simulation_evidence',[t,c,'COMMAND',event]); await executor.query('COMMIT');
  await worker.query('BEGIN'); await bridge(worker,'authorize_simulation_process',[t,c]);
  await bridge(worker,'append_simulation_evidence',[t,c,'PROCESS',{event:'EFFECT_COMPLETED',commandId:'command-a',requesterPrincipal:'writer_a'}]); await worker.query('COMMIT');
  const rows=(await db.admin.query(`SELECT * FROM ${S}.evidence ORDER BY sequence`)).rows;
  expect(rows[0].id).toBe(eid); expect(rows.map(r=>r.actor)).toEqual(['writer_a','campaign_a']);
  expect(rows[1].prior_hash).toBe(rows[0].hash);
  for (const r of rows) expect(createHash('sha256').update(r.canonical).digest('hex')).toBe(r.hash);
  for (const invalid of [{...event,actor:'spoof'}, {...event,event:'EFFECT_COMPLETED'}, {...event,commandId:null}]) {
    await executor.query('BEGIN'); await transition(); await denied(bridge(executor,'append_simulation_evidence',[t,c,'COMMAND',invalid])); await executor.query('ROLLBACK');
  }
});
