import type { EmailAssistantService } from '../email/service.js';
import type { DeliveryChannel } from './delivery-router-types.js';
import type { DigestRecord } from './digest-composer-types.js';
import type { NotificationRecord } from './notification-engine-types.js';

export class AaliyahDeliveryRouterHandlers {
  constructor(private readonly emailService: EmailAssistantService) {}

  async send(args: {
    tenantId: string;
    channel: DeliveryChannel;
    source:
      | { sourceType: 'notification'; notification: NotificationRecord }
      | { sourceType: 'digest'; digest: DigestRecord; html: string };
  }): Promise<Record<string, unknown>> {
    if (args.channel === 'console') {
      return {
        transport: 'console',
        visibleInConsole: true,
        deliveredSourceType: args.source.sourceType,
        deliveredSourceId: args.source.sourceType === 'notification' ? args.source.notification.id : args.source.digest.id
      };
    }

    const subject = args.source.sourceType === 'notification'
      ? `[Aaliyah] ${args.source.notification.title}`
      : `[Aaliyah] ${args.source.digest.title}`;
    const bodyText = args.source.sourceType === 'notification'
      ? [args.source.notification.summary, '', args.source.notification.reason].join('\n')
      : args.source.digest.bodyText;
    const bodyHtml = args.source.sourceType === 'notification'
      ? `<p>${escapeHtml(args.source.notification.summary)}</p><p>${escapeHtml(args.source.notification.reason)}</p>`
      : args.source.html;
    const sent = await this.emailService.sendSystemEmail({
      tenantId: args.tenantId,
      subject,
      bodyText,
      bodyHtml
    });
    return {
      transport: 'gmail',
      providerMessageId: sent.providerMessageId,
      providerThreadId: sent.providerThreadId,
      sentAt: sent.sentAt
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
