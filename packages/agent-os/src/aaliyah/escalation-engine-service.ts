import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahEscalationEngineAuditService } from './escalation-engine-audit.js';
import {
  EscalationEngineAccessDeniedError,
  EscalationEngineConflictError,
  EscalationEngineInternalError,
  EscalationEngineInvalidModeError,
  EscalationEngineNotFoundError
} from './escalation-engine-errors.js';
import { evaluateEscalations } from './escalation-engine-evaluator.js';
import { buildEscalationListMessage } from './escalation-engine-policy.js';
import { AaliyahEscalationEngineSources } from './escalation-engine-sources.js';
import { buildEscalationMessage } from './escalation-engine-summary.js';
import { AaliyahFounderPreferencesResolver } from './founder-preferences-resolver.js';
import type {
  EscalationDetailResult,
  EscalationFailureResult,
  EscalationListResult,
  EscalationResult
} from './escalation-engine-types.js';

export class AaliyahEscalationEngineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahEscalationEngineAuditService;
  private readonly sources: AaliyahEscalationEngineSources;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService,
    preferencesResolver?: AaliyahFounderPreferencesResolver
  ) {
    const resolver = preferencesResolver ?? new AaliyahFounderPreferencesResolver(repository);
    this.audit = new AaliyahEscalationEngineAuditService(diagnostics);
    this.sources = new AaliyahEscalationEngineSources(repository, resolver);
  }

  async evaluate(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    generatedAt?: string;
  }): Promise<EscalationResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const { preferences, ...bundle } = await this.sources.loadBundle({ ...args, generatedAt });
      const drafts = evaluateEscalations({
        bundle,
        preferences: preferences.escalation,
        evaluatedAtIso: generatedAt
      });
      if (drafts.length === 0) {
        await this.audit.record({
          eventType: 'aaliyah.escalation.noop',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { sourceVersion: bundle.sourceVersion }
        });
        return {
          ok: true,
          escalations: [],
          replayedCount: 0,
          message: 'No escalations crossed founder thresholds.'
        };
      }

      const escalations = [] as Awaited<ReturnType<AgentOsRepository['createEscalation']>>[];
      let replayedCount = 0;
      for (const draft of drafts) {
        const existing = await this.repository.getEscalationByIdempotencyKey({
          tenantId: args.tenantId,
          idempotencyKey: draft.idempotencyKey
        });
        if (existing) {
          replayedCount += 1;
          escalations.push(existing);
          await this.audit.record({
            eventType: 'aaliyah.escalation.replayed',
            principalId: args.actorId,
            tenantId: args.tenantId,
            mode: args.mode,
            timestamp: generatedAt,
            metadata: this.audit.buildMetadata({
              escalationId: existing.id,
              escalationType: existing.escalationType,
              escalationLevel: existing.escalationLevel,
              idempotencyKey: existing.idempotencyKey,
              sourceRecordIds: existing.sourceRecordIds,
              sourceRecordTypes: existing.sourceRecordTypes,
              relatedClusterId: existing.relatedClusterId,
              reason: existing.reason,
              summary: existing.summary,
              replayed: true
            })
          });
          continue;
        }

        const escalationId = `escalation:${randomUUID()}`;
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.escalation.created',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            escalationId,
            escalationType: draft.escalationType,
            escalationLevel: draft.escalationLevel,
            idempotencyKey: draft.idempotencyKey,
            sourceRecordIds: draft.sourceRecordIds,
            sourceRecordTypes: draft.sourceRecordTypes,
            relatedClusterId: draft.relatedClusterId,
            reason: draft.reason,
            summary: draft.summary,
            replayed: false
          })
        });

        const created = await this.repository.createEscalation({
          tenantId: args.tenantId,
          escalationId,
          escalationType: draft.escalationType,
          escalationStatus: draft.status,
          escalationLevel: draft.escalationLevel,
          title: draft.title,
          summary: draft.summary,
          reason: draft.reason,
          idempotencyKey: draft.idempotencyKey,
          sourceRecordIds: draft.sourceRecordIds,
          sourceRecordTypes: draft.sourceRecordTypes,
          relatedClusterId: draft.relatedClusterId,
          auditEventId,
          metadata: draft.metadata,
          createdAt: generatedAt,
          evaluatedAt: draft.evaluatedAtIso
        });
        escalations.push(created);
      }

      return {
        ok: true,
        escalations,
        replayedCount,
        message: buildEscalationMessage(escalations.length, replayedCount)
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
    escalationId: string;
  }): Promise<EscalationDetailResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const escalation = await this.repository.getEscalationById({
        tenantId: args.tenantId,
        escalationId: args.escalationId
      });
      if (!escalation) {
        throw new EscalationEngineNotFoundError('Escalation record was not found.');
      }
      return { ok: true, escalation, message: escalation.summary };
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
    status?: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  }): Promise<EscalationListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const escalations = await this.repository.listEscalations({
        tenantId: args.tenantId,
        limit: args.limit,
        status: args.status
      });
      return { ok: true, escalations, message: buildEscalationListMessage(escalations.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async acknowledge(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    escalationId: string;
    generatedAt?: string;
  }): Promise<EscalationDetailResult> {
    return this.transition({
      ...args,
      nextStatus: 'acknowledged',
      eventType: 'aaliyah.escalation.acknowledged'
    });
  }

  async dismiss(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    escalationId: string;
    generatedAt?: string;
  }): Promise<EscalationDetailResult> {
    return this.transition({
      ...args,
      nextStatus: 'dismissed',
      eventType: 'aaliyah.escalation.dismissed'
    });
  }

  async resolve(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    escalationId: string;
    generatedAt?: string;
  }): Promise<EscalationDetailResult> {
    return this.transition({
      ...args,
      nextStatus: 'resolved',
      eventType: 'aaliyah.escalation.resolved'
    });
  }

  private async transition(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    escalationId: string;
    nextStatus: 'acknowledged' | 'dismissed' | 'resolved';
    eventType:
      | 'aaliyah.escalation.acknowledged'
      | 'aaliyah.escalation.dismissed'
      | 'aaliyah.escalation.resolved';
    generatedAt?: string;
  }): Promise<EscalationDetailResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getEscalationById({
        tenantId: args.tenantId,
        escalationId: args.escalationId
      });
      if (!existing) {
        throw new EscalationEngineNotFoundError('Escalation record was not found.');
      }
      if (existing.status === args.nextStatus) {
        return { ok: true, escalation: existing, message: existing.summary };
      }
      if (existing.status !== 'active' && args.nextStatus !== 'resolved') {
        throw new EscalationEngineConflictError('Escalation has already left the active state.');
      }
      if (existing.status === 'dismissed' && args.nextStatus === 'resolved') {
        throw new EscalationEngineConflictError('Dismissed escalations cannot be resolved directly.');
      }
      const escalation = await this.repository.updateEscalationStatus({
        tenantId: args.tenantId,
        escalationId: args.escalationId,
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
          escalationId: escalation.id,
          escalationType: escalation.escalationType,
          escalationLevel: escalation.escalationLevel,
          idempotencyKey: escalation.idempotencyKey,
          sourceRecordIds: escalation.sourceRecordIds,
          sourceRecordTypes: escalation.sourceRecordTypes,
          relatedClusterId: escalation.relatedClusterId,
          reason: escalation.reason,
          summary: escalation.summary,
          replayed: false
        })
      });
      return { ok: true, escalation, message: escalation.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new EscalationEngineAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new EscalationEngineInvalidModeError();
    }
  }

  private normalizeFailure(errorValue: unknown): EscalationFailureResult {
    const error = errorValue instanceof Error ? errorValue : new EscalationEngineInternalError();
    return error instanceof EscalationEngineAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false as const, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for escalations.' }
      : error instanceof EscalationEngineInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
        ? { ok: false as const, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for escalations.' }
        : error instanceof EscalationEngineNotFoundError
          ? { ok: false as const, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
          : error instanceof EscalationEngineConflictError
            ? { ok: false as const, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
            : { ok: false as const, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Escalation evaluation failed.' };
  }
}
