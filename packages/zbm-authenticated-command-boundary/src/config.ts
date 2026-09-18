import { z } from 'zod';
import { tenantIdSchema, type ServiceAuthConfig, type ServiceIdentity } from '@zbest/service-auth';
import type { PoolConfig } from 'pg';

export type CredentialPolicy = Readonly<{
  keyId: string;
  audience: 'zbm-command-boundary/simulation';
  notBefore: string;
  expiresAt: string;
  enabled: boolean;
}>;
export type ConnectionBinding = Readonly<{
  keyId: string; tenantId: string; principal: string; databaseLogin: string; credentialSlot: string;
}>;
export type BoundaryConfig = {
  authConfig: ServiceAuthConfig; policies: CredentialPolicy[]; bindings: ConnectionBinding[];
};
export type BoundaryDependencies = {
  connections: Record<string, PoolConfig>;
  now?: () => number;
  log?: (event: Readonly<Record<string, unknown>>) => void;
};
const identifier = z.string().min(1).max(160).refine(v => v.trim().length > 0 && !v.includes('\0'));
const policySchema = z.object({
  keyId: identifier, audience: z.literal('zbm-command-boundary/simulation'),
  notBefore: z.string().datetime({offset:true}), expiresAt: z.string().datetime({offset:true}), enabled: z.boolean()
}).strict().refine(p => Date.parse(p.notBefore) < Date.parse(p.expiresAt));
const bindingSchema = z.object({
  keyId: identifier, tenantId: tenantIdSchema, principal: identifier,
  databaseLogin: z.string().min(1).max(63).refine(v => !v.includes('\0')),
  credentialSlot: identifier
}).strict();
const identitySchema = z.object({keyId:identifier, tenants:z.array(tenantIdSchema).min(1), description:z.string().optional()}).strict();
// Require every connection input explicitly: pg must not silently use PG* environment credentials.
// SSL/connection strings/options/hooks/custom streams/type parsers are deliberately unsupported.
const connectionSchema = z.object({
  host:z.string().min(1).refine(v=>!v.includes('\0')), port:z.number().int().min(1).max(65535),
  user:z.string().min(1), password:z.string().min(1), database:z.string().min(1)
}).strict();
type SafeConnection = Readonly<z.infer<typeof connectionSchema>>;
export type Snapshot = Readonly<{
  authConfig: ServiceAuthConfig;
  policies: readonly CredentialPolicy[];
  bindings: readonly ConnectionBinding[];
  connections: ReadonlyMap<string, SafeConnection>;
  now: () => number;
  log?: BoundaryDependencies['log'];
}>;

export function snapshotConfig(config: BoundaryConfig, deps: BoundaryDependencies): Snapshot {
  try {
    const parsed = z.object({
      authConfig:z.object({principalsByToken:z.instanceof(Map)}).strict(),
      policies:z.array(policySchema).min(1).max(16), bindings:z.array(bindingSchema).min(1).max(16)
    }).strict().parse(config);
    z.object({connections:z.record(z.unknown()), now:z.function().optional(), log:z.function().optional()}).strict().parse(deps);
    const principalsByToken = new Map<string, ServiceIdentity>();
    const identities = new Map<string, ServiceIdentity>();
    for(const [token, raw] of parsed.authConfig.principalsByToken) {
      // The boundary's unambiguous Bearer grammar must be able to represent every configured token.
      if(typeof token !== 'string' || !/^[A-Za-z0-9._~+/-]{8,}=*$/.test(token)) throw new Error();
      const identity = identitySchema.parse(raw);
      if(identities.has(identity.keyId) || new Set(identity.tenants).size !== identity.tenants.length) throw new Error();
      Object.freeze(identity.tenants); Object.freeze(identity);
      principalsByToken.set(token, identity); identities.set(identity.keyId, identity);
    }
    if(!identities.size || identities.size > 16) throw new Error();
    const policyIds = new Set<string>();
    for(const policy of parsed.policies) {
      if(!identities.has(policy.keyId) || policyIds.has(policy.keyId)) throw new Error();
      policyIds.add(policy.keyId); Object.freeze(policy);
    }
    if(policyIds.size !== identities.size) throw new Error();
    const pairs = new Set<string>(), logins = new Set<string>(), slots = new Set<string>(), principals = new Set<string>();
    const connections = new Map<string, SafeConnection>();
    for(const binding of parsed.bindings) {
      const identity = identities.get(binding.keyId);
      const pair = JSON.stringify([binding.keyId,binding.tenantId]);
      const principal = JSON.stringify([binding.tenantId,binding.principal]);
      if(!identity?.tenants.includes(binding.tenantId) || pairs.has(pair) || logins.has(binding.databaseLogin) || slots.has(binding.credentialSlot) || principals.has(principal)) throw new Error();
      if(!Object.prototype.hasOwnProperty.call(deps.connections, binding.credentialSlot)) throw new Error();
      const connection = connectionSchema.parse(deps.connections[binding.credentialSlot]);
      if(connection.user !== binding.databaseLogin) throw new Error();
      pairs.add(pair); logins.add(binding.databaseLogin); slots.add(binding.credentialSlot); principals.add(principal);
      connections.set(binding.credentialSlot,Object.freeze(connection)); Object.freeze(binding);
    }
    for(const identity of identities.values()) for(const tenant of identity.tenants) {
      if(!pairs.has(JSON.stringify([identity.keyId,tenant]))) throw new Error();
    }
    if(Object.keys(deps.connections).some(slot=>!slots.has(slot))) throw new Error();
    // Maps never leave the closure through the public setup API. freeze alone would not protect Map.set.
    return Object.freeze({authConfig:Object.freeze({principalsByToken}), policies:Object.freeze(parsed.policies),
      bindings:Object.freeze(parsed.bindings), connections, now:deps.now ?? Date.now, log:deps.log});
  } catch {
    // No Zod inputs, credentials, key IDs, database names or raw errors escape startup.
    throw new Error('Invalid boundary configuration');
  }
}
