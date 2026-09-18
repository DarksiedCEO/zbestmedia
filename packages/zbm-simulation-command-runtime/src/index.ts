import type { FastifyPluginAsync } from 'fastify';
import { createServiceAuthenticator, type BoundaryConfig, type BoundaryDependencies, type ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { createConnections } from './connections';
import { createPlugin } from './http';
import { createWorkers, type WorkerReport } from './worker';
import type { Scope } from './contracts';

export type { AdvanceSimulationProbeV1, AcceptedResult, ResultRequest, Scope } from './contracts';
export type { WorkerReport } from './worker';
export type { BoundaryConfig, BoundaryDependencies, ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
/** Injectable HTTP boundary and explicitly invoked finite FAKE worker. Opens no listener. */
export function createRuntime(config: BoundaryConfig, deps: BoundaryDependencies): Readonly<{
  plugin: FastifyPluginAsync;
  close: () => Promise<void>;
  worker: (binding: ConnectionBinding) => (scope: Scope) => Promise<WorkerReport>;
}> {
  const authenticator = createServiceAuthenticator(config, deps);
  const database = createConnections(config, deps);
  const workers = createWorkers(database, deps.log);
  const close = () => { workers.close(); return database.close(); };
  return Object.freeze({ plugin: createPlugin(authenticator, database, deps.log, close), close, worker: workers.worker });
}
