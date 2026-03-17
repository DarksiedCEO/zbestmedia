import type { EmailAssistantService } from '../email/service.js';
import type { DeliveryChannel } from './delivery-router-types.js';
import type { NotificationRecord } from './notification-engine-types.js';

export class AaliyahDeliveryRouterHandlers {
  constructor(private readonly emailService: EmailAssistantService) {}

  async send(args: {
    tenantId: string;
    channel: DeliveryChannel;
    notification: NotificationRecord;
  }): Promise<Record<string, unknown>> {
    if (args.channel === 'console') {
      return {
        transport: 'console',
        visibleInConsole: true,
        deliveredNotificationId: args.notification.id
      };
    }

    const subject = `[Aaliyah] ${args.notification.title}`;
    const bodyText = [args.notification.summary, '', args.notification.reason].join('\n');
    const bodyHtml = `<p>${escapeHtml(args.notification.summary)}</p><p>${escapeHtml(args.notification.reason)}</p>`;
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
