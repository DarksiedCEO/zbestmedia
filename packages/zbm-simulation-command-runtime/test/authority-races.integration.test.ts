import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {B,Database,command,sql,bsql,waitForBlock,waitUntil} from './helpers/postgres';

describe('D04/D09/D10 current authority under real lock barriers',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it.each([
    ['wrong issuer',`issuer='RIGHTS'`],['same actor',`actor='executor_a',custodial_login='executor_a'`],
    ['wrong version',`subject_version='1'`],['wrong hash',`subject_hash=repeat('c',64)`],
    ['expired',`expires_at=clock_timestamp()-interval '1 second'`],['future',`valid_from=clock_timestamp()+interval '1 hour'`],
    ['custody mismatch',`actor='manager_a'`],['revoked',`status='REVOKED',changed_at=clock_timestamp()`]
  ])('D04 denies %s approval without persisting acceptance',async(_name,patch)=>{
    await db.admin.query(`UPDATE ${B}.approvals SET ${patch} WHERE id='approval-a'`);
    await expect(db.submit()).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toMatchObject({commands:0,accepted:0});
  });
  it.each([[],['approval-a','approval-a'],['approval-a','extra']].map(approvalIds=>({approvalIds})))('D04 exact one approval is required: %j',async ({approvalIds})=>{
    await expect(db.submit(command({approvalIds}))).rejects.toMatchObject({code:'22023'});expect(await db.counts()).toMatchObject({commands:0});
  });
  it('D04 active issuer must retain TECHNICAL_QC custody capability',async()=>{
    await db.admin.query(`UPDATE ${B}.caller_bindings SET issuers='{}' WHERE login='issuer_a'`);await expect(db.submit()).rejects.toMatchObject({code:'42501'});
  });
  for(const mutation of ['grant','approval','tenant','binding'] as const){
    const mutate=async(c:Awaited<ReturnType<Database['connect']>>)=>{
      if(mutation==='grant')return bsql(c,'revoke_grant',['tenant-a',null,'SIMULATION','executor_a-EXECUTE_SIMULATION',0]);
      if(mutation==='approval')return bsql(c,'revoke_approval',['tenant-a','campaign-a','SIMULATION','approval-a',0]);
      if(mutation==='tenant')return bsql(c,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);
      return bsql(c,'change_binding',['executor_a',false]);
    };
    it(`D09 ${mutation} revocation wins lock and command denies after observed wait`,async()=>{
      const revoker=await db.connect(mutation==='binding'?'postgres':'manager_a'),executor=await db.connect('executor_a');
      await revoker.query('BEGIN');await mutate(revoker);
      const result=sql(executor,'submit_or_replay',[command(),false]).then(value=>({value,code:''}),e=>({value:null,code:e.code}));
      await waitForBlock(db.admin,executor,revoker);await revoker.query('COMMIT');
      expect((await result).code).toBe('42501');expect(await db.counts()).toMatchObject({commands:0,accepted:0});
    });
    it(`D09 command wins lock and ${mutation} waits until atomic commit`,async()=>{
      const executor=await db.connect('executor_a'),revoker=await db.connect(mutation==='binding'?'postgres':'manager_a');
      await executor.query('BEGIN');await sql(executor,'submit_or_replay',[command(),false]);
      const revoked=mutate(revoker);await waitForBlock(db.admin,revoker,executor);await executor.query('COMMIT');await revoked;
      expect(await db.version()).toBe('1');expect(await db.counts()).toMatchObject({commands:1,accepted:1,effect_intents:1});
    });
  }
  for(const mutation of ['grant','tenant'] as const){
    const mutate=async(c:Awaited<ReturnType<Database['connect']>>)=>mutation==='grant'
      ? bsql(c,'revoke_grant',['tenant-a',null,'SIMULATION','executor_a-EXECUTE_SIMULATION',0])
      : bsql(c,'set_tenant_status',['tenant-a','SIMULATION','SUSPENDED',0]);
    it(`D09 campaign-b waits behind tenant-wide ${mutation}; both campaigns deny after mutation commits`,async()=>{
      const req=command({scope:{tenantId:'tenant-a',campaignId:'campaign-b'}});await db.seedProbe(req);await db.approve(req);
      const revoker=await db.connect('manager_a'),executor=await db.connect('executor_a');
      await revoker.query('BEGIN');await mutate(revoker);
      const waiting=sql(executor,'submit_or_replay',[req,false]).then(()=>'',e=>e.code);
      await waitForBlock(db.admin,executor,revoker);await revoker.query('COMMIT');
      expect(await waiting).toBe('42501');
      await expect(db.submit(command())).rejects.toMatchObject({code:'42501'});
      await expect(db.submit(req)).rejects.toMatchObject({code:'42501'});
      expect(await db.version(command())).toBe('0');expect(await db.version(req)).toBe('0');
      expect(await db.counts()).toMatchObject({commands:0,probe_versions:0,effect_intents:0,accepted:0});
    });
    it(`D09 campaign-b command wins; tenant-wide ${mutation} waits, then both campaigns deny new commands`,async()=>{
      const req=command({scope:{tenantId:'tenant-a',campaignId:'campaign-b'}});await db.seedProbe(req);await db.approve(req);
      // Prepare a valid successor so denial cannot be attributed to stale probe state.
      const successor=command({scope:req.scope,expectedVersion:'1',expectedPayloadSha256:req.nextPayloadSha256,nextPayloadSha256:'c'.repeat(64),approvalIds:['approval-b-next'],idempotencyKey:'campaign-b-after-revocation'});await db.approve(successor);
      const executor=await db.connect('executor_a'),revoker=await db.connect('manager_a');
      await executor.query('BEGIN');const accepted=await sql<{acceptance:string;resultingVersion:string}>(executor,'submit_or_replay',[req,false]);
      expect(accepted).toMatchObject({acceptance:'ACCEPTED',resultingVersion:'1'});
      const revoked=mutate(revoker);await waitForBlock(db.admin,revoker,executor);
      await executor.query('COMMIT');await revoked;
      await expect(db.submit(command())).rejects.toMatchObject({code:'42501'});
      await expect(db.submit(successor)).rejects.toMatchObject({code:'42501'});
      expect(await db.version(command())).toBe('0');expect(await db.version(req)).toBe('1');
      expect(await db.counts()).toMatchObject({commands:1,probe_versions:1,effect_intents:1,accepted:1});
    });
  }
  it.each(['grant','approval'])('D10 %s expires during observed lock wait; decision uses time after wait',async kind=>{
    const blocker=await db.connect('postgres'),executor=await db.connect('executor_a');
    const relation=kind==='grant'?'grants':'approvals',id=kind==='grant'?'executor_a-EXECUTE_SIMULATION':'approval-a';
    await db.admin.query(`UPDATE ${B}.${relation} SET expires_at=clock_timestamp()+interval '600 milliseconds' WHERE id=$1`,[id]);
    await blocker.query('BEGIN');await blocker.query(`SELECT * FROM ${B}.tenants WHERE id='tenant-a' FOR UPDATE`);
    const waiting=sql(executor,'submit_or_replay',[command(),false]).then(()=>'',e=>e.code);
    await waitForBlock(db.admin,executor,blocker);
    await waitUntil(db.admin,`clock_timestamp()>(SELECT expires_at FROM ${B}.${relation} WHERE id=$1)`,[id]);
    await blocker.query('COMMIT');expect(await waiting).toBe('42501');expect(await db.counts()).toMatchObject({commands:0,accepted:0});
  });
  it('D09 tenant-wide execute revocation denies both campaigns',async()=>{
    const other=command({scope:{tenantId:'tenant-a',campaignId:'campaign-b'}});await db.seedProbe(other);await db.approve(other);
    await db.revoke('EXECUTE_SIMULATION');for(const req of [command(),other])await expect(db.submit(req)).rejects.toMatchObject({code:'42501'});
  });
  it('D09 campaign grant revocation only denies its campaign',async()=>{
    await db.admin.query(`DELETE FROM ${B}.grants WHERE id='executor_a-EXECUTE_SIMULATION'; INSERT INTO ${B}.grants(id,tenant_id,campaign_id,scope_kind,principal,purpose,capability,valid_from,expires_at) SELECT 'execute-'||id,tenant_id,id,'CAMPAIGN','executor_a','SIMULATION','EXECUTE_SIMULATION',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day' FROM ${B}.campaigns WHERE tenant_id='tenant-a'`);
    await bsql(await db.connect('manager_a'),'revoke_grant',['tenant-a','campaign-a','SIMULATION','execute-campaign-a',0]);
    await expect(db.submit()).rejects.toMatchObject({code:'42501'});
    const other=command({scope:{tenantId:'tenant-a',campaignId:'campaign-b'}});await db.seedProbe(other);await db.approve(other);expect((await db.submit(other)).acceptance).toBe('ACCEPTED');
  });
  it('D04 superseded approval denies even with a current independent successor',async()=>{
    const successor=command({approvalIds:['approval-successor']});await db.approve(successor);
    await db.admin.query(`UPDATE ${B}.approvals SET status='SUPERSEDED',changed_at=clock_timestamp(),successor_id='approval-successor' WHERE id='approval-a'`);
    await expect(db.submit()).rejects.toMatchObject({code:'42501'});expect(await db.counts()).toMatchObject({commands:0,accepted:0});
  });

});
