import { randomUUID } from 'node:crypto';

import { AaliyahAccessControlService } from './access.js';
import type { FounderBriefingMode } from './briefing-types.js';
import type { AaliyahDiagnosticsService } from './diagnostics.js';
import { AaliyahDeliveryRouterAuditService } from './delivery-router-audit.js';
import {
  DeliveryRouterAccessDeniedError,
  DeliveryRouterConflictError,
  DeliveryRouterInvalidModeError,
  DeliveryRouterNotFoundError,
  DeliveryRouterValidationError
} from './delivery-router-errors.js';
import { AaliyahDeliveryRouterHandlers } from './delivery-router-handlers.js';
import {
  buildDeliveryIdempotencyKey,
  isChannelEligibleForDigest,
  isChannelEligibleForNotification
} from './delivery-router-policy.js';
import { assertRetryable, nextAttemptCount } from './delivery-router-retry.js';
import { buildDeliveryListMessage, buildDeliveryMessage } from './delivery-router-summary.js';
import type { DeliveryChannel, DeliveryListResult, DeliveryResult, DeliverySourceType } from './delivery-router-types.js';
import type { DigestRecord } from './digest-composer-types.js';
import type { FounderPreferencesRecord } from './founder-preferences-types.js';
import type { NotificationRecord } from './notification-engine-types.js';
import type { AgentOsRepository } from '../persistence/repository.js';
import type { EmailAssistantService } from '../email/service.js';
import { renderDigestHtml } from './digest-composer-renderer.js';
import type { AaliyahFounderPreferencesResolver } from './founder-preferences-resolver.js';

export class AaliyahDeliveryRouterService {
  private readonly access = new AaliyahAccessControlService();
  private readonly audit: AaliyahDeliveryRouterAuditService;
  private readonly handlers: AaliyahDeliveryRouterHandlers;

  constructor(
    private readonly repository: AgentOsRepository,
    emailService: EmailAssistantService,
    diagnostics?: AaliyahDiagnosticsService,
    private readonly preferencesResolver?: AaliyahFounderPreferencesResolver
  ) {
    this.audit = new AaliyahDeliveryRouterAuditService(diagnostics);
    this.handlers = new AaliyahDeliveryRouterHandlers(emailService);
  }

