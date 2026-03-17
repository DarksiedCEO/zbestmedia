import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahDigestComposerAuditService } from './digest-composer-audit.js';
import {
  DigestComposerAccessDeniedError,
  DigestComposerConflictError,
  DigestComposerInvalidModeError,
  DigestComposerNotFoundError,
  DigestComposerValidationError
} from './digest-composer-errors.js';
import { composeDigestDraft } from './digest-dispatch-rules.js';
import { AaliyahDigestComposerSources } from './digest-composer-sources.js';
import { buildDigestListMessage, buildDigestMessage } from './digest-composer-policy.js';
import { buildDigestSendMessage } from './digest-composer-summary.js';
import { renderDigestHtml } from './digest-composer-renderer.js';
import type { DigestListResult, DigestResult, DigestType } from './digest-composer-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';
import type { AaliyahDeliveryRouterService } from './delivery-router-service.js';

export class AaliyahDigestComposerService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahDigestComposerAuditService;
  private readonly sources: AaliyahDigestComposerSources;

  constructor(
    private readonly repository: AgentOsRepository,
    private readonly deliveryRouter: AaliyahDeliveryRouterService,
    diagnostics?: AaliyahDiagnosticsService
  ) {
    this.audit = new AaliyahDigestComposerAuditService(diagnostics);
    this.sources = new AaliyahDigestComposerSources(repository);
  }

  async compose(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    digestType: DigestType;
    generatedAt?: string;
  }): Promise<DigestResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadBundle({ tenantId: args.tenantId, generatedAtIso: generatedAt });
      const draft = composeDigestDraft({ digestType: args.digestType, bundle });
      const existing = await this.repository.getDigestByIdempotencyKey({ tenantId: args.tenantId, idempotencyKey: draft.idempotencyKey });
      if (existing) {
        await this.audit.record({
          eventType: 'aaliyah.digest.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { digestId: existing.id, digestType: existing.digestType, idempotencyKey: existing.idempotencyKey, status: existing.digestStatus }
        });
        return { ok: true, digest: existing, replayed: true, message: buildDigestMessage({ digestType: existing.digestType, digestStatus: existing.digestStatus, replayed: true }) };
      }

      const digestId = `digest:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: draft.digestStatus === 'skipped' ? 'aaliyah.digest.skipped' : 'aaliyah.digest.composed',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: { digestId, digestType: draft.digestType, idempotencyKey: draft.idempotencyKey, windowKey: draft.windowKey, status: draft.digestStatus }
      });

      const digest = await this.repository.createDigest({
        tenantId: args.tenantId,
        digestId,
        digestType: draft.digestType,
        digestStatus: draft.digestStatus,
        title: draft.title,
        summary: draft.summary,
        bodyText: draft.bodyText,
        idempotencyKey: draft.idempotencyKey,
        relatedNotificationIds: draft.relatedNotificationIds,
        relatedOpportunityIds: draft.relatedOpportunityIds,
        relatedInsightIds: draft.relatedInsightIds,
        relatedRecommendationIds: draft.relatedRecommendationIds,
        relatedFollowThroughIds: draft.relatedFollowThroughIds,
        deliveryRecordIds: [],
        auditEventId,
        metadata: draft.metadata,
        createdAt: generatedAt,
        composedAt: draft.composedAtIso,
        sentAt: null
      });
      return { ok: true, digest, replayed: false, message: buildDigestMessage({ digestType: digest.digestType, digestStatus: digest.digestStatus }) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async send(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    digestId: string;
    generatedAt?: string;
  }): Promise<DigestResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const digest = await this.repository.getDigestById({ tenantId: args.tenantId, digestId: args.digestId });
      if (!digest) {
        throw new DigestComposerNotFoundError('Digest was not found.');
      }
      if (digest.digestStatus === 'skipped') {
        throw new DigestComposerConflictError('Skipped digests cannot be sent.');
      }
      if (digest.digestStatus === 'sent') {
        await this.audit.record({
          eventType: 'aaliyah.digest.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: { digestId: digest.id, digestType: digest.digestType, idempotencyKey: digest.idempotencyKey, status: digest.digestStatus }
        });
        return { ok: true, digest, replayed: true, message: buildDigestSendMessage(digest.digestType, true) };
      }

      const delivery = await this.deliveryRouter.send({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        sourceType: 'digest',
        sourceId: digest.id,
        channel: 'email',
        generatedAt
      });
      if (!delivery.ok) {
        return delivery;
      }

      const auditEventId = await this.audit.record({
        eventType: 'aaliyah.digest.sent',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: {
          digestId: digest.id,
          digestType: digest.digestType,
          idempotencyKey: digest.idempotencyKey,
          deliveryId: delivery.delivery.id,
          replayed: delivery.replayed
        }
      });

      const updated = await this.repository.updateDigestAfterSend({
        tenantId: args.tenantId,
        digestId: digest.id,
        digestStatus: 'sent',
        deliveryRecordIds: Array.from(new Set([...digest.deliveryRecordIds, delivery.delivery.id])),
        auditEventId: auditEventId ?? digest.auditEventId,
        sentAt: generatedAt
      });
      return { ok: true, digest: updated, replayed: delivery.replayed, message: buildDigestSendMessage(updated.digestType, delivery.replayed) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    digestId: string;
  }): Promise<DigestResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const digest = await this.repository.getDigestById({ tenantId: args.tenantId, digestId: args.digestId });
      if (!digest) {
        throw new DigestComposerNotFoundError('Digest was not found.');
      }
      return { ok: true, digest, replayed: false, message: digest.summary };
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
    digestType?: DigestType;
  }): Promise<DigestListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const digests = await this.repository.listDigests({ tenantId: args.tenantId, limit: args.limit, digestType: args.digestType });
      return { ok: true, digests, message: buildDigestListMessage(digests.length) };
    } catch (error) {
      return this.normalizeFailure(error) as DigestListResult;
    }
  }

  renderHtml(digest: { title: string; summary: string; bodyText: string }) {
    return renderDigestHtml(digest);
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
      const message = error instanceof Error ? error.message : 'aaliyah_digest_access_denied';
      if (message === 'aaliyah_principal_context_denied') {
        throw new DigestComposerAccessDeniedError();
      }
      if (message.startsWith('aaliyah_memory_boundary_denied')) {
        throw new DigestComposerInvalidModeError();
      }
      throw error;
    }
  }

  private normalizeFailure(error: unknown): DigestResult {
    if (error instanceof DigestComposerAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof DigestComposerInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof DigestComposerNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof DigestComposerConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    if (error instanceof DigestComposerValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: error.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: 'Digest composer failed unexpectedly.' };
  }
}
