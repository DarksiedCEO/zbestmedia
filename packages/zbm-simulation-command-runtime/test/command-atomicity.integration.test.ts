import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { B,D,Database,command,sql } from './helpers/postgres';

describe('D03–D06 atomic command transaction',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it.each(['STATE_ONLY','FAKE_RECEIPT'] as const)('D06 commits all records for %s',async completion=>{
    const req=command({completion});await db.approve(req);const r=await db.submit(req);
    expect(r).toMatchObject({found:true,acceptance:'ACCEPTED',execution:'COMPLETED',resultingVersion:'1',replay:false,effect:{status:completion==='STATE_ONLY'?'NOT_REQUIRED':'PENDING'}});
    expect(await db.version()).toBe('1');expect(await db.counts()).toMatchObject({commands:1,probe_versions:1,effect_intents:completion==='FAKE_RECEIPT'?1:0,accepted:1,fake_operations:0,fake_receipts:0});
  });
  it.each(['probes','probe_versions','commands','effect_intents'] )('D06 exception after %s write rolls the whole transaction back',async table=>{
    // Fixture-only trigger injects a real server exception after the selected write.
    await db.admin.query(`CREATE FUNCTION ${D}.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test crash boundary'; END $$; CREATE TRIGGER test_fail AFTER INSERT OR UPDATE ON ${D}.${table} FOR EACH ROW EXECUTE FUNCTION ${D}.test_fail()`);
    try {await expect(db.submit()).rejects.toMatchObject({code:'P0001'});}finally{await db.admin.query(`DROP TRIGGER test_fail ON ${D}.${table}; DROP FUNCTION ${D}.test_fail()`);}
    expect(await db.version()).toBe('0');expect(await db.counts()).toMatchObject({commands:0,probe_versions:0,effect_intents:0,accepted:0});
    expect((await db.submit()).resultingVersion).toBe('1');
  });
  it('D06 evidence append failure leaves no command, version, intent or reserved key',async()=>{
    await db.admin.query(`CREATE FUNCTION ${B}.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'evidence failure'; END $$; CREATE TRIGGER test_fail AFTER INSERT ON ${B}.evidence FOR EACH ROW EXECUTE FUNCTION ${B}.test_fail()`);
    try{await expect(db.submit()).rejects.toMatchObject({code:'P0001'});}finally{await db.admin.query(`DROP TRIGGER test_fail ON ${B}.evidence; DROP FUNCTION ${B}.test_fail()`);}
    expect(await db.counts()).toMatchObject({commands:0,probe_versions:0,effect_intents:0,accepted:0});expect(await db.version()).toBe('0');await db.submit();
  });
  it.each([{expectedVersion:'1'},{expectedPayloadSha256:'c'.repeat(64)}])('D05 stale aggregate %j is conflict and does not reserve the key',async change=>{
    const req=command(change);await db.approve(req);await expect(db.submit(req)).rejects.toMatchObject({code:'P0002'});
    expect(await db.counts()).toMatchObject({commands:0,accepted:0,effect_intents:0});
  });
  it('D05 different keys competing for the same version have one winner',async()=>{
    const outcomes=await Promise.allSettled([db.submit(),db.submit(command({idempotencyKey:'key-b'}))]);
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x=>x.status==='rejected').map(x=>x.reason.code)).toEqual(['P0002']);
    expect(await db.version()).toBe('1');expect(await db.counts()).toMatchObject({commands:1,accepted:1,effect_intents:1});
  });
  it('D03/D05 int64 above 2^53 is exact and maximum int64 cannot wrap',async()=>{
    const req=command({expectedVersion:'9007199254740993'});
    await db.admin.query(`UPDATE ${D}.probes SET version=$1`,[req.expectedVersion]);await db.approve(req);
    expect((await db.submit(req)).resultingVersion).toBe('9007199254740994');
    await db.reset();const max=command({expectedVersion:'9223372036854775807'});
    await db.admin.query(`UPDATE ${D}.probes SET version=$1`,[max.expectedVersion]);await db.approve(max);
    await expect(db.submit(max)).rejects.toMatchObject({code:'P0002'});expect(await db.version()).toBe(max.expectedVersion);
  });
  it.each([{provider:'stripe'},{completion:'PAYOUT'},{expectedVersion:'01'},{expectedVersion:1},{expectedVersion:'9223372036854775808'},{scope:{tenantId:'tenant-a',campaignId:'campaign-a',environment:'LIVE'}},{nextPayloadSha256:'BAD'},{approvalIds:[]},{idempotencyKey:'x'.repeat(129)}])('D03/D24 direct SQL rejects malformed shape %j',async change=>{
    const c=await db.connect('executor_a');await expect(sql(c,'submit_or_replay',[{...command(),...change},false])).rejects.toMatchObject({code:'22023'});
    expect(await db.counts()).toMatchObject({commands:0,effect_intents:0,accepted:0});
  });
});
