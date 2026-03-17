import type { ScheduledEngineType } from './evaluation-scheduler-types.js';

export function buildScheduleMessage(args: { engineType: ScheduledEngineType; updated: boolean }) {
  return args.updated
    ? `Updated the ${args.engineType.replace(/_/g, ' ')} evaluation cadence.`
    : `Created the ${args.engineType.replace(/_/g, ' ')} evaluation cadence.`;
}

export function buildScheduleListMessage(count: number) {
  return count === 1 ? 'Loaded 1 evaluation schedule.' : `Loaded ${count} evaluation schedules.`;
}

export function buildRunListMessage(count: number) {
  return count === 1 ? 'Loaded 1 evaluation run.' : `Loaded ${count} evaluation runs.`;
}

export function buildPauseResumeMessage(engineType: ScheduledEngineType, status: 'active' | 'paused') {
  return status === 'paused'
    ? `Paused the ${engineType.replace(/_/g, ' ')} cadence.`
    : `Resumed the ${engineType.replace(/_/g, ' ')} cadence.`;
}
