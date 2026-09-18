import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import Fastify from 'fastify';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createRuntime} from '../src/index';
import {Database,command,diagnoseWorkerRun,mustClaim,route,scope,sql,thirdClaim,token,waitUntil,type Claim,type Result} from './helpers/postgres';
import {CommitProxy} from './helpers/commit-proxy';
import {WorkerChild} from './helpers/worker-child';

const params=(c:Claim)=>[scope.tenantId,scope.campaignId,c.operationId,c.epoch,c.token];
describe('D20/D21/D27–D32 real COMMIT loss and process death',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it('D20 actual command COMMIT reply is dropped: HTTP UNKNOWN resolves to exactly one durable acceptance',async()=>{
    const proxy=new CommitProxy(db.credentials('executor_a'));const connection=await proxy.start();proxy.arm(1);
    const a=await db.application('executor_a',{connections:connection});
    try{
      const response=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});
      await proxy.committed;expect(proxy.commitRepliesDropped).toBe(1);expect(response.statusCode).toBe(503);expect(response.json()).toMatchObject({acceptance:'UNKNOWN'});
      // Separate admin socket proves durable state, never a mock query exception.
      expect(await db.counts()).toMatchObject({commands:1,probe_versions:1,effect_intents:1,accepted:1});expect(await db.version()).toBe('1');
      const durable=await db.result();expect(durable.acceptance).toBe('ACCEPTED');expect((await db.submit()).commandId).toBe(durable.commandId);expect(await db.evidenceCount('COMMAND_ACCEPTED')).toBe(1);
    }finally{await a.close();await proxy.close();}
  });
  it('D20 HTTP peer disappears after commit before response, same key returns committed result',async()=>{
    const runtime=createRuntime(db.configuration(),{connections:{d:db.credentials('executor_a')}}),app=Fastify({logger:false});
    let release!:()=>void,observed!:()=>void;const gate=new Promise<void>(r=>{release=r;}),barrier=new Promise<void>(r=>{observed=r;});
    app.addHook('onSend',async(_req,_reply,payload)=>{observed();await gate;return payload;});await app.register(runtime.plugin);
    try{
      const url=await app.listen({host:'127.0.0.1',port:0});const client=request(url+route,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}});client.on('error',()=>undefined);client.end(JSON.stringify(command()));
      await barrier;expect(await db.counts()).toMatchObject({commands:1,accepted:1});client.destroy();release();
      expect((await db.submit()).replay).toBe(true);expect(await db.version()).toBe('1');
    }finally{release();await app.close();await runtime.close();}
  });
  it('D20 command child killed with open transaction rolls state/evidence/intent back and releases locks',async()=>{
    const child=new WorkerChild(db.credentials('executor_a'));
    try{
      await child.query('BEGIN');await child.call<Result>('submit_or_replay',[command(),false]);expect(await db.counts()).toMatchObject({commands:0,accepted:0});
      await child.kill();await waitUntil(db.admin,"NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='executor_a')");
      expect(await db.version()).toBe('0');expect(await db.counts()).toMatchObject({commands:0,probe_versions:0,effect_intents:0,accepted:0});expect((await db.submit()).resultingVersion).toBe('1');
    }finally{await child.kill();}
  });
  it.each(['before-claim','after-claim','before-fake-commit','after-fake-commit','before-completion-commit','after-completion-commit'] as const)('D21/D29 kill worker at %s and recover from a new process',async stage=>{
    await db.submit();const child=new WorkerChild(db.credentials('worker_a'));let c:Claim|undefined;
    try{
      if(stage==='before-claim'){await child.query('BEGIN');await child.kill();expect(await db.counts()).toMatchObject({effect_attempts:0});c=mustClaim(await db.claim());}
      else {
        c=await child.call<Claim>('claim_effect',[scope.tenantId,scope.campaignId,randomUUID()]);
        if(stage!=='after-claim'){
          if(stage==='before-fake-commit')await child.query('BEGIN');await child.call('dispatch_fake',params(c));
          if(stage==='before-completion-commit'||stage==='after-completion-commit'){
            await child.call('request_reconciliation',params(c));const r=await child.call<Claim>('claim_reconciliation',[scope.tenantId,scope.campaignId,randomUUID()]);
            if(stage==='before-completion-commit')await child.query('BEGIN');await child.call('reconcile_effect',params(r));
          }
        }
        await child.kill();
      }
      if(stage==='after-completion-commit'){expect(await db.counts()).toMatchObject({fake_operations:1,completed:1});return;}
      await db.expire(c.operationId);
      if(stage==='before-completion-commit'){await db.recover();await db.due(c.operationId);}
      const replacement=new WorkerChild(db.credentials('worker_b'));
      try{
        const r=await replacement.call<Claim>('claim_reconciliation',[scope.tenantId,scope.campaignId,randomUUID()]);expect(r.kind).toBe('RECONCILE');
        const result=await replacement.call<{status:string}>('reconcile_effect',params(r));
        const receiptCommitted=stage==='after-fake-commit'||stage==='before-completion-commit';expect(result.status).toBe(receiptCommitted?'COMPLETED':'PENDING');
        expect(await db.counts()).toMatchObject({effect_attempts:1,fake_operations:receiptCommitted?1:0,completed:receiptCommitted?1:0});
      }finally{await replacement.kill();}
    }finally{await child.kill();}
  });
  it.each([false,true])('D27/D28 actual third-attempt process death, receipt committed=%s',async receiptCommitted=>{
    await db.submit();const c=await thirdClaim(db),child=new WorkerChild(db.credentials('worker_a'));
    try{
      if(!receiptCommitted)await child.query('BEGIN');await child.call('dispatch_fake',params(c));await child.kill();
      expect(await db.counts()).toMatchObject({fake_operations:receiptCommitted?1:0,effect_attempts:3});await db.expire(c.operationId);
      if(receiptCommitted){await db.revoke('EXECUTE_SIMULATION');await db.revokeApproval();await db.disable('issuer_a');}
      const replacement=new WorkerChild(db.credentials('worker_b'));try{
        const r=await replacement.call<Claim>('claim_reconciliation',[scope.tenantId,scope.campaignId,randomUUID()]);expect(r.dispatchNumber).toBe(3);
        const result=await replacement.call<{status:string}>('reconcile_effect',params(r));expect(result.status).toBe(receiptCommitted?'COMPLETED':'FAILED');
        expect(await db.claim('worker_b')).toBeNull();expect((await db.intent(c.operationId)).dispatch_claims_used).toBe(3);
        expect(await db.counts()).toMatchObject({fake_operations:receiptCommitted?1:0,completed:receiptCommitted?1:0,failed:receiptCommitted?0:1});
      }finally{await replacement.kill();}
    }finally{await child.kill();}
  });
  it('D16 receipt COMMIT reply loss is resolved from independently verified durable receipt',async()=>{
    await db.submit();const c=mustClaim(await db.claim());const proxy=new CommitProxy(db.credentials('worker_a'));const credentials=await proxy.start();proxy.arm();
    const child=new WorkerChild(credentials);try{
      await child.query('BEGIN');await child.call('dispatch_fake',params(c));await expect(child.query('COMMIT')).rejects.toThrow();await proxy.committed;
      expect(proxy.commitRepliesDropped).toBe(1);expect(await db.counts()).toMatchObject({fake_operations:1,fake_receipts:1,completed:0});
      await db.expire(c.operationId);expect((await db.reconcile(mustClaim(await db.recover()))).status).toBe('COMPLETED');expect(await db.evidenceCount('EFFECT_COMPLETED')).toBe(1);
    }finally{await child.kill();await proxy.close();}
  });
  it('D30 claim counters and due times survive actual database restart using the same owned storage',async()=>{
    await db.submit();const c=await thirdClaim(db);await db.expire(c.operationId);const r=mustClaim(await db.recover());const before=await db.intent(c.operationId);
    const containerId=db.container!.getId(),counts=await db.counts(),result=await db.result();
    const clusterId=(await db.admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier;
    await db.restart();expect(db.container!.getId()).toBe(containerId);expect((await db.admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0].system_identifier).toBe(clusterId);
    expect(await db.intent(c.operationId)).toEqual(before);expect(await db.counts()).toEqual(counts);expect(await db.result()).toEqual(result);
    await db.expire(r.operationId);await db.recover();await db.due(r.operationId);const next=mustClaim(await db.recover());expect((await db.reconcile(next)).status).toBe('FAILED');expect((await db.intent(c.operationId)).dispatch_claims_used).toBe(3);
  });
  it('D32 ambiguous committed claim is found by original token without consuming a replacement dispatch',async()=>{
    await db.submit();const proxy=new CommitProxy(db.credentials('worker_a'));const credentials=await proxy.start();proxy.arm();const child=new WorkerChild(credentials),claimToken=randomUUID();
    try{
      await child.query('BEGIN');const c=await child.call<Claim>('claim_effect',[scope.tenantId,scope.campaignId,claimToken]);await expect(child.query('COMMIT')).rejects.toThrow();await proxy.committed;
      const found=await sql(await db.connect('worker_a'),'inspect_worker_claim',[scope.tenantId,scope.campaignId,claimToken]);expect(found).toMatchObject({found:true,current:true,token:claimToken,operationId:c.operationId});expect((await db.intent(c.operationId)).dispatch_claims_used).toBe(1);expect(await db.counts()).toMatchObject({effect_attempts:1});
    }finally{await child.kill();await proxy.close();}
  });
});

