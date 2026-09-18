import { beforeEach,afterEach,expect,test } from 'vitest';
import { Database,S,call,observe,blockedBy } from './helpers/postgres';
let db:Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});
const approval={id:'ap',subjectType:'CUT',subjectId:'cut',subjectVersion:'1',subjectHash:'a'.repeat(64),issuer:'RIGHTS',actor:'writer_a',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
for(const first of ['revoke','observe'])test(`B-RACE-01/05: tenant grant ${first} wins and other campaign respects revocation`,async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader'),c=await db.runtime('reader_a','reader');
 if(first==='revoke'){
  await a.query('BEGIN');await call(a,'revoke_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0]);
  const result=observe(b,'tenant-a','campaign-b').then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);const second=observe(c).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,c,b);await a.query('COMMIT');expect(await result).toBe(true);expect(await second).toBe(true);
 }else{
  await b.query('BEGIN');await observe(b);const pending=call(a,'revoke_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0]);await blockedBy(db.admin,a,b);await b.query('COMMIT');await pending;
 }
 for(const c of ['campaign-a','campaign-b'])await expect(observe(b,'tenant-a',c)).rejects.toMatchObject({code:'42501'});
 expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(1);
});
for(const first of ['suspend','observe'])test(`B-RACE-04: three sessions, ${first} wins across campaigns`,async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader'),c=await db.runtime('campaign_a','reader');
 if(first==='suspend'){
  await a.query('BEGIN');await call(a,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);
  const p1=observe(b,'tenant-a','campaign-b').then(()=>false,error=>error?.code==='42501'),p2=observe(c).then(()=>false,error=>error?.code==='42501');
  await blockedBy(db.admin,b,a);await blockedBy(db.admin,c,a);await a.query('COMMIT');expect(await p1).toBe(true);expect(await p2).toBe(true);
 }else{
  await c.query('BEGIN');await observe(c);const suspending=call(a,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);await blockedBy(db.admin,a,c);
  const later=observe(b,'tenant-a','campaign-b').then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await c.query('COMMIT');await suspending;expect(await later).toBe(true);
 }
});
for(const first of ['revoke','observe'])test(`B-RACE-03: approval ${first} winner is serialized`,async()=>{
 const a=await db.runtime('writer_a','approval_writer'),b=await db.runtime('reader_a','reader');await call(a,'record_approval',['tenant-a','campaign-a','SIMULATION',approval]);
 const read=()=>call(b,'read_approval',['tenant-a','campaign-a','SIMULATION','ap','CUT','cut','1','a'.repeat(64),'RIGHTS']);
 if(first==='revoke'){
  await a.query('BEGIN');await call(a,'revoke_approval',['tenant-a','campaign-a','SIMULATION','ap',0]);const pending=read().then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await a.query('COMMIT');expect(await pending).toBe(true);
 }else{await b.query('BEGIN');await read();const pending=call(a,'revoke_approval',['tenant-a','campaign-a','SIMULATION','ap',0]);await blockedBy(db.admin,a,b);await b.query('COMMIT');await pending;await expect(read()).rejects.toMatchObject({code:'42501'});}
});
test('B-RACE-02/06: absent grant under tenant lock denies before later creation',async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader');
 await call(a,'revoke_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0]);
 await a.query('BEGIN');await observe(a);const observing=observe(b).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await a.query('COMMIT');expect(await observing).toBe(true);
 await call(a,'create_grant',['tenant-a',null,'SIMULATION',{id:'replacement',scopeKind:'TENANT',principal:'reader_a',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}]);await observe(b);
});
for(const first of ['revoke','observe'])test(`B-ID-03/B-RACE-06: binding ${first} serialization`,async()=>{
 const c=await db.runtime('reader_a','reader');
 if(first==='revoke'){
  await db.admin.query('BEGIN');await call(db.admin,'change_binding',['reader_a',false]);const pending=observe(c).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,c,db.admin);await db.admin.query('COMMIT');expect(await pending).toBe(true);
 }else{await c.query('BEGIN');await observe(c);const pending=call(db.admin,'change_binding',['reader_a',false]);const monitor=await db.connect('postgres');await blockedBy(monitor,db.admin,c);await c.query('COMMIT');await pending;await expect(observe(c)).rejects.toMatchObject({code:'42501'});}
});
test('B-RACE-07: connection loss releases lock; stale conflict never duplicates evidence',async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader');await a.query('BEGIN');await observe(a);const pending=observe(b);await blockedBy(db.admin,b,a);await a.end();await pending;
 const c=await db.runtime();await call(c,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);await expect(call(c,'set_tenant_status',['tenant-a','SIMULATION','ACTIVE',0])).rejects.toMatchObject({code:'40001'});expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(1);
});
const grant={id:'new-read',principal:'reader_a',scopeKind:'TENANT',capability:'READ',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
for(const first of ['revoke','observe'])test(`B-RACE-01/05: campaign-only ${first}; other campaign remains valid`,async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader');
 await call(a,'revoke_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0]);
 for(const campaign of ['campaign-a','campaign-b'])await call(a,'create_grant',['tenant-a',campaign,'SIMULATION',{...grant,id:campaign,scopeKind:'CAMPAIGN'}]);
 if(first==='revoke'){
  await a.query('BEGIN');await call(a,'revoke_grant',['tenant-a','campaign-a','SIMULATION','campaign-a',0]);const pending=observe(b).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await a.query('COMMIT');expect(await pending).toBe(true);
 }else{
  await b.query('BEGIN');await observe(b);const pending=call(a,'revoke_grant',['tenant-a','campaign-a','SIMULATION','campaign-a',0]);await blockedBy(db.admin,a,b);await b.query('COMMIT');await pending;
 }
 await expect(observe(b)).rejects.toMatchObject({code:'42501'});await observe(b,'tenant-a','campaign-b');
 expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(4);
});
for(const first of ['supersede','observe'])test(`B-RACE-03: approval supersession ${first}`,async()=>{
 const a=await db.runtime('writer_a','approval_writer'),b=await db.runtime('reader_a','reader');await call(a,'record_approval',['tenant-a','campaign-a','SIMULATION',approval]);
 const read=()=>call(b,'read_approval',['tenant-a','campaign-a','SIMULATION','ap','CUT','cut','1','a'.repeat(64),'RIGHTS']);
 const replace=()=>call(a,'supersede_approval',['tenant-a','campaign-a','SIMULATION','ap',0,{...approval,id:'next',subjectVersion:'2'}]);
 if(first==='supersede'){await a.query('BEGIN');await replace();const pending=read().then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await a.query('COMMIT');expect(await pending).toBe(true);}
 else{await b.query('BEGIN');await read();const pending=replace();await blockedBy(db.admin,a,b);await b.query('COMMIT');await pending;}
 await expect(read()).rejects.toMatchObject({code:'42501'});expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(3);
});
for(const first of ['supersede','observe'])test(`B-RACE-06: tenant-wide grant ${first} serializes both campaigns`,async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader');
 const replace=()=>call(a,'supersede_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0,{...grant,validFrom:'2098-01-01T00:00:00Z'}]);
 if(first==='supersede'){await a.query('BEGIN');await replace();const pending=observe(b).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,a);await a.query('COMMIT');expect(await pending).toBe(true);}
 else{await b.query('BEGIN');await observe(b);const pending=replace();await blockedBy(db.admin,a,b);await b.query('COMMIT');await pending;}
 for(const campaign of ['campaign-a','campaign-b'])await expect(observe(b,'tenant-a',campaign)).rejects.toMatchObject({code:'42501'});
 expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(2);
});
for(const scope of ['TENANT','CAMPAIGN'])test(`B-RACE-02/06: absent ${scope} grant creation and observation orderings`,async()=>{
 const a=await db.runtime(),b=await db.runtime('reader_a','reader');await call(a,'revoke_grant',['tenant-a',null,'SIMULATION','reader_a-READ',0]);
 // A denial completes before creation, so it cannot be retroactively accepted.
 await expect(observe(b)).rejects.toMatchObject({code:'42501'});
 await a.query('BEGIN');await call(a,'create_grant',['tenant-a',scope==='TENANT'?null:'campaign-a','SIMULATION',{...grant,scopeKind:scope}]);
 const pending=observe(b);await blockedBy(db.admin,b,a);await a.query('COMMIT');await pending;
 expect((await db.admin.query(`SELECT count(*)::int n FROM ${S}.evidence`)).rows[0].n).toBe(2);
});
test('B-RACE-04: permitted evidence precedes suspension; queued other campaign write denied',async()=>{
 const t=await db.runtime(),a=await db.runtime('campaign_a','evidence_writer'),b=await db.runtime('writer_a','evidence_writer');
 await a.query('BEGIN');await call(a,'append_evidence',['tenant-a','campaign-a','SIMULATION','s',{before:true},null]);
 const suspend=call(t,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);await blockedBy(db.admin,t,a);
 const later=call(b,'append_evidence',['tenant-a','campaign-b','SIMULATION','s',{},null]).then(()=>false,error=>error?.code==='42501');await blockedBy(db.admin,b,t);
 await a.query('COMMIT');await suspend;expect(await later).toBe(true);
 const rows=(await db.admin.query(`SELECT campaign_id,appended_at FROM ${S}.evidence ORDER BY appended_at`)).rows;expect(rows.map(x=>x.campaign_id)).toEqual(['campaign-a',null]);
});
for(const first of ['create','observe'])test(`B-RACE-06: absent campaign ${first} obeys tenant lock`,async()=>{
 const r=await db.runtime('reader_a','reader');
 if(first==='create'){
  await db.admin.query('BEGIN');await call(db.admin,'provision_campaign',['tenant-a','new-campaign']);const pending=observe(r,'tenant-a','new-campaign');const monitor=await db.connect('postgres');await blockedBy(monitor,r,db.admin);await db.admin.query('COMMIT');await pending;
 }else{
  await expect(observe(r,'tenant-a','new-campaign')).rejects.toMatchObject({code:'42501'});
  await r.query('BEGIN');await observe(r);const pending=call(db.admin,'provision_campaign',['tenant-a','new-campaign']);const monitor=await db.connect('postgres');await blockedBy(monitor,db.admin,r);await r.query('COMMIT');await pending;await observe(r,'tenant-a','new-campaign');
 }
 await expect(call(r,'provision_campaign',['tenant-a','forbidden'])).rejects.toMatchObject({code:'42501'});
});
test('B-RACE-06: absent tenant provisioning takes the same logical key',async()=>{
 const owner=await db.connect('postgres'),monitor=await db.connect('postgres');
 await owner.query(`SET ROLE zbm_ae_owner; BEGIN; SELECT pg_advisory_xact_lock(${S}.lock_key('["zbm-ae-v1","tenant","new-tenant"]'::jsonb))`);
 const pending=call(db.admin,'provision_tenant',['new-tenant']);await blockedBy(monitor,db.admin,owner);await owner.query('COMMIT');await pending;
 const r=await db.runtime('reader_a','reader');await expect(observe(r,'new-tenant',null)).rejects.toMatchObject({code:'42501'});
});

test('B-RACE-07: unsupported isolation is explicitly denied',async()=>{
 const r=await db.runtime('reader_a','reader');await r.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await expect(observe(r)).rejects.toMatchObject({code:'42501',message:'READ COMMITTED required'});await r.query('ROLLBACK');await observe(r);
});
