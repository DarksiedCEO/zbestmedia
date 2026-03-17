import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahStrategicIntelligenceAuditService } from './strategic-intelligence-audit.js';
import {
  StrategicIntelligenceAccessDeniedError,
  StrategicIntelligenceConflictError,
  StrategicIntelligenceInternalError,
  StrategicIntelligenceInvalidModeError,
  StrategicIntelligenceNotFoundError,
  StrategicIntelligenceValidationError
} from './strategic-intelligence-errors.js';
import { evaluateStrategicIntelligence } from './strategic-intelligence-evaluator.js';
import { buildListMessage } from './strategic-intelligence-policy.js';
import { AaliyahStrategicIntelligenceSources } from './strategic-intelligence-sources.js';
import { buildStrategicInsightMessage } from './strategic-intelligence-summary.js';
import type {
  StrategicInsightDetailResult,
  StrategicInsightFailureResult,
  StrategicInsightListResult,
  StrategicInsightResult,
  StrategicIntelligenceEvaluationScope
} from './strategic-intelligence-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

export class AaliyahStrategicIntelligenceService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahStrategicIntelligenceAuditService;
  private readonly sources: AaliyahStrategicIntelligenceSources;

  constructor(private readonly repository: AgentOsRepository, diagnostics?: AaliyahDiagnosticsService) {
    this.audit = new AaliyahStrategicIntelligenceAuditService(diagnostics);
    this.sources = new AaliyahStrategicIntelligenceSources(repository);
  }

  async evaluate(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    scope: StrategicIntelligenceEvaluationScope;
    generatedAt?: string;
  }): Promise<StrategicInsightResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadBundle({ ...args, generatedAt });
      const drafts = evaluateStrategicIntelligence({ bundle, evaluatedAtIso: generatedAt });
      if (drafts.length === 0) {
        await this.audit.record({
          eventType: 'aaliyah.strategic_insight.noop',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { scope: args.scope }
        });
        return { ok: true, insights: [], replayedCount: 0, message: 'No strategic insight qualified for persistence.' };
      }

      const insights = [] as Awaited<ReturnType<AgentOsRepository['createStrategicInsight']>>[];
      let replayedCount = 0;
      for (const draft of drafts) {
        const existing = await this.repository.getStrategicInsightByIdempotencyKey({
          tenantId: args.tenantId,
          idempotencyKey: draft.idempotencyKey
        });
        if (existing) {
          replayedCount += 1;
          insights.push(existing);
          await this.audit.record({
            eventType: 'aaliyah.strategic_insight.replayed',
            principalId: args.actorId,
            tenantId: args.tenantId,
            mode: args.mode,
            timestamp: generatedAt,
            metadata: this.audit.buildMetadata({
              insightId: existing.id,
              insightType: existing.insightType,
              idempotencyKey: existing.idempotencyKey,
              relatedEntityIds: existing.relatedEntityIds,
              relatedRecordIds: existing.relatedRecordIds,
              reason: existing.reason,
              summary: existing.summary,
              replayed: true
            })
          });
          continue;
        }

        const insightId = `strategic-insight:${randomUUID()}`;
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.strategic_insight.created',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            insightId,
            insightType: draft.insightType,
            idempotencyKey: draft.idempotencyKey,
            relatedEntityIds: draft.relatedEntityIds,
            relatedRecordIds: draft.relatedRecordIds,
            reason: draft.reason,
            summary: draft.summary,
            replayed: false
          })
        });

        const created = await this.repository.createStrategicInsight({
          tenantId: args.tenantId,
          insightId,
          insightType: draft.insightType,
          insightStatus: draft.status,
          title: draft.title,
          summary: draft.summary,
          reason: draft.reason,
          idempotencyKey: draft.idempotencyKey,
          relatedEntityIds: draft.relatedEntityIds,
          relatedRecordIds: draft.relatedRecordIds,
          metadata: draft.metadata,
          auditEventId,
          createdAt: generatedAt,
          evaluatedAt: draft.evaluatedAtIso
        });
        insights.push(created);
      }

      return {
        ok: true,
        insights,
        replayedCount,
        message: buildStrategicInsightMessage(insights.length, replayedCount)
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
    insightId: string;
  }): Promise<StrategicInsightDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const insight = await this.repository.getStrategicInsightById({ tenantId: args.tenantId, insightId: args.insightId });
      if (!insight) {
        throw new StrategicIntelligenceNotFoundError('Strategic insight was not found.');
      }
      return { ok: true, insight, message: insight.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async list(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    status?: 'active' | 'superseded' | 'acknowledged' | 'dismissed';
  }): Promise<StrategicInsightListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const insights = await this.repository.listStrategicInsights({
        tenantId: args.tenantId,
        limit: args.limit,
        status: args.status
      });
      return { ok: true, insights, message: buildListMessage(insights.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async acknowledge(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    insightId: string;
    generatedAt?: string;
  }): Promise<StrategicInsightDetailResult> {
    return this.transition({ ...args, nextStatus: 'acknowledged', eventType: 'aaliyah.strategic_insight.acknowledged' });
  }

  async dismiss(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    insightId: string;
    generatedAt?: string;
  }): Promise<StrategicInsightDetailResult> {
    return this.transition({ ...args, nextStatus: 'dismissed', eventType: 'aaliyah.strategic_insight.dismissed' });
  }

  private async transition(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    insightId: string;
    nextStatus: 'acknowledged' | 'dismissed';
    eventType: 'aaliyah.strategic_insight.acknowledged' | 'aaliyah.strategic_insight.dismissed';
    generatedAt?: string;
  }): Promise<StrategicInsightDetailResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getStrategicInsightById({ tenantId: args.tenantId, insightId: args.insightId });
      if (!existing) {
        throw new StrategicIntelligenceNotFoundError('Strategic insight was not found.');
      }
      if (existing.status === args.nextStatus) {
        return { ok: true, insight: existing, message: existing.summary };
      }
      if (existing.status !== 'active') {
        throw new StrategicIntelligenceConflictError('Strategic insight has already been resolved.');
      }
      const insight = await this.repository.updateStrategicInsightStatus({
        tenantId: args.tenantId,
        insightId: args.insightId,
        status: args.nextStatus,
        changedAt: generatedAt
      });
      await this.audit.record({
        eventType: args.eventType,
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          insightId: insight.id,
          insightType: insight.insightType,
          idempotencyKey: insight.idempotencyKey,
          relatedEntityIds: insight.relatedEntityIds,
          relatedRecordIds: insight.relatedRecordIds,
          reason: insight.reason,
          summary: insight.summary,
          replayed: false
        })
      });
      return { ok: true, insight, message: insight.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new StrategicIntelligenceAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new StrategicIntelligenceInvalidModeError();
    }
  }

  private normalizeFailure(errorValue: unknown): StrategicInsightFailureResult {
    const error = errorValue instanceof Error ? errorValue : new StrategicIntelligenceInternalError();
    return error instanceof StrategicIntelligenceAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for strategic intelligence.' }
      : error instanceof StrategicIntelligenceInvalidModeError || error.message === 'aaliyah_mode_boundary_violation'
        ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Strategic intelligence is only available in founder mode.' }
        : error instanceof StrategicIntelligenceValidationError
          ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
          : error instanceof StrategicIntelligenceNotFoundError
            ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
            : error instanceof StrategicIntelligenceConflictError
              ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
              : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: error.message };
  }
}
