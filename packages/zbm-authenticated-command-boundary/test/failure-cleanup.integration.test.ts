import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { Database, S, route, tokenA, scopeRequest, approvalRequest, waitForBlock, pid } from "./helpers/postgres";

let db: Database;
let application: Awaited<ReturnType<Database["application"]>> | undefined;
beforeEach(async()=>{db=await new Database().start();});
afterEach(async()=>{vi.restoreAllMocks();try { await db?.stop(); } finally { await application?.close(); application=undefined; }});
const inject = (payload: unknown=scopeRequest()) => application!.app.inject({method:"POST",url:route,headers:{authorization:`Bearer ${tokenA}`},payload:payload as object}).then(x=>x);
async function activeReaderSessions() {return (await db.admin.query("SELECT pid,state FROM pg_stat_activity WHERE usename='reader_a'")).rows;}
async function waitForReaderCount(count:number) {
  const until=Date.now()+1500;
  while(Date.now()<until){const rows=await activeReaderSessions();if(rows.length===count)return rows;await new Promise(r=>setTimeout(r,5));}
  throw new Error("Unexpected reader connection count");
}

describe("C16/C17/C19: non-success on failures, bounded connections and cleanup",()=>{
  it("lock timeout is 503, not authorization denial or a passing inspection; no retry",async()=>{
    application=await db.application();const before=await db.snapshot();
    const holder=await db.connect("postgres");await holder.query("BEGIN");
    await holder.query(`SELECT id FROM ${S}.tenants WHERE id='tenant-a' FOR UPDATE`);
    const result=inject();
    await waitForBlock(db.admin,"reader_a",await pid(holder));
    const denied=await result;expect(denied.statusCode).toBe(503);expect(denied.json()).not.toHaveProperty("status","OBSERVED_ONLY");
    await holder.query("ROLLBACK");expect(await db.snapshot()).toEqual(before);
    const next=await inject();expect(next.statusCode).toBe(200);
    expect((await activeReaderSessions()).every(r=>r.state==="idle")).toBe(true);
  });
  it("terminated PostgreSQL session returns 503, is discarded, and later request uses a new login",async()=>{
    application=await db.application();const before=await db.snapshot();
    const holder=await db.connect("postgres");await holder.query("BEGIN");await holder.query(`SELECT id FROM ${S}.tenants WHERE id='tenant-a' FOR UPDATE`);
    const pending=inject();const blocked=await waitForBlock(db.admin,"reader_a",await pid(holder));
    await db.admin.query("SELECT pg_terminate_backend($1)",[blocked]);
    const result=await pending;expect(result.statusCode).toBe(503);
    await holder.query("ROLLBACK");expect(await db.snapshot()).toEqual(before);
    expect((await inject()).statusCode).toBe(200);
    expect((await activeReaderSessions()).every(r=>r.pid!==blocked)).toBe(true);
  });
  it("real PostgreSQL deadlock returns non-success without retry",async()=>{
    await db.admin.query("ALTER ROLE reader_a SET deadlock_timeout='50ms'");
    application=await db.application();
    const holder=await db.connect("postgres");await holder.query("SET deadlock_timeout='5s'");await holder.query("BEGIN");
    await holder.query(`SELECT id FROM ${S}.approvals WHERE id='approval-a' FOR UPDATE`);
    const pending=inject(approvalRequest());await waitForBlock(db.admin,"reader_a",await pid(holder));
    const cycle=holder.query(`SELECT id FROM ${S}.tenants WHERE id='tenant-a' FOR UPDATE`);cycle.catch(()=>undefined);
    const result=await pending;expect(result.statusCode).toBe(503);
    await cycle;await holder.query("ROLLBACK");
    expect((await inject()).statusCode).toBe(200);
  });
  for(const failure of ["COMMIT","ROLLBACK"]){
    it(`${failure} transport error destroys session and never returns success`,async()=>{
      application=await db.application();
      // Test-only transport fault on an actual restricted client's transaction.
      // The candidate has no callback/fault-injection surface.
      const original=Client.prototype.query;let faults=0;
      vi.spyOn(Client.prototype,"query").mockImplementation(function(this:Client,...args:unknown[]){
        const sql=typeof args[0]==="string"?args[0]:"";
        if(sql.trim().toUpperCase()===failure){faults++;return Promise.reject(Object.assign(new Error("fixture transport failed"),{code:"08006"}));}
        return Reflect.apply(original,this,args);
      } as typeof Client.prototype.query);
      const result=await inject(failure==="ROLLBACK"?scopeRequest("missing-campaign"):scopeRequest());
      expect(result.statusCode).not.toBe(200);expect(faults).toBe(1);
      vi.restoreAllMocks();await waitForReaderCount(0);
      expect((await inject()).statusCode).toBe(200);
    });
  }
  it("pool is capped at two even for concurrent requests; failure leaves no locks",async()=>{
    application=await db.application();const holder=await db.connect("postgres");
    await holder.query("BEGIN");await holder.query(`SELECT id FROM ${S}.tenants WHERE id='tenant-a' FOR UPDATE`);
    const requests=Array.from({length:5},()=>inject());
    await waitForReaderCount(2);expect((await activeReaderSessions()).length).toBeLessThanOrEqual(2);
    const responses=await Promise.all(requests);expect(responses.every(r=>r.statusCode===503)).toBe(true);
    await holder.query("ROLLBACK");expect((await inject()).statusCode).toBe(200);
  });
  it("shutdown removes owned connections and leaves fixture administration alive",async()=>{
    application=await db.application();expect((await inject()).statusCode).toBe(200);
    await application.close();application=undefined;await waitForReaderCount(0);
    expect((await db.admin.query("SELECT 1 AS alive")).rows[0].alive).toBe(1);
  });
});
