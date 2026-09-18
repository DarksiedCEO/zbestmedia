import { authorizeTenant, type ServiceIdentity } from '@zbest/service-auth';
import { authenticate } from './authentication';
import { snapshotConfig, type BoundaryConfig, type BoundaryDependencies, type ConnectionBinding } from './config';
import { BoundaryError } from './requests';

declare const contextBrand: unique symbol;
/** Opaque, instance-owned identity context. It conveys no database authority. */
export type ServiceAuthenticationContext = Readonly<{ [contextBrand]: true }>;
export type ServiceAuthenticator = Readonly<{
  authenticateHeaders(header: string | string[] | undefined, rawHeaders: readonly string[]): ServiceAuthenticationContext;
  resolveTenant(context: ServiceAuthenticationContext, tenantId: string): ConnectionBinding;
}>;

/** Server-only routing seam; opens no pools and exposes no bearer or connection secrets. */
export function createServiceAuthenticator(config: BoundaryConfig, deps: BoundaryDependencies): ServiceAuthenticator {
  const snapshot = snapshotConfig(config, deps);
  const contexts = new WeakMap<ServiceAuthenticationContext, ServiceIdentity>();
  return Object.freeze({
    authenticateHeaders(header: string | string[] | undefined, rawHeaders: readonly string[]) {
      const identity = authenticate(header, rawHeaders, snapshot.authConfig, snapshot.policies, snapshot.now());
      const context = Object.freeze(Object.create(null)) as ServiceAuthenticationContext;
      contexts.set(context, identity);
      return context;
    },
    resolveTenant(context: ServiceAuthenticationContext, tenantId: string) {
      const identity = contexts.get(context);
      if (!identity) throw new BoundaryError(401);
      const policy = snapshot.policies.find(p => p.keyId === identity.keyId);
      const now = snapshot.now();
      if (!policy || !policy.enabled || policy.audience !== 'zbm-command-boundary/simulation' || !Number.isFinite(now)
        || !(Date.parse(policy.notBefore) <= now && now < Date.parse(policy.expiresAt))) throw new BoundaryError(401);
      try { authorizeTenant(identity, tenantId); } catch { throw new BoundaryError(403); }
      const binding = snapshot.bindings.find(b => b.keyId === identity.keyId && b.tenantId === tenantId);
      if (!binding) throw new BoundaryError(403);
      return binding;
    }
  });
}
