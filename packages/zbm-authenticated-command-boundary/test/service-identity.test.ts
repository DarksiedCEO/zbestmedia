import { beforeAll, afterAll, expect, test } from 'vitest';
import { createServiceAuthenticator, type ServiceAuthenticationContext } from '../src/index';
import { BoundaryError } from '../src/requests';
import { Database, tokenA, tokenB, S } from './helpers/postgres';

const db = new Database();
beforeAll(async () => { await db.start(); });
afterAll(async () => { await db.stop(); });
function fixture() {
  let time = Date.parse('2026-09-16T00:00:00Z');
  const config = db.configuration();
  const deps = {connections:{a:db.credentials('reader_a'),b:db.credentials('reader_b')},now:()=>time};
  return {config,deps,advance:(next:number)=>{time=next;}};
}
const headers = (token = tokenA) => ['Authorization',`Bearer ${token}`];
function status(action: () => unknown, code: number) {
  try { action(); throw new Error('Expected denial'); } catch (error) {
    expect(error).toBeInstanceOf(BoundaryError); expect(error).toMatchObject({statusCode:code});
    expect(String(error)).not.toMatch(/fixture-token|password|reader_a/);
  }
}

test('opaque mapping is immutable and corresponds to real restricted PostgreSQL session, not execution authority', async () => {
  const {config,deps}=fixture(); const auth=createServiceAuthenticator(config,deps);
  expect(Object.keys(auth).sort()).toEqual(['authenticateHeaders','resolveTenant']);
  const context=auth.authenticateHeaders(`Bearer ${tokenA}`,headers());
  expect(Object.keys(context)).toEqual([]); expect(JSON.stringify(context)).toBe('{}'); expect(Object.isFrozen(context)).toBe(true);
  const binding=auth.resolveTenant(context,'tenant-a'); expect(binding).toEqual(config.bindings[0]); expect(Object.isFrozen(binding)).toBe(true);
  expect(Object.keys(binding).sort()).toEqual(['credentialSlot','databaseLogin','keyId','principal','tenantId']);
  const client=await db.connect(binding.databaseLogin);
  expect((await client.query('SELECT session_user')).rows[0].session_user).toBe(binding.databaseLogin);
  const observed=(await client.query(`SELECT ${S}.observe_authority($1,$2,'SIMULATION','READ') AS result`,[binding.tenantId,'campaign-a'])).rows[0].result;
  expect(observed.principal).toBe(binding.principal);
  await expect(client.query(`SELECT ${S}.authorize_simulation_transition($1,$2,'COMMAND',session_user::text,'probe','0',$3,ARRAY['approval'])`,[binding.tenantId,'campaign-a','a'.repeat(64)])).rejects.toMatchObject({code:'42501'});
});
test.each([
  ['missing',undefined,[]], ['array',[`Bearer ${tokenA}`],headers()],
  ['duplicate',`Bearer ${tokenA}`,[...headers(),'authorization',`Bearer ${tokenA}`]],
  ['comma',`Bearer ${tokenA}, Bearer ${tokenB}`,headers()], ['unknown','Bearer missing-token',headers()],
  ['space',`Bearer  ${tokenA}`,headers()], ['trailing',`Bearer ${tokenA} `,headers()], ['wrong scheme',`Basic ${tokenA}`,headers()],
  ['no raw header',`Bearer ${tokenA}`,['Content-Type','application/json']]
] as const)('rejects ambiguous or invalid %s headers', (_label,header,raw) => {
  const {config,deps}=fixture(); const auth=createServiceAuthenticator(config,deps);
  status(()=>auth.authenticateHeaders(Array.isArray(header)?[...header]:header as string|undefined,raw),401);
});
test('case-insensitive Bearer and header name retain tenant isolation', () => {
  const {config,deps}=fixture(); const auth=createServiceAuthenticator(config,deps);
  const a=auth.authenticateHeaders(`bEaReR ${tokenA}`,['aUtHoRiZaTiOn',`bEaReR ${tokenA}`]);
  expect(auth.resolveTenant(a,'tenant-a').principal).toBe('reader_a');
  for (const tenant of ['tenant-b','*','','tenant-a\0']) status(()=>auth.resolveTenant(a,tenant),403);
  const b=auth.authenticateHeaders(`Bearer ${tokenB}`,headers(tokenB));
  expect(auth.resolveTenant(b,'tenant-b').principal).toBe('reader_b');
});
test('forged, cloned, prototype-derived and other-instance contexts cannot resolve', () => {
  const {config,deps}=fixture(); const a=createServiceAuthenticator(config,deps), b=createServiceAuthenticator(config,deps);
  const context=a.authenticateHeaders(`Bearer ${tokenA}`,headers());
  for (const fake of [{},{...context},Object.create(context),null,undefined,'context']) status(()=>a.resolveTenant(fake as ServiceAuthenticationContext,'tenant-a'),401);
  status(()=>b.resolveTenant(context,'tenant-a'),401);
});
test('configuration mutation cannot change existing identity, policy, mapping or connection', () => {
  const {config,deps}=fixture(); const auth=createServiceAuthenticator(config,deps);
  const context=auth.authenticateHeaders(`Bearer ${tokenA}`,headers());
  config.authConfig.principalsByToken.get(tokenA)!.tenants.push('tenant-b'); config.authConfig.principalsByToken.clear();
  config.policies[0].enabled=false; config.bindings[0].principal='spoof'; deps.connections.a.user='postgres';
  expect(auth.resolveTenant(context,'tenant-a').principal).toBe('reader_a');
  status(()=>auth.resolveTenant(context,'tenant-b'),403);
  expect(auth.resolveTenant(auth.authenticateHeaders(`Bearer ${tokenA}`,headers()),'tenant-a').databaseLogin).toBe('reader_a');
});
test.each(['expiry','future','nonfinite'])('rechecks current local policy at tenant resolution: %s', kind => {
  const f=fixture(); const auth=createServiceAuthenticator(f.config,f.deps);
  const context=auth.authenticateHeaders(`Bearer ${tokenA}`,headers());
  f.advance(kind==='expiry'?Date.parse(f.config.policies[0].expiresAt):kind==='future'?Date.parse(f.config.policies[0].notBefore)-1:NaN);
  status(()=>auth.resolveTenant(context,'tenant-a'),401);
  status(()=>auth.authenticateHeaders(`Bearer ${tokenA}`,headers()),401);
});
test('disabled protected policy cannot authenticate', () => {
  const {config,deps}=fixture(); config.policies[0].enabled=false; const auth=createServiceAuthenticator(config,deps);
  status(()=>auth.authenticateHeaders(`Bearer ${tokenA}`,headers()),401);
});
test('seam shares strict startup validation including no connection environment fallback', () => {
  const {config,deps}=fixture(); delete deps.connections.a.host;
  expect(()=>createServiceAuthenticator(config,deps)).toThrow('Invalid boundary configuration');
});
