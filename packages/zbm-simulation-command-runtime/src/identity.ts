import { z } from 'zod';
import type { ConnectionBinding } from '@zbest/zbm-authenticated-command-boundary';
import { RuntimeError, type AcceptedResult, type AdvanceSimulationProbeV1, type Scope } from './contracts';

// PostgreSQL owns canonical bytes and SHA256. Never use JS JSON.stringify as replay identity.
export const COMMAND_CANONICAL_FORMAT = 'zbm-sim-command-v1';
export const TRANSITION_CANONICAL_FORMAT = 'zbm-sim-transition-v1';
const observationSchema = z.object({
  principal: z.string().min(1).max(160), tenant: z.string(), campaign: z.string(),
  login: z.string().min(1).max(160)
}).strict();
export function verifyObservation(value: unknown, binding: ConnectionBinding, scope: Scope): void {
  const parsed = observationSchema.safeParse(value);
  if (!parsed.success) throw new RuntimeError(500, 'internal');
  if (parsed.data.principal !== binding.principal || parsed.data.login !== binding.databaseLogin
    || parsed.data.tenant !== scope.tenantId || parsed.data.campaign !== scope.campaignId) {
    throw new RuntimeError(403, 'denied');
  }
}
export function verifyCommandResult(result: AcceptedResult, command: AdvanceSimulationProbeV1): AcceptedResult {
  if (result.probeId !== command.probeId || BigInt(result.resultingVersion) !== BigInt(command.expectedVersion) + 1n
    || ((result.effect.status === 'NOT_REQUIRED') !== (command.completion === 'STATE_ONLY'))) {
    throw new RuntimeError(500, 'internal');
  }
  return result;
}
