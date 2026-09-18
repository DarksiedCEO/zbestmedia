import {Writable} from 'node:stream';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {Database,command,route,resultRoute,token,waitUntil} from './helpers/postgres';
import {CommitProxy} from './helpers/commit-proxy';

describe('D02/D03/D24 authenticated injection boundary',()=>{
  const db=new Database();beforeAll(()=>db.start());afterAll(()=>db.stop());beforeEach(()=>db.reset());
  it.each([undefined,'Basic abc',`Bearer ${token}, Bearer ${token}`,'Bearer bad-token','Bearer  '+token])('D02 unambiguous authentication precedes malformed body: %s',async authorization=>{
    const a=await db.application();try{
      const r=await a.app.inject({method:'POST',url:route,headers:{'content-type':'application/json',...(authorization?{authorization}:{})},payload:'{broken'});
      expect(r.statusCode).toBe(401);expect(r.headers['cache-control']).toBe('no-store');expect(await db.counts()).toMatchObject({commands:0,accepted:0});
    }finally{await a.close();}
  });
  it('D02 expired policy rechecks at each call using current clock',async()=>{
    let now=Date.parse('2026-01-01T00:00:00Z');const cfg=db.configuration();cfg.policies[0]={...cfg.policies[0],expiresAt:'2026-01-02T00:00:00Z'};
    const a=await db.application('executor_a',{config:cfg,deps:{now:()=>now}});try{
      expect((await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()})).statusCode).toBe(202);
      now=Date.parse('2026-01-03T00:00:00Z');expect((await a.app.inject({method:'POST',url:resultRoute,headers:{authorization:`Bearer ${token}`},payload:{scope:command().scope,idempotencyKey:'key-a'}})).statusCode).toBe(401);
    }finally{await a.close();}
  });
  it.each(['reader_a','auditor_a','unbound'])('D02 %s transport membership does not grant execute authority',async login=>{
    const a=await db.application(login);try{const r=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});expect(r.statusCode).toBe(403);expect(await db.counts()).toMatchObject({commands:0,accepted:0});}finally{await a.close();}
  });
  it('D02 token tenant membership and protected database principal must both match',async()=>{
    const a=await db.application('executor_a',{principal:'forged'});try{const r=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});expect(r.statusCode).toBe(403);}finally{await a.close();}
    const b=await db.application();try{const r=await b.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command({scope:{tenantId:'tenant-b',campaignId:'campaign-c'}})});expect(r.statusCode).toBe(403);}finally{await b.close();}
  });
  it('D02 real session_user mismatch destroys checked-out backend rather than pooling it',async()=>{
    const proxy=new CommitProxy(db.credentials('executor_a'),'executor_other'),connections=await proxy.start();const a=await db.application('executor_a',{connections});
    try {
      const r=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});expect(r.statusCode).toBe(403);
      await waitUntil(db.admin,"NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='executor_other')");expect(await db.counts()).toMatchObject({commands:0});
    }finally{await a.close();await proxy.close();}
  });
  it('D02 enabled parent logger and explicit sink receive no request, token, password, SQL or approval',async()=>{
    const output:string[]=[],events:Readonly<Record<string,unknown>>[]=[];
    const stream=new Writable({write(chunk,_encoding,done){output.push(String(chunk));done();}});
    const a=await db.application('executor_a',{fastify:{logger:{level:'trace',stream}},deps:{log:event=>{events.push(event);}}});
    try{
      await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:command()});
      await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:{...command(),provider:'SECRET-PROVIDER'}});
      expect(events.length).toBeGreaterThan(0);for(const event of events)expect(Object.keys(event).sort()).toEqual(['category','durationMs','requestId']);
      const logs=JSON.stringify({output,events});for(const secret of [token,String(db.credentials('executor_a').password),'approval-a','SECRET-PROVIDER','SELECT','idempotencyKey'])expect(logs).not.toContain(secret);
    }finally{await a.close();}
  });
  it.each([{provider:'https://provider.invalid'},{amount:100},{completion:'PUBLICATION'},{environment:'LIVE'},{credentialSlot:'admin'},{probeId:'bad\0id'},{idempotencyKey:'x'.repeat(129)},{nextPayloadSha256:'A'.repeat(64)}])('D03/D24 rejects forbidden input before connecting %j',async change=>{
    const before=Number((await db.admin.query("SELECT count(*) FROM pg_stat_activity WHERE usename='executor_a'")).rows[0].count);
    const a=await db.application();try{const r=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:{...command(),...change}});expect(r.statusCode).toBe(400);expect(Number((await db.admin.query("SELECT count(*) FROM pg_stat_activity WHERE usename='executor_a'")).rows[0].count)).toBe(before);}finally{await a.close();}
  });
  it('D03 body over 16KiB fails before SQL',async()=>{
    const a=await db.application();try{const r=await a.app.inject({method:'POST',url:route,headers:{authorization:`Bearer ${token}`},payload:{...command(),extra:'x'.repeat(17000)}});expect(r.statusCode).toBe(400);expect(await db.counts()).toMatchObject({commands:0});}finally{await a.close();}
  });
});
