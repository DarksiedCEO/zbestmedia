import { beforeEach, afterEach, expect, test } from "vitest";
import { Database, S, call, observe } from "./helpers/postgres";
let db: Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});

test("B-TEN-01: campaign grant cannot authorize another campaign; tenant grant can",async()=>{
 const c=await db.runtime("campaign_a","reader");expect((await observe(c)).rows[0].result.campaign).toBe('campaign-a');await expect(observe(c,'tenant-a','campaign-b')).rejects.toMatchObject({code:'42501'});
 const r=await db.runtime('reader_a','reader');expect((await observe(r,'tenant-a','campaign-b')).rows[0].result.tenant).toBe('tenant-a');
 await expect(db.admin.query(`INSERT INTO ${S}.campaigns(tenant_id,id) VALUES('missing','x')`)).rejects.toMatchObject({code:'23503'});
});
test("B-TEN-02: suspension denies every campaign and only explicit audit/admin exceptions pass",async()=>{
 const w=await db.runtime(),r=await db.runtime('reader_a','reader');await call(w,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);
 for(const campaign of ['campaign-a','campaign-b'])await expect(observe(r,'tenant-a',campaign)).rejects.toMatchObject({code:'42501'});
 const audit=await db.runtime('auditor_a','auditor');await observe(audit,'tenant-a','campaign-b','AUDIT');
 await call(w,'set_tenant_status',['tenant-a','SIMULATION','ACTIVE',1]);await observe(r);
 await expect(call(w,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0])).rejects.toMatchObject({code:'40001'});
});
test("B-GRT-01: grants validate intervals/scope, preserve content, and evidence is atomic",async()=>{
 const w=await db.runtime();const g={id:'new',principal:'reader_a',scopeKind:'CAMPAIGN',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
 await expect(call(w,'create_grant',['tenant-a','campaign-a','SIMULATION',{...g,expiresAt:g.validFrom}])).rejects.toBeDefined();
 await call(w,'create_grant',['tenant-a','campaign-a','SIMULATION',g]);await call(w,'revoke_grant',['tenant-a','campaign-a','SIMULATION','new',0]);
 const r=await db.admin.query(`SELECT status,principal,version FROM ${S}.grants WHERE id='new'`);expect(r.rows[0]).toEqual({status:'REVOKED',principal:'reader_a',version:1});
 await w.query('BEGIN');await call(w,'create_grant',['tenant-a','campaign-a','SIMULATION',{...g,id:'rollback'}]);await w.query('ROLLBACK');expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.grants WHERE id='rollback'`)).rows[0].n).toBe(0);
 const before=(await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n;
 await db.admin.query(`ALTER TABLE ${S}.evidence ADD CONSTRAINT injected_failure CHECK(false) NOT VALID`);
 await expect(call(w,'create_grant',['tenant-a','campaign-a','SIMULATION',{...g,id:'atomic'}])).rejects.toMatchObject({code:'23514'});
 expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.grants WHERE id='atomic'`)).rows[0].n).toBe(0);expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(before);
});
test('B-GRT-01: database-time expiry boundary and immutable supersession',async()=>{
 const w=await db.runtime(),r=await db.runtime('reader_a','reader');
 const now=(await db.admin.query('SELECT clock_timestamp()::text t')).rows[0].t;
 await call(w,'supersede_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0,{id:'expired',scopeKind:'TENANT',principal:'reader_a',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:now}]);
 await expect(observe(r)).rejects.toMatchObject({code:'42501'});
 const original=(await db.admin.query(`SELECT principal,scope_kind,status,version,successor_id FROM ${S}.grants WHERE id='reader_a-READ'`)).rows[0];expect(original).toEqual({principal:'reader_a',scope_kind:'TENANT',status:'SUPERSEDED',version:1,successor_id:'expired'});
 await expect(call(w,'supersede_grant',['tenant-a',null,'SIMULATION','expired',0,{id:'foreign',scopeKind:'TENANT',principal:'reader_b',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}])).rejects.toThrow('Invalid grant successor');
 await call(w,'set_tenant_status',['tenant-a','SIMULATION','REVOKED',0]);await expect(call(w,'set_tenant_status',['tenant-a','SIMULATION','ACTIVE',1])).rejects.toThrow('Invalid status transition');
});

test('B-TEN-01/B-ID-02: grant identifiers are campaign-scoped without a foreign existence oracle',async()=>{
 const w=await db.runtime(),a=await db.runtime('campaign_a','authority_writer');const g={id:'same-id',scopeKind:'CAMPAIGN',principal:'reader_a',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
 await call(w,'create_grant',['tenant-a','campaign-b','SIMULATION',g]);
 await call(a,'create_grant',['tenant-a','campaign-a','SIMULATION',g]);
 await call(a,'revoke_grant',['tenant-a','campaign-a','SIMULATION','same-id',0]);
 const rows=(await db.admin.query(`SELECT campaign_id,status FROM ${S}.grants WHERE id='same-id' ORDER BY campaign_id`)).rows;expect(rows).toEqual([{campaign_id:'campaign-a',status:'REVOKED'},{campaign_id:'campaign-b',status:'ACTIVE'}]);
});