  async send(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    sourceType: DeliverySourceType;
    sourceId: string;
    channel: DeliveryChannel;
    generatedAt?: string;
  }): Promise<DeliveryResult> {
    return this.deliver({
      ...args,
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      allowRetryFromFailed: false
    });
  }

  async routeNotification(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    notificationId: string;
    generatedAt?: string;
  }): Promise<DeliveryResult[]> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const source = await this.requireSource({ tenantId: args.tenantId, sourceId: args.notificationId, sourceType: 'notification' });
    if (source.sourceType !== 'notification') {
      throw new DeliveryRouterValidationError('Notification routing requires a notification source.');
    }
    const preferences = this.preferencesResolver
      ? await this.preferencesResolver.resolve({ tenantId: args.tenantId, actorUserId: args.actorId, generatedAt })
      : undefined;
    const notification = source.notification;
    const results: DeliveryResult[] = [];
    if (isChannelEligibleForNotification({ channel: 'console', notification, preferences })) {
      results.push(
        await this.deliver({
          ...args,
          sourceType: 'notification',
          sourceId: notification.id,
          channel: 'console',
          generatedAt,
          allowRetryFromFailed: false,
          notification,
          preferences
        })
      );
    }
    if (isChannelEligibleForNotification({ channel: 'email', notification, preferences })) {
      results.push(
        await this.deliver({
          ...args,
          sourceType: 'notification',
          sourceId: notification.id,
          channel: 'email',
          generatedAt,
          allowRetryFromFailed: false,
          notification,
          preferences
        })
      );
    }
    return results;
  }

  async retryDelivery(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    deliveryId: string;
    generatedAt?: string;
  }): Promise<DeliveryResult> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const existing = await this.repository.getDeliveryById({ tenantId: args.tenantId, deliveryId: args.deliveryId });
      if (!existing) {
        throw new DeliveryRouterNotFoundError('Delivery was not found.');
      }
      assertRetryable(existing);
      return this.deliver({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        mode: args.mode,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        channel: existing.channel,
        generatedAt,
        allowRetryFromFailed: true,
        existingDelivery: existing
      });
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async getDeliveryById(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    deliveryId: string;
  }): Promise<DeliveryResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const delivery = await this.repository.getDeliveryById({ tenantId: args.tenantId, deliveryId: args.deliveryId });
      if (!delivery) {
        throw new DeliveryRouterNotFoundError('Delivery was not found.');
      }
      return { ok: true, delivery, replayed: delivery.deliveryStatus === 'replayed', message: delivery.deliveryStatus === 'failed' ? delivery.lastError ?? 'Delivery failed.' : delivery.deliveryStatus };
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  async listDeliveries(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    limit?: number;
    sourceType?: DeliverySourceType;
    sourceId?: string;
  }): Promise<DeliveryListResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const deliveries = await this.repository.listDeliveries({
        tenantId: args.tenantId,
        limit: args.limit,
        sourceType: args.sourceType,
        sourceId: args.sourceId
      });
      return { ok: true, deliveries, message: buildDeliveryListMessage(deliveries.length) };
    } catch (error) {
      return this.normalizeFailure(error) as DeliveryListResult;
    }
  }

  private async deliver(args: {
    tenantId: string;
    actorId: string;
    principalContext: 'founder' | 'operator';
    mode: FounderBriefingMode;
    sourceType: DeliverySourceType;
    sourceId: string;
    channel: DeliveryChannel;
    generatedAt: string;
    allowRetryFromFailed: boolean;
    existingDelivery?: {
      id: string;
      attemptCount: number;
    } & Awaited<ReturnType<AgentOsRepository['getDeliveryById']>>;
    notification?: NotificationRecord;
    digest?: DigestRecord;
    preferences?: FounderPreferencesRecord;
  }): Promise<DeliveryResult> {
    try {
      this.assertFounderModeAccess(args.principalContext, args.mode);
      const source = await this.requireSource({
        tenantId: args.tenantId,
        sourceId: args.sourceId,
        sourceType: args.sourceType,
        notification: args.notification,
        digest: args.digest
      });
      const preferences = args.preferences ?? (
        this.preferencesResolver
          ? await this.preferencesResolver.resolve({ tenantId: args.tenantId, actorUserId: args.actorId, generatedAt: args.generatedAt })
          : undefined
      );
      if (source.sourceType === 'notification' && !isChannelEligibleForNotification({ channel: args.channel, notification: source.notification, preferences })) {
        throw new DeliveryRouterValidationError(`Delivery channel ${args.channel} is not allowed for this notification.`);
      }
      if (source.sourceType === 'digest' && !isChannelEligibleForDigest({ channel: args.channel, digest: source.digest, preferences })) {
        throw new DeliveryRouterValidationError(`Delivery channel ${args.channel} is not allowed for this digest.`);
      }

      const idempotencyKey = buildDeliveryIdempotencyKey({
        channel: args.channel,
        sourceType: args.sourceType,
        sourceId: args.sourceId
      });
      const existing = args.existingDelivery ?? await this.repository.getDeliveryByIdempotencyKey({
        tenantId: args.tenantId,
        idempotencyKey
      });

      if (existing && existing.deliveryStatus !== 'failed') {
        await this.audit.record({
          eventType: 'aaliyah.delivery.replayed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: args.generatedAt,
          metadata: this.audit.buildMetadata({
            deliveryId: existing.id,
            channel: existing.channel,
            sourceType: existing.sourceType,
            sourceId: existing.sourceId,
            attemptCount: existing.attemptCount,
            status: existing.deliveryStatus,
            idempotencyKey: existing.idempotencyKey,
            replayed: true
          })
        });
        return { ok: true, delivery: existing, replayed: true, message: buildDeliveryMessage({ channel: existing.channel, status: existing.deliveryStatus, replayed: true }) };
      }

      if (existing && existing.deliveryStatus === 'failed' && !args.allowRetryFromFailed) {
        throw new DeliveryRouterConflictError('Delivery previously failed. Use retry to attempt again.');
      }

      const attemptCount = existing ? nextAttemptCount(existing) : 1;
        const deliveryId = existing?.id ?? `delivery:${randomUUID()}`;
        try {
          const metadata = await this.handlers.send({
            tenantId: args.tenantId,
            channel: args.channel,
            source: source.sourceType === 'notification'
              ? source
              : { sourceType: 'digest', digest: source.digest, html: renderDigestHtml(source.digest) }
          });
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.delivery.sent',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: args.generatedAt,
          metadata: this.audit.buildMetadata({
            deliveryId,
            channel: args.channel,
            sourceType: args.sourceType,
            sourceId: args.sourceId,
            attemptCount,
            status: 'sent',
            idempotencyKey
          })
        });

        const delivery = existing
          ? await this.repository.updateDelivery({
              tenantId: args.tenantId,
              deliveryId,
              deliveryStatus: 'sent',
              attemptCount,
              lastError: null,
              metadata: { ...existing.metadata, ...metadata, auditEventId },
              sentAt: args.generatedAt
            })
          : await this.repository.createDelivery({
              tenantId: args.tenantId,
              deliveryId,
              channel: args.channel,
              sourceType: args.sourceType,
              sourceId: args.sourceId,
              deliveryStatus: 'sent',
              attemptCount,
              lastError: null,
              idempotencyKey,
              metadata: { ...metadata, auditEventId },
              createdAt: args.generatedAt,
              sentAt: args.generatedAt
            });

        return { ok: true, delivery, replayed: false, message: buildDeliveryMessage({ channel: args.channel, status: delivery.deliveryStatus }) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Delivery failed.';
        const auditEventId = await this.audit.record({
          eventType: 'aaliyah.delivery.failed',
          principalId: args.actorId,
          tenantId: args.tenantId,
          mode: args.mode,
          timestamp: args.generatedAt,
          metadata: this.audit.buildMetadata({
            deliveryId,
            channel: args.channel,
            sourceType: args.sourceType,
            sourceId: args.sourceId,
            attemptCount,
            status: 'failed',
            idempotencyKey,
            error: message
          })
        });

        const delivery = existing
          ? await this.repository.updateDelivery({
              tenantId: args.tenantId,
              deliveryId,
              deliveryStatus: 'failed',
              attemptCount,
              lastError: message,
              metadata: { ...existing.metadata, auditEventId },
              sentAt: null
            })
          : await this.repository.createDelivery({
              tenantId: args.tenantId,
              deliveryId,
              channel: args.channel,
              sourceType: args.sourceType,
              sourceId: args.sourceId,
              deliveryStatus: 'failed',
              attemptCount,
              lastError: message,
              idempotencyKey,
              metadata: { auditEventId },
              createdAt: args.generatedAt,
              sentAt: null
            });

        return { ok: true, delivery, replayed: false, message };
      }
    } catch (error) {
      return this.normalizeFailure(error);
    }
  }

  private async requireSource(args: {
    tenantId: string;
    sourceId: string;
    sourceType?: DeliverySourceType;
    notification?: NotificationRecord;
    digest?: DigestRecord;
  }): Promise<
    | { sourceType: 'notification'; notification: NotificationRecord }
    | { sourceType: 'digest'; digest: DigestRecord }
  > {
    if ((args.sourceType ?? 'notification') === 'notification') {
      const notification = args.notification ?? await this.repository.getNotificationById({ tenantId: args.tenantId, notificationId: args.sourceId });
      if (!notification) {
        throw new DeliveryRouterNotFoundError('Notification source was not found.');
      }
      return { sourceType: 'notification', notification };
    }
    const digest = args.digest ?? await this.repository.getDigestById({ tenantId: args.tenantId, digestId: args.sourceId });
    if (!digest) {
      throw new DeliveryRouterNotFoundError('Digest source was not found.');
    }
    return { sourceType: 'digest', digest };
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
      const message = error instanceof Error ? error.message : 'aaliyah_delivery_access_denied';
      if (message === 'aaliyah_principal_context_denied') {
        throw new DeliveryRouterAccessDeniedError();
      }
      if (message.startsWith('aaliyah_memory_boundary_denied')) {
        throw new DeliveryRouterInvalidModeError();
      }
      throw error;
    }
  }

  private normalizeFailure(error: unknown): DeliveryResult {
    if (error instanceof DeliveryRouterAccessDeniedError) {
      return { ok: false, denialCode: 'ACCESS_DENIED', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof DeliveryRouterInvalidModeError) {
      return { ok: false, denialCode: 'INVALID_MODE', errorCode: null, retryable: false, message: error.message };
    }
    if (error instanceof DeliveryRouterNotFoundError) {
      return { ok: false, denialCode: null, errorCode: 'NOT_FOUND', retryable: false, message: error.message };
    }
    if (error instanceof DeliveryRouterConflictError) {
      return { ok: false, denialCode: null, errorCode: 'CONFLICT', retryable: false, message: error.message };
    }
    if (error instanceof DeliveryRouterValidationError) {
      return { ok: false, denialCode: null, errorCode: 'INVALID_INPUT', retryable: false, message: error.message };
    }
    if (error instanceof Error) {
      return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: error.message };
    }
    return { ok: false, denialCode: null, errorCode: 'INTERNAL_ERROR', retryable: true, message: 'Delivery router failed unexpectedly.' };
  }
}
