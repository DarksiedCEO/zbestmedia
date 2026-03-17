export type AaliyahDiagnosticsWindow = "24h" | "7d" | "30d";

export type AaliyahDiagnosticsEventType =
  | "runtime_result"
  | "session_reset"
  | "follow_through_invalid_action"
  | "workspace_draft_requested"
  | "workspace_draft_denied"
  | "workspace_draft_created"
  | "workspace_draft_failed"
  | "workspace_calendar_availability_requested"
  | "workspace_calendar_availability_denied"
  | "workspace_calendar_availability_failed"
  | "workspace_calendar_availability_resolved"
  | "workspace_calendar_event_requested"
  | "workspace_calendar_event_denied"
  | "workspace_calendar_event_created"
  | "workspace_calendar_event_failed"
  | "crm_contact_created"
  | "crm_contact_updated"
  | "crm_account_created"
  | "crm_account_updated"
  | "crm_note_created"
  | "crm_context_requested"
  | "crm_denied"
  | "crm_failed"
  | "tasks_created"
  | "tasks_updated"
  | "tasks_completed"
  | "tasks_blocked"
  | "tasks_requested"
  | "tasks_list_requested"
  | "tasks_denied"
  | "tasks_failed"
  | "founder_command_executed"
  | "founder_command_rejected"
  | "founder_command_noop"
  | "follow_through_engine_executed"
  | "follow_through_engine_blocked"
  | "follow_through_engine_stale"
  | "follow_through_engine_noop"
  | "recommendation_engine_created"
  | "recommendation_engine_replayed"
  | "recommendation_engine_noop"
  | "notification_engine_created"
  | "notification_engine_replayed"
  | "notification_engine_acknowledged"
  | "notification_engine_dismissed"
  | "notification_engine_noop"
  | "opportunity_engine_created"
  | "opportunity_engine_replayed"
  | "opportunity_engine_acknowledged"
  | "opportunity_engine_dismissed"
  | "opportunity_engine_noop"
  | "strategic_intelligence_created"
  | "strategic_intelligence_replayed"
  | "strategic_intelligence_acknowledged"
  | "strategic_intelligence_dismissed"
  | "strategic_intelligence_noop";

export type AaliyahDiagnosticsEvent = {
  tenantId: string;
  eventId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  activeMode: "founder" | "zbestmedia";
  eventType: AaliyahDiagnosticsEventType;
  eventSource: "aaliyah_runtime" | "aaliyah_session" | "aaliyah_follow_through" | "aaliyah_workspace";
  signalKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AaliyahDriftSignal = {
  signalId: string;
  metric: "ambiguity_fallback_rate" | "low_confidence_defer_rate" | "denied_due_to_scope_rate" | "specialist_delegation_rate" | "invalid_action_attempt_rate" | "escalation_rate";
  count: number;
  denominator: number;
  rate: number;
};

export type AaliyahQueueLatencySignal = {
  pendingReviewCount: number;
  pendingReviewAgeBuckets: {
    under1Hour: number;
    oneToFourHours: number;
    fourToTwentyFourHours: number;
    overTwentyFourHours: number;
  };
  oldestPendingReviewAgeSeconds: number | null;
};

export type AaliyahClosureQualitySignal = {
  totalTerminalEvents: number;
  founderDeclaredCompletionCount: number;
  founderDeclaredCompletionRate: number;
  downstreamConfirmedCompletionCount: number;
  downstreamConfirmedCompletionRate: number;
  invalidationCount: number;
  invalidationRate: number;
  abandonmentCount: number;
  abandonmentRate: number;
  escalationCount: number;
  escalationWithRationaleCount: number;
  escalationWithRationaleCompleteness: number;
  terminalActionIdempotencyFailureCount: number;
};

export type AaliyahInterruptionLoadSignal = {
  interruptNowCount: number;
  sameDayBriefingCount: number;
  passiveQueueCount: number;
  silentLogCount: number;
  highInterruptionConcentrationWindows: Array<{
    hourStartedAt: string;
    interruptNowCount: number;
  }>;
};

export type AaliyahSessionResetSignal = {
  softResetCount: number;
  hardExpirationCount: number;
  disambiguationExpiryCount: number;
  staleContextRejectionCount: number;
};

export type AaliyahEnforcementTriggerSignal = {
  deniedDueToScopeCount: number;
  deniedDueToModeBoundaryCount: number;
  lowConfidenceDeferCount: number;
  ambiguityFallbackCount: number;
  specialistDelegationCount: number;
  invalidActionAttemptCount: number;
};

export type AaliyahFounderFrictionSignal = {
  founderDeclaredCompletionCount: number;
  manualResetCount: number;
  pendingReviewOverTwentyFourHoursCount: number;
  staleContextRejectionCount: number;
  openCriticalIncidentCount: number;
};

export type AaliyahPerformanceSnapshot = {
  snapshotId: string;
  generatedAt: string;
  window: AaliyahDiagnosticsWindow;
  windowStartedAt: string;
  windowEndedAt: string;
  nextGovernedActionDistribution: Record<string, number>;
  followThroughTerminalCounts: Record<string, number>;
  reviewQueueLatency: AaliyahQueueLatencySignal;
  closureQuality: AaliyahClosureQualitySignal;
  interruptionLoad: AaliyahInterruptionLoadSignal;
  sessionReset: AaliyahSessionResetSignal;
  enforcementTriggers: AaliyahEnforcementTriggerSignal;
  founderFriction: AaliyahFounderFrictionSignal;
  driftSignals: AaliyahDriftSignal[];
  sourceMetadata: {
    runtimeEventCount: number;
    followThroughHistoryCount: number;
    voiceCallCount: number;
    pendingReviewCount: number;
    incidentCount: number;
  };
};

export type AaliyahDiagnosticsSummary = {
  tenantId: string;
  principalContext: "founder" | "operator";
  activeMode: "founder" | "zbestmedia" | "mixed";
  snapshot: AaliyahPerformanceSnapshot;
  attentionFlags: Array<{
    code: string;
    severity: "info" | "warning" | "critical";
    summary: string;
  }>;
};
