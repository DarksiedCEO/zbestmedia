import type { FounderPreferencesRecord } from './founder-preferences-types.js';

export const DEFAULT_FOUNDER_PREFERENCES: Omit<FounderPreferencesRecord, 'id' | 'tenantId' | 'actorUserId' | 'createdAtIso' | 'updatedAtIso'> = {
  notification: {
    minimumConsoleSeverity: 'warning',
    minimumEmailSeverity: 'critical',
    autoDismissInfoAfterHours: null
  },
  digest: {
    dailyDigestEnabled: true,
    weeklyBriefEnabled: true,
    criticalDigestEnabled: true,
    sendEmptyDigests: false
  },
  opportunity: {
    dormantContactDays: 14,
    missedFollowUpWindowHours: 48,
    recurringBlockThreshold: 3,
    engagementSpikeMinimumEvents: 3
  },
  recommendation: {
    escalateHighPriorityOnly: true,
    reviveContactRequiresPriorValue: true
  },
  scheduler: {
    allowAutomaticRuns: true,
    defaultDailyRunHourUtc: 16
  },
  delivery: {
    emailEnabled: true,
    consoleEnabled: true
  }
};
