export type ScheduledEngineType =
  | 'follow_through'
  | 'recommendation'
  | 'notification'
  | 'opportunity'
  | 'strategic_intelligence';

export type EvaluationScheduleStatus = 'active' | 'paused';
export type EvaluationCadenceType = 'manual' | 'hourly' | 'daily' | 'weekly';
export type EvaluationRunStatus = 'started' | 'completed' | 'failed' | 'replayed';

export type EvaluationScheduleRecord = {
  id: string;
  tenantId: string;
  engineType: ScheduledEngineType;
  status: EvaluationScheduleStatus;
  cadenceType: EvaluationCadenceType;
  cadenceValue: string | null;
  lastRunAtIso: string | null;
  nextRunAtIso: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type EvaluationRunRecord = {
  id: string;
  tenantId: string;
  scheduleId: string;
  engineType: ScheduledEngineType;
  runStatus: EvaluationRunStatus;
  windowKey: string;
  summary: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  startedAtIso: string;
  completedAtIso: string | null;
};

export type EvaluationScheduleResult =
  | {
      ok: true;
      schedule: EvaluationScheduleRecord;
      message: string;
    }
  | EvaluationSchedulerFailureResult;

export type EvaluationScheduleDetailResult = EvaluationScheduleResult;

export type EvaluationScheduleListResult =
  | {
      ok: true;
      schedules: EvaluationScheduleRecord[];
      message: string;
    }
  | EvaluationSchedulerFailureResult;

export type EvaluationRunResult =
  | {
      ok: true;
      run: EvaluationRunRecord;
      schedule: EvaluationScheduleRecord;
      replayed: boolean;
      message: string;
    }
  | EvaluationSchedulerFailureResult;

export type EvaluationRunDetailResult =
  | {
      ok: true;
      run: EvaluationRunRecord;
      message: string;
    }
  | EvaluationSchedulerFailureResult;

export type EvaluationRunListResult =
  | {
      ok: true;
      runs: EvaluationRunRecord[];
      message: string;
    }
  | EvaluationSchedulerFailureResult;

export type EvaluationSchedulerFailureResult = {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
};

export type EvaluationSchedulerAuditEventType =
  | 'aaliyah.evaluation_schedule.created'
  | 'aaliyah.evaluation_schedule.updated'
  | 'aaliyah.evaluation_schedule.paused'
  | 'aaliyah.evaluation_schedule.resumed'
  | 'aaliyah.evaluation_run.started'
  | 'aaliyah.evaluation_run.completed'
  | 'aaliyah.evaluation_run.failed'
  | 'aaliyah.evaluation_run.replayed';

export type EvaluationSchedulerAuditEvent = {
  eventType: EvaluationSchedulerAuditEventType;
  principalId: string;
  tenantId: string;
  mode: 'founder' | 'zbestmedia';
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type EvaluationJobOutcome = {
  executedCount: number;
  replayedCount: number;
  failureCount: number;
  recordIds: string[];
  details: Array<{
    sourceType: string;
    sourceId: string;
    ok: boolean;
    replayed?: boolean;
    message: string;
    recordId?: string;
  }>;
};
