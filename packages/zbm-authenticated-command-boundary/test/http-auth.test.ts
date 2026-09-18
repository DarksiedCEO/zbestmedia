import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoundary } from '../src/index';
import { authenticate } from '../src/authentication';

const db = vi.hoisted(() => ({
  queries: [] as Array<{text:string; values?:unknown[]}>, releases: [] as boolean[], pools: [] as Record<string, unknown>[],
  ends: 0, connects: 0, login: 'reader_a', fail: '', code: '', rollbackFail: false,
  observation: {} as Record<string, unknown>, approval: {} as Record<string, unknown>,
  listeners: [] as Array<(...args: unknown[]) => void>
}));
vi.mock('pg', () => {
  class Pool {
    constructor(config: Record<string, unknown>) { db.pools.push(config); }
    on(_event: string, listener: (...args:unknown[]) => void) { db.listeners.push(listener); return this; }
    async connect() {
      db.connects++;
      if(db.fail === 'connect') throw Object.assign(new Error('secret SQL connection'), {code: db.code});
      return {
        on: vi.fn(), removeListener: vi.fn(),
        async query(text:string, values?:unknown[]) {
          db.queries.push({text, values});
          if ((db.fail && (['COMMIT','BEGIN'].includes(db.fail) ? (db.fail==='COMMIT' ? text==='COMMIT' : text.startsWith('BEGIN ')) : text.includes(db.fail))) || (db.rollbackFail && text === 'ROLLBACK'))
            throw Object.assign(new Error('secret SQL password-sentinel'), {code: db.code});
          if(text.includes('session_user')) return {rows:[{session_user:db.login}]};
          if(text.includes('observe_authority')) return {rows:[{observation:db.observation}]};
          if(text.includes('read_approval')) return {rows:[{approval:db.approval}]};
          return {rows:[]};
        },
        release(destroy?:boolean) { db.releases.push(Boolean(destroy)); }
      };
    }
    async end() { db.ends++; }
  }
  return { Pool, default: {Pool} };
});
const url = '/internal/simulation/authority-inspections';
const scope = {tenantId:'tenant-a', campaignId:'campaign-a'};
const payload = {kind:'SCOPE_READ', scope};
const approval = {id:'approval-a', subjectType:'CUT', subjectId:'cut-a', subjectVersion:'9007199254740993', subjectSha256:'a'.repeat(64), issuer:'EDITORIAL'};
function fixture() {
  return {
    config: {
      authConfig:{principalsByToken:new Map([['secret-token', {keyId:'svc', tenants:['tenant-a']}]])},
      policies:[{keyId:'svc', audience:'zbm-command-boundary/simulation' as const, notBefore:'2026-01-01T00:00:00Z', expiresAt:'2027-01-01T00:00:00Z', enabled:true}],
      bindings:[{keyId:'svc', tenantId:'tenant-a', principal:'principal-a', databaseLogin:'reader_a', credentialSlot:'reader'}]
    },
    deps:{connections:{reader:{host:'127.0.0.1', port:5432, user:'reader_a', password:'password-sentinel', database:'test'}}, now:()=>Date.parse('2026-06-01T00:00:00Z'), log:vi.fn()}
  };
}
const apps: ReturnType<typeof Fastify>[] = [];
async function setup(f = fixture()) {
  const boundary = createBoundary(f.config, f.deps); const app = Fastify({logger:false}); apps.push(app);
  await app.register(boundary.plugin); await app.ready(); return {app, boundary, f};
}
beforeEach(() => {
  Object.assign(db, {queries:[], releases:[], pools:[], ends:0, connects:0, login:'reader_a', fail:'', code:'', rollbackFail:false, listeners:[],
    observation:{principal:'principal-a', tenant:'tenant-a', campaign:'campaign-a', purpose:'SIMULATION', capability:'READ', bindingVersion:0},
    approval:{id:'approval-a', tenant_id:'tenant-a', campaign_id:'campaign-a', subject_type:'CUT', subject_id:'cut-a', subject_version:'9007199254740993', subject_hash:'a'.repeat(64), issuer:'EDITORIAL', actor:'editor', custodial_login:'editor_login', valid_from:'2026-01-01T00:00:00+00:00', expires_at:'2027-01-01T00:00:00+00:00', status:'ACTIVE', version:0, changed_at:null, successor_id:null}});
});
afterEach(async () => { vi.unstubAllEnvs(); for(const app of apps.splice(0)) await app.close(); });
describe('HTTP authentication and strict request boundary', () => {
  it.each([undefined, 'Bearer unknown-token', 'Basic secret-token', 'Bearer secret-token extra', 'Bearer secret-token,secret-token', 'Bearer  secret-token', 'Bearer\tsecret-token'])('rejects %s before malformed JSON and database checkout', async authorization => {
    const {app} = await setup();
    const response = await app.inject({method:'POST', url, headers:{...(authorization ? {authorization}:{}), 'content-type':'application/json'}, payload:'{'});
    expect(response.statusCode).toBe(401); expect(response.headers['cache-control']).toBe('no-store'); expect(db.connects).toBe(0);
  });
  it('rejects duplicate raw occurrences and arrays even if a normalized header looks valid', () => {
    const f = fixture();
    for(const raw of [['Authorization','Bearer secret-token','authorization','Bearer secret-token'], ['authorization','Bearer secret-token']]) {
      expect(() => authenticate(['Bearer secret-token'], raw, f.config.authConfig, f.config.policies, f.deps.now())).toThrow();
    }
    expect(() => authenticate('Bearer secret-token', ['Authorization','Bearer secret-token','authorization','Bearer other-token'], f.config.authConfig, f.config.policies, f.deps.now())).toThrow();
  });
  it('rejects duplicate injected headers', async () => {
    const {app} = await setup(); const r=await app.inject({method:'POST', url, headers:{authorization:['Bearer secret-token','Bearer secret-token'] as unknown as string}, payload});
    expect(r.statusCode).toBe(401); expect(db.connects).toBe(0);
  });
  it.each([
    ['disabled', false, '2026-06-01T00:00:00Z', 401],
    ['before notBefore', true, '2025-12-31T23:59:59.999Z', 401],
    ['exact notBefore', true, '2026-01-01T00:00:00Z', 200],
    ['before expiresAt', true, '2026-12-31T23:59:59.999Z', 200],
    ['exact expiresAt', true, '2027-01-01T00:00:00Z', 401]
  ] as const)('%s obeys local policy lifetime', async (_label, enabled, time, status) => {
    const f=fixture(); f.config.policies[0].enabled=enabled; f.deps.now=()=>Date.parse(time);
    const {app}=await setup(f); const r=await app.inject({method:'POST', url, headers:{authorization:'Bearer secret-token'}, payload});
    expect(r.statusCode).toBe(status); if(status===401) expect(db.connects).toBe(0);
  });
  it('rejects wrong audience when authenticating local metadata', () => {
    const f=fixture(); Object.assign(f.config.policies[0], {audience:'wrong'});
    expect(() => authenticate('Bearer secret-token', ['authorization','Bearer secret-token'], f.config.authConfig, f.config.policies, f.deps.now())).toThrow();
  });
  it.each([
    {...payload, actor:'admin'}, {...payload, capability:'AUDIT'}, {...payload, audit:true}, {...payload, grants:[]},
    {...payload, scope:{...scope, role:'owner'}}, {...payload, kind:'COMMAND'},
    {kind:'APPROVAL_READ', scope, approval:{...approval, issuer:'FINANCE'}},
    {kind:'APPROVAL_READ', scope, approval:{...approval, actor:'editor'}},
    {kind:'APPROVAL_READ', scope, approval:{...approval, subjectSha256:'A'.repeat(64)}},
    {...payload, scope:{...scope, campaignId:''}}, {...payload, scope:{...scope, tenantId:'*'}},
    {kind:'APPROVAL_READ', scope, approval:{...approval, subjectVersion:9007199254740992}}
  ])('rejects caller-controlled or malformed fields %#', async body => {
    const {app}=await setup(); const r=await app.inject({method:'POST', url, headers:{authorization:'Bearer secret-token'}, payload:body});
    expect(r.statusCode).toBe(400); expect(db.connects).toBe(0); expect(r.headers['cache-control']).toBe('no-store');
  });
  it.each(['tenantId','campaignId','id','subjectType','subjectId','subjectVersion'].flatMap(field =>
    ['\0bad','bad\0value','bad\0'].map(value => ({field,value}))
  ))('rejects NUL in $field ($value) before database acquisition', async ({field,value}) => {
    const body = field === 'tenantId' || field === 'campaignId'
      ? {...payload, scope:{...scope,[field]:value}}
      : {kind:'APPROVAL_READ',scope,approval:{...approval,[field]:value}};
    const {app,f}=await setup();
    const response=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload:body});
    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({error:'BAD_REQUEST',requestId:expect.any(String)});
    expect(db.connects).toBe(0); expect(db.queries).toEqual([]);
    expect(f.deps.log).toHaveBeenCalledTimes(1);
    const requestId = response.json().requestId;
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const event = f.deps.log.mock.calls[0][0];
    expect(event).toEqual({
      requestId,
      decision: 'invalid',
      keyId: 'svc',
      latencyMs: expect.any(Number)
    });
    expect(Number.isFinite(event.latencyMs)).toBe(true);
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it.each([['text/plain', JSON.stringify(payload)], ['application/json', '{'], ['application/json', JSON.stringify({...payload, padding:'x'.repeat(16384)})]])('rejects unsupported/malformed/oversized body %#', async (contentType, body) => {
    const {app}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token','content-type':contentType},payload:body});
    expect(r.statusCode).toBe(400); expect(db.connects).toBe(0); expect(r.headers['cache-control']).toBe('no-store');
  });
  it('denies service tenant mismatch with generic 403 before DB', async () => {
    const {app}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload:{...payload, scope:{...scope,tenantId:'tenant-b'}}});
    expect(r.statusCode).toBe(403); expect(db.connects).toBe(0); expect(r.body).not.toContain('tenant-b');
  });
  it('snapshots mutable identity, policy, mapping, credentials and dependencies', async () => {
    const f=fixture(); const {app}=await setup(f);
    f.config.authConfig.principalsByToken.clear(); f.config.policies[0].enabled=false; f.config.bindings[0].principal='evil';
    f.deps.connections.reader.password='evil'; f.deps.connections.reader.user='owner'; f.deps.now=()=>0;
    const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload});
    expect(r.statusCode).toBe(200); expect(db.pools[0].user).toBe('reader_a'); expect(db.pools[0].password).toBe('password-sentinel');
  });
  it('registers no command execution route', async () => {
    const {app}=await setup(); expect((await app.inject({method:'POST',url:'/commands',payload})).statusCode).toBe(404);
    expect(db.connects).toBe(0);
  });
});
describe('fixed transaction and failure cleanup', () => {
  it('returns only OBSERVED_ONLY after a bounded READ COMMITTED transaction', async () => {
    const {app,f}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token','x-request-id':'attacker'},payload});
    expect(r.statusCode).toBe(200); expect(r.json()).toEqual({status:'OBSERVED_ONLY',execution:'DISABLED',kind:'SCOPE_READ',requestId:expect.any(String)});
    expect(r.json().requestId).not.toBe('attacker');
    expect(db.pools[0]).toMatchObject({max:2,connectionTimeoutMillis:2000,statement_timeout:5000,idle_in_transaction_session_timeout:5000});
    const texts=db.queries.map(q=>q.text);
    expect(texts[0]).toContain('session_user'); expect(texts[1]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(texts).toContain("SET LOCAL statement_timeout = '5s'"); expect(texts).toContain("SET LOCAL lock_timeout = '2s'");
    expect(texts).toContain("SET LOCAL idle_in_transaction_session_timeout = '5s'"); expect(texts.at(-1)).toBe('COMMIT');
    expect(db.queries.find(q=>q.text.includes('observe_authority'))?.values).toEqual(['tenant-a','campaign-a','SIMULATION','READ']);
    expect(db.releases).toEqual([false]); expect(f.deps.log).toHaveBeenCalledWith(expect.objectContaining({decision:'observed',operation:'SCOPE_READ',keyId:'svc'}));
  });
  it('parameterizes exact approval tuple and preserves string subject versions', async () => {
    const {app}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload:{kind:'APPROVAL_READ',scope,approval}});
    expect(r.statusCode).toBe(200);
    expect(db.queries.find(q=>q.text.includes('read_approval'))?.values).toEqual(['tenant-a','campaign-a','SIMULATION','approval-a','CUT','cut-a','9007199254740993','a'.repeat(64),'EDITORIAL']);
    expect(r.body).not.toContain('custodial_login');
  });
  it.each(['principal','tenant','campaign','purpose','capability','bindingVersion'])('destroys mismatched observed %s', async field => {
    db.observation[field]='wrong'; const {app}=await setup();
    const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload});
    expect(r.statusCode).toBe(500); expect(db.releases).toEqual([true]); expect(db.queries.some(q=>q.text==='COMMIT')).toBe(false);
  });
  it('destroys wrong session_user before transaction', async () => {
    db.login='owner'; const {app}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload});
    expect(r.statusCode).toBe(500); expect(db.releases).toEqual([true]); expect(db.queries).toHaveLength(1);
  });
  it.each(['id','tenant_id','campaign_id','subject_type','subject_id','subject_version','subject_hash','issuer','status','version','valid_from','changed_at','successor_id'])('rejects malformed/mismatched approval %s', async field => {
    db.approval[field]='wrong'; const {app}=await setup(); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload:{kind:'APPROVAL_READ',scope,approval}});
    expect(r.statusCode).toBe(500); expect(db.queries.some(q=>q.text==='COMMIT')).toBe(false);
  });
  it.each([
    ['observe_authority','42501',false,403,false], ['observe_authority','55P03',false,503,false],
    ['observe_authority','40P01',false,503,false], ['observe_authority','57014',false,503,false],
    ['observe_authority','08006',false,503,true], ['observe_authority','XX000',false,500,false],
    ['observe_authority','42501',true,503,true], ['COMMIT','40001',false,503,true],
    ['COMMIT','',false,503,true], ['BEGIN','08006',false,503,true], ['connect','ECONNREFUSED',false,503,undefined]
  ] as const)('sanitizes %s/%s and cleans up', async (fail,code,rollbackFail,status,destroy) => {
    Object.assign(db,{fail,code,rollbackFail}); const {app,f}=await setup();
    const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload});
    expect(r.statusCode).toBe(status); expect(r.headers['cache-control']).toBe('no-store');
    expect(db.connects).toBe(1); expect(db.releases).toEqual(destroy===undefined?[]:[destroy]);
    expect(r.body+JSON.stringify(f.deps.log.mock.calls)).not.toMatch(/secret|password|SQL|reader_a/);
    expect(r.body).not.toContain('OBSERVED_ONLY');
  });
  it('handles idle pool errors and closes owned pools exactly once', async () => {
    const {app,boundary}=await setup(); expect(db.listeners.length).toBeGreaterThan(0);
    expect(()=>db.listeners[0](new Error('secret SQL password-sentinel'))).not.toThrow();
    await app.close(); await boundary.close(); expect(db.ends).toBe(1);
  });
  it('does not let throwing log callback change a committed observation', async () => {
    const f=fixture(); f.deps.log.mockImplementation(()=>{throw new Error('logger failure');});
    const {app}=await setup(f); expect((await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload})).statusCode).toBe(200);
  });
});

