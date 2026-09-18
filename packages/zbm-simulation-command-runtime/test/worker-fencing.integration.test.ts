import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {B,D,Database,command,mustClaim,scope,sql,waitForBlock,waitUntil,type Claim} from './helpers/postgres';

describe('D13–D15/D19/D29/D34/D35 worker ownership fences',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(async()=>{await db.reset();await db.submit();});
  it('D13 two separate worker logins compete for one durable dispatch claim',async()=>{
    const claims=await Promise.all([db.claim('worker_a'),db.claim('worker_b')]);expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await db.counts()).toMatchObject({effect_attempts:1});
    const c=mustClaim(claims.find(Boolean)!);expect((await db.intent(c.operationId)).dispatch_claims_used).toBe(1);
    const wrong=claims[0]?'worker_b':'worker_a';await expect(db.dispatch(c,wrong)).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toMatchObject({fake_operations:0});
  });
  it('D13/D14 reclaim wins: old direct adapter call cannot insert after new fence',async()=>{
    const old=mustClaim(await db.claim());await db.expire(old.operationId);
    expect(await db.claim('worker_b')).toBeNull();const recovery=mustClaim(await db.recover());expect(BigInt(recovery.epoch)).toBeGreaterThan(BigInt(old.epoch));
    expect((await db.reconcile(recovery)).status).toBe('PENDING');await db.due(old.operationId);
    const replacement=mustClaim(await db.claim('worker_b'));expect(replacement.dispatchNumber).toBe(2);
    await expect(db.dispatch(old)).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toMatchObject({fake_operations:0});
    await db.dispatch(replacement,'worker_b');expect(await db.counts()).toMatchObject({fake_operations:1,fake_receipts:1});
  });
  it('D14/F2 same-generation reconciliation takeover fences the old dispatch before and after absence proof',async()=>{
    const old=mustClaim(await db.claim('worker_a'));
    expect(old).toMatchObject({kind:'DISPATCH',epoch:'1',dispatchNumber:1});
    await db.expire(old.operationId);
    const recovery=mustClaim(await db.recover('worker_b'));
    expect(recovery).toMatchObject({operationId:old.operationId,kind:'RECONCILE',epoch:'2',dispatchNumber:1});
    const owned=await db.intent(old.operationId),beforeTakeoverDenial=await db.counts();
    expect(owned).toMatchObject({owner_kind:'RECONCILE',owner_login:'worker_b',dispatch_claims_used:1});
    expect(beforeTakeoverDenial).toMatchObject({effect_attempts:1,fake_operations:0,fake_receipts:0});
    await expect(db.dispatch(old,'worker_a')).rejects.toMatchObject({code:'42501'});
    expect(await db.counts()).toEqual(beforeTakeoverDenial);expect(await db.intent(old.operationId)).toEqual(owned);

    expect(await db.reconcile(recovery,'worker_b')).toMatchObject({status:'PENDING',reason:'NO_EFFECT_RETRY',parked:false});
    const pending=await db.intent(old.operationId),beforeRetryDenial=await db.counts();
    expect(pending).toMatchObject({status:'PENDING',owner_kind:'NONE',dispatch_claims_used:1,reason:'NO_EFFECT_RETRY'});
    const proof=await db.admin.query(`SELECT dispatch_generation,reason FROM ${D}.attempt_events WHERE operation_id=$1 AND event_kind='RETRY_SCHEDULED'`,[old.operationId]);
    expect(proof.rows).toEqual([{dispatch_generation:1,reason:'NO_EFFECT_RETRY'}]);
    expect(beforeRetryDenial).toMatchObject({effect_attempts:1,fake_operations:0,fake_receipts:0});
    await expect(db.dispatch(old,'worker_a')).rejects.toMatchObject({code:'42501'});
    expect(await db.counts()).toEqual(beforeRetryDenial);expect(await db.intent(old.operationId)).toEqual(pending);

    await db.due(old.operationId);
    const next=mustClaim(await db.claim('worker_b'));
    expect(next).toMatchObject({operationId:old.operationId,kind:'DISPATCH',epoch:'3',dispatchNumber:2});
    const receipt=await db.dispatch(next,'worker_b');expect(receipt.operationId).toBe(old.operationId);
    await db.handoff(next,'worker_b');
    const completion=mustClaim(await db.recover('worker_a'));
    expect(await db.reconcile(completion,'worker_a')).toMatchObject({status:'COMPLETED',receiptId:receipt.receiptId});
    expect(await db.counts()).toMatchObject({effect_attempts:2,fake_operations:1,fake_receipts:1,completed:1,failed:0});
  });
  it('D14 old dispatch locks valid first; reclaim waits and can only reconcile its receipt',async()=>{
    const claim=mustClaim(await db.claim()),old=await db.connect('worker_a'),replacement=await db.connect('worker_b');
    await old.query('BEGIN');await sql(old,'dispatch_fake',[scope.tenantId,scope.campaignId,claim.operationId,claim.epoch,claim.token]);
    const pending=sql<Claim|null>(replacement,'claim_reconciliation',[scope.tenantId,scope.campaignId,randomUUID()]);
    await waitForBlock(db.admin,replacement,old);await old.query('COMMIT');
    expect(await pending).toBeNull();await db.expire(claim.operationId);const r=mustClaim(await db.recover());expect((await db.reconcile(r)).status).toBe('COMPLETED');
    expect(await db.counts()).toMatchObject({fake_operations:1,completed:1});
  });
  it('D15 same identity returns exact same receipt; wrong fence, token and scope deny',async()=>{
    const c=mustClaim(await db.claim());expect(await db.dispatch(c)).toEqual(await db.dispatch(c));
    for(const invalid of [{...c,epoch:String(BigInt(c.epoch)+1n)},{...c,token:randomUUID()}])await expect(db.dispatch(invalid)).rejects.toMatchObject({code:'42501'});
    await expect(sql(await db.connect('worker_a'),'dispatch_fake',['tenant-a','campaign-b',c.operationId,c.epoch,c.token])).rejects.toMatchObject({code:'42501'});
    expect(await db.counts()).toMatchObject({fake_operations:1,fake_receipts:1});
  });
  it('D29 simultaneous reconcilers acquire one token and append completion exactly once',async()=>{
    const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);
    const claims=await Promise.all([db.recover('worker_a'),db.recover('worker_b')]);expect(claims.filter(Boolean)).toHaveLength(1);
    const winner=claims[0]?'worker_a':'worker_b',r=mustClaim(claims.find(Boolean)!);
    await expect(db.reconcile({...r,token:randomUUID()},winner)).rejects.toMatchObject({code:'42501'});
    const outputs=await Promise.all([db.reconcile(r,winner),db.reconcile(r,winner)]);expect(outputs.every(x=>x.status==='COMPLETED')).toBe(true);
    await db.reconcile(r,winner);expect(await db.counts()).toMatchObject({completed:1,fake_operations:1,fake_receipts:1});
    const terminal=await db.admin.query(`SELECT count(*) FROM ${D}.attempt_events WHERE operation_id=$1 AND event_kind IN ('COMPLETED','FAILED','EFFECT_COMPLETED','EFFECT_FAILED')`,[r.operationId]);expect(Number(terminal.rows[0].count)).toBe(1);
  });
  it.each(['READ','PROCESS_SIMULATION','binding'])('D34 valid lease does not survive worker %s revocation',async capability=>{
    const c=mustClaim(await db.claim());if(capability==='binding')await db.disable('worker_a');else await db.revoke(capability,'worker_a');
    const before=await db.counts();await expect(db.dispatch(c)).rejects.toMatchObject({code:'42501'});await expect(db.handoff(c)).rejects.toMatchObject({code:'42501'});await expect(db.claim()).rejects.toMatchObject({code:'42501'});await expect(db.recover('worker_a')).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toEqual(before);
    await db.expire(c.operationId);expect((await db.reconcile(mustClaim(await db.recover()))).status).toBe('PENDING');
  });
  it('D19 tenant suspension denies all PROCESS operations and resumes only after restoration',async()=>{
    const c=mustClaim(await db.claim());await db.suspend();const before=await db.counts();await expect(db.dispatch(c)).rejects.toMatchObject({code:'42501'});await expect(db.recover()).rejects.toMatchObject({code:'42501'});await expect(db.claim()).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toEqual(before);
    await db.admin.query(`UPDATE ${B}.tenants SET status='ACTIVE',version=version+1 WHERE id='tenant-a'`);await db.expire(c.operationId);expect(await db.recover()).not.toBeNull();
  });
  it('D35 PROCESS and a RECONCILE token never confer dispatch authority',async()=>{
    const c=mustClaim(await db.claim());await db.expire(c.operationId);const r=mustClaim(await db.recover());
    await expect(db.dispatch(r,'worker_b')).rejects.toMatchObject({code:'42501'});
    await expect(db.submit(command(),'worker_a')).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toMatchObject({fake_operations:0});
  });
  it('D14 lease expires while blocked before validity check, so direct dispatch cannot insert',async()=>{
    const c=mustClaim(await db.claim()),blocker=await db.connect('postgres'),worker=await db.connect('worker_a');
    await db.admin.query(`UPDATE ${D}.effect_intents SET lease_until=clock_timestamp()+interval '600 milliseconds' WHERE operation_id=$1`,[c.operationId]);
    await blocker.query('BEGIN');await blocker.query(`SELECT * FROM ${B}.tenants WHERE id='tenant-a' FOR UPDATE`);
    const dispatch=sql(worker,'dispatch_fake',[scope.tenantId,scope.campaignId,c.operationId,c.epoch,c.token]).then(()=>'',e=>e.code);
    await waitForBlock(db.admin,worker,blocker);
    await waitUntil(db.admin,`clock_timestamp()>(SELECT lease_until FROM ${D}.effect_intents WHERE operation_id=$1)`,[c.operationId]);
    await blocker.query('COMMIT');expect(await dispatch).toBe('42501');expect(await db.counts()).toMatchObject({fake_operations:0});
  });
  it('D34 revocation denies reconciliation despite a live recovery lease; replacement retains receipt truth',async()=>{
    const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);const r=mustClaim(await db.recover());await db.revoke('PROCESS_SIMULATION','worker_b');
    const before=await db.counts();await expect(db.reconcile(r)).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toEqual(before);
    await db.expire(c.operationId);await db.recover('worker_a');await db.due(c.operationId);const next=mustClaim(await db.recover('worker_a'));expect((await db.reconcile(next,'worker_a')).status).toBe('COMPLETED');
  });

});
