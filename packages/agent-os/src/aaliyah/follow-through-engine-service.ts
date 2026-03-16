import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahFollowThroughEngineAuditService } from './follow-through-engine-audit.js';
import {
  FollowThroughEngineAccessDeniedError,
  FollowThroughEngineConflictError,
  FollowThroughEngineInternalError,
  FollowThroughEngineInvalidModeError,
  FollowThroughEngineNotFoundError,
  FollowThroughEngineValidationError
} from './follow-through-engine-errors.js';
import { evaluateFollowThrough } from './follow-through-engine-evaluator.js';
import { AaliyahFollowThroughEngineSources } from './follow-through-engine-sources.js';
import { buildFollowThroughListMessage, summarizeExistingReplay } from './follow-through-engine-summary.js';
import type {
  FollowThroughEngineRecord,
  FollowThroughEvaluateResult,
  FollowThroughFailureResult,
  FollowThroughListResult,
  FollowThroughSourceRef
} from './follow-through-engine-types.js';
import type { AaliyahTasksService } from './tasks-service.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahFollowThroughEngineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahFollowThroughEngineAuditService;
  private readonly sources: AaliyahFollowThroughEngineSources;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly tasksService: AaliyahTasksService,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahFollowThroughEngineAuditService(diagnostics);
    this.sources = new AaliyahFollowThroughEngineSources(repository);
  }

  async evaluateSource(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: FollowThroughSourceRef;
    generatedAt?: string;
  }): Promise<FollowThroughEvaluateResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      this.validateSource(args.source);
      const context = await this.sources.loadSourceContextForEvaluation({ ...args, generatedAt });
      const evaluation = evaluateFollowThrough({ context, evaluatedAtIso: generatedAt });
      const existing = await this.repository.getFollowThroughEngineRecordByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: evaluation.result.idempotencyKey
      });
      if (existing) {
        return {
          ok: true,
          record: existing,
          message: summarizeExistingReplay(existing)
        };
      }

      const evaluationId = `follow-through-engine:${randomUUID()}`;
      const createdArtifactIds: string[] = [];

      if (evaluation.result.decisionType === 'create_task') {
        if (!evaluation.suggestedTaskPayload) {
          throw new FollowThroughEngineInternalError('Follow-through task payload was missing.');
        }
        const taskResult = await this.tasksService.createTask({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext,
          mode: args.mode,
          generatedAt,
          input: {
            title: evaluation.suggestedTaskPayload.title,
            description: evaluation.suggestedTaskPayload.description,
            priority: evaluation.suggestedTaskPayload.priority,
            source: this.mapTaskSource(evaluation.suggestedTaskPayload.channel),
            contactId: evaluation.suggestedTaskPayload.attachToContactId,
            accountId: evaluation.suggestedTaskPayload.attachToAccountId,
            relatedEmailDraftId: evaluation.suggestedTaskPayload.attachToDraftId,
            relatedCalendarEventId: evaluation.suggestedTaskPayload.attachToCalendarEventId,
            dueAt: evaluation.suggestedTaskPayload.dueAtIso,
            remindAt: evaluation.suggestedTaskPayload.remindAtIso
          }
        });
        if (!taskResult.ok) {
          throw new FollowThroughEngineInternalError(taskResult.message);
        }
        createdArtifactIds.push(taskResult.task.id);
      }

      const auditEventId = await this.audit.record({
        eventType: this.mapAuditEventType(evaluation.result.status),
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          evaluationId,
          sourceType: evaluation.result.source.sourceType,
          sourceId: evaluation.result.source.sourceId,
          policyKey: evaluation.result.policyKey,
          decisionType: evaluation.result.decisionType,
          idempotencyKey: evaluation.result.idempotencyKey,
          createdArtifactIds,
          includedRejectedIntentContext: Boolean(evaluation.result.metadata.includedRejectedIntentContext),
          linkedCommandId: typeof evaluation.result.metadata.linkedCommandId === 'string' ? evaluation.result.metadata.linkedCommandId : null,
          linkedTaskId: typeof evaluation.result.metadata.linkedTaskId === 'string' ? evaluation.result.metadata.linkedTaskId : null,
          reason: evaluation.result.reason,
          summary: evaluation.result.summary
        })
      });

      const record = await this.repository.createFollowThroughEngineRecord({
        tenantId: args.tenantId,
        recordId: evaluationId,
        sourceType: evaluation.result.source.sourceType,
        sourceId: evaluation.result.source.sourceId,
        policyKey: evaluation.result.policyKey,
        decisionType: evaluation.result.decisionType,
        evaluationStatus: evaluation.result.status,
        reason: evaluation.result.reason,
        summary: evaluation.result.summary,
        idempotencyKey: evaluation.result.idempotencyKey,
        createdArtifactIds,
        auditEventId,
        metadata: evaluation.result.metadata,
        createdAt: generatedAt,
        evaluatedAt: generatedAt
      });

      return {
        ok: true,
        record,
        message: record.summary
      };
    } catch (error) {
      return this.normalizeFailure({
        tenantId: args.tenantId,
        actorId: args.actorId,
        mode: args.mode,
        generatedAt,
        error
      });
    }
  }

  async getRecordById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    recordId: string;
    generatedAt?: string;
  }): Promise<FollowThroughEvaluateResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const record = await this.sources.getRecordById({ tenantId: args.tenantId, recordId: args.recordId });
      if (!record) {
        throw new FollowThroughEngineNotFoundError('Follow-through record was not found.');
      }
      return { ok: true, record, message: buildFollowThroughListMessage(1) };
    } catch (error) {
      return this.normalizeFailure({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error });
    }
  }

  async listRecords(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    generatedAt?: string;
  }): Promise<FollowThroughListResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const records = await this.sources.listRecords({ tenantId: args.tenantId, limit: args.limit });
      return { ok: true, records, message: buildFollowThroughListMessage(records.length) };
    } catch (error) {
      return this.normalizeFailure({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error });
    }
  }

  private validateSource(source: FollowThroughSourceRef) {
    if (!source.sourceId?.trim()) {
      throw new FollowThroughEngineValidationError('Follow-through source id is required.');
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new FollowThroughEngineAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new FollowThroughEngineInvalidModeError();
    }
  }

  private mapTaskSource(channel: string | undefined) {
    switch (channel) {
      case 'meeting':
        return 'calendar_follow_up' as const;
      case 'email':
        return 'email_follow_up' as const;
      case 'call':
      case 'internal':
      default:
        return 'manual' as const;
    }
  }

  private mapAuditEventType(status: FollowThroughEngineRecord['status']) {
    switch (status) {
      case 'eligible':
        return 'aaliyah.follow_through.executed' as const;
      case 'blocked':
        return 'aaliyah.follow_through.blocked' as const;
      case 'stale':
        return 'aaliyah.follow_through.stale' as const;
      case 'noop':
        return 'aaliyah.follow_through.noop' as const;
    }
  }

  private async normalizeFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    error: unknown;
  }): Promise<FollowThroughFailureResult> {
    const error = args.error instanceof Error ? args.error : new FollowThroughEngineInternalError();
    const result: FollowThroughFailureResult =
      error instanceof FollowThroughEngineAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
        ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for follow-through actions.' }
        : error instanceof FollowThroughEngineInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
          ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for follow-through actions.' }
          : error instanceof FollowThroughEngineValidationError
            ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
            : error instanceof FollowThroughEngineNotFoundError
              ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
              : error instanceof FollowThroughEngineConflictError
                ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
                : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Follow-through evaluation failed.' };

    await this.audit.record({
      eventType: 'aaliyah.follow_through.blocked',
      principalId: args.actorId,
      tenantId: args.tenantId,
      mode: args.mode,
      timestamp: args.generatedAt,
      metadata: {
        resultCode: result.errorCode ?? result.denialCode ?? 'error',
        summaryHash: result.message
      }
    });

    return result;
  }
}
