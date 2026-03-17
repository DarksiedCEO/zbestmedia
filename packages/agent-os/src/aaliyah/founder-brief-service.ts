import { randomUUID } from 'node:crypto';

import type { AgentOsRepository } from '../persistence/repository.js';
import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import {
  FounderBriefAccessDeniedError,
  FounderBriefConflictError,
  FounderBriefInvalidModeError,
  FounderBriefNotFoundError,
  FounderBriefValidationError
} from './founder-brief-errors.js';
import { AaliyahFounderBriefAuditService } from './founder-brief-audit.js';
import { composeFounderBrief } from './founder-brief-composer.js';
import { AaliyahFounderBriefSources } from './founder-brief-sources.js';
import { buildFounderBriefListMessage } from './founder-brief-policy.js';
import { buildFounderBriefMessage } from './founder-brief-summary.js';
import type { FounderBriefKind, FounderBriefListResult, FounderBriefResult } from './founder-brief-types.js';
import type { AaliyahFounderPreferencesResolver } from './founder-preferences-resolver.js';

export class AaliyahFounderBriefService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahFounderBriefAuditService;
  private readonly sources: AaliyahFounderBriefSources;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService,
    private readonly preferencesResolver?: AaliyahFounderPreferencesResolver
  ) {
    this.audit = new AaliyahFounderBriefAuditService(diagnostics);
    this.sources = new AaliyahFounderBriefSources(repository);
  }

  async generate(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    briefKind?: FounderBriefKind;
    generatedAt?: string;
  }): Promise<FounderBriefResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const briefKind = args.briefKind ?? 'daily';
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadBundle({ tenantId: args.tenantId, generatedAtIso: generatedAt, briefKind });
      const preferences = this.preferencesResolver
        ? await this.preferencesResolver.resolve({ tenantId: args.tenantId, actorUserId: args.actorId, generatedAt })
        : undefined;
      const draft = composeFounderBrief({ bundle, preferences });
      const existing = await this.repository.getFounderBriefByIdempotencyKey({ tenantId: args.tenantId, idempotencyKey: draft.idempotencyKey });
      if (existing) {
        const items = await this.repository.listFounderBriefItems({ tenantId: args.tenantId, briefId: existing.id });
        await this.audit.record({
          eventType: 'aaliyah.founder_brief.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { briefId: existing.id, briefKind: existing.briefKind, idempotencyKey: existing.idempotencyKey, itemCount: items.length }
        });
        return { ok: true, brief: existing, items, replayed: true, message: buildFounderBriefMessage({ replayed: true, itemCount: items.length, headline: existing.headline }) };
      }

      const briefId = `founder-brief:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: 'aaliyah.founder_brief.generated',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: {
          briefId,
          briefKind: draft.briefKind,
          briefDate: draft.briefDate,
          idempotencyKey: draft.idempotencyKey,
          itemCount: draft.items.length,
          previousBriefId: draft.previousBriefId
        }
      });

      const brief = await this.repository.createFounderBrief({
        tenantId: args.tenantId,
        briefId,
        briefDate: draft.briefDate,
        briefKind: draft.briefKind,
        generatedByFounderActorId: args.actorId,
        generatedAt,
        windowStartAt: draft.windowStartAtIso,
        windowEndAt: draft.windowEndAtIso,
        headline: draft.headline,
        summary: draft.summary,
        idempotencyKey: draft.idempotencyKey,
        previousBriefId: draft.previousBriefId,
        deliveryStatus: 'not_sent',
        lastDispatchedAt: null,
        auditEventId,
        metadata: draft.metadata,
        createdAt: generatedAt
      });

      const items = await Promise.all(
        draft.items.map((item) => this.repository.createFounderBriefItem({
          tenantId: args.tenantId,
          briefItemId: `founder-brief-item:${randomUUID()}`,
          briefId,
          section: item.section,
          queueItemId: item.queueItemId,
          canonicalIssueKey: item.canonicalIssueKey,
          operatorActionLogId: item.operatorActionLogId,
          outcomeFeedbackId: item.outcomeFeedbackId,
          priorityScore: item.priorityScore,
          deltaType: item.deltaType,
          payload: item.payload,
          createdAt: generatedAt
        }))
      );

      return { ok: true, brief, items, replayed: false, message: buildFounderBriefMessage({ replayed: false, itemCount: items.length, headline: brief.headline }) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async latest(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    briefKind?: FounderBriefKind;
  }): Promise<FounderBriefResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const brief = await this.repository.getLatestFounderBrief({ tenantId: args.tenantId, briefKind: args.briefKind ?? 'daily' });
      if (!brief) throw new FounderBriefNotFoundError('Founder brief was not found.');
      const items = await this.repository.listFounderBriefItems({ tenantId: args.tenantId, briefId: brief.id });
      return { ok: true, brief, items, replayed: false, message: brief.headline };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    briefId: string;
  }): Promise<FounderBriefResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const brief = await this.repository.getFounderBriefById({ tenantId: args.tenantId, briefId: args.briefId });
      if (!brief) throw new FounderBriefNotFoundError('Founder brief was not found.');
      const items = await this.repository.listFounderBriefItems({ tenantId: args.tenantId, briefId: brief.id });
      return { ok: true, brief, items, replayed: false, message: brief.headline };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async list(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    briefKind?: FounderBriefKind;
    limit?: number;
  }): Promise<FounderBriefListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const briefs = await this.repository.listFounderBriefs({ tenantId: args.tenantId, briefKind: args.briefKind, limit: args.limit });
      return { ok: true, briefs, message: buildFounderBriefListMessage(briefs.length) };
    } catch (error) {
      return this.normalizeFailure(error) as FounderBriefListResult;
    }
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderModeAccess({
        principalContext,
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'aaliyah_founder_brief_access_denied';
      if (message === 'aaliyah_principal_context_denied') {
        throw new FounderBriefAccessDeniedError();
      }
      if (message.startsWith('aaliyah_memory_boundary_denied')) {
        throw new FounderBriefInvalidModeError();
      }
      throw error;
    }
  }

  private normalizeFailure(error: unknown): FounderBriefResult {
    if (error instanceof FounderBriefAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof FounderBriefInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof FounderBriefNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof FounderBriefConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    if (error instanceof FounderBriefValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: error.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: 'Founder brief failed unexpectedly.' };
  }
}
