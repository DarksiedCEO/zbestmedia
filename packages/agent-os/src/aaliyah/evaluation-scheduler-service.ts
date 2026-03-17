import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahEvaluationSchedulerAuditService } from './evaluation-scheduler-audit.js';
import {
  EvaluationSchedulerAccessDeniedError,
  EvaluationSchedulerConflictError,
  EvaluationSchedulerInternalError,
  EvaluationSchedulerInvalidModeError,
  EvaluationSchedulerNotFoundError,
  EvaluationSchedulerValidationError
} from './evaluation-scheduler-errors.js';
import { type SchedulerEngineServices } from './evaluation-scheduler-jobs.js';
import { AaliyahEvaluationSchedulerRunner } from './evaluation-scheduler-runner.js';
import {
  buildScheduleIdempotencyKey,
  computeNextRunAt,
  normalizeCadenceValue,
  validateCadenceValue
} from './evaluation-scheduler-policy.js';
import { buildPauseResumeMessage, buildRunListMessage, buildScheduleListMessage, buildScheduleMessage } from './evaluation-scheduler-summary.js';
import type {
  EvaluationRunDetailResult,
  EvaluationRunListResult,
  EvaluationRunResult,
  EvaluationScheduleListResult,
  EvaluationScheduleResult,
  EvaluationSchedulerFailureResult,
  ScheduledEngineType
} from './evaluation-scheduler-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahEvaluationSchedulerService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahEvaluationSchedulerAuditService;
  private readonly runner: AaliyahEvaluationSchedulerRunner;

  constructor(
    private readonly repository: AgentOsRepository,
    services: SchedulerEngineServices,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahEvaluationSchedulerAuditService(diagnostics);
    this.runner = new AaliyahEvaluationSchedulerRunner(repository, services, diagnostics);
  }

  async createOrUpdateSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    engineType: ScheduledEngineType;
    cadenceType: 'manual' | 'hourly' | 'daily' | 'weekly';
    cadenceValue?: string | null;
    metadata?: Record<string, unknown>;
    generatedAt?: string;
  }): Promise<EvaluationScheduleResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      validateCadenceValue(args.cadenceType, args.cadenceValue);
      const cadenceValue = normalizeCadenceValue(args.cadenceType, args.cadenceValue, generatedAt);
      const idempotencyKey = buildScheduleIdempotencyKey({ engineType: args.engineType, cadenceType: args.cadenceType, cadenceValue });
      const existing = await this.repository.getEvaluationScheduleByEngine({ tenantId: args.tenantId, engineType: args.engineType });
      const nextRunAt = computeNextRunAt({ cadenceType: args.cadenceType, cadenceValue, referenceIso: generatedAt });

      let schedule;
      let updated = false;
      if (existing) {
        updated = true;
        schedule = await this.repository.updateEvaluationSchedule({
          tenantId: args.tenantId,
          scheduleId: existing.id,
          status: 'active',
          cadenceType: args.cadenceType,
          cadenceValue,
          nextRunAt,
          idempotencyKey,
          metadata: args.metadata ?? existing.metadata,
          updatedAt: generatedAt
        });
      } else {
        schedule = await this.repository.createEvaluationSchedule({
          tenantId: args.tenantId,
          scheduleId: `evaluation-schedule:${randomUUID()}`,
          engineType: args.engineType,
          status: 'active',
          cadenceType: args.cadenceType,
          cadenceValue,
          lastRunAt: null,
          nextRunAt,
          idempotencyKey,
          metadata: args.metadata ?? {},
          createdAt: generatedAt,
          updatedAt: generatedAt
        });
      }

      await this.audit.record({
        eventType: updated ? 'aaliyah.evaluation_schedule.updated' : 'aaliyah.evaluation_schedule.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          scheduleId: schedule.id,
          engineType: schedule.engineType,
          cadenceType: schedule.cadenceType,
          cadenceValue: schedule.cadenceValue,
          nextRunAt: schedule.nextRunAtIso
        })
      });

      return { ok: true, schedule, message: buildScheduleMessage({ engineType: args.engineType, updated }) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listSchedules(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
  }): Promise<EvaluationScheduleListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const schedules = await this.repository.listEvaluationSchedules({ tenantId: args.tenantId, limit: args.limit });
      return { ok: true, schedules, message: buildScheduleListMessage(schedules.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getScheduleById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scheduleId: string;
  }): Promise<EvaluationScheduleResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const schedule = await this.repository.getEvaluationScheduleById({ tenantId: args.tenantId, scheduleId: args.scheduleId });
      if (!schedule) {
        throw new EvaluationSchedulerNotFoundError('Evaluation schedule was not found.');
      }
      return { ok: true, schedule, message: schedule.engineType };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async pauseSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scheduleId: string;
    generatedAt?: string;
  }): Promise<EvaluationScheduleResult> {
    return this.transitionSchedule({ ...args, nextStatus: 'paused' });
  }

  async resumeSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scheduleId: string;
    generatedAt?: string;
  }): Promise<EvaluationScheduleResult> {
    return this.transitionSchedule({ ...args, nextStatus: 'active' });
  }

  async runSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scheduleId: string;
    generatedAt?: string;
  }): Promise<EvaluationRunResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const schedule = await this.repository.getEvaluationScheduleById({ tenantId: args.tenantId, scheduleId: args.scheduleId });
      if (!schedule) {
        throw new EvaluationSchedulerNotFoundError('Evaluation schedule was not found.');
      }
      const result = await this.runner.runSchedule({
        schedule,
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        generatedAt
      });
      return { ok: true, ...result };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listRuns(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    engineType?: ScheduledEngineType;
  }): Promise<EvaluationRunListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const runs = await this.repository.listEvaluationRuns({ tenantId: args.tenantId, limit: args.limit, engineType: args.engineType });
      return { ok: true, runs, message: buildRunListMessage(runs.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getRunById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    runId: string;
  }): Promise<EvaluationRunDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const run = await this.repository.getEvaluationRunById({ tenantId: args.tenantId, runId: args.runId });
      if (!run) {
        throw new EvaluationSchedulerNotFoundError('Evaluation run was not found.');
      }
      return { ok: true, run, message: run.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private async transitionSchedule(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scheduleId: string;
    nextStatus: 'active' | 'paused';
    generatedAt?: string;
  }): Promise<EvaluationScheduleResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getEvaluationScheduleById({ tenantId: args.tenantId, scheduleId: args.scheduleId });
      if (!existing) {
        throw new EvaluationSchedulerNotFoundError('Evaluation schedule was not found.');
      }
      if (existing.status === args.nextStatus) {
        return { ok: true, schedule: existing, message: buildPauseResumeMessage(existing.engineType, existing.status) };
      }
      const schedule = await this.repository.updateEvaluationSchedule({
        tenantId: args.tenantId,
        scheduleId: args.scheduleId,
        status: args.nextStatus,
        nextRunAt: args.nextStatus === 'active'
          ? computeNextRunAt({
              cadenceType: existing.cadenceType,
              cadenceValue: existing.cadenceValue,
              referenceIso: generatedAt
            })
          : null,
        updatedAt: generatedAt
      });
      await this.audit.record({
        eventType: args.nextStatus === 'active' ? 'aaliyah.evaluation_schedule.resumed' : 'aaliyah.evaluation_schedule.paused',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          scheduleId: schedule.id,
          engineType: schedule.engineType,
          status: schedule.status,
          nextRunAt: schedule.nextRunAtIso
        })
      });
      return { ok: true, schedule, message: buildPauseResumeMessage(schedule.engineType, schedule.status) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new EvaluationSchedulerAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new EvaluationSchedulerInvalidModeError();
    }
  }

  private normalizeFailure(error: unknown): EvaluationSchedulerFailureResult {
    const typed = error instanceof Error ? error : new EvaluationSchedulerInternalError();
    if (typed instanceof EvaluationSchedulerAccessDeniedError || typed.message === 'aaliyah_principal_context_denied') {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: typed.message };
    }
    if (typed instanceof EvaluationSchedulerInvalidModeError || typed.message.startsWith('aaliyah_memory_boundary_denied')) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: typed.message };
    }
    if (typed instanceof EvaluationSchedulerValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: typed.message };
    }
    if (typed instanceof EvaluationSchedulerNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: typed.message };
    }
    if (typed instanceof EvaluationSchedulerConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: typed.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: typed.message };
  }
}
