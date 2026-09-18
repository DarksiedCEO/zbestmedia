import { beforeEach, afterEach, expect, test } from "vitest";
import { Database, S, call, observe } from "./helpers/postgres";
let db: Database;
beforeEach(async()=>{db=new Database();await db.start();await db.seed();});
afterEach(async()=>{await db.stop();});

test("B-ID-01: arguments, GUCs and SET ROLE cannot impersonate another login",async()=>{
 const c=await db.runtime("reader_a","reader");
 await c.query("SELECT set_config('app.tenant','tenant-b',false),set_config('app.principal','reader_b',false)");
 expect((await observe(c)).rows[0].result.principal).toBe("reader_a");
 await expect(observe(c,"tenant-b","campaign-c")).rejects.toMatchObject({code:"42501",message:"Scope unavailable"});
 await expect(c.query("SET ROLE zbm_ae_authority_writer")).rejects.toMatchObject({code:"42501"});
 // Deliberately over-provision this adversarial fixture: binding remains the ceiling.
 await db.admin.query("GRANT zbm_ae_authority_writer TO reader_a");
 await c.query("SET ROLE zbm_ae_authority_writer");
 await expect(call(c,"set_tenant_status",["tenant-a","SIMULATION","SUSPENDED",0])).rejects.toMatchObject({code:"42501"});
 await expect(c.query("SET SESSION AUTHORIZATION writer_a")).rejects.toMatchObject({code:"42501"});
});
test("B-ID-02: missing/inactive binding and wrong purpose deny",async()=>{
 const unbound=await db.runtime("unbound","reader");await expect(observe(unbound)).rejects.toMatchObject({code:"42501"});
 const c=await db.runtime("reader_a","reader");
 await expect(call(c,"observe_authority",["tenant-a","campaign-a","OTHER","READ"])).rejects.toMatchObject({code:"42501"});
 await db.admin.query(`UPDATE ${S}.caller_bindings SET active=false WHERE login='reader_a'`);
 await expect(observe(c)).rejects.toMatchObject({code:"42501"});
 await expect(db.admin.query(`INSERT INTO ${S}.caller_bindings SELECT * FROM ${S}.caller_bindings WHERE login='reader_a'`)).rejects.toMatchObject({code:"23505"});
});
test("B-ID-03: runtime cannot alter binding or claim unsupported issuer",async()=>{
 const c=await db.runtime("writer_a","approval_writer");
 await expect(c.query(`UPDATE ${S}.caller_bindings SET issuers=ARRAY['FOUNDER_CREATIVE']`)).rejects.toMatchObject({code:"42501"});
 await expect(call(c,"record_approval",["tenant-a","campaign-a","SIMULATION",{id:"bad",subjectType:"CUT",subjectId:"cut",subjectVersion:"1",subjectHash:"a".repeat(64),issuer:"FOUNDER_CREATIVE",actor:"writer_a",validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"}])).rejects.toMatchObject({code:"42501"});
});

test("B-ID-02: ambiguous NULL capability/issuer elements fail closed at provisioning",async()=>{
 for(const column of ['capabilities','issuers'])await expect(db.admin.query(`UPDATE ${S}.caller_bindings SET ${column}=ARRAY[NULL]::text[] WHERE login='reader_a'`)).rejects.toMatchObject({code:'23514'});
});
