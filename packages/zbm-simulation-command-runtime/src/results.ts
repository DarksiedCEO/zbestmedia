import type { ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { acceptedResultSchema, parseRequest, resultRequestSchema, type AcceptedResult } from './contracts';
import type { Connections } from './connections';

export async function readResult(database: Connections, binding: ConnectionBinding, input: unknown): Promise<AcceptedResult> {
  const request = parseRequest(resultRequestSchema, input);
  return database.call(binding, request.scope, 'result',
    [request.scope.tenantId, request.scope.campaignId, request.idempotencyKey], acceptedResultSchema);
}
