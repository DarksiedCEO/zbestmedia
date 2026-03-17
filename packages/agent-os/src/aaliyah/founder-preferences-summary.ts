import type { FounderPreferencesRecord } from './founder-preferences-types.js';

export function buildFounderPreferencesMessage(updated: boolean) {
  return updated
    ? 'Founder preference controls updated successfully.'
    : 'Founder preference controls loaded successfully.';
}

export function buildFounderPreferencesSummary(preferences: FounderPreferencesRecord) {
  return [
    `Console notifications at ${preferences.notification.minimumConsoleSeverity}+`,
    `email at ${preferences.notification.minimumEmailSeverity}+`,
    `daily digest ${preferences.digest.dailyDigestEnabled ? 'on' : 'off'}`,
    `weekly brief ${preferences.digest.weeklyBriefEnabled ? 'on' : 'off'}`,
    `automatic runs ${preferences.scheduler.allowAutomaticRuns ? 'enabled' : 'disabled'}`
  ].join(', ');
}
