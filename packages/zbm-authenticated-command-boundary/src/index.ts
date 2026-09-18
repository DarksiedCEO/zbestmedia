import type { FastifyPluginAsync } from 'fastify';
import { snapshotConfig, type BoundaryConfig, type BoundaryDependencies } from './config';
import { createDatabase } from './database';
import { createPlugin } from './http';

export type { BoundaryConfig, BoundaryDependencies, ConnectionBinding, CredentialPolicy } from './config';
export type { ServiceAuthConfig } from '@zbest/service-auth';
/** Immutable, local service credential configuration. No listener or executable command API. */
export function createBoundary(config:BoundaryConfig,deps:BoundaryDependencies):{plugin:FastifyPluginAsync;close:()=>Promise<void>} {
  const snapshot=snapshotConfig(config,deps);
  const database=createDatabase(snapshot);
  return Object.freeze({plugin:createPlugin(snapshot,database),close:database.close});
}

export { createServiceAuthenticator, type ServiceAuthenticationContext, type ServiceAuthenticator } from './service-identity';
