import { expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
test("B-MIG-01: separate provisioning and ordinary migration exist", () => {
  expect(existsSync("sql/provision-roles.sql")).toBe(true);
  const ddl = readFileSync("prisma/migrations/20260914_000001_authority_evidence_spine/migration.sql", "utf8");
  expect(ddl).not.toMatch(/CREATE\s+(ROLE|USER)/i);
  expect(ddl).toContain("session_user");
});
import { Database, S } from "./helpers/postgres";
test("B-MIG-02: migrated schema exists in real PostgreSQL", async () => {
 const db = new Database();
 try { await db.start(); const r=await db.admin.query("SELECT to_regclass($1) object",[S+".caller_bindings"]); expect(r.rows[0].object).not.toBeNull(); }
 finally { await db.stop(); }
});

test("B-MIG-01: missing role prerequisite is explicit",async()=>{
 const db=new Database();try{await db.start(false);await expect(db.admin.query(readFileSync("prisma/migrations/20260914_000001_authority_evidence_spine/migration.sql","utf8"))).rejects.toThrow("Provision zbm_ae roles before ordinary migration");}finally{await db.stop();}
});
test("B-MIG-02: actual mapping, indexes, constraints, owners and default privileges",async()=>{
 const db=new Database();try{await db.start();
 const roles=(await db.admin.query("SELECT rolname,rolsuper,rolcreaterole FROM pg_roles WHERE rolname='zbm_ae_migrator'")).rows;expect(roles).toEqual([{rolname:'zbm_ae_migrator',rolsuper:false,rolcreaterole:false}]);
 const tables=(await db.admin.query(`SELECT tablename,tableowner FROM pg_tables WHERE schemaname=$1`,[S])).rows;expect(tables.map(x=>x.tablename).sort()).toEqual(['_prisma_migrations','approvals','caller_bindings','campaigns','evidence','grants','tenants']);expect(tables.every(x=>x.tableowner==='zbm_ae_owner')).toBe(true);
 const migrations = await db.admin.query(`
  SELECT migration_name
  FROM ${S}._prisma_migrations
  WHERE finished_at IS NOT NULL
    AND rolled_back_at IS NULL
  ORDER BY migration_name
 `);
 expect(migrations.rows.map(row => row.migration_name)).toEqual([
  "20260914_000001_authority_evidence_spine",
  "20260916_000002_simulation_runtime_bridge",
 ]);
 const indexes=(await db.admin.query("SELECT indexname FROM pg_indexes WHERE schemaname=$1",[S])).rows.map(x=>x.indexname);for(const n of ['grants_lookup','approvals_lookup','evidence_scope','campaigns_status'])expect(indexes).toContain(n);
 const constraints=(await db.admin.query("SELECT contype FROM pg_constraint WHERE connamespace=$1::regnamespace",[S])).rows;expect(constraints.filter(x=>x.contype==='f').length).toBeGreaterThanOrEqual(10);expect(constraints.filter(x=>x.contype==='c').length).toBeGreaterThanOrEqual(20);
 const introspection=db.introspect();for(const model of ['ZbmTenant','ZbmCampaignAuthority','ZbmDatabaseCallerBinding','ZbmPrincipalGrant','ZbmApprovalRecord','ZbmEvidenceEntry'])expect(introspection).toContain('model '+model+' {');
 await db.admin.query(`SET ROLE zbm_ae_owner; CREATE FUNCTION ${S}.default_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'; RESET ROLE`);
 expect((await db.admin.query("SELECT has_function_privilege('zbm_ae_reader',$1,'EXECUTE') allowed",[S+'.default_probe()'])).rows[0].allowed).toBe(false);
 }finally{await db.stop();}
});
