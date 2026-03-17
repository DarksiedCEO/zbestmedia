import { createHash } from 'node:crypto';

import type {
  EvaluationCadenceType,
  EvaluationScheduleRecord,
  ScheduledEngineType
} from './evaluation-scheduler-types.js';

export const EVALUATION_ENGINE_ORDER: ScheduledEngineType[] = [
  'follow_through',
  'recommendation',
  'notification',
  'opportunity',
  'strategic_intelligence'
];

const WEEKDAY_INDEX: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6
};

function hash(parts: Array<string | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('|')).digest('hex').slice(0, 16);
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('invalid_time');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error('invalid_time');
  }
  return { hour, minute };
}

export function validateCadenceValue(cadenceType: EvaluationCadenceType, cadenceValue: string | null | undefined) {
  if (cadenceType === 'manual') {
    if (cadenceValue && cadenceValue.trim()) {
      throw new Error('Manual cadence does not accept a cadence value.');
    }
    return;
  }

  if (cadenceType === 'hourly') {
    if (!cadenceValue) {
      return;
    }
    const interval = Number(cadenceValue);
    if (!Number.isInteger(interval) || interval < 1 || interval > 24) {
      throw new Error('Hourly cadence value must be an integer between 1 and 24.');
    }
    return;
  }

  if (cadenceType === 'daily') {
    if (!cadenceValue) {
      return;
    }
    parseTime(cadenceValue);
    return;
  }

  if (!cadenceValue) {
    return;
  }
  const match = /^(SUN|MON|TUE|WED|THU|FRI|SAT)@(\d{2}:\d{2})$/.exec(cadenceValue);
  if (!match) {
    throw new Error('Weekly cadence value must look like MON@09:00.');
  }
  parseTime(match[2]!);
}

export function normalizeCadenceValue(cadenceType: EvaluationCadenceType, cadenceValue: string | null | undefined, referenceIso: string): string | null {
  if (cadenceType === 'manual') {
    return null;
  }
  if (cadenceType === 'hourly') {
    return cadenceValue?.trim() ? String(Number(cadenceValue)) : '1';
  }
  const reference = new Date(referenceIso);
  if (cadenceType === 'daily') {
    return cadenceValue?.trim() ? cadenceValue : `${String(reference.getHours()).padStart(2, '0')}:00`;
  }
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][reference.getDay()]!;
  return cadenceValue?.trim() ? cadenceValue : `${weekday}@${String(reference.getHours()).padStart(2, '0')}:00`;
}

export function computeNextRunAt(args: {
  cadenceType: EvaluationCadenceType;
  cadenceValue: string | null;
  referenceIso: string;
}): string | null {
  if (args.cadenceType === 'manual') {
    return null;
  }

  const reference = new Date(args.referenceIso);
  if (args.cadenceType === 'hourly') {
    const interval = Number(args.cadenceValue ?? '1');
    const next = new Date(reference);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + interval);
    return next.toISOString();
  }

  if (args.cadenceType === 'daily') {
    const { hour, minute } = parseTime(args.cadenceValue ?? '09:00');
    const next = new Date(reference);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= reference.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  const weekly = /^(SUN|MON|TUE|WED|THU|FRI|SAT)@(\d{2}:\d{2})$/.exec(args.cadenceValue ?? 'MON@09:00');
  const weekday = WEEKDAY_INDEX[(weekly?.[1] ?? 'MON') as keyof typeof WEEKDAY_INDEX];
  const { hour, minute } = parseTime(weekly?.[2] ?? '09:00');
  const next = new Date(reference);
  next.setHours(hour, minute, 0, 0);
  let delta = weekday - next.getDay();
  if (delta < 0 || (delta === 0 && next.getTime() <= reference.getTime())) {
    delta += 7;
  }
  if (delta === 0 && next.getTime() <= reference.getTime()) {
    delta = 7;
  }
  next.setDate(next.getDate() + delta);
  return next.toISOString();
}

export function buildScheduleIdempotencyKey(args: {
  engineType: ScheduledEngineType;
  cadenceType: EvaluationCadenceType;
  cadenceValue: string | null;
}): string {
  return `sched:${args.engineType}:${args.cadenceType}:${hash([args.cadenceValue])}`;
}

export function buildRunWindowKey(args: {
  engineType: ScheduledEngineType;
  scheduleId: string;
  cadenceType: EvaluationCadenceType;
  generatedAt: string;
}): string {
  const date = new Date(args.generatedAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');

  let windowPart = `${year}-${month}-${day}T${hour}`;
  if (args.cadenceType === 'daily') {
    windowPart = `${year}-${month}-${day}`;
  } else if (args.cadenceType === 'weekly') {
    const copy = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
    const dayOfWeek = copy.getUTCDay();
    const offset = (dayOfWeek + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - offset);
    windowPart = copy.toISOString().slice(0, 10);
  } else if (args.cadenceType === 'manual') {
    windowPart = `${year}-${month}-${day}T${hour}:${minute}`;
  }

  return `schedrun:${args.engineType}:${args.scheduleId}:${windowPart}`;
}

export function isScheduleDue(schedule: EvaluationScheduleRecord, referenceIso: string) {
  return schedule.status === 'active' && Boolean(schedule.nextRunAtIso) && Date.parse(schedule.nextRunAtIso!) <= Date.parse(referenceIso);
}

export function sortSchedulesByEngineOrder<T extends { engineType: ScheduledEngineType }>(items: T[]) {
  return [...items].sort((left, right) => EVALUATION_ENGINE_ORDER.indexOf(left.engineType) - EVALUATION_ENGINE_ORDER.indexOf(right.engineType));
}

export function buildRunSummary(engineType: ScheduledEngineType, executedCount: number, replayedCount: number, failureCount: number) {
  return `Ran ${engineType.replace(/_/g, ' ')} evaluation with ${executedCount} executed, ${replayedCount} replayed, and ${failureCount} failed source checks.`;
}
