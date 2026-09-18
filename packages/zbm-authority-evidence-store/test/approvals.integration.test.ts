import { beforeEach, afterEach, expect, test } from "vitest";
import { Database, S, call } from "./helpers/postgres";
let db: Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});

const approval={id:'approval-1',subjectType:'CUT',subjectId:'cut-1',subjectVersion:'1',subjectHash:'a'.repeat(64),issuer:'RIGHTS',actor:'writer_a',validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
test("B-APR-01: exact approval identity, actor, time and issuer",async()=>{
 const w=await db.runtime('writer_a','approval_writer');
 for(const patch of [{subjectHash:'bad'},{actor:'founder'},{issuer:'FINANCE'},{validFrom:'2098-01-01T00:00:00Z'},{expiresAt:'2020-01-02T00:00:00Z'}])await expect(call(w,'record_approval',['tenant-a','campaign-a','SIMULATION',{...approval,...patch}])).rejects.toBeDefined();
 await call(w,'record_approval',['tenant-a','campaign-a','SIMULATION',approval]);
 const r=await call(w,'read_approval',['tenant-a','campaign-a','SIMULATION','approval-1','CUT','cut-1','1','a'.repeat(64),'RIGHTS']);expect(r.rows[0].result.actor).toBe('writer_a');
 await expect(call(w,'read_approval',['tenant-a','campaign-a','SIMULATION','approval-1','CUT','cut-1','2','a'.repeat(64),'RIGHTS'])).rejects.toMatchObject({code:'42501'});
 await expect(call(w,'read_approval',['tenant-a','campaign-a','SIMULATION','approval-1','CUT','cut-1','1','b'.repeat(64),'RIGHTS'])).rejects.toMatchObject({code:'42501'});
});
test("B-APR-02: supersession keeps original decision and rollback is atomic",async()=>{
 const w=await db.runtime('writer_a','approval_writer');await call(w,'record_approval',['tenant-a','campaign-a','SIMULATION',approval]);
 await call(w,'supersede_approval',['tenant-a','campaign-a','SIMULATION','approval-1',0,{...approval,id:'approval-2',subjectVersion:'2'}]);
 const r=await db.admin.query(`SELECT id,status,subject_version FROM ${S}.approvals ORDER BY id`);expect(r.rows).toEqual([{id:'approval-1',status:'SUPERSEDED',subject_version:'1'},{id:'approval-2',status:'ACTIVE',subject_version:'2'}]);
 await db.admin.query(`ALTER TABLE ${S}.evidence ADD CONSTRAINT injected_failure CHECK(false) NOT VALID`);
 await expect(call(w,'revoke_approval',['tenant-a','campaign-a','SIMULATION','approval-2',0])).rejects.toMatchObject({code:'23514'});
 expect((await db.admin.query(`SELECT status FROM ${S}.approvals WHERE id='approval-2'`)).rows[0].status).toBe('ACTIVE');
});
