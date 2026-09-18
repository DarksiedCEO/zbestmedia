import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { B,D,Database,command,sql,waitForBlock,type Result } from './helpers/postgres';

describe('D07/D08/D33 durable exact replay',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it('D07 simultaneous identical first use commits once',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>db.submit()));
    expect(new Set(results.map(r=>r.commandId)).size).toBe(1);expect(results.filter(r=>!r.replay)).toHaveLength(1);
    expect(await db.version()).toBe('1');expect(await db.counts()).toMatchObject({commands:1,probe_versions:1,accepted:1,effect_intents:1});
  });
  it.each([{probeId:'other'},{expectedVersion:'1'},{expectedPayloadSha256:'c'.repeat(64)},{nextPayloadSha256:'c'.repeat(64)},{completion:'STATE_ONLY' as const},{approvalIds:['other']}])('D07 each command identity change conflicts: %j',async change=>{
    const original=await db.submit();await expect(db.submit(command(change))).rejects.toMatchObject({code:'P0002'});
    expect((await db.result()).commandId).toBe(original.commandId);expect(await db.counts()).toMatchObject({commands:1,accepted:1});
  });
  it('D07 concurrent conflicting identities cannot overwrite',async()=>{
    const outcomes=await Promise.allSettled([db.submit(),db.submit(command({nextPayloadSha256:'c'.repeat(64)}))]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(await db.counts()).toMatchObject({commands:1,accepted:1});
  });
  it('D08 SQL canonicalization ignores JSON property order and keeps decimal text',async()=>{
    const req=command();const first=await db.submit(req);
    const reversed=Object.fromEntries(Object.entries(req).reverse());
    const replay=await sql<Result>(await db.connect('executor_a'),'submit_or_replay',[reversed,false]);
    expect(replay).toMatchObject({commandId:first.commandId,replay:true});
    const row=(await db.admin.query(`SELECT * FROM ${D}.commands`)).rows[0];
    // Fixed independent golden vectors: do not derive expected bytes/hash from database output.
    expect(row.canonical).toBe('["zbm-sim-command-v1", "SIMULATION", "tenant-a", "campaign-a", "executor_a", "ADVANCE_SIMULATION_PROBE", 1, "probe-a", "0", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "FAKE_RECEIPT", ["approval-a"]]');
    expect(row.identity_hash).toBe('d3370a54c956324b29fd816294325f11d68ec8e6eeaba0425fa530580de3d4d1');
    expect(await db.transitionHash(command())).toBe('036f465e2fa1d98e9de3303cef7311548a6b303695fb4fdc4c11c2fb1aa15255');
  });
  it('D08 tenant, campaign and principal namespaces accept their own same key and deny foreign lookups',async()=>{
    await db.submit();const other=command({scope:{tenantId:'tenant-a',campaignId:'campaign-b'}});await db.seedProbe(other);await db.approve(other);await db.submit(other);
    const principal=command({probeId:'probe-other',approvalIds:['approval-other']});await db.seedProbe(principal);await db.approve(principal);const principalAccepted=await db.submit(principal,'executor_other');
    expect(await db.counts()).toMatchObject({commands:3,accepted:3,effect_intents:3});
    const own=await db.result(command(),'executor_other');expect(own).toMatchObject({probeId:'probe-other',commandId:principalAccepted.commandId});expect(own.commandId).not.toBe((await db.result()).commandId);
    const privateKey=command({probeId:'private-probe',approvalIds:['private-approval'],idempotencyKey:'only-executor-a'});await db.seedProbe(privateKey);await db.approve(privateKey);const privateAccepted=await db.submit(privateKey);
    expect((await db.result(privateKey)).commandId).toBe(privateAccepted.commandId);
    await expect(db.result(privateKey,'executor_other')).rejects.toMatchObject({code:'42501'});
    const tenantB=command({scope:{tenantId:'tenant-b',campaignId:'campaign-c'}});await db.seedProbe(tenantB);await db.approve(tenantB,'issuer_b');
    // Same probe ID/key/payload, but a real tenant-b executor and independent tenant-b custodian.
    const acceptedB=await db.submit(tenantB,'executor_b');expect(acceptedB).toMatchObject({acceptance:'ACCEPTED',resultingVersion:'1',probeId:'probe-a',replay:false});
    expect(await db.result(tenantB,'executor_b')).toMatchObject({commandId:acceptedB.commandId,probeId:'probe-a'});
    expect(acceptedB.commandId).not.toBe((await db.result()).commandId);expect(acceptedB.commandId).not.toBe(principalAccepted.commandId);
    expect(await db.submit(tenantB,'executor_b')).toMatchObject({commandId:acceptedB.commandId,replay:true});
    await expect(db.result(tenantB,'executor_a')).rejects.toMatchObject({code:'42501'});
    await expect(db.result(command(),'executor_b')).rejects.toMatchObject({code:'42501'});
    await expect(db.submit(tenantB,'executor_a')).rejects.toMatchObject({code:'42501'});
    expect(await db.counts()).toMatchObject({commands:5,accepted:5,effect_intents:5});
  });
  it('D33 READ replay survives execute, approval and custodian revocation',async()=>{
    const first=await db.submit();await db.revoke('EXECUTE_SIMULATION');await db.revokeApproval();await db.disable('issuer_a');
    const before=await db.counts();expect(await db.submit()).toMatchObject({commandId:first.commandId,replay:true});expect((await db.result()).commandId).toBe(first.commandId);
    expect(await db.counts()).toEqual(before);await expect(db.submit(command({idempotencyKey:'new-key'}))).rejects.toMatchObject({code:'42501'});
  });
  it('D33 COMMAND miss races a commit: replay is checked before old X/A validity',async()=>{
    const loser=await db.connect('executor_a');
    expect(await sql(loser,'submit_or_replay',[command(),true])).toEqual({found:false});
    const accepted=await db.submit();
    const admin=await db.connect('postgres');await admin.query('BEGIN');
    await admin.query(`SELECT * FROM ${B}.caller_bindings WHERE login='issuer_a' FOR UPDATE`);
    await admin.query(`UPDATE ${B}.grants SET status='REVOKED',changed_at=clock_timestamp(),version=version+1 WHERE id='executor_a-EXECUTE_SIMULATION'`);
    await admin.query(`UPDATE ${B}.approvals SET status='REVOKED',changed_at=clock_timestamp(),version=version+1 WHERE id='approval-a'`);
    await admin.query(`UPDATE ${B}.caller_bindings SET active=false WHERE login='issuer_a'`);
    const waiting=sql<Result>(loser,'submit_or_replay',[command(),false]);
    await waitForBlock(db.admin,loser,admin);await admin.query('COMMIT');
    expect(await waiting).toMatchObject({commandId:accepted.commandId,replay:true});
    expect((await db.submit()).replay).toBe(true);
    expect(await db.counts()).toMatchObject({commands:1,accepted:1});
  });
  it('D08 equal stored hash cannot substitute for equal canonical bytes',async()=>{
    await db.submit();const c=await db.connect('postgres');await c.query('BEGIN');
    try{
      const constraints=(await c.query(`SELECT conname FROM pg_constraint WHERE conrelid='${D}.commands'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%canonical%'`)).rows;
      expect(constraints).toHaveLength(1);
      await c.query(`ALTER TABLE ${D}.commands DROP CONSTRAINT "${constraints[0].conname}"; ALTER TABLE ${D}.commands DISABLE TRIGGER USER`);
      await c.query(`UPDATE ${D}.commands SET canonical=canonical||' '`);
      await c.query('COMMIT');
      await expect(db.submit()).rejects.toMatchObject({code:'P0002'});
    }finally{
      await c.query('ROLLBACK');
      await db.admin.query(`UPDATE ${D}.commands SET canonical=rtrim(canonical); ALTER TABLE ${D}.commands ENABLE TRIGGER USER; ALTER TABLE ${D}.commands ADD CHECK(identity_hash=encode(sha256(convert_to(canonical,'UTF8')),'hex'))`);
    }
  });

});
