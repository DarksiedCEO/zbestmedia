import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahRecommendationEngineAuditService } from './recommendation-engine-audit.js';
import {
  RecommendationEngineAccessDeniedError,
  RecommendationEngineConflictError,
  RecommendationEngineInternalError,
  RecommendationEngineInvalidModeError,
  RecommendationEngineNotFoundError,
  RecommendationEngineValidationError
} from './recommendation-engine-errors.js';
import { evaluateRecommendation } from './recommendation-engine-evaluator.js';
import { AaliyahRecommendationEngineSources } from './recommendation-engine-sources.js';
import { buildRecommendationListMessage } from './recommendation-engine-summary.js';
import type {
  RecommendationFailureResult,
  RecommendationListResult,
  RecommendationResult,
  RecommendationSourceRef
} from './recommendation-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahRecommendationEngineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahRecommendationEngineAuditService;
  private readonly sources: AaliyahRecommendationEngineSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahRecommendationEngineAuditService(diagnostics);
    this.sources = new AaliyahRecommendationEngineSources(repository);
  }

  async evaluateSource(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: RecommendationSourceRef;
    generatedAt?: string;
  }): Promise<RecommendationResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      if (!args.source.sourceId.trim()) {
        throw new RecommendationEngineValidationError('Recommendation source id is required.');
      }
      const bundle = await this.sources.loadSourceBundle({ ...args, generatedAt });
      const draft = evaluateRecommendation({ bundle, evaluatedAtIso: generatedAt });
      const existing = await this.repository.getRecommendationByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: draft.idempotencyKey
      });
      if (existing) {
        await this.audit.record({
          eventType: 'aaliyah.recommendation.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            recommendationId: existing.id,
            sourceType: existing.source.sourceType,
            sourceId: existing.source.sourceId,
            recommendationType: existing.recommendationType,
            idempotencyKey: existing.idempotencyKey,
            relatedCommandId: existing.relatedCommandId,
            relatedTaskId: existing.relatedTaskId,
            reason: existing.reason,
            summary: existing.summary,
            replayed: true
          })
        });
        return { ok: true, recommendation: existing, replayed: true, message: existing.summary };
      }

      const recommendationId = `recommendation:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: draft.recommendationType === 'noop' ? 'aaliyah.recommendation.noop' : 'aaliyah.recommendation.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          recommendationId,
          sourceType: draft.source.sourceType,
          sourceId: draft.source.sourceId,
          recommendationType: draft.recommendationType,
          idempotencyKey: draft.idempotencyKey,
          relatedCommandId: draft.relatedCommandId,
          relatedTaskId: draft.relatedTaskId,
          reason: draft.reason,
          summary: draft.summary,
          replayed: false
        })
      });

      const recommendation = await this.repository.createRecommendation({
        tenantId: args.tenantId,
        recommendationId,
        sourceType: draft.source.sourceType,
        sourceId: draft.source.sourceId,
        recommendationType: draft.recommendationType,
        recommendationStatus: draft.status,
        reason: draft.reason,
        summary: draft.summary,
        idempotencyKey: draft.idempotencyKey,
        relatedCommandId: draft.relatedCommandId,
        relatedTaskId: draft.relatedTaskId,
        metadata: draft.metadata,
        auditEventId,
        createdAt: generatedAt,
        evaluatedAt: draft.evaluatedAtIso
      });

      return { ok: true, recommendation, replayed: false, message: recommendation.summary };
    } catch (error) {
      return this.normalizeFailure({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error });
    }
  }

  async getRecommendationById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    recommendationId: string;
    generatedAt?: string;
  }): Promise<RecommendationResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const recommendation = await this.repository.getRecommendationById({ tenantId: args.tenantId, recommendationId: args.recommendationId });
      if (!recommendation) {
        throw new RecommendationEngineNotFoundError('Recommendation was not found.');
      }
      return { ok: true, recommendation, replayed: false, message: buildRecommendationListMessage(1) };
    } catch (error) {
      return this.normalizeFailure({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error });
    }
  }

  async listRecommendations(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    generatedAt?: string;
  }): Promise<RecommendationListResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const recommendations = await this.repository.listRecommendations({ tenantId: args.tenantId, limit: args.limit });
      return { ok: true, recommendations, message: buildRecommendationListMessage(recommendations.length) };
    } catch (error) {
      return this.normalizeFailure({ tenantId: args.tenantId, actorId: args.actorId, mode: args.mode, generatedAt, error });
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new RecommendationEngineAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new RecommendationEngineInvalidModeError();
    }
  }

  private normalizeFailure(args: {
    tenantId: string;
    actorId: string;
    mode: FounderBriefingMode;
    generatedAt: string;
    error: unknown;
  }): RecommendationFailureResult {
    const error = args.error instanceof Error ? args.error : new RecommendationEngineInternalError();
    return error instanceof RecommendationEngineAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for recommendations.' }
      : error instanceof RecommendationEngineInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
        ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for recommendations.' }
        : error instanceof RecommendationEngineValidationError
          ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
          : error instanceof RecommendationEngineNotFoundError
            ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
            : error instanceof RecommendationEngineConflictError
              ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
              : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Recommendation evaluation failed.' };
  }
}
