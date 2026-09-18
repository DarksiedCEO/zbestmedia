import { beforeEach, afterEach, expect, test } from "vitest";
import { Database, S, call, observe } from "./helpers/postgres";
let db: Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});

test("B-PRV-01: runtime denies direct table DML, DDL and escalation",async()=>{
 const c=await db.runtime();
 for(const sql of [`SELECT * FROM ${S}.caller_bindings`,`INSERT INTO ${S}.tenants(id) VALUES('evil')`,`UPDATE ${S}.tenants SET status='ACTIVE'`,`DELETE FROM ${S}.evidence`,`TRUNCATE ${S}.evidence`,`CREATE TABLE ${S}.evil(id int)`,`ALTER TABLE ${S}.evidence DISABLE TRIGGER ALL`,`DROP TABLE ${S}.evidence`,`SET ROLE zbm_ae_owner`,`SET ROLE zbm_ae_migrator`,`CREATE ROLE evil`,`GRANT zbm_ae_owner TO writer_a`,`CREATE OR REPLACE FUNCTION ${S}.observe_authority(text,text,text,text) RETURNS jsonb LANGUAGE sql AS 'select null::jsonb'`]) await expect(c.query(sql)).rejects.toMatchObject({code:"42501"});
 const r=await db.admin.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname LIKE 'zbm_ae_%'");expect(r.rows.every(x=>!x.rolsuper&&!x.rolcreaterole&&!x.rolcreatedb&&!x.rolbypassrls)).toBe(true);
 const seq=await db.admin.query(`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='S'`,[S]);expect(seq.rows[0].n).toBe(0);
});
test("B-PRV-02: secure functions cannot be bypassed through shadow objects or helpers",async()=>{
 const c=await db.runtime("reader_a","reader");await c.query("CREATE TEMP TABLE caller_bindings(login text); SET search_path=pg_temp,public");
 expect((await observe(c)).rows[0].result.principal).toBe("reader_a");
 await expect(call(c,"authorize_scope",["tenant-a","campaign-a","SIMULATION","READ",true])).rejects.toMatchObject({code:"42501"});
 const r=await db.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prosecdef`,[S]);expect(r.rows.length).toBeGreaterThan(4);expect(r.rows.every(x=>x.owner==='zbm_ae_owner'&&x.proconfig.includes('search_path=pg_catalog'))).toBe(true);
 await expect(observe(c,"tenant-a' OR true--")).rejects.toMatchObject({code:"42501"});
});
test("B-PRV-03: auditor cannot write and no group can escalate to owner",async()=>{
 const c=await db.runtime("auditor_a","auditor");expect((await observe(c,"tenant-a","campaign-a","AUDIT")).rows[0].result.principal).toBe("auditor_a");
 await expect(call(c,"append_evidence",["tenant-a","campaign-a","SIMULATION","s",{},null])).rejects.toMatchObject({code:"42501"});
 const r=await db.admin.query("SELECT pg_has_role('writer_a','zbm_ae_owner','MEMBER') owner,pg_has_role('writer_a','zbm_ae_migrator','MEMBER') migrator");expect(r.rows[0]).toEqual({owner:false,migrator:false});
});
