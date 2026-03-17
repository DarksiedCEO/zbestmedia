import { randomUUID } from 'node:crypto';

import { AaliyahEvaluationSchedulerAuditService } from './evaluation-scheduler-audit.js';
import { executeScheduledEngine, type SchedulerEngineServices } from './evaluation-scheduler-jobs.js';
import {
  buildRunSummary,
  buildRunWindowKey,
  computeNextRunAt,
  sortSchedulesByEngineOrder
} from './evaluation-scheduler-policy.js';
import type {
  EvaluationRunRecord,
  EvaluationScheduleRecord
} from './evaluation-scheduler-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahEvaluationSchedulerRunner {
  private readonly audit: AaliyahEvaluationSchedulerAuditService;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly services: SchedulerEngineServices,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahEvaluationSchedulerAuditService(diagnostics);
  }

  async runSchedule(args: {
    schedule: EvaluationScheduleRecord;
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt: string;
  }): Promise<{ run: EvaluationRunRecord; schedule: EvaluationScheduleRecord; replayed: boolean; message: string }> {
    const windowKey = buildRunWindowKey({
      engineType: args.schedule.engineType,
      scheduleId: args.schedule.id,
      cadenceType: args.schedule.cadenceType,
      generatedAt: args.generatedAt
    });
    const existing = await this.repository.getEvaluationRunByWindowKey({
      tenantId: args.tenantId,
      scheduleId: args.schedule.id,
      windowKey
    });
    if (existing) {
      await this.audit.record({
        eventType: 'aaliyah.evaluation_run.replayed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: args.generatedAt,
        metadata: this.audit.buildMetadata({
          scheduleId: args.schedule.id,
          runId: existing.id,
          engineType: args.schedule.engineType,
          windowKey
        })
      });
      return { run: existing, schedule: args.schedule, replayed: true, message: existing.summary };
    }

    const runId = `evaluation-run:${randomUUID()}`;
    const startedAuditEventId = await this.audit.record({
      eventType: 'aaliyah.evaluation_run.started',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: args.generatedAt,
      metadata: this.audit.buildMetadata({
        scheduleId: args.schedule.id,
        runId,
        engineType: args.schedule.engineType,
        windowKey
      })
    });

    await this.repository.createEvaluationRun({
      tenantId: args.tenantId,
      runId,
      scheduleId: args.schedule.id,
      engineType: args.schedule.engineType,
      runStatus: 'started',
      windowKey,
      summary: `Started ${args.schedule.engineType.replace(/_/g, ' ')} evaluation.`,
      auditEventId: startedAuditEventId,
      metadata: { cadenceType: args.schedule.cadenceType },
      startedAt: args.generatedAt,
      completedAt: null
    });

    try {
      const outcome = await executeScheduledEngine({
        repository: this.repository,
        services: this.services,
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        schedule: args.schedule,
        generatedAt: args.generatedAt
      });
      const summary = buildRunSummary(args.schedule.engineType, outcome.executedCount, outcome.replayedCount, outcome.failureCount);
      const completedAuditEventId = await this.audit.record({
        eventType: 'aaliyah.evaluation_run.completed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: args.generatedAt,
        metadata: this.audit.buildMetadata({
          scheduleId: args.schedule.id,
          runId,
          engineType: args.schedule.engineType,
          windowKey,
          ...outcome,
          summary
        })
      });
      const run = await this.repository.updateEvaluationRun({
        tenantId: args.tenantId,
        runId,
        runStatus: 'completed',
        summary,
        auditEventId: completedAuditEventId,
        metadata: {
          cadenceType: args.schedule.cadenceType,
          cadenceValue: args.schedule.cadenceValue,
          ...outcome
        },
        completedAt: args.generatedAt
      });
      const schedule = await this.repository.updateEvaluationScheduleRuntime({
        tenantId: args.tenantId,
        scheduleId: args.schedule.id,
        lastRunAt: args.generatedAt,
        nextRunAt: args.schedule.status === 'active'
          ? computeNextRunAt({
              cadenceType: args.schedule.cadenceType,
              cadenceValue: args.schedule.cadenceValue,
              referenceIso: args.generatedAt
            })
          : null,
        updatedAt: args.generatedAt
      });
      return { run, schedule, replayed: false, message: summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evaluation run failed.';
      const failedAuditEventId = await this.audit.record({
        eventType: 'aaliyah.evaluation_run.failed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: args.generatedAt,
        metadata: this.audit.buildMetadata({
          scheduleId: args.schedule.id,
          runId,
          engineType: args.schedule.engineType,
          windowKey,
          error: message
        })
      });
      const run = await this.repository.updateEvaluationRun({
        tenantId: args.tenantId,
        runId,
        runStatus: 'failed',
        summary: message,
        auditEventId: failedAuditEventId,
        metadata: { cadenceType: args.schedule.cadenceType, error: message },
        completedAt: args.generatedAt
      });
      throw Object.assign(error instanceof Error ? error : new Error(message), { run });
    }
  }

  async runDueSchedules(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt: string;
  }) {
    const dueSchedules = sortSchedulesByEngineOrder(await this.repository.listDueEvaluationSchedules({
      tenantId: args.tenantId,
      referenceAt: args.generatedAt
    }));
    const runs = [] as Array<{ run: EvaluationRunRecord; schedule: EvaluationScheduleRecord; replayed: boolean; message: string }>;
    for (const schedule of dueSchedules) {
      runs.push(await this.runSchedule({ ...args, schedule }));
    }
    return runs;
  }
}