describe('D32/D36 finite production worker invocation',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it('D36 empty queue exits and explicit close prevents later background work',async()=>{
    const a=await db.application('worker_a');const run=a.runtime.worker(db.configuration('worker_a').bindings[0]);
    try{expect(await run(scope)).toMatchObject({reason:'EMPTY',claims:0});await a.runtime.close();expect(await run(scope)).toMatchObject({reason:'STOPPED',claims:0});expect(await db.counts()).toMatchObject({effect_attempts:0});}finally{await a.close();}
  });
  it('D36 launcher stops at 32 claims and explicit replacement resumes remaining durable work',async()=>{
    for(let i=0;i<17;i++){
      const req=command({probeId:'probe-'+i,approvalIds:['approval-'+i],idempotencyKey:'key-'+i});await db.seedProbe(req);await db.approve(req);await db.submit(req);
    }
    const a=await db.application('worker_a');try{
      const report=await a.runtime.worker(db.configuration('worker_a').bindings[0])(scope);expect(report).toMatchObject({reason:'CLAIM_LIMIT',claims:32});expect(await db.counts()).toMatchObject({completed:16,fake_operations:16});
    }finally{await a.close();}
    const b=await db.application('worker_b');try{expect(await b.runtime.worker(db.configuration('worker_b').bindings[0])(scope)).toMatchObject({reason:'EMPTY',claims:2});expect(await db.counts()).toMatchObject({completed:17,fake_operations:17});}finally{await b.close();}
  });
  it('D32 three real unavailable acquisitions end the invocation without invented durable counters',async()=>{
    await db.submit();const proxy=new CommitProxy(db.credentials('worker_a')),connections=await proxy.start();await proxy.close();
    const a=await db.application('worker_a',{connections});const start=performance.now();try{
      expect(await a.runtime.worker(db.configuration('worker_a').bindings[0])(scope)).toMatchObject({reason:'UNAVAILABLE',claims:0});expect(performance.now()-start).toBeLessThan(20000);expect(await db.counts()).toMatchObject({effect_attempts:0,completed:0});
    }finally{await a.close();}
  });
  it('D36 blackholed query terminates within stricter connection watchdog and bounded cleanup',async()=>{
    const proxy=new CommitProxy(db.credentials('worker_a')),connections=await proxy.start();proxy.blackholeAfterQuery('claim_reconciliation');
    const a=await db.application('worker_a',{connections});const start=performance.now();try{
      const report=await diagnoseWorkerRun(db,proxy,'watchdog-blackhole',()=>a.runtime.worker(db.configuration('worker_a').bindings[0])(scope));expect(report.reason).toBe('UNAVAILABLE');expect(performance.now()-start).toBeLessThan(70000);await a.close();expect(performance.now()-start).toBeLessThan(72000);expect(await db.counts()).toMatchObject({effect_attempts:0});
    }finally{await proxy.close();await a.close();}
  },135000);
  it('D32 production launcher resolves ambiguous claim token instead of blindly claiming again',async()=>{
    await db.submit();const proxy=new CommitProxy(db.credentials('worker_a')),connections=await proxy.start();proxy.arm(1);
    const a=await db.application('worker_a',{connections});try{
      const report=await a.runtime.worker(db.configuration('worker_a').bindings[0])(scope);await proxy.committed;expect(report).toMatchObject({reason:'UNCERTAIN',claims:1});
      expect(await db.counts()).toMatchObject({effect_attempts:1,fake_operations:0});
    }finally{await a.close();await proxy.close();}
  });
  it('D32 unavailable replacement leaves committed claim counter unchanged',async()=>{
    await db.submit();const c=mustClaim(await db.claim()),before=await db.intent(c.operationId);const proxy=new CommitProxy(db.credentials('worker_a')),connections=await proxy.start();await proxy.close();
    const a=await db.application('worker_a',{connections});try{
      expect(await a.runtime.worker(db.configuration('worker_a').bindings[0])(scope)).toMatchObject({reason:'UNAVAILABLE',claims:0});expect(await db.intent(c.operationId)).toEqual(before);
    }finally{await a.close();}
    await db.expire(c.operationId);expect((await db.reconcile(mustClaim(await db.recover()))).status).toBe('PENDING');
  });
  it('D31/D36 finite launcher refuses parked work and replacement does not reset counters',async()=>{
    await db.submit();const c=mustClaim(await db.claim());await db.expire(c.operationId);
    for(let slot=1;slot<=3;slot++){mustClaim(await db.recover());await db.expire(c.operationId);await db.recover();if(slot<3)await db.due(c.operationId);}
    const before=await db.intent(c.operationId),a=await db.application('worker_a');try{
      expect(await a.runtime.worker(db.configuration('worker_a').bindings[0])(scope)).toMatchObject({reason:'EMPTY',claims:0,parkedCount:1});expect(await db.intent(c.operationId)).toEqual(before);
    }finally{await a.close();}
  });

  it('D36 independent 120s invocation deadline aborts a blackholed ack while each earlier call stayed below 20s',async()=>{
    for(let i=0;i<8;i++){const req=command({probeId:'deadline-'+i,approvalIds:['deadline-approval-'+i],idempotencyKey:'deadline-key-'+i});await db.seedProbe(req);await db.approve(req);await db.submit(req);}
    const proxy=new CommitProxy(db.credentials('worker_a')),connections=await proxy.start();
    // Seven empty reconciliation claims wait 15s each with no owned lease.
    // All owned-work replies are immediate; actual COMMIT 40 is blackholed
    // after about 105s, so the 120s invocation deadline beats its 20s watchdog.
    const delayedCommits=[1,7,13,19,25,31,37];
    proxy.delayUnownedClaimsThenBlackhole(15000,delayedCommits,40,async()=>{
      const observed=await db.admin.query("SELECT NOT EXISTS(SELECT 1 FROM zbm_simulation_runtime.effect_intents WHERE owner_login='worker_a' AND owner_kind<>'NONE') AS unowned");
      return observed.rows[0].unowned===true;
    });
    const a=await db.application('worker_a',{connections});const started=performance.now();try{
      const report=await diagnoseWorkerRun(db,proxy,'independent-deadline',()=>a.runtime.worker(db.configuration('worker_a').bindings[0])(scope));
      const diagnostic=proxy.diagnostics(),trace=diagnostic.trace;
      expect(trace.filter(e=>e.event==='delay-eligibility').map(e=>({commitNumber:e.commitNumber,operation:e.operation,resultNull:e.resultNull,unowned:e.unowned,emptyClaim:e.emptyClaim}))).toEqual(delayedCommits.map(commitNumber=>({commitNumber,operation:'claim_reconciliation',resultNull:true,unowned:true,emptyClaim:true})));
      expect(trace.filter(e=>e.event==='delayed-reply-delivered').map(e=>e.commitNumber)).toEqual(delayedCommits);
      expect(proxy.delayedCommitRepliesDelivered).toBe(7);expect(proxy.serverCommitReplies).toBe(40);
      const faults=trace.filter(e=>e.event==='commit-blackhole-activated');expect(faults).toHaveLength(1);
      expect(faults[0]).toMatchObject({commitNumber:40,operation:'request_reconciliation'});
      expect(Number(faults[0].elapsedMs)).toBeGreaterThan(100000);expect(Number(faults[0].elapsedMs)).toBeLessThan(120000);
      expect(diagnostic.blackholeActive).toBe(true);
      expect(proxy.forwardedCommits).toBe(40);expect(report.reason).toBe('DEADLINE');expect(performance.now()-started).toBeGreaterThanOrEqual(119000);expect(performance.now()-started).toBeLessThan(125000);
      // Observe socket disposal BEFORE runtime.close/proxy.close can cause it.
      await waitUntil(db.admin,"NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='worker_a' AND application_name='zbm-simulation-runtime')");
      expect(proxy.openSocketCount).toBe(0);expect(performance.now()-started).toBeLessThan(125000);
      await a.close();expect(performance.now()-started).toBeLessThan(127000);
    }finally{await proxy.close();await a.close();}
  },135000);

});
