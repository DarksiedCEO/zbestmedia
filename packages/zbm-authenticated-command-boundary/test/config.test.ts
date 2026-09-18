import { describe, expect, it } from 'vitest';
import { createBoundary } from '../src/index';

function fixture() {
  return {
    config: {
      authConfig: { principalsByToken: new Map([['secret-token', { keyId: 'svc', tenants: ['tenant-a'] }]]) },
      policies: [{ keyId: 'svc', audience: 'zbm-command-boundary/simulation' as const, notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', enabled: true }],
      bindings: [{ keyId: 'svc', tenantId: 'tenant-a', principal: 'principal-a', databaseLogin: 'reader_a', credentialSlot: 'reader' }]
    },
    deps: { connections: { reader: { host: '127.0.0.1', port: 5432, user: 'reader_a', password: 'password-sentinel', database: 'test' } } }
  };
}
describe('protected startup configuration', () => {
  it('exposes only plugin and idempotent close', async () => {
    const {config, deps} = fixture(); const boundary = createBoundary(config, deps);
    expect(Object.keys(boundary).sort()).toEqual(['close', 'plugin']);
    expect(typeof boundary.plugin).toBe('function'); await boundary.close(); await boundary.close();
  });
  const invalid: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ['duplicate key IDs', f => f.config.authConfig.principalsByToken.set('another-token', {keyId:'svc', tenants:['tenant-a']})],
    ['wildcard tenant', f => f.config.authConfig.principalsByToken.get('secret-token')!.tenants.push('*')],
    ['duplicate tenant', f => f.config.authConfig.principalsByToken.get('secret-token')!.tenants.push('tenant-a')],
    ['missing mapping', f => { f.config.bindings = []; }],
    ['duplicate mapping', f => f.config.bindings.push({...f.config.bindings[0]})],
    ['extra tenant mapping', f => f.config.bindings.push({...f.config.bindings[0], tenantId:'tenant-b'})],
    ['missing policy', f => { f.config.policies = []; }],
    ['duplicate policy', f => f.config.policies.push({...f.config.policies[0]})],
    ['unknown policy', f => f.config.policies.push({...f.config.policies[0], keyId:'unknown'})],
    ['bad interval', f => { f.config.policies[0].expiresAt = f.config.policies[0].notBefore; }],
    ['invalid time', f => { f.config.policies[0].notBefore = 'yesterday'; }],
    ['wrong audience', f => { Object.assign(f.config.policies[0], {audience:'other'}); }],
    ['missing slot', f => { f.config.bindings[0].credentialSlot = 'missing'; }],
    ['wrong connection user', f => { f.deps.connections.reader.user = 'owner'; }],
    ['missing explicit host', f => { Object.assign(f.deps.connections.reader, {host:undefined}); }],
    ['connection string', f => { Object.assign(f.deps.connections.reader, {connectionString:'secret-sentinel'}); }],
    ['SSL ambiguity', f => { Object.assign(f.deps.connections.reader, {ssl:true}); }],
    ['query timeout', f => { Object.assign(f.deps.connections.reader, {query_timeout:100}); }],
    ['PG options injection', f => { Object.assign(f.deps.connections.reader, {options:'-c role=owner'}); }],
    ['unknown config key', f => { Object.assign(f.config, {actor:'admin'}); }],
    ['unknown binding key', f => { Object.assign(f.config.bindings[0], {role:'owner'}); }],
    ['unknown identity key', f => { Object.assign(f.config.authConfig.principalsByToken.get('secret-token')!, {actor:'admin'}); }],
    ['reused login for another identity', f => {
      f.config.authConfig.principalsByToken.set('other-token', {keyId:'other', tenants:['tenant-a']});
      f.config.policies.push({...f.config.policies[0], keyId:'other'});
      f.config.bindings.push({...f.config.bindings[0], keyId:'other', principal:'principal-b'});
    }],
    ['reused principal for another identity', f => {
      f.config.authConfig.principalsByToken.set('other-token', {keyId:'other', tenants:['tenant-a']});
      f.config.policies.push({...f.config.policies[0], keyId:'other'});
      Object.assign(f.deps.connections, {other:{...f.deps.connections.reader, user:'reader_b'}});
      f.config.bindings.push({...f.config.bindings[0], keyId:'other', databaseLogin:'reader_b', credentialSlot:'other'});
    }],
    ['more than sixteen pools', f => {
      for(let i=1;i<=16;i++) {
        const keyId = `svc${i}`, tenantId = `tenant-${i}`, user = `reader_${i}`;
        f.config.authConfig.principalsByToken.set(`token-secret-${i}`, {keyId, tenants:[tenantId]});
        f.config.policies.push({...f.config.policies[0], keyId});
        f.config.bindings.push({keyId, tenantId, principal:`principal-${i}`, databaseLogin:user, credentialSlot:user});
        Object.assign(f.deps.connections, {[user]:{...f.deps.connections.reader, user}});
      }
    }]
  ];
  it.each(invalid)('rejects %s with sanitized startup error', (_name, mutate) => {
    const f = fixture(); mutate(f);
    expect(() => createBoundary(f.config, f.deps)).toThrow('Invalid boundary configuration');
    try { createBoundary(f.config, f.deps); } catch (e) { expect(String(e)).not.toMatch(/secret|password|owner|reader_a/); }
  });
});
