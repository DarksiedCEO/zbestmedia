import { beforeEach, afterEach, expect, test } from "vitest";
import { Database, S, call } from "./helpers/postgres";
let db: Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});

import { createHash } from 'node:crypto';
test("B-EVD-01: immutable scoped supersession and canonical hashes",async()=>{
 const w=await db.runtime('writer_a','evidence_writer');const e=(await call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{z:1,a:null},null])).rows[0].result;
 await call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{correction:true},e]);
 await expect(call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},e])).rejects.toMatchObject({code:'23505'});
 await expect(call(w,'append_evidence',['tenant-a','campaign-b','SIMULATION','s',{},e])).rejects.toMatchObject({code:'42501'});
 const rows=(await db.admin.query(`SELECT *,to_char(appended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') utc_time FROM ${S}.evidence ORDER BY sequence`)).rows;expect(rows.length).toBe(2);expect(rows[0].sequence).toBe('1');expect(rows[1].prior_hash).toBe(rows[0].hash);
 const reader=await db.runtime('reader_a','reader');expect((await call(reader,'read_evidence',['tenant-a','campaign-a','SIMULATION',e,false])).rows[0].result.sequence).toBe('1');
 for(const [i,row] of rows.entries()){
  expect(createHash('sha256').update(row.canonical).digest('hex')).toBe(row.hash);
  expect(JSON.parse(row.canonical)).toEqual(['zbm-ae-evidence-v1',row.id,row.tenant_id,row.campaign_id,row.stream,Number(row.sequence),row.operation,row.predecessor,row.prior_hash,row.actor,row.custodial_login,row.utc_time,i===0?{z:1,a:null}:{correction:true}]);
  expect(row.actor).toBe('writer_a');expect(row.custodial_login).toBe('writer_a');
 }
 const golden=(await db.admin.query(`SELECT jsonb_build_array('v1',NULL,1,jsonb_build_object('z',2,'a',1))::text canonical`)).rows[0].canonical;expect(golden).toBe('["v1", null, 1, {"a": 1, "z": 2}]');
 await expect(db.admin.query(`UPDATE ${S}.evidence SET actor='other' WHERE id=$1`,[e])).rejects.toThrow('Evidence is append-only');
});
test("B-EVD-02: concurrent append allocates a single valid chain and rollback leaves no row",async()=>{
 const a=await db.runtime('writer_a','evidence_writer'),b=await db.runtime('writer_a','evidence_writer');
 await Promise.all([call(a,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},null]),call(b,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},null])]);
 expect((await db.admin.query(`SELECT sequence FROM ${S}.evidence ORDER BY sequence`)).rows.map(x=>x.sequence)).toEqual(['1','2']);
 await a.query('BEGIN');await call(a,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},null]);await a.query('ROLLBACK');expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(2);
});
test("B-ID-02/B-EVD-03: absent and foreign evidence are indistinguishable to scoped readers",async()=>{
 const w=await db.runtime('writer_a','evidence_writer'),r=await db.runtime('reader_b','reader');const id=(await call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},null])).rows[0].result;
 for(const eid of [id,'absent'])await expect(call(r,'read_evidence',['tenant-b','campaign-c','SIMULATION',eid,false])).rejects.toMatchObject({code:'42501',message:'Scope unavailable'});
});

test('B-EVD-02: concurrent corrections have exactly one direct successor',async()=>{
 const a=await db.runtime('writer_a','evidence_writer'),b=await db.runtime('campaign_a','evidence_writer');
 const id=(await call(a,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{},null])).rows[0].result;
 const outcomes=await Promise.allSettled([call(a,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{a:1},id]),call(b,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{b:1},id])]);
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
 for(const outcome of outcomes)if(outcome.status==='rejected')expect(outcome.reason).toMatchObject({code:'23505'});
 const rows=(await db.admin.query(`SELECT sequence,prior_hash,hash FROM ${S}.evidence ORDER BY sequence`)).rows;expect(rows.map(x=>x.sequence)).toEqual(['1','2']);expect(rows[1].prior_hash).toBe(rows[0].hash);
});
test('B-RACE-07: versioned advisory key golden vectors use signed SHA256 prefix',async()=>{
 for(const vector of ['["zbm-ae-v1", "tenant", "tenant-a"]','["zbm-ae-v1", "binding", "reader_a"]','["zbm-ae-v1", "stream", "tenant-a", null, "é"]']){
 const digest=createHash('sha256').update(vector,'utf8').digest();const expected=digest.readBigInt64BE().toString();expect((await db.admin.query(`SELECT ${S}.lock_key($1::jsonb)::text key`,[vector])).rows[0].key).toBe(expected);
 }
});

