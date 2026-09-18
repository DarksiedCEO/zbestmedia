import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {B,Database,command,mustClaim,resultRoute,route,token} from './helpers/postgres';

describe('D11/D12/D18/D33/D34 current result access',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it.each(['revoked','expired','binding','tenant','campaign'])('D11/D34 %s current READ scope denies historical replay and retrieval',async loss=>{
    await db.submit();
    if(loss==='revoked')await db.revoke('READ');
    if(loss==='expired')await db.admin.query(`UPDATE ${B}.grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id='executor_a-READ'`);
    if(loss==='binding')await db.disable('executor_a');
    if(loss==='tenant')await db.suspend();
    if(loss==='campaign')await db.admin.query(`UPDATE ${B}.campaigns SET status='SUSPENDED' WHERE id='campaign-a'`);
    const before=await db.counts();await expect(db.result()).rejects.toMatchObject({code:'42501'});await expect(db.submit()).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toEqual(before);
  });
  it('D11 absent, foreign-principal and foreign-scope results share generic HTTP denial',async()=>{
    await db.submit();const a=await db.application('executor_other');
    try{
      const bodies=[];
      for(const req of [command(),command({idempotencyKey:'missing'}),command({scope:{tenantId:'tenant-b',campaignId:'campaign-c'}})]){
        const r=await a.app.inject({method:'POST',url:resultRoute,headers:{authorization:`Bearer ${token}`},payload:{scope:req.scope,idempotencyKey:req.idempotencyKey}});
        expect(r.statusCode).toBe(403);bodies.push(r.json().error);expect(r.headers['cache-control']).toBe('no-store');
      }
      expect(bodies[0]).toEqual(bodies[1]);expect(bodies[1]).toEqual(bodies[2]);
    }finally{await a.close();}
  });
  it('D12 HTTP acceptance and execution completion do not assert effect completion',async()=>{
    const a=await db.application();try{
      const accepted=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});
      expect(accepted.statusCode).toBe(202);expect(accepted.json()).toMatchObject({acceptance:'ACCEPTED',execution:'COMPLETED',effect:{status:'PENDING'}});
      const before=await db.counts();for(let i=0;i<3;i++)expect((await db.result()).effect.status).toBe('PENDING');expect(await db.counts()).toEqual(before);
      const claim=mustClaim(await db.claim());await db.dispatch(claim);await db.handoff(claim);expect((await db.result()).effect.status).not.toBe('COMPLETED');
      const recovery=mustClaim(await db.recover());await db.reconcile(recovery);expect((await db.result()).effect.status).toBe('COMPLETED');
    }finally{await a.close();}
  });
  it('D18/D34 disabled requester loses READ but independent PROCESS worker records committed receipt',async()=>{
    await db.submit();const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);await db.disable('executor_a');await db.revokeApproval();await db.disable('issuer_a');
    await expect(db.result()).rejects.toMatchObject({code:'42501'});
    const r=mustClaim(await db.recover());expect((await db.reconcile(r)).status).toBe('COMPLETED');expect(await db.counts()).toMatchObject({fake_operations:1,fake_receipts:1,completed:1});
  });
});
