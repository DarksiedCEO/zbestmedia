import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import {
  OutcomeFeedbackAccessDeniedError,
  OutcomeFeedbackConflictError,
  OutcomeFeedbackInternalError,
  OutcomeFeedbackInvalidModeError,
  OutcomeFeedbackNotFoundError,
  OutcomeFeedbackValidationError
} from './outcome-feedback-errors.js';
import { AaliyahOutcomeFeedbackAuditService } from './outcome-feedback-audit.js';
import { AaliyahOutcomeFeedbackSources } from './outcome-feedback-sources.js';
import { buildOutcomeListMessage, } from './outcome-feedback-policy.js';
import { AaliyahOutcomeFeedbackResolver } from './outcome-feedback-resolver.js';
import { buildOutcomeFeedbackDetailMessage, buildOutcomeFeedbackMessage } from './outcome-feedback-summary.js';
import type {
  OutcomeFeedbackDetailResult,
  OutcomeFeedbackFailureResult,
  OutcomeFeedbackListResult,
  OutcomeFeedbackWriteResult,
  RecordOutcomeFeedbackRequest
} from './outcome-feedback-types.js';
import { AaliyahOutcomeFeedbackValidator } from './outcome-feedback-validator.js';

export class AaliyahOutcomeFeedbackService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahOutcomeFeedbackAuditService;
  private readonly sources: AaliyahOutcomeFeedbackSources;
  private readonly validator = new AaliyahOutcomeFeedbackValidator();
  private readonly resolver = new AaliyahOutcomeFeedbackResolver();

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahOutcomeFeedbackAuditService(diagnostics);
    this.sources = new AaliyahOutcomeFeedbackSources(repository);
  }

  async record(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    request: RecordOutcomeFeedbackRequest;
    generatedAt?: string;
  }): Promise<OutcomeFeedbackWriteResult> {
    const generatedAt = args.generatedAt ?? args.request.reportedAtIso ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);

      const replay = await this.repository.getOutcomeFeedbackByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: args.request.idempotencyKey
      });
      if (replay) {
        const issueState = await this.repository.getIssueStateByCanonicalIssueKey({
          tenantId: args.tenantId,
          canonicalIssueKey: replay.canonicalIssueKey
        });
        await this.audit.record({
          eventType: 'aaliyah.outcome_feedback.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            outcomeId: replay.id,
            queueItemId: replay.queueItemId,
            operatorActionLogId: replay.operatorActionLogId,
            canonicalIssueKey: replay.canonicalIssueKey,
            outcomeType: replay.outcomeType,
            outcomeStatus: replay.outcomeStatus,
            replayed: true
          })
        });
        return {
          ok: true,
          outcome: replay,
          issueState: issueState ?? this.buildFallbackIssueState(replay, generatedAt),
          replayed: true,
          message: buildOutcomeFeedbackMessage({
            outcomeType: replay.outcomeType,
            outcomeStatus: replay.outcomeStatus,
            replayed: true
          })
        };
      }

      const lineage = await this.sources.loadLineage({
        tenantId: args.tenantId,
        queueItemId: args.request.queueItemId,
        operatorActionLogId: args.request.operatorActionLogId
      });
      const resolvedLineage = this.validator.validate({
        lineage,
        request: args.request
      });

      const outcomeId = `outcome-feedback:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: 'aaliyah.outcome_feedback.recorded',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          outcomeId,
          queueItemId: args.request.queueItemId,
          operatorActionLogId: args.request.operatorActionLogId,
          canonicalIssueKey: resolvedLineage.canonicalIssueKey,
          outcomeType: args.request.outcomeType,
          outcomeStatus: args.request.outcomeStatus,
          reasonCode: args.request.reasonCode ?? null
        })
      });

      const outcome = await this.repository.createOutcomeFeedback({
        tenantId: args.tenantId,
        outcomeId,
        queueItemId: args.request.queueItemId,
        operatorActionLogId: args.request.operatorActionLogId,
        commandId: resolvedLineage.commandId,
        canonicalIssueKey: resolvedLineage.canonicalIssueKey,
        sourceType: resolvedLineage.sourceType,
        sourceId: resolvedLineage.sourceId,
        outcomeType: args.request.outcomeType,
        outcomeStatus: args.request.outcomeStatus,
        reasonCode: args.request.reasonCode ?? null,
        notes: args.request.notes ?? null,
        reportedByFounderActorId: args.actorId,
        reportedAt: generatedAt,
        auditEventId,
        metadata: {},
        idempotencyKey: args.request.idempotencyKey,
        createdAt: generatedAt
      });

      const resolution = this.resolver.resolve({
        priorState: lineage?.issueState ?? null,
        outcome: {
          outcomeType: outcome.outcomeType,
          outcomeStatus: outcome.outcomeStatus,
          reportedAtIso: outcome.reportedAtIso,
          reasonCode: outcome.reasonCode
        }
      });

      const issueState = await this.repository.upsertIssueState({
        tenantId: args.tenantId,
        canonicalIssueKey: outcome.canonicalIssueKey,
        currentState: resolution.currentState,
        lastOutcomeType: outcome.outcomeType,
        lastOutcomeStatus: outcome.outcomeStatus,
        lastQueueItemId: outcome.queueItemId,
        lastOperatorActionLogId: outcome.operatorActionLogId,
        lastCommandId: outcome.commandId,
        lastUpdatedAt: generatedAt,
        lastOutcomeAt: outcome.reportedAtIso,
        reopenCount: resolution.reopenCount,
        resolutionCount: resolution.resolutionCount,
        metadata: {
          lastReasonCode: outcome.reasonCode,
          wasRecentlyRejected: resolution.signals.wasRecentlyRejected,
          wasRecentlyResolved: resolution.signals.wasRecentlyResolved,
          hasRepeatedFailure: resolution.signals.hasRepeatedFailure
        }
      });

      await this.syncQueueOutcomeState({
        tenantId: args.tenantId,
        canonicalIssueKey: outcome.canonicalIssueKey,
        issueState
      });

      return {
        ok: true,
        outcome,
        issueState,
        replayed: false,
        message: buildOutcomeFeedbackMessage({
          outcomeType: outcome.outcomeType,
          outcomeStatus: outcome.outcomeStatus,
          replayed: false
        })
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    outcomeId: string;
  }): Promise<OutcomeFeedbackDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const outcome = await this.repository.getOutcomeFeedbackById({
        tenantId: args.tenantId,
        outcomeId: args.outcomeId
      });
      if (!outcome) {
        throw new OutcomeFeedbackNotFoundError('Outcome feedback record was not found.');
      }
      const issueState = await this.repository.getIssueStateByCanonicalIssueKey({
        tenantId: args.tenantId,
        canonicalIssueKey: outcome.canonicalIssueKey
      });
      return {
        ok: true,
        outcome,
        issueState,
        message: buildOutcomeFeedbackDetailMessage(outcome)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listByIssueKey(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    canonicalIssueKey: string;
    limit?: number;
  }): Promise<OutcomeFeedbackListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const outcomes = await this.repository.listOutcomeFeedbackByCanonicalIssueKey({
        tenantId: args.tenantId,
        canonicalIssueKey: args.canonicalIssueKey,
        limit: args.limit
      });
      const issueState = await this.repository.getIssueStateByCanonicalIssueKey({
        tenantId: args.tenantId,
        canonicalIssueKey: args.canonicalIssueKey
      });
      return {
        ok: true,
        outcomes,
        issueState,
        message: buildOutcomeListMessage(outcomes.length)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listByQueueItem(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    queueItemId: string;
    limit?: number;
  }): Promise<OutcomeFeedbackListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const outcomes = await this.repository.listOutcomeFeedbackByQueueItemId({
        tenantId: args.tenantId,
        queueItemId: args.queueItemId,
        limit: args.limit
      });
      const issueState = outcomes[0]
        ? await this.repository.getIssueStateByCanonicalIssueKey({
            tenantId: args.tenantId,
            canonicalIssueKey: outcomes[0].canonicalIssueKey
          })
        : null;
      return {
        ok: true,
        outcomes,
        issueState,
        message: buildOutcomeListMessage(outcomes.length)
      };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private async syncQueueOutcomeState(args: {
    tenantId: string;
    canonicalIssueKey: string;
    issueState: Awaited<ReturnType<AgentOsRepository['upsertIssueState']>>;
  }) {
    const queueItems = await this.repository.listOperatorQueueRecords({
      tenantId: args.tenantId,
      canonicalIssueKey: args.canonicalIssueKey,
      limit: 100
    });
    for (const queueItem of queueItems) {
      await this.repository.updateOperatorQueueRecord({
        tenantId: args.tenantId,
        queueItemId: queueItem.id,
        issueState: args.issueState.currentState,
        lastOutcomeType: args.issueState.lastOutcomeType,
        lastOutcomeStatus: args.issueState.lastOutcomeStatus,
        lastOutcomeAt: args.issueState.lastOutcomeAtIso
      });
    }
  }

  private buildFallbackIssueState(
    outcome: {
      tenantId: string;
      canonicalIssueKey: string;
      queueItemId: string;
      operatorActionLogId: string | null;
      commandId: string | null;
      outcomeType: string;
      outcomeStatus: string;
      reportedAtIso: string;
      reasonCode: string | null;
    },
    generatedAt: string
  ) {
    return {
      tenantId: outcome.tenantId,
      canonicalIssueKey: outcome.canonicalIssueKey,
      currentState: 'open' as const,
      lastOutcomeType: outcome.outcomeType as never,
      lastOutcomeStatus: outcome.outcomeStatus as never,
      lastQueueItemId: outcome.queueItemId,
      lastOperatorActionLogId: outcome.operatorActionLogId,
      lastCommandId: outcome.commandId,
      lastUpdatedAtIso: generatedAt,
      lastOutcomeAtIso: outcome.reportedAtIso,
      reopenCount: 0,
      resolutionCount: 0,
      metadata: {
        lastReasonCode: outcome.reasonCode,
        wasRecentlyRejected: false,
        wasRecentlyResolved: false,
        hasRepeatedFailure: false
      }
    };
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new OutcomeFeedbackAccessDeniedError();
    }
    if (mode !== 'founder') {
      throw new OutcomeFeedbackInvalidModeError();
    }
  }

  private normalizeFailure(error: unknown): OutcomeFeedbackFailureResult {
    if (error instanceof OutcomeFeedbackAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OutcomeFeedbackInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof OutcomeFeedbackValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    if (error instanceof OutcomeFeedbackNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof OutcomeFeedbackConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: error.message };
    }
    const internal = new OutcomeFeedbackInternalError();
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: internal.message };
  }
}