it.each([NaN,Infinity,-Infinity])('nonfinite credential clock %s fails closed', async now => {
  const f=fixture(); f.deps.now=()=>now;
  const {app}=await setup(f); const r=await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload});
  expect(r.statusCode).toBe(401); expect(db.connects).toBe(0);
});
it('neutralizes ambient pg options, TLS and application name using actual pg parsing', async () => {
  vi.stubEnv('PGOPTIONS','-c role=owner'); vi.stubEnv('PGSSLMODE','require'); vi.stubEnv('PGAPPNAME','secret-sentinel');
  vi.stubEnv('PGUSER','owner'); vi.stubEnv('PGPASSWORD','other-secret'); vi.stubEnv('PGDATABASE','foreign');
  const {app}=await setup();
  const actual=await vi.importActual<typeof import('pg')>('pg');
  const client=new actual.Client(db.pools[0]);
  const parameters=(client as unknown as {connectionParameters:Record<string,unknown>}).connectionParameters;
  expect(parameters.options).toBe('-c search_path=pg_catalog'); expect(parameters.ssl).toBe(false);
  expect(parameters.application_name).toBe('zbm-authority-inspection'); expect(parameters.user).toBe('reader_a');
  expect(parameters.password).toBe('password-sentinel'); expect(parameters.database).toBe('test');
  db.login='owner';
  expect((await app.inject({method:'POST',url,headers:{authorization:'Bearer secret-token'},payload})).statusCode).toBe(500);
  expect(db.releases).toEqual([true]);
});
