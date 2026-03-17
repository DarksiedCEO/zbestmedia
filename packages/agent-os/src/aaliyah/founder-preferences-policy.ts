import type {
  FounderPreferencesInput,
  FounderPreferencesRecord,
  FounderPreferenceSeverity
} from './founder-preferences-types.js';
import { FounderPreferencesValidationError } from './founder-preferences-errors.js';

const SEVERITY_ORDER: FounderPreferenceSeverity[] = ['info', 'warning', 'critical'];

export function severityMeetsThreshold(severity: FounderPreferenceSeverity, threshold: FounderPreferenceSeverity) {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

export function normalizeFounderPreferencesInput(input: FounderPreferencesInput): FounderPreferencesInput {
  return {
    notification: input.notification,
    digest: input.digest,
    opportunity: input.opportunity,
    recommendation: input.recommendation,
    scheduler: input.scheduler,
    delivery: input.delivery,
    escalation: input.escalation
  };
}

export function validateFounderPreferences(record: FounderPreferencesRecord) {
  if (record.notification.autoDismissInfoAfterHours !== null && record.notification.autoDismissInfoAfterHours <= 0) {
    throw new FounderPreferencesValidationError('Notification auto-dismiss hours must be greater than zero when set.');
  }

  if (record.opportunity.dormantContactDays < 1 || record.opportunity.dormantContactDays > 365) {
    throw new FounderPreferencesValidationError('Dormant contact days must be between 1 and 365.');
  }
  if (record.opportunity.missedFollowUpWindowHours < 1 || record.opportunity.missedFollowUpWindowHours > 24 * 30) {
    throw new FounderPreferencesValidationError('Missed follow-up window hours must be between 1 and 720.');
  }
  if (record.opportunity.recurringBlockThreshold < 1 || record.opportunity.recurringBlockThreshold > 20) {
    throw new FounderPreferencesValidationError('Recurring block threshold must be between 1 and 20.');
  }
  if (record.opportunity.engagementSpikeMinimumEvents < 1 || record.opportunity.engagementSpikeMinimumEvents > 100) {
    throw new FounderPreferencesValidationError('Engagement spike minimum events must be between 1 and 100.');
  }

  if (record.scheduler.defaultDailyRunHourUtc !== null && (record.scheduler.defaultDailyRunHourUtc < 0 || record.scheduler.defaultDailyRunHourUtc > 23)) {
    throw new FounderPreferencesValidationError('Default daily run hour must be between 0 and 23.');
  }

  if (!record.delivery.consoleEnabled && !record.delivery.emailEnabled) {
    throw new FounderPreferencesValidationError('At least one delivery channel must remain enabled.');
  }

  if (record.escalation.criticalEscalationHours < 1 || record.escalation.criticalEscalationHours > 24 * 30) {
    throw new FounderPreferencesValidationError('Critical escalation hours must be between 1 and 720.');
  }
  if (record.escalation.blockedPatternEscalationCount < 1 || record.escalation.blockedPatternEscalationCount > 25) {
    throw new FounderPreferencesValidationError('Blocked pattern escalation count must be between 1 and 25.');
  }
  if (record.escalation.clusterPressureThreshold < 2 || record.escalation.clusterPressureThreshold > 25) {
    throw new FounderPreferencesValidationError('Cluster pressure threshold must be between 2 and 25.');
  }
  if (record.escalation.missedFollowUpEscalationHours < 1 || record.escalation.missedFollowUpEscalationHours > 24 * 60) {
    throw new FounderPreferencesValidationError('Missed follow-up escalation hours must be between 1 and 1440.');
  }
  if (record.escalation.attentionOverloadThreshold < 1 || record.escalation.attentionOverloadThreshold > 50) {
    throw new FounderPreferencesValidationError('Attention overload threshold must be between 1 and 50.');
  }
}
