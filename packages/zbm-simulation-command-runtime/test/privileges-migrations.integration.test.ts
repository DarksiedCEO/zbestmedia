import {createHash} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {B,D,Database,command,mustClaim,sql,bsql} from './helpers/postgres';

describe('D22/D23/D25 restricted runtime and migration histories',()=>{
  const db=new Database();beforeAll(()=>db.start(true));afterAll(()=>db.stop());
  it('D23 reviewed B schema with representative data upgrades before D without changing history owner',async()=>{
    expect((await db.admin.query(`SELECT id FROM ${B}.campaigns WHERE tenant_id='upgrade-tenant'`)).rows).toEqual([{id:'upgrade-campaign'}]);
    const b=(await db.admin.query(`SELECT migration_name FROM ${B}._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`)).rows.map(r=>r.migration_name);
    const d=(await db.admin.query(`SELECT migration_name FROM ${D}._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`)).rows.map(r=>r.migration_name);
    expect(b).toEqual(['20260914_000001_authority_evidence_spine','20260916_000002_simulation_runtime_bridge']);expect(d).toEqual(['20260916_000001_simulation_runtime']);
    db.migrate('B');db.migrate('D');expect((await db.admin.query(`SELECT count(*) FROM ${D}._prisma_migrations`)).rows[0].count).toBe('1');
    expect(await sql(await db.connect('reader_a'),'observe_runtime_principal',['tenant-a','campaign-a'])).toMatchObject({principal:'reader_a',login:'reader_a'});
  });
  it.each(['executor_a','reader_a','worker_a','unbound'])('D22 %s has no base-table read/write, DDL, private bridge or owner SET ROLE',async login=>{
    const c=await db.connect(login);
    for(const query of [
      `SELECT * FROM ${D}.commands`,`INSERT INTO ${D}.fake_receipts(id) VALUES(gen_random_uuid())`,`UPDATE ${D}.effect_intents SET dispatch_claims_used=0`,`DELETE FROM ${D}.commands`,
      `CREATE TABLE ${D}.malicious(id int)`,`ALTER TABLE ${D}.commands ADD COLUMN forged text`,'SET ROLE zbm_sim_owner','SET ROLE zbm_sim_migrator','SET ROLE zbm_ae_simulation_bridge',
      `SELECT ${B}.append_simulation_evidence('tenant-a','campaign-a','PROCESS','{"event":"EFFECT_COMPLETED","commandId":"forged","actor":"admin"}')`,
      `SELECT ${D}.seed_probe('tenant-a','campaign-a','forged',repeat('a',64))`
    ])await expect(c.query(query)).rejects.toMatchObject({code:'42501'});
  });
  it.each(['zbm_sim_executor','zbm_sim_result_reader','zbm_sim_worker'])('F1 %s inherits no B reader functions',async role=>{
    expect((await db.admin.query("SELECT pg_has_role($1,'zbm_ae_reader','MEMBER') AS member",[role])).rows[0].member).toBe(false);
    const functions=(await db.admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND has_function_privilege($2,p.oid,'EXECUTE') ORDER BY p.proname`,[B,role])).rows;
    expect(functions).toEqual([]);
  });
  it.each(['executor_a','executor_other','reader_a','worker_a'])('F1 %s cannot directly read known B evidence or approvals',async login=>{
    await db.reset();await db.submit();
    const id=(await db.admin.query(`SELECT id FROM ${B}.evidence WHERE stream='simulation-runtime-v1' ORDER BY sequence LIMIT 1`)).rows[0].id;
    const c=await db.connect(login);
    await expect(bsql(c,'read_evidence',['tenant-a','campaign-a','SIMULATION',id,false])).rejects.toMatchObject({code:'42501'});
    await expect(bsql(c,'read_approval',['tenant-a','campaign-a','SIMULATION','approval-a','SIMULATION_PROBE_TRANSITION_V1','probe-a','0',await db.transitionHash(command()),'TECHNICAL_QC'])).rejects.toMatchObject({code:'42501'});
    await expect(c.query('SET ROLE zbm_ae_reader')).rejects.toMatchObject({code:'42501'});
    // The underlying records exist and the B approval issuer retains its intended access.
    expect(await bsql(await db.connect('issuer_a'),'read_approval',['tenant-a','campaign-a','SIMULATION','approval-a','SIMULATION_PROBE_TRANSITION_V1','probe-a','0',await db.transitionHash(command()),'TECHNICAL_QC'])).toBeTruthy();
  });
  it.each(['executor_a','reader_a','worker_a'])('F1 %s narrow observation requires current scoped READ',async login=>{
    await db.reset();const c=await db.connect(login);
    expect(await sql(c,'observe_runtime_principal',['tenant-a','campaign-a'])).toEqual({principal:login,login,tenant:'tenant-a',campaign:'campaign-a'});
    await expect(sql(c,'observe_runtime_principal',['tenant-b','campaign-c'])).rejects.toMatchObject({code:'42501'});
    await db.revoke('READ',login);
    await expect(sql(c,'observe_runtime_principal',['tenant-a','campaign-a'])).rejects.toMatchObject({code:'42501'});
  });
  it('D22 all SECURITY DEFINER entries pin search_path and PUBLIC has no execute',async()=>{
    const rows=(await db.admin.query(`SELECT p.proname,p.prosecdef,p.proconfig,coalesce(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false) AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ON true WHERE n.nspname=$1 GROUP BY p.oid`,[D])).rows;
    expect(rows.length).toBeGreaterThan(10);for(const r of rows){expect(r.public_execute,r.proname).toBe(false);if(r.prosecdef)expect(r.proconfig,r.proname).toContain('search_path=pg_catalog');}
    const c=await db.connect('executor_a');await c.query('CREATE TEMP TABLE commands(id text); SET search_path=pg_temp,public');expect((await sql<{acceptance:string}>(c,'submit_or_replay',[command(),false])).acceptance).toBe('ACCEPTED');
  });
  it('D22 excessive transport groups never bypass missing protected binding',async()=>{
    await expect(sql(await db.connect('issuer_a'),'observe_runtime_principal',['tenant-a','campaign-a'])).rejects.toMatchObject({code:'42501'});
    await expect(sql(await db.connect('unbound'),'observe_runtime_principal',['tenant-a','campaign-a'])).rejects.toMatchObject({code:'42501'});
    const c=await db.connect('unbound');await expect(sql(c,'submit_or_replay',[command(),false])).rejects.toMatchObject({code:'42501'});await expect(sql(c,'claim_effect',['tenant-a','campaign-a','00000000-0000-4000-8000-000000000001'])).rejects.toMatchObject({code:'42501'});
  });
  it('D23 D migrator cannot alter B objects or grant itself ownership',async()=>{
    const c=await db.connect('zbm_sim_migrator');await c.query('SET ROLE zbm_sim_owner');
    await expect(c.query(`ALTER TABLE ${B}.tenants ADD COLUMN forged text`)).rejects.toMatchObject({code:'42501'});await expect(c.query('SET ROLE zbm_ae_owner')).rejects.toMatchObject({code:'42501'});
  });
  it('D25 evidence sequence/hash chain recomputes and worker attribution differs from requester',async()=>{
    await db.reset();await db.submit();const c=mustClaim(await db.claim());await db.dispatch(c);await db.handoff(c);await db.reconcile(mustClaim(await db.recover()));
    const rows=(await db.admin.query(`SELECT * FROM ${B}.evidence WHERE stream='simulation-runtime-v1' ORDER BY sequence`)).rows;
    expect(rows.length).toBeGreaterThanOrEqual(4);let prior='0'.repeat(64),sequence=0n;
    for(const row of rows){expect(BigInt(row.sequence)).toBe(++sequence);expect(row.prior_hash).toBe(prior);expect(createHash('sha256').update(row.canonical).digest('hex')).toBe(row.hash);const canonical=JSON.parse(row.canonical);expect(canonical[8]).toBe(prior);expect(canonical[9]).toBe(row.actor);expect(canonical[10]).toBe(row.custodial_login);prior=row.hash;}
    expect(rows[0].actor).toBe('executor_a');const completion=rows.find(r=>JSON.parse(r.canonical)[12].event==='EFFECT_COMPLETED');expect(completion.actor).toBe('worker_b');expect(JSON.parse(completion.canonical)[12].requesterPrincipal).toBe('executor_a');
    for(const table of ['commands','probe_versions','effect_attempts','attempt_events','fake_operations','fake_receipts'])await expect(db.admin.query(`DELETE FROM ${D}.${table}`)).rejects.toMatchObject({code:'42501'});
    // Reviewed B trigger deliberately raises P0001 to an owner; runtime denial remains42501.
    await expect(db.admin.query(`DELETE FROM ${B}.evidence`)).rejects.toMatchObject({code:'P0001'});
    await expect((await db.connect('executor_a')).query(`DELETE FROM ${B}.evidence`)).rejects.toMatchObject({code:'42501'});
    expect((await db.admin.query(`SELECT count(*) FROM ${B}.evidence WHERE stream='simulation-runtime-v1'`)).rows[0].count).toBe(String(rows.length));
  });
});
