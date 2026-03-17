import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahNotificationEngineAuditService } from './notification-engine-audit.js';
import {
  NotificationEngineAccessDeniedError,
  NotificationEngineConflictError,
  NotificationEngineInternalError,
  NotificationEngineInvalidModeError,
  NotificationEngineNotFoundError,
  NotificationEngineValidationError
} from './notification-engine-errors.js';
import { buildNotificationIdempotencyKey } from './notification-engine-policy.js';
import { AaliyahNotificationEngineSources } from './notification-engine-sources.js';
import type { AaliyahFounderPreferencesResolver } from './founder-preferences-resolver.js';
import type { AaliyahDeliveryRouterService } from './delivery-router-service.js';
import {
  buildNotificationListMessage,
  buildNotificationReason,
  buildNotificationSummary,
  buildNotificationTitle
} from './notification-engine-summary.js';
import type {
  NotificationDraft,
  NotificationFailureResult,
  NotificationListResult,
  NotificationResult,
  NotificationSourceRef
} from './notification-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';

function toDraft(args: {
  source: NotificationSourceRef;
  sourceVersion: string;
  notificationType: NotificationDraft['notificationType'];
  severity: NotificationDraft['severity'];
  reason: string;
  metadata?: Record<string, unknown>;
  relatedRecommendationId?: string | null;
  relatedTaskId?: string | null;
  evaluatedAtIso: string;
}): NotificationDraft {
  return {
    source: args.source,
    notificationType: args.notificationType,
    severity: args.severity,
    status: 'active',
    title: buildNotificationTitle({ notificationType: args.notificationType }),
    summary: buildNotificationSummary({ notificationType: args.notificationType, sourceType: args.source.sourceType }),
    reason: buildNotificationReason(args.reason),
    idempotencyKey: buildNotificationIdempotencyKey({
      notificationType: args.notificationType,
      source: args.source,
      sourceVersion: args.sourceVersion
    }),
    relatedRecommendationId: args.relatedRecommendationId ?? null,
    relatedTaskId: args.relatedTaskId ?? null,
    metadata: args.metadata ?? {},
    evaluatedAtIso: args.evaluatedAtIso
  };
}

