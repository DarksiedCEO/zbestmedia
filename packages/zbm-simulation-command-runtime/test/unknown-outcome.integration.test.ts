import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {D,Database,mustClaim,thirdClaim,sql,scope} from './helpers/postgres';

describe('D16–D18/D27–D31/D35 durable reconciliation truth',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(async()=>{await db.reset();await db.submit();});
  it('D27 third attempt without receipt records FAILED once and cannot dispatch4 under another login',async()=>{
    const third=await thirdClaim(db);await db.expire(third.operationId);const r=mustClaim(await db.recover());
    expect(r.dispatchNumber).toBe(3);expect((await db.reconcile(r))).toMatchObject({status:'FAILED',reason:'DISPATCH_BUDGET_EXHAUSTED_NO_EFFECT'});
    expect(await db.claim()).toBeNull();expect(await db.claim('worker_b')).toBeNull();await expect(db.dispatch(third)).rejects.toMatchObject({code:'42501'});
    expect((await db.intent(third.operationId)).dispatch_claims_used).toBe(3);expect(await db.counts()).toMatchObject({effect_attempts:3,fake_operations:0,failed:1,completed:0});await db.reconcile(r);expect(await db.evidenceCount('EFFECT_FAILED')).toBe(1);
  });
  it('D28 third receipt wins over revoked execute, approval and disabled custodian',async()=>{
    const third=await thirdClaim(db);const receipt=await db.dispatch(third);await db.expire(third.operationId);await db.revoke('EXECUTE_SIMULATION');await db.revokeApproval();await db.disable('issuer_a');
    const r=mustClaim(await db.recover());expect(await db.reconcile(r)).toMatchObject({status:'COMPLETED',receiptId:receipt.receiptId});await db.reconcile(r);
    expect((await db.intent(third.operationId)).dispatch_claims_used).toBe(3);expect(await db.counts()).toMatchObject({effect_attempts:3,fake_operations:1,fake_receipts:1,completed:1,failed:0});expect(await db.claim()).toBeNull();
  });
  it.each(['requester','approval','custodian'])('D18/D35 %s revocation denies new effect but permits proven no-effect terminal outcome',async loss=>{
    const c=mustClaim(await db.claim());if(loss==='requester')await db.revoke('EXECUTE_SIMULATION');if(loss==='approval')await db.revokeApproval();if(loss==='custodian')await db.disable('issuer_a');
    await expect(db.dispatch(c)).rejects.toMatchObject({code:'42501'});await db.expire(c.operationId);const r=mustClaim(await db.recover());expect(await db.reconcile(r)).toMatchObject({status:'FAILED',reason:'AUTHORITY_REVOKED_NO_EFFECT'});
    expect(await db.counts()).toMatchObject({fake_operations:0,failed:1});
  });
  it('D17 absence proof schedules bounded 1s/5s due times; expiry alone cannot authorize retry',async()=>{
    for(let n=1;n<=2;n++){
      const c=mustClaim(await db.claim());await db.expire(c.operationId);expect(await db.claim('worker_b')).toBeNull();const r=mustClaim(await db.recover());expect((await db.reconcile(r)).status).toBe('PENDING');
      const timing=(await db.admin.query(`SELECT extract(epoch FROM(next_dispatch_at-clock_timestamp())) AS seconds FROM ${D}.effect_intents WHERE operation_id=$1`,[c.operationId])).rows[0];
      expect(Number(timing.seconds)).toBeGreaterThan(n===1?0:3);expect(Number(timing.seconds)).toBeLessThanOrEqual(n===1?1:5);expect(await db.claim()).toBeNull();await db.due(c.operationId);
    }
    expect(mustClaim(await db.claim()).dispatchNumber).toBe(3);
  });
  it('D30 expired reservation increments expired counter, never unsuccessful observations',async()=>{
    const c=mustClaim(await db.claim());await db.expire(c.operationId);const r=mustClaim(await db.recover());await db.expire(c.operationId);
    await db.recover();const row=await db.intent(c.operationId);expect(row.reconcile_slots_used).toBe(1);expect(row.expired_reconcile_claims).toBe(1);expect(row.unsuccessful_reconciliations).toBe(0);expect(row.dispatch_claims_used).toBe(1);
    await db.due(c.operationId);const next=mustClaim(await db.recover());expect(BigInt(next.epoch)).toBeGreaterThan(BigInt(r.epoch));expect((await db.reconcile(next)).status).toBe('PENDING');
    await db.due(c.operationId);expect(mustClaim(await db.claim()).dispatchNumber).toBe(2);expect((await db.intent(c.operationId)).reconcile_slots_used).toBe(0);
  });
  it('D31 third expired reconciliation reservation parks UNKNOWN durably without success/failure',async()=>{
    const c=mustClaim(await db.claim());await db.expire(c.operationId);
    for(let slot=1;slot<=3;slot++){
      const r=mustClaim(await db.recover());expect((await db.intent(c.operationId)).reconcile_slots_used).toBe(slot);await db.expire(r.operationId);await db.recover();if(slot<3)await db.due(c.operationId);
    }
    const row=await db.intent(c.operationId);expect(row).toMatchObject({parked:true,reconcile_slots_used:3,expired_reconcile_claims:3,unsuccessful_reconciliations:0,next_reconcile_at:null});
    expect((await db.result()).effect).toMatchObject({status:'UNKNOWN_PENDING_RECONCILIATION',parked:true});
    expect(await db.claim()).toBeNull();const recovery=await db.recover();expect(recovery===null||!('token' in recovery)).toBe(true);expect(await db.counts()).toMatchObject({failed:0,completed:0});
  });
  it('D16/D30/D31 inconsistent receipt uses unsuccessful slots and parks instead of inventing absence',async()=>{
    const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);
    // Corrupt owner-controlled fixture only: runtime cannot alter this immutable record.
    await db.admin.query(`ALTER TABLE ${D}.fake_receipts DISABLE TRIGGER USER`);
    try {await db.admin.query(`UPDATE ${D}.fake_receipts SET identity_hash=repeat('c',64)`);}finally{await db.admin.query(`ALTER TABLE ${D}.fake_receipts ENABLE TRIGGER USER`);}
    for(let slot=1;slot<=3;slot++){
      const r=mustClaim(await db.recover());const result=await db.reconcile(r);expect(result.status).toBe('UNKNOWN_PENDING_RECONCILIATION');expect(result.parked).toBe(slot===3);if(slot<3)await db.due(c.operationId);
    }
    const row=await db.intent(c.operationId);expect(row).toMatchObject({parked:true,reconcile_slots_used:3,expired_reconcile_claims:0,unsuccessful_reconciliations:3,next_reconcile_at:null});expect(await db.counts()).toMatchObject({fake_operations:1,failed:0,completed:0});
    expect(await db.claim()).toBeNull();
  });
  it('D16 completion transaction rollback keeps receipt and consumed reservation for another owner',async()=>{
    const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);const r=mustClaim(await db.recover());
    const worker=await db.connect('worker_b');await worker.query('BEGIN');await sql(worker,'reconcile_effect',[scope.tenantId,scope.campaignId,r.operationId,r.epoch,r.token]);await worker.query('ROLLBACK');
    expect(await db.counts()).toMatchObject({fake_receipts:1,completed:0});expect((await db.intent(c.operationId)).reconcile_slots_used).toBe(1);
    await db.expire(c.operationId);await db.recover();await db.due(c.operationId);const replacement=mustClaim(await db.recover('worker_a'));expect((await db.reconcile(replacement,'worker_a')).status).toBe('COMPLETED');expect(await db.evidenceCount('EFFECT_COMPLETED')).toBe(1);
  });
  it('D30 generation1/2 consumed recovery slots do not steal generation3 recovery',async()=>{
    for(let generation=1;generation<=2;generation++){
      const c=mustClaim(await db.claim());expect(c.dispatchNumber).toBe(generation);await db.expire(c.operationId);
      for(let slot=1;slot<=2;slot++){mustClaim(await db.recover());await db.expire(c.operationId);await db.recover();await db.due(c.operationId);}
      const r=mustClaim(await db.recover());expect((await db.intent(c.operationId)).reconcile_slots_used).toBe(3);expect((await db.reconcile(r)).status).toBe('PENDING');await db.due(c.operationId);
    }
    const third=mustClaim(await db.claim());expect(third.dispatchNumber).toBe(3);await db.expire(third.operationId);const recovery=mustClaim(await db.recover());expect((await db.intent(third.operationId)).reconcile_slots_used).toBe(1);expect((await db.reconcile(recovery)).status).toBe('FAILED');
  });

});
