export type FounderPreferenceSeverity = 'info' | 'warning' | 'critical';
export type FounderPreferenceEmailSeverity = 'warning' | 'critical';

export interface FounderNotificationPreferences {
  minimumConsoleSeverity: FounderPreferenceSeverity;
  minimumEmailSeverity: FounderPreferenceEmailSeverity;
  autoDismissInfoAfterHours: number | null;
}

export interface FounderDigestPreferences {
  dailyDigestEnabled: boolean;
  weeklyBriefEnabled: boolean;
  criticalDigestEnabled: boolean;
  sendEmptyDigests: boolean;
}

export interface FounderOpportunityPreferences {
  dormantContactDays: number;
  missedFollowUpWindowHours: number;
  recurringBlockThreshold: number;
  engagementSpikeMinimumEvents: number;
}

export interface FounderRecommendationPreferences {
  escalateHighPriorityOnly: boolean;
  reviveContactRequiresPriorValue: boolean;
}

export interface FounderSchedulerPreferences {
  allowAutomaticRuns: boolean;
  defaultDailyRunHourUtc: number | null;
}

export interface FounderDeliveryPreferences {
  emailEnabled: boolean;
  consoleEnabled: boolean;
}

export interface FounderPreferencesRecord {
  id: string;
  tenantId: string;
  actorUserId: string;
  notification: FounderNotificationPreferences;
  digest: FounderDigestPreferences;
  opportunity: FounderOpportunityPreferences;
  recommendation: FounderRecommendationPreferences;
  scheduler: FounderSchedulerPreferences;
  delivery: FounderDeliveryPreferences;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface FounderPreferencesInput {
  notification?: Partial<FounderNotificationPreferences>;
  digest?: Partial<FounderDigestPreferences>;
  opportunity?: Partial<FounderOpportunityPreferences>;
  recommendation?: Partial<FounderRecommendationPreferences>;
  scheduler?: Partial<FounderSchedulerPreferences>;
  delivery?: Partial<FounderDeliveryPreferences>;
}

export interface FounderPreferencesSuccessResult {
  ok: true;
  preferences: FounderPreferencesRecord;
  message: string;
}

export interface FounderPreferencesFailureResult {
  ok: false;
  denialCode: 'ACCESS_DENIED' | 'INVALID_MODE' | null;
  errorCode: 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | null;
  retryable: boolean;
  message: string;
}

export type FounderPreferencesResult = FounderPreferencesSuccessResult | FounderPreferencesFailureResult;