export class AaliyahNotificationEngineService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahNotificationEngineAuditService;
  private readonly sources: AaliyahNotificationEngineSources;

  constructor(
    private readonly repository: AgentOsRepository,
    diagnostics?: AaliyahDiagnosticsService,
    private readonly deliveryRouter?: AaliyahDeliveryRouterService,
    private readonly preferencesResolver?: AaliyahFounderPreferencesResolver
  ) {
    this.audit = new AaliyahNotificationEngineAuditService(diagnostics);
    this.sources = new AaliyahNotificationEngineSources(repository);
  }

  async evaluateSource(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    source: NotificationSourceRef;
    generatedAt?: string;
  }): Promise<NotificationResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const bundle = await this.sources.loadSourceBundle({ tenantId: args.tenantId, source: args.source });
      const draft = this.evaluateBundle(bundle, generatedAt);
      const existing = await this.repository.getNotificationByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey: draft.idempotencyKey
      });
      if (existing) {
        await this.audit.record({
          eventType: 'aaliyah.notification.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: generatedAt,
          metadata: this.audit.buildMetadata({
            notificationId: existing.id,
            sourceType: existing.source.sourceType,
            sourceId: existing.source.sourceId,
            notificationType: existing.notificationType,
            idempotencyKey: existing.idempotencyKey,
            severity: existing.severity,
            relatedRecommendationId: existing.relatedRecommendationId,
            relatedTaskId: existing.relatedTaskId,
            reason: existing.reason,
            summary: existing.summary,
            replayed: true
          })
        });
        return { ok: true, notification: existing, replayed: true, message: existing.summary };
      }

      const notificationId = `notification:${randomUUID()}`;
      const auditEventId = await this.audit.record({
        eventType: draft.notificationType === 'noop' ? 'aaliyah.notification.noop' : 'aaliyah.notification.created',
        principalId: args.actorId,
        tenantId: args.tenantId,
        mode: args.mode,
        timestamp: generatedAt,
        metadata: this.audit.buildMetadata({
          notificationId,
          sourceType: draft.source.sourceType,
          sourceId: draft.source.sourceId,
          notificationType: draft.notificationType,
          idempotencyKey: draft.idempotencyKey,
          severity: draft.severity,
          relatedRecommendationId: draft.relatedRecommendationId,
          relatedTaskId: draft.relatedTaskId,
          reason: draft.reason,
          summary: draft.summary,
          replayed: false
        })
      });

      const notification = await this.repository.createNotification({
        tenantId: args.tenantId,
        notificationId,
        sourceType: draft.source.sourceType,
        sourceId: draft.source.sourceId,
        notificationType: draft.notificationType,
        severity: draft.severity,
        notificationStatus: draft.status,
        title: draft.title,
        summary: draft.summary,
        reason: draft.reason,
        idempotencyKey: draft.idempotencyKey,
        relatedRecommendationId: draft.relatedRecommendationId,
        relatedTaskId: draft.relatedTaskId,
        auditEventId,
        metadata: draft.metadata,
        createdAt: generatedAt,
        evaluatedAt: draft.evaluatedAtIso
      });

      if (this.deliveryRouter && notification.notificationType !== 'noop') {
        await this.deliveryRouter.routeNotification({
          tenantId: args.tenantId,
          actorId: args.actorId,
          principalContext: args.principalContext,
          mode: args.mode,
          notificationId: notification.id,
          generatedAt
        });
      }

      return { ok: true, notification, replayed: false, message: notification.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getNotificationById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    notificationId: string;
  }): Promise<NotificationResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const notification = await this.repository.getNotificationById({ tenantId: args.tenantId, notificationId: args.notificationId });
      if (!notification) {
        throw new NotificationEngineNotFoundError('Notification was not found.');
      }
      return { ok: true, notification, replayed: false, message: buildNotificationListMessage(1) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listNotifications(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    status?: 'active' | 'acknowledged' | 'dismissed';
  }): Promise<NotificationListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const preferences = this.preferencesResolver
        ? await this.preferencesResolver.resolve({ tenantId: args.tenantId, actorUserId: args.actorId })
        : null;
      const notifications = await this.repository.listNotifications({
        tenantId: args.tenantId,
        limit: args.limit,
        status: args.status
      });
      const filtered = preferences
        ? notifications.filter((item) => {
            const order = ['info', 'warning', 'critical'];
            return order.indexOf(item.severity) >= order.indexOf(preferences.notification.minimumConsoleSeverity);
          })
        : notifications;
      return { ok: true, notifications: filtered, message: buildNotificationListMessage(filtered.length) };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async acknowledgeNotification(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    notificationId: string;
    generatedAt?: string;
  }): Promise<NotificationResult> {
    return this.transitionNotification({ ...args, action: 'acknowledged', eventType: 'aaliyah.notification.acknowledged' });
  }

  async dismissNotification(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    notificationId: string;
    generatedAt?: string;
  }): Promise<NotificationResult> {
    return this.transitionNotification({ ...args, action: 'dismissed', eventType: 'aaliyah.notification.dismissed' });
  }

  private async transitionNotification(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    notificationId: string;
    action: 'acknowledged' | 'dismissed';
    eventType: 'aaliyah.notification.acknowledged' | 'aaliyah.notification.dismissed';
    generatedAt?: string;
  }): Promise<NotificationResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getNotificationById({ tenantId: args.tenantId, notificationId: args.notificationId });
      if (!existing) {
        throw new NotificationEngineNotFoundError('Notification was not found.');
      }
      if (existing.status === args.action) {
        return { ok: true, notification: existing, replayed: true, message: existing.summary };
      }
      if (existing.status !== 'active') {
        throw new NotificationEngineConflictError('Notification has already been resolved.');
      }
      const notification = await this.repository.updateNotificationStatus({
        tenantId: args.tenantId,
        notificationId: args.notificationId,
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
          notificationId: notification.id,
          sourceType: notification.source.sourceType,
          sourceId: notification.source.sourceId,
          notificationType: notification.notificationType,
          idempotencyKey: notification.idempotencyKey,
          severity: notification.severity,
          relatedRecommendationId: notification.relatedRecommendationId,
          relatedTaskId: notification.relatedTaskId,
          reason: notification.reason,
          summary: notification.summary,
          replayed: false
        })
      });
      return { ok: true, notification, replayed: false, message: notification.summary };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private evaluateBundle(bundle: {
    source: NotificationSourceRef;
    followThroughRecord: { status: string; reason: string; createdArtifactIds: string[] } | null;
    recommendation: { id: string; recommendationType: string; status: string; reason: string; relatedTaskId: string | null } | null;
    task: { id: string; priority: string } | null;
    sourceVersion: string;
  }, evaluatedAtIso: string): NotificationDraft {
    if (
      (bundle.followThroughRecord?.status === 'stale' || bundle.source.sourceType === 'task')
      && ['high', 'critical'].includes(bundle.task?.priority ?? '')
    ) {
      return toDraft({
        source: bundle.source,
        sourceVersion: bundle.sourceVersion,
        notificationType: 'stale_critical_work',
        severity: 'critical',
        reason: 'Stale high-priority work still needs founder attention.',
        relatedTaskId: bundle.task?.id ?? null,
        evaluatedAtIso
      });
    }

    if (bundle.recommendation?.recommendationType === 'review_blocked' && bundle.recommendation.status === 'active') {
      return toDraft({
        source: bundle.source,
        sourceVersion: bundle.sourceVersion,
        notificationType: 'blocked_recommendation',
        severity: 'warning',
        reason: 'A blocked recommendation is still active and unresolved.',
        relatedRecommendationId: bundle.recommendation.id,
        relatedTaskId: bundle.task?.id ?? bundle.recommendation?.relatedTaskId ?? null,
        evaluatedAtIso
      });
    }

    if (bundle.followThroughRecord && (bundle.followThroughRecord.status === 'blocked' || bundle.followThroughRecord.reason.includes('review'))) {
      return toDraft({
        source: bundle.source,
        sourceVersion: bundle.sourceVersion,
        notificationType: 'founder_review_required',
        severity: 'warning',
        reason: 'Follow-through state is asking for explicit founder review.',
        relatedTaskId: bundle.task?.id ?? null,
        evaluatedAtIso
      });
    }

    if (
      bundle.followThroughRecord?.createdArtifactIds.length
      && ['high', 'critical'].includes(bundle.task?.priority ?? '')
    ) {
      return toDraft({
        source: bundle.source,
        sourceVersion: bundle.sourceVersion,
        notificationType: 'high_priority_follow_through',
        severity: 'warning',
        reason: 'High-priority follow-through was created and should be surfaced.',
        relatedTaskId: bundle.task?.id ?? bundle.followThroughRecord.createdArtifactIds[0] ?? null,
        evaluatedAtIso
      });
    }

    return toDraft({
      source: bundle.source,
      sourceVersion: bundle.sourceVersion,
      notificationType: 'noop',
      severity: 'info',
      reason: 'No notification is active for this source.',
      evaluatedAtIso
    });
  }

  private assertFounderModeAccess(principalContext: 'founder' | 'operator', mode: FounderBriefingMode) {
    try {
      this.access.assertFounderPrincipal(principalContext);
    } catch {
      throw new NotificationEngineAccessDeniedError();
    }
    try {
      this.access.assertModeAccess({
        activeMode: mode,
        requestedMode: mode,
        detailLevel: mode === 'founder' ? 'summary' : 'detail'
      });
    } catch {
      throw new NotificationEngineInvalidModeError();
    }
  }

  private normalizeFailure(errorLike: unknown): NotificationFailureResult {
    const error = errorLike instanceof Error ? errorLike : new NotificationEngineInternalError();
    return error instanceof NotificationEngineAccessDeniedError || error.message === 'aaliyah_principal_context_denied'
      ? { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: 'Founder access is required for notifications.' }
      : error instanceof NotificationEngineInvalidModeError || error.message.startsWith('aaliyah_memory_boundary_denied')
        ? { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: 'Mode is not allowed for notifications.' }
        : error instanceof NotificationEngineValidationError
          ? { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message }
          : error instanceof NotificationEngineNotFoundError
            ? { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message }
            : error instanceof NotificationEngineConflictError
              ? { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message }
              : { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: false, message: 'Notification evaluation failed.' };
  }
}
