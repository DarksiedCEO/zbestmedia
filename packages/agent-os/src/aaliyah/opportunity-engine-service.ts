import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahOpportunityEngineAuditService } from './opportunity-engine-audit.js';
import {
  OpportunityEngineAccessDeniedError,
  OpportunityEngineConflictError,
  OpportunityEngineInternalError,
  OpportunityEngineInvalidModeError,
  OpportunityEngineNotFoundError,
  OpportunityEngineValidationError
} from './opportunity-engine-errors.js';
import { evaluateOpportunity } from './opportunity-engine-evaluator.js';
import { AaliyahOpportunityEngineSources } from './opportunity-engine-sources.js';
import { buildOpportunityListMessage } from './opportunity-engine-summary.js';
import type {
  OpportunityFailureResult,
  OpportunityListResult,
  OpportunityResult,
  OpportunitySourceRef
} from './opportunity-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahOpportunityEngineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahOpportunityEngineAuditService;
  private readonly sources: AaliyahOpportunityEngineSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahOpportunityEngineAuditService(diagnostics);
    this.sources = new AaliyahOpportunityEngineSources(repository);
  }

  async evaluateSource(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: OpportunitySourceRef;
    generatedAt?: string;
  }): Promise<OpportunityResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      if (!args.source.sourceId.trim()) {
        throw new OpportunityEngineValidationError('Opportunity source id is required.');
      }
      const bundle = await this.sources.loadSourceBundle({ ...args, generatedAt });
      const draft = evaluateOpportunity({ bundle, evaluatedAtIso: generatedAt });
      const existing = await this.repository.getOpportunityByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: draft.idempotencyKey
      });
      if (existing) {
        await this.audit.record({
          eventType: 'aaliyah.opportunity.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            opportunityId: existing.id,
            sourceType: existing.source.sourceType,
            sourceId: existing.source.sourceId,
            opportunityType: existing.opportunityType,
            idempotencyKey: existing.idempotencyKey,
            relatedTaskId: existing.relatedTaskId,
            relatedRecommendationId: existing.relatedRecommendationId,
            reason: existing.reason,
            summary: existing.summary,
            replayed: true
          })
        });
        return { ok: true, opportunity: existing, replayed: true, message: existing.summary };
      }

      const opportunityId = `opportunity:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: draft.opportunityType === 'noop' ? 'aaliyah.opportunity.noop' : 'aaliyah.opportunity.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          opportunityId,
          sourceType: draft.source.sourceType,
          sourceId: draft.source.sourceId,
          opportunityType: draft.opportunityType,
          idempotencyKey: draft.idempotencyKey,
          relatedTaskId: draft.relatedTaskId,
          relatedRecommendationId: draft.relatedRecommendationId,
          reason: draft.reason,
          summary: draft.summary,
          replayed: false
        })
      });

      const opportunity = await this.repository.createOpportunity({
        tenantId: args.tenantId,
        opportunityId,
        sourceType: draft.source.sourceType,
        sourceId: draft.source.sourceId,
        opportunityType: draft.opportunityType,
        opportunityStatus: draft.status,
        reason: draft.reason,
        summary: draft.summary,
        idempotencyKey: draft.idempotencyKey,
        relatedTaskId: draft.relatedTaskId,
        relatedRecommendationId: draft.relatedRecommendationId,
        metadata: draft.metadata,
        auditEventId,
        createdAt: generatedAt,
        evaluatedAt: draft.evaluatedAtIso
      });

      return { ok: true, opportunity, replayed: false, message: opportunity.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getOpportunityById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    opportunityId: string;
  }): Promise<OpportunityResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const opportunity = await this.repository.getOpportunityById({ tenantId: args.tenantId, opportunityId: args.opportunityId });
      if (!opportunity) {
        throw new OpportunityEngineNotFoundError('Opportunity was not found.');
      }
      return { ok: true, opportunity, replayed: false, message: buildOpportunityListMessage(1) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listOpportunities(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    status?: 'active' | 'acknowledged' | 'converted' | 'dismissed' | 'noop';
  }): Promise<OpportunityListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const opportunities = await this.repository.listOpportunities({
        tenantId: args.tenantId,
        limit: args.limit,
        status: args.status
      });
      return { ok: true, opportunities, message: buildOpportunityListMessage(opportunities.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async acknowledgeOpportunity(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    opportunityId: string;
    generatedAt?: string;
  }): Promise<OpportunityResult> {
    return this.transitionOpportunity({ ...args, action: 'acknowledged', eventType: 'aaliyah.opportunity.acknowledged' });
  }

  async dismissOpportunity(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    opportunityId: string;
    generatedAt?: string;
  }): Promise<OpportunityResult> {
    return this.transitionOpportunity({ ...args, action: 'dismissed', eventType: 'aaliyah.opportunity.dismissed' });
  }

  private async transitionOpportunity(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    opportunityId: string;
    action: 'acknowledged' | 'dismissed';
    eventType: 'aaliyah.opportunity.acknowledged' | 'aaliyah.opportunity.dismissed';
    generatedAt?: string;
  }): Promise<OpportunityResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getOpportunityById({ tenantId: args.tenantId, opportunityId: args.opportunityId });
      if (!existing) {
        throw new OpportunityEngineNotFoundError('Opportunity was not found.');
      }
      if (existing.status === args.action) {
        return { ok: true, opportunity: existing, replayed: true, message: existing.summary };
      }
      if (existing.status !== 'active') {
        throw new OpportunityEngineConflictError('Opportunity has already been resolved.');
      }
      const opportunity = await this.repository.updateOpportunityStatus({
        tenantId: args.tenantId,
        opportunityId: args.opportunityId,
        status: args.action,
        changedAt: generatedAt
      });
      await this.audit.record({
        eventType: args.eventType,
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          opportunityId: opportunity.id,
          sourceType: opportunity.source.sourceType,
          sourceId: opportunity.source.sourceId,
          opportunityType: opportunity.opportunityType,
          idempotencyKey: opportunity.idempotencyKey,
          relatedTaskId: opportunity.relatedTaskId,
          relatedRecommendationId: opportunity.relatedRecommendationId,
          reason: opportunity.reason,
          summary: opportunity.summary,
          replayed: false
        })
      });
      return { ok: true, opportunity, replayed: false, message: opportunity.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new OpportunityEngineAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new OpportunityEngineInvalidModeError();
    }
  }

  private normalizeFailure(errorValue: unknown): OpportunityFailureResult {
    const error = errorValue instanceof Error ? errorValue : new OpportunityEngineInternalError();
    return error instanceof OpportunityEngineAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for opportunities.' }
      : error instanceof OpportunityEngineInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
        ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for opportunities.' }
        : error instanceof OpportunityEngineValidationError
          ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
          : error instanceof OpportunityEngineNotFoundError
            ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
            : error instanceof OpportunityEngineConflictError
              ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
              : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Opportunity evaluation failed.' };
  }
}
