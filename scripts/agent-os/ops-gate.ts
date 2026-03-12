export type WorkerSloStatus = 'healthy' | 'warning' | 'critical';

export function assertWorkerSloReleaseStatus(status: unknown): WorkerSloStatus {
  if (status !== 'healthy' && status !== 'warning' && status !== 'critical') {
    throw new Error(`[agent-os:ops:smoke] worker SLO returned invalid status '${String(status)}'`);
  }

  if (status === 'critical') {
    throw new Error('[agent-os:ops:smoke] worker SLO status is critical; failing release gate');
  }

  return status;
}
