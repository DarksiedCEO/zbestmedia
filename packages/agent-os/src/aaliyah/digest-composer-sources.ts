import type { AgentOsRepository } from '../persistence/repository.js';
import type { DigestSourceBundle } from './digest-composer-types.js';

export class AaliyahDigestComposerSources {
  constructor(private readonly repository: AgentOsRepository) {}

  async loadBundle(args: { tenantId: string; generatedAtIso: string }): Promise<DigestSourceBundle> {
    const [strategicInsights, notifications, opportunities, recommendations, followThroughRecords] = await Promise.all([
      this.repository.listStrategicInsights({ tenantId: args.tenantId, limit: 10, status: 'active' }),
      this.repository.listNotifications({ tenantId: args.tenantId, limit: 10, status: 'active' }),
      this.repository.listOpportunities({ tenantId: args.tenantId, limit: 10, status: 'active' }),
      this.repository.listRecommendations({ tenantId: args.tenantId, limit: 20 }),
      this.repository.listFollowThroughEngineRecords({ tenantId: args.tenantId, limit: 20 })
    ]);

    return {
      generatedAtIso: args.generatedAtIso,
      strategicInsights: strategicInsights.filter((item) => item.status === 'active').map((item) => ({
        id: item.id,
        insightType: item.insightType,
        title: item.title,
        summary: item.summary,
        reason: item.reason,
        status: item.status
      })),
      notifications: notifications.filter((item) => item.status === 'active').map((item) => ({
        id: item.id,
        notificationType: item.notificationType,
        severity: item.severity,
        title: item.title,
        summary: item.summary,
        reason: item.reason,
        status: item.status
      })),
      opportunities: opportunities.filter((item) => item.status === 'active').map((item) => ({
        id: item.id,
        opportunityType: item.opportunityType,
        summary: item.summary,
        reason: item.reason,
        status: item.status
      })),
      recommendations: recommendations.filter((item) => item.status === 'active').map((item) => ({
        id: item.id,
        recommendationType: item.recommendationType,
        summary: item.summary,
        reason: item.reason,
        status: item.status
      })),
      followThroughRecords: followThroughRecords.filter((item) => item.status !== 'noop').map((item) => ({
        id: item.id,
        decisionType: item.decisionType,
        status: item.status,
        summary: item.summary,
        reason: item.reason
      }))
    };
  }
}
