import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { BoundaryDependencies, ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { classify, type Connections } from './connections';
import { effectSchema, parseRequest, RuntimeError, scopeSchema, versionSchema, type Scope } from './contracts';
import { claimSchema, dispatchFake, ownershipParameters, requestReconciliation, type Claim } from './fake-adapter';
import { safeLog } from './http';

const recoverySchema = z.union([claimSchema, z.object({ parked: z.literal(true), operationId: z.string().uuid() }).strict(), z.null()]);
const nextDueSchema = z.object({ nextDue: z.string().refine(v => Number.isFinite(Date.parse(v))).nullable(), parkedCount: z.number().int().nonnegative() }).strict();
const inspectedSchema = z.union([
  z.object({ found: z.literal(false) }).strict(),
  z.object({ found: z.literal(true), operationId: z.string().uuid(), epoch: versionSchema,
    token: z.string().uuid(), kind: z.enum(['DISPATCH','RECONCILE']), current: z.boolean(), terminal: z.boolean() }).strict()
]);
export type WorkerReport = Readonly<{
  reason: 'EMPTY' | 'NOT_DUE' | 'CLAIM_LIMIT' | 'DEADLINE' | 'UNAVAILABLE' | 'UNCERTAIN' | 'STOPPED' | 'DENIED' | 'ERROR';
  claims: number; nextDue: string | null; parkedCount: number;
}>;
function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
export function createWorkers(database: Connections, log: BoundaryDependencies['log']) {
  let closed = false;
  const active = new Set<AbortController>();
  const worker = (input: ConnectionBinding) => {
    const binding = database.protect(input);
    return async (inputScope: Scope): Promise<WorkerReport> => {
      const scope = parseRequest(scopeSchema, inputScope);
      if (scope.tenantId !== binding.tenantId) throw new RuntimeError(403, 'denied');
      const controller = new AbortController(), signal = controller.signal;
      const started = performance.now(), requestId = randomUUID();
      let claims = 0, failures = 0, pendingToken: string | undefined;
      let due: { nextDue: string | null; parkedCount: number } = { nextDue: null, parkedCount: 0 };
      const report = (reason: WorkerReport['reason']): WorkerReport => {
        safeLog(log, reason.toLowerCase(), requestId, started);
        return Object.freeze({ reason, claims, ...due });
      };
      if (closed) return report('STOPPED');
      active.add(controller);
      const deadline = setTimeout(() => controller.abort(), 120000);
      const claim = async (kind: 'DISPATCH' | 'RECONCILE') => {
        const token = randomUUID();
        try {
          const result = await database.call(binding, scope, kind === 'DISPATCH' ? 'claim' : 'claimReconciliation',
            [scope.tenantId, scope.campaignId, token], recoverySchema.transform(value => {
              if (value && 'kind' in value && (value.token !== token || value.kind !== kind)) throw new RuntimeError(500, 'internal');
              if (kind === 'DISPATCH' && value && 'parked' in value) throw new RuntimeError(500, 'internal');
              return value;
            }), signal);
          return result;
        } catch (error) {
          if (error instanceof RuntimeError && error.uncertain) pendingToken = token;
          throw error;
        }
      };
      try {
        while (claims < 32 && !signal.aborted && performance.now() - started < 120000) {
          let ownedWork = false;
          try {
            if (pendingToken) {
              const inspected = await database.call(binding, scope, 'inspect', [scope.tenantId, scope.campaignId, pendingToken],
                inspectedSchema.transform(value => {
                  if (value.found && value.token !== pendingToken) throw new RuntimeError(500, 'internal');
                  return value;
                }), signal);
              if (inspected.found) claims++;
              // Durable ownership survives this invocation; never repeat an unacknowledged claim.
              return report('UNCERTAIN');
            }
            const recovery = await claim('RECONCILE');
            if (recovery) {
              claims++;
              ownedWork = true;
              if ('kind' in recovery) {
                await database.call(binding, scope, 'reconcile', ownershipParameters(scope, recovery), effectSchema, signal);
              }
              failures = 0;
              continue;
            }
            const dispatch = await claim('DISPATCH');
            if (dispatch && 'kind' in dispatch) {
              claims++;
              ownedWork = true;
              await execute(dispatch);
              failures = 0;
              continue;
            }
            due = await database.call(binding, scope, 'nextDue', [scope.tenantId, scope.campaignId], nextDueSchema, signal);
            return report(due.nextDue === null ? 'EMPTY' : 'NOT_DUE');
          } catch (error) {
            if (signal.aborted) break;
            const failure = classify(error);
            if (ownedWork && (failure.connectionFailure || failure.uncertain)) return report('UNCERTAIN');
            if (failure.connectionFailure) {
              if (++failures >= 3) return report('UNAVAILABLE');
              await pause(failures === 1 ? 1000 : 5000, signal);
              continue;
            }
            if (failure.statusCode === 403) return report('DENIED');
            return report(failure.statusCode === 503 ? 'UNAVAILABLE' : 'ERROR');
          }
        }
        return report(closed ? 'STOPPED' : claims >= 32 ? 'CLAIM_LIMIT' : 'DEADLINE');
      } finally {
        clearTimeout(deadline);
        controller.abort();
        active.delete(controller);
      }
      async function execute(owned: Claim): Promise<void> {
        try { await dispatchFake(database, binding, scope, owned, signal); }
        catch (error) {
          const failure = classify(error);
          // A broken transport is left to durable lease expiry/recovery. No immediate effect retry.
          if (failure.connectionFailure || failure.uncertain) throw failure;
          // A known denial/rollback still needs PROCESS reconciliation to prove absence.
          await requestReconciliation(database, binding, scope, owned, signal);
          return;
        }
        await requestReconciliation(database, binding, scope, owned, signal);
      }
    };
  };
  const close = () => { closed = true; for (const controller of active) controller.abort(); };
  return Object.freeze({ worker, close });
}
