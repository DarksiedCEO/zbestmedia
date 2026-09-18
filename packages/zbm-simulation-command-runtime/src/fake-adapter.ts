import { z } from 'zod';
import type { ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import type { Connections } from './connections';
import { RuntimeError, type Scope, versionSchema } from './contracts';

export const claimSchema = z.object({
  operationId: z.string().uuid(), epoch: versionSchema.refine(value => value !== '0'), token: z.string().uuid(),
  kind: z.enum(['DISPATCH', 'RECONCILE']), dispatchNumber: z.number().int().min(1).max(3),
  leaseUntil: z.string().refine(value => Number.isFinite(Date.parse(value)))
}).strict();
export type Claim = z.infer<typeof claimSchema>;
export const ownershipParameters = (scope: Scope, claim: Pick<Claim, 'operationId' | 'epoch' | 'token'>): string[] =>
  [scope.tenantId, scope.campaignId, claim.operationId, claim.epoch, claim.token];

// The only adapter is this fixed database function. No provider, endpoint or effect callback exists.
export async function dispatchFake(database: Connections, binding: ConnectionBinding, scope: Scope, claim: Claim, signal: AbortSignal) {
  if (claim.kind !== 'DISPATCH') throw new RuntimeError(500, 'internal');
  const receiptSchema = z.object({ receiptId: z.string().uuid(), operationId: z.literal(claim.operationId) }).strict();
  return database.call(binding, scope, 'dispatch', ownershipParameters(scope, claim), receiptSchema, signal);
}
export async function requestReconciliation(database: Connections, binding: ConnectionBinding, scope: Scope, claim: Claim, signal: AbortSignal) {
  // This function returns no product data. SQL owns the PROCESS authorization and current ownership check.
  await database.call(binding, scope, 'handoff', ownershipParameters(scope, claim), z.unknown(), signal);
}