for(const scope of ['tenant','campaign'])for(const status of ['SUSPENDED','REVOKED'])test(`NULL-audit regression: ${scope} ${status}`,async()=>{
 const w=await db.runtime('writer_a','evidence_writer'),r=await db.runtime('reader_a','reader'),a=await db.runtime('auditor_a','auditor');
 const id=(await call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','audit-regression',{},null])).rows[0].result;
 for(const audit of [false,null])expect((await call(r,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,audit])).rows[0].result.id).toBe(id);
 if(scope==='tenant'){const admin=await db.runtime();await call(admin,'set_tenant_status',['tenant-a','SIMULATION',status,0]);}
 else await db.admin.query(`UPDATE ${S}.campaigns SET status=$1 WHERE tenant_id='tenant-a' AND id='campaign-a'`,[status]);
 for(const audit of [false,null,true])await expect(call(r,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,audit])).rejects.toMatchObject({code:'42501',message:'Scope unavailable'});
 expect((await call(a,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,true])).rows[0].result.id).toBe(id);
 for(const audit of [false,null])await expect(call(a,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,audit])).rejects.toMatchObject({code:'42501'});
 await call(db.admin,'change_binding',['auditor_a',false]);
 await expect(call(a,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,true])).rejects.toMatchObject({code:'42501'});
 await call(db.admin,'change_binding',['auditor_a',true]);
 expect((await call(a,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,true])).rows[0].result.id).toBe(id);
 await db.admin.query(`UPDATE ${S}.grants SET status='REVOKED',changed_at=clock_timestamp() WHERE principal='auditor_a' AND capability='AUDIT'`);
 await expect(call(a,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,true])).rejects.toMatchObject({code:'42501'});
});

test('B-EVD-01: large bigint sequence survives scoped read and increment exactly',async()=>{
 // Trusted fixture seeds a boundary value; it is not a claim of contiguous prior history.
 await db.admin.query(`WITH fixture AS (SELECT gen_random_uuid()::text id,clock_timestamp() dt), canonical AS (
 SELECT id,dt,jsonb_build_array('zbm-ae-evidence-v1',id,'tenant-a','campaign-a','large',9007199254740993::bigint,'APPEND',NULL,repeat('0',64),'writer_a','writer_a',to_char(dt AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'{}'::jsonb)::text canon FROM fixture)
 INSERT INTO ${S}.evidence(id,tenant_id,campaign_id,stream,sequence,operation,predecessor,canonical,prior_hash,hash,custodial_login,actor,appended_at)
 SELECT id,'tenant-a','campaign-a','large',9007199254740993::bigint,'APPEND',NULL,canon,repeat('0',64),encode(sha256(convert_to(canon,'UTF8')),'hex'),'writer_a','writer_a',dt FROM canonical`);
 const r=await db.runtime('reader_a','reader'),w=await db.runtime('writer_a','evidence_writer');
 const seed=(await db.admin.query(`SELECT id,hash FROM ${S}.evidence WHERE stream='large'`)).rows[0];
 expect((await call(r,'read_evidence',['tenant-a','campaign-a','SIMULATION',seed.id,false])).rows[0].result.sequence).toBe('9007199254740993');
 const id=(await call(w,'append_evidence',['tenant-a','campaign-a','SIMULATION','large',{},null])).rows[0].result;
 const result=(await call(r,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,false])).rows[0].result;
 expect(result.sequence).toBe('9007199254740994');expect(result.prior_hash).toBe(seed.hash);
 expect(result.canonical).toContain('9007199254740994');expect(createHash('sha256').update(result.canonical).digest('hex')).toBe(result.hash);
});
