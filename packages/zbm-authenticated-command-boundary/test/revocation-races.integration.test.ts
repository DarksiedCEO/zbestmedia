import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { Database, S, call, pid, waitForBlock, route, tokenA, approvalRequest } from "./helpers/postgres";

let db: Database;
let application: Awaited<ReturnType<Database["application"]>> | undefined;
beforeEach(async()=>{db=await new Database().start();});
afterEach(async()=>{try { await db?.stop(); } finally { await application?.close(); application=undefined; }});

type Change = { name: string; campaign: string; login: string; invoke: (c: Client)=>Promise<unknown>; admin?: boolean };
const changes: Change[] = [
  ...["campaign-a","campaign-b"].map(campaign=>({name:`tenant suspension / ${campaign}`,campaign,login:"reader_a",invoke:(c:Client)=>call(c,"set_tenant_status",["tenant-a","SIMULATION","SUSPENDED",0])})),
  ...["campaign-a","campaign-b"].map(campaign=>({name:`tenant-wide grant revocation / ${campaign}`,campaign,login:"reader_a",invoke:(c:Client)=>call(c,"revoke_grant",["tenant-a",null,"SIMULATION","reader_a-READ",0])})),
  {name:"caller-binding revocation",campaign:"campaign-a",login:"reader_a",admin:true,invoke:c=>call(c,"change_binding",["reader_a",false])},
  {name:"campaign-local grant revocation",campaign:"campaign-a",login:"campaign_a",invoke:c=>call(c,"revoke_grant",["tenant-a","campaign-a","SIMULATION","campaign_a-READ",0])}
];
async function requestFor(campaign:string) {
  if(campaign==="campaign-b")await db.admin.query(`INSERT INTO ${S}.approvals(id,tenant_id,campaign_id,subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at) SELECT 'approval-b',tenant_id,'campaign-b',subject_type,subject_id,subject_version,subject_hash,issuer,actor,custodial_login,valid_from,expires_at FROM ${S}.approvals WHERE id='approval-a'`);
  const request=approvalRequest();request.scope.campaignId=campaign;request.approval.id=campaign==="campaign-b"?"approval-b":"approval-a";return request;
}

describe("C14/C15: revocation and inspection serialize through existing database locks",()=>{
  for(const change of changes){
    it(`revocation commits first: ${change.name}`,async()=>{
      const request=await requestFor(change.campaign);
      application=await db.application(change.login);
      const revoker=await db.connect(change.admin?"postgres":"writer_a");
      await revoker.query("BEGIN");await change.invoke(revoker);
      const response=application.app.inject({method:"POST",url:route,headers:{authorization:`Bearer ${tokenA}`},payload:request}).then(x=>x);
      try { await waitForBlock(db.admin,change.login,await pid(revoker)); }
      finally { await revoker.query("COMMIT"); }
      const result=await response;expect(result.statusCode).toBe(403);
      expect(result.json()).not.toHaveProperty("status","OBSERVED_ONLY");
      expect(result.headers["cache-control"]).toBe("no-store");
    });
    it(`inspection obtains authority first: ${change.name}`,async()=>{
      const request=await requestFor(change.campaign);
      application=await db.application(change.login);
      const blocker=await db.connect("postgres");
      await blocker.query("BEGIN");
      await blocker.query(`SELECT id FROM ${S}.approvals WHERE id=$1 FOR UPDATE`,[request.approval.id]);
      const response=application.app.inject({method:"POST",url:route,headers:{authorization:`Bearer ${tokenA}`},payload:request}).then(x=>x);
      let revoke:Promise<unknown>|undefined;
      try {
        // The reader has acquired binding/tenant locks before blocking on approval.
        const readerPid=await waitForBlock(db.admin,change.login,await pid(blocker));
        const revoker=await db.connect(change.admin?"postgres":"writer_a");
        const revokerPid=await pid(revoker);
        revoke=change.invoke(revoker);revoke.catch(()=>undefined);
        await waitForBlock(db.admin,revokerPid,readerPid);
      } finally {await blocker.query("COMMIT");}
      const first=await response;
      expect(first.statusCode).toBe(200);expect(first.json()).toMatchObject({status:"OBSERVED_ONLY",execution:"DISABLED"});
      await revoke;
      const next=await application.app.inject({method:"POST",url:route,headers:{authorization:`Bearer ${tokenA}`},payload:request});
      expect(next.statusCode).toBe(403);
    });
  }
});
