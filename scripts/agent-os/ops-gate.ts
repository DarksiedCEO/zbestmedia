import { buildCodeSentinelSignal } from '../../packages/agent-os/src/org/code-sentinel.js';

export type WorkerSloStatus = 'healthy' | 'warning' | 'critical';

export function buildWorkerSloSignal(status: unknown) {
  if (status !== 'healthy' && status !== 'warning' && status !== 'critical') {
    throw new Error(`[agent-os:ops:smoke] worker SLO returned invalid status '${String(status)}'`);
  }

  return buildCodeSentinelSignal({
    signalType: 'slo_release_gate',
    status,
    source: 'scripts/agent-os/ops-gate.ts',
    message:
      status === 'critical'
        ? 'worker SLO status is critical; release gate must fail'
        : `worker SLO status evaluated as ${status}`
  });
}

export function assertWorkerSloReleaseStatus(status: unknown): WorkerSloStatus {
  const signal = buildWorkerSloSignal(status);

  if (signal.status === 'critical') {
    throw new Error(
      `[agent-os:ops:smoke] worker SLO status is critical; failing release gate (owner=${signal.owningSubAgentId})`
    );
  }

  return signal.status;
}
