export type GovernanceSnapshot = {
  integrity_score: number;
  governance_fingerprint: string;
  auto_block_active: boolean;
  last_self_check_passed?: boolean;
  last_self_check_ts?: string | null;
  integrity_flags: unknown[];
  runtime: {
    defaults_hash: string;
    enforcement_mode: string;
  };
  controls?: {
    freeze_mode?: boolean;
    kill_switch_active?: boolean;
  };
};

export type AaliyahMode = "founder" | "zbestmedia";
export type AaliyahUrgency = "low" | "normal" | "high" | "urgent";
export type AaliyahRisk = "low" | "medium" | "high" | "critical";
export type AaliyahConfidenceLevel = "high" | "medium" | "low";
export type AaliyahInterruptionClass = "interrupt_now" | "same_day_briefing" | "passive_queue" | "silent_log";

export type AaliyahBriefingItem = {
  itemId: string;
  category: string;
  title: string;
  summary: string;
  urgency: AaliyahUrgency;
  recommendedAction: string;
  interruptionClass: "interrupt_now" | "review_soon" | "can_wait";
  requiresFounderAttention: boolean;
  provenanceReferences: string[];
  owner: {
    executiveId: string | null;
    departmentId: string | null;
    leadAgentId: string | null;
    subAgentId: string | null;
    sourceLane: string;
  };
};

export type AaliyahRecommendedAction = {
  actionId: string;
  title: string;
  action: string;
  urgency: AaliyahUrgency;
  sourceItemId: string;
};

export type AaliyahQuickAction = {
  actionId: string;
  actionType: string;
  label: string;
  targetIntent: string;
  allowedParameters: string[];
  defaultParameters: Record<string, unknown>;
  approvalRequired: boolean;
  availabilityStatus: "available" | "requires_parameters" | "disabled";
  availabilityReason: string | null;
};

export type AaliyahEmailReviewItem = {
  reviewItemId: string;
  draftId: string;
  emailAccountId: string;
  threadId: string;
  reviewStatus: "pending_review" | "approved" | "rejected" | "revision_requested";
  intentCategory: string;
  priority: string;
  riskLevel: string;
  summary: string;
  proposedSubject: string;
  proposedBody: string;
  confidenceScore: number;
  riskScore: number;
  escalationRecommended: boolean;
  blockedAutoSend: boolean;
  requiredApproval: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AaliyahVoiceCall = {
  callId: string;
  callerPhoneNumber: string;
  callerDisplayName: string | null;
  intent: string;
  urgency: "low" | "normal" | "high" | "critical";
  riskLevel: "low" | "moderate" | "high";
  companyMode: AaliyahMode;
  routingTarget: string;
  callSummaryText: string | null;
  recommendedNextAction: string;
  founderAttentionRequired: boolean;
  interruptionClass: AaliyahInterruptionClass | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AaliyahReviewQueueItem = {
  queueItemId: string;
  sourceSubsystem: string;
  sourceItemId: string;
  itemType:
    | "approval_required"
    | "voice_escalation"
    | "incident_attention"
    | "dispatch_action"
    | "routing_preview_action"
    | "founder_recommended_action";
  title: string;
  summary: string;
  urgency: AaliyahUrgency;
  risk: AaliyahRisk;
  confidenceLevel: AaliyahConfidenceLevel;
  interruptionClass: AaliyahInterruptionClass;
  activeMode: AaliyahMode;
  founderAttentionRequired: boolean;
  recommendedNextAction: string;
  allowedNextActions: string[];
  provenanceSummary: {
    manifestVersion: string;
    references: string[];
    contributingSourceItemIds: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type AaliyahReviewQueueSummary = {
  queueId: string;
  generatedAt: string;
  activeMode: AaliyahMode;
  manifestVersion: string;
  itemCountsByType: Record<string, number>;
  itemCountsByInterruptionClass: Record<string, number>;
  topActionableItems: AaliyahReviewQueueItem[];
  totalFounderActionableItems: number;
};

export type AaliyahReviewQueue = AaliyahReviewQueueSummary & {
  items: AaliyahReviewQueueItem[];
};

export type AaliyahTriageClass =
  | "act_now"
  | "review_today"
  | "blocked"
  | "stale"
  | "monitor"
  | "resolved_or_terminal";

export type AaliyahPriorityBand = "p0" | "p1" | "p2" | "p3";

export type AaliyahNextFounderAction =
  | "approve_review_item"
  | "reject_review_item"
  | "request_revision"
  | "dispatch_email"
  | "review_voice_escalation"
  | "review_incident"
  | "review_routing_preview"
  | "refresh_briefing"
  | "select_new_item"
  | "wait"
  | "none_terminal";

export type AaliyahInboxItem = {
  inboxItemId: string;
  queueItemId: string;
  sourceSubsystem: string;
  sourceItemId: string;
  itemType: AaliyahReviewQueueItem["itemType"];
  title: string;
  summary: string;
  activeMode: AaliyahMode;
  urgency: AaliyahUrgency;
  risk: AaliyahRisk;
  triageClass: AaliyahTriageClass;
  priorityBand: AaliyahPriorityBand;
  reasonCodes: string[];
  nextFounderAction: AaliyahNextFounderAction;
  founderAttentionRequired: boolean;
  interruptionClass: AaliyahInterruptionClass;
  confidenceLevel: AaliyahConfidenceLevel;
  followThroughStatus: "active" | "completed" | "abandoned" | "escalated" | "invalidated" | "reset" | null;
  followThroughClosureReason: string | null;
  nextGovernedAction: string | null;
  isBlocked: boolean;
  isStale: boolean;
  ageSeconds: number;
  provenanceSummary: AaliyahReviewQueueItem["provenanceSummary"];
  createdAt: string;
  updatedAt: string;
};

export type AaliyahTask = {
  id: string;
  tenantId: string;
  principalId: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "critical";
  source: "manual" | "crm_follow_up" | "calendar_follow_up" | "email_follow_up" | "system";
  contactId: string | null;
  accountId: string | null;
  relatedEmailDraftId: string | null;
  relatedCalendarEventId: string | null;
  dueAt: string | null;
  remindAt: string | null;
  blockedReason: string | null;
  completionNote: string | null;
  nextStepSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type FounderCommandType =
  | "approve_draft"
  | "create_follow_up"
  | "escalate_task"
  | "override_schedule"
  | "trigger_workflow";

export type FounderCommandTargetType =
  | "gmail_draft"
  | "task"
  | "calendar_event"
  | "contact"
  | "account"
  | "workflow";

export type FounderCommandRecord = {
  id: string;
  tenantId: string;
  requestId: string;
  actorUserId: string;
  actorRole: "founder";
  commandType: FounderCommandType;
  targetType: FounderCommandTargetType;
  targetId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  executionStatus: "executed" | "noop";
  summary: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  executedAt: string | null;
};

export type AaliyahFollowThroughEngineRecord = {
  id: string;
  tenantId: string;
  source: {
    sourceType: "founder_command" | "task" | "gmail_draft" | "calendar_event" | "contact" | "account";
    sourceId: string;
  };
  policyKey:
    | "FT-001-approved-draft-next-step"
    | "FT-002-workflow-dependency-next-step"
    | "FT-003-overdue-task-stale"
    | "FT-004-event-linked-recap"
    | "FT-005-rejected-intent-context";
  decisionType: "create_task" | "queue_founder_review" | "flag_stale" | "record_blocked" | "noop";
  status: "eligible" | "blocked" | "stale" | "noop";
  reason: string;
  summary: string;
  idempotencyKey: string;
  createdArtifactIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  evaluatedAtIso: string;
};

export type AaliyahRecommendationRecord = {
  id: string;
  tenantId: string;
  source: {
    sourceType: "follow_through_record" | "founder_command" | "task" | "gmail_draft" | "calendar_event" | "contact" | "account";
    sourceId: string;
  };
  recommendationType: "send_now" | "follow_up_now" | "review_blocked" | "escalate_now" | "revive_contact" | "schedule_next" | "noop";
  status: "active" | "dismissed" | "accepted" | "noop";
  reason: string;
  summary: string;
  idempotencyKey: string;
  relatedCommandId: string | null;
  relatedTaskId: string | null;
  metadata: Record<string, unknown>;
  auditEventId: string | null;
  createdAtIso: string;
  evaluatedAtIso: string;
};

export type AaliyahNotificationRecord = {
  id: string;
  tenantId: string;
  source: {
    sourceType: "follow_through_record" | "recommendation" | "task" | "founder_command" | "contact" | "account";
    sourceId: string;
  };
  notificationType: "stale_critical_work" | "blocked_recommendation" | "founder_review_required" | "high_priority_follow_through" | "opportunity_signal" | "noop";
  severity: "info" | "warning" | "critical";
  status: "active" | "acknowledged" | "dismissed";
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedRecommendationId: string | null;
  relatedTaskId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type AaliyahDeliveryRecord = {
  id: string;
  tenantId: string;
  channel: "console" | "email";
  sourceType: "notification" | "digest";
  sourceId: string;
  deliveryStatus: "pending" | "sent" | "failed" | "replayed";
  attemptCount: number;
  lastError: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  sentAtIso: string | null;
};

export type AaliyahDigestRecord = {
  id: string;
  tenantId: string;
  digestType: "daily_founder_digest" | "weekly_founder_brief" | "critical_digest";
  digestStatus: "composed" | "sent" | "skipped" | "replayed";
  title: string;
  summary: string;
  bodyText: string;
  idempotencyKey: string;
  relatedNotificationIds: string[];
  relatedOpportunityIds: string[];
  relatedInsightIds: string[];
  relatedRecommendationIds: string[];
  relatedFollowThroughIds: string[];
  deliveryRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  composedAtIso: string;
  sentAtIso: string | null;
};

export type AaliyahOpportunityRecord = {
  id: string;
  tenantId: string;
  source: {
    sourceType: "contact" | "account" | "task" | "calendar_event" | "follow_through_record" | "recommendation" | "founder_command";
    sourceId: string;
  };
  opportunityType: "dormant_contact" | "stalled_pipeline" | "missed_follow_up_window" | "engagement_spike" | "recurring_block_pattern" | "noop";
  status: "active" | "acknowledged" | "converted" | "dismissed" | "noop";
  reason: string;
  summary: string;
  idempotencyKey: string;
  relatedTaskId: string | null;
  relatedRecommendationId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type AaliyahStrategicInsightRecord = {
  id: string;
  tenantId: string;
  insightType: "attention_priority" | "blocked_pattern" | "follow_through_gap" | "opportunity_cluster" | "execution_bottleneck" | "daily_brief" | "weekly_brief" | "noop";
  status: "active" | "superseded" | "acknowledged" | "dismissed";
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedEntityIds: string[];
  relatedRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type AaliyahCoalescedSignalRecord = {
  id: string;
  tenantId: string;
  signalType: "blocked_execution_cluster" | "follow_up_gap_cluster" | "opportunity_cluster" | "attention_cluster" | "noop";
  status: "active" | "acknowledged" | "dismissed" | "resolved";
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: Array<"notification" | "recommendation" | "opportunity" | "strategic_insight" | "follow_through_record">;
  dominantSourceType: "notification" | "recommendation" | "opportunity" | "strategic_insight" | "follow_through_record";
  suppressedRecordIds: string[];
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
};

export type AaliyahEscalationRecord = {
  id: string;
  tenantId: string;
  escalationType: "stale_critical_escalation" | "blocked_pattern_escalation" | "cluster_pressure_escalation" | "missed_follow_up_escalation" | "attention_overload_escalation" | "noop";
  status: "active" | "acknowledged" | "dismissed" | "resolved";
  title: string;
  summary: string;
  reason: string;
  escalationLevel: "warning" | "high" | "critical";
  idempotencyKey: string;
  sourceRecordIds: string[];
  sourceRecordTypes: Array<"notification" | "recommendation" | "opportunity" | "strategic_insight" | "coalesced_signal" | "follow_through_record">;
  relatedClusterId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  acknowledgedAtIso: string | null;
  dismissedAtIso: string | null;
  resolvedAtIso: string | null;
};

export type AaliyahOperatorQueueRecord = {
  id: string;
  tenantId: string;
  sourceType: "escalation" | "coalesced_signal" | "strategic_insight" | "notification" | "recommendation" | "opportunity";
  sourceId: string;
  queueItemType: "immediate_action" | "review_required" | "watch_item" | "summary_item";
  priorityScore: number;
  priorityBand: "critical" | "high" | "normal";
  status: "active" | "suppressed" | "executed" | "invalidated" | "superseded";
  rankingVersion: number;
  staleAfterAtIso: string;
  canonicalIssueKey: string | null;
  supersededByQueueItemId: string | null;
  title: string;
  summary: string;
  reason: string;
  idempotencyKey: string;
  relatedRecordIds: string[];
  relatedRecordTypes: string[];
  actionableCommandType: FounderCommandType | null;
  actionableTargetType: FounderCommandTargetType | null;
  actionableTargetId: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  evaluatedAtIso: string;
  lastRefreshedAtIso: string | null;
  lastExecutedAtIso: string | null;
  issueState: "open" | "in_progress" | "resolved" | "unresolved" | "reopened" | "dismissed" | null;
  lastOutcomeType:
    | "issue_resolved"
    | "issue_unresolved"
    | "issue_reopened"
    | "opportunity_converted"
    | "opportunity_lost"
    | "recommendation_accepted"
    | "recommendation_rejected"
    | "escalation_cleared"
    | "escalation_persisting"
    | "action_failed_downstream"
    | "action_deferred"
    | null;
  lastOutcomeStatus: "confirmed" | "partial" | "rejected" | "needs_follow_through" | null;
  lastOutcomeAtIso: string | null;
};

export type AaliyahOperatorActionLogRecord = {
  id: string;
  tenantId: string;
  queueItemId: string;
  queueItemVersion: number;
  canonicalIssueKey: string | null;
  actionPath: string;
  commandId: string | null;
  founderActorId: string;
  idempotencyKey: string;
  executionStatus: "success" | "failure" | "invalidated" | "already_executed" | "superseded" | "not_actionable";
  failureCode:
    | "QUEUE_ITEM_NOT_FOUND"
    | "QUEUE_ITEM_STALE"
    | "QUEUE_ITEM_INVALIDATED"
    | "QUEUE_ITEM_SUPERSEDED"
    | "QUEUE_ITEM_ALREADY_EXECUTED"
    | "SOURCE_NOT_FOUND"
    | "SOURCE_NOT_ACTIONABLE"
    | "ACTION_PATH_UNRESOLVABLE"
    | "FOUNDER_PERMISSION_DENIED"
    | null;
  failureReason: string | null;
  executedAtIso: string;
  createdAtIso: string;
};

export type AaliyahOutcomeFeedbackRecord = {
  id: string;
  tenantId: string;
  queueItemId: string;
  operatorActionLogId: string | null;
  commandId: string | null;
  canonicalIssueKey: string;
  sourceType: "escalation" | "coalesced_signal" | "strategic_insight" | "notification" | "recommendation" | "opportunity";
  sourceId: string;
  outcomeType:
    | "issue_resolved"
    | "issue_unresolved"
    | "issue_reopened"
    | "opportunity_converted"
    | "opportunity_lost"
    | "recommendation_accepted"
    | "recommendation_rejected"
    | "escalation_cleared"
    | "escalation_persisting"
    | "action_failed_downstream"
    | "action_deferred";
  outcomeStatus: "confirmed" | "partial" | "rejected" | "needs_follow_through";
  reasonCode: string | null;
  notes: string | null;
  reportedByFounderActorId: string;
  reportedAtIso: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  createdAtIso: string;
};

export type AaliyahIssueStateRecord = {
  tenantId: string;
  canonicalIssueKey: string;
  currentState: "open" | "in_progress" | "resolved" | "unresolved" | "reopened" | "dismissed";
  lastOutcomeType: AaliyahOutcomeFeedbackRecord["outcomeType"] | null;
  lastOutcomeStatus: AaliyahOutcomeFeedbackRecord["outcomeStatus"] | null;
  lastQueueItemId: string | null;
  lastOperatorActionLogId: string | null;
  lastCommandId: string | null;
  lastUpdatedAtIso: string;
  lastOutcomeAtIso: string | null;
  reopenCount: number;
  resolutionCount: number;
  metadata: {
    lastReasonCode: string | null;
    wasRecentlyRejected: boolean;
    wasRecentlyResolved: boolean;
    hasRepeatedFailure: boolean;
  };
};

export type AaliyahFounderBriefRecord = {
  id: string;
  tenantId: string;
  briefDate: string;
  briefKind: "daily" | "ad_hoc";
  generatedByFounderActorId: string;
  generatedAtIso: string;
  windowStartAtIso: string;
  windowEndAtIso: string;
  headline: string;
  summary: {
    headline: string;
    generatedAtIso: string;
    previousBriefId: string | null;
    counts: {
      immediateActions: number;
      resolved: number;
      reopenedOrPersisting: number;
      opportunities: number;
      watchlist: number;
    };
    sectionOrder: Array<
      | "immediate_founder_actions"
      | "newly_resolved"
      | "reopened_or_persisting"
      | "high_value_opportunities"
      | "strategic_watchlist"
      | "execution_outcome_summary"
    >;
    notes: string[];
  };
  idempotencyKey: string;
  previousBriefId: string | null;
  deliveryStatus: "not_sent" | "sent";
  lastDispatchedAtIso: string | null;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  createdAtIso: string;
};

export type AaliyahFounderBriefItemRecord = {
  id: string;
  tenantId: string;
  briefId: string;
  section:
    | "immediate_founder_actions"
    | "newly_resolved"
    | "reopened_or_persisting"
    | "high_value_opportunities"
    | "strategic_watchlist"
    | "execution_outcome_summary";
  queueItemId: string | null;
  canonicalIssueKey: string | null;
  operatorActionLogId: string | null;
  outcomeFeedbackId: string | null;
  priorityScore: number;
  deltaType: "new" | "unchanged" | "worsened" | "improved" | "resolved" | "reopened" | "suppressed";
  payload: Record<string, unknown>;
  createdAtIso: string;
};

export type AaliyahEvaluationScheduleRecord = {
  id: string;
  tenantId: string;
  engineType: "follow_through" | "recommendation" | "notification" | "opportunity" | "strategic_intelligence";
  status: "active" | "paused";
  cadenceType: "manual" | "hourly" | "daily" | "weekly";
  cadenceValue: string | null;
  lastRunAtIso: string | null;
  nextRunAtIso: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type AaliyahEvaluationRunRecord = {
  id: string;
  tenantId: string;
  scheduleId: string;
  engineType: "follow_through" | "recommendation" | "notification" | "opportunity" | "strategic_intelligence";
  runStatus: "started" | "completed" | "failed" | "replayed";
  windowKey: string;
  summary: string;
  auditEventId: string | null;
  metadata: Record<string, unknown>;
  startedAtIso: string;
  completedAtIso: string | null;
};

export type AaliyahFounderPreferenceControlsRecord = {
  id: string;
  tenantId: string;
  actorUserId: string;
  notification: {
    minimumConsoleSeverity: "info" | "warning" | "critical";
    minimumEmailSeverity: "warning" | "critical";
    autoDismissInfoAfterHours: number | null;
  };
  digest: {
    dailyDigestEnabled: boolean;
    weeklyBriefEnabled: boolean;
    criticalDigestEnabled: boolean;
    sendEmptyDigests: boolean;
  };
  opportunity: {
    dormantContactDays: number;
    missedFollowUpWindowHours: number;
    recurringBlockThreshold: number;
    engagementSpikeMinimumEvents: number;
  };
  recommendation: {
    escalateHighPriorityOnly: boolean;
    reviveContactRequiresPriorValue: boolean;
  };
  scheduler: {
    allowAutomaticRuns: boolean;
    defaultDailyRunHourUtc: number | null;
  };
  delivery: {
    emailEnabled: boolean;
    consoleEnabled: boolean;
  };
  escalation: {
    criticalEscalationHours: number;
    blockedPatternEscalationCount: number;
    clusterPressureThreshold: number;
    missedFollowUpEscalationHours: number;
    attentionOverloadThreshold: number;
  };
  createdAtIso: string;
  updatedAtIso: string;
};

export type AaliyahFounderPreferenceControlsMutationResult =
  | {
      ok: true;
      preferences: AaliyahFounderPreferenceControlsRecord;
      message: string;
    }
  | {
      ok: false;
      denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
      errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
      retryable: boolean;
      message: string;
    };

export type AaliyahEvaluationScheduleMutationResult =
  | {
      ok: true;
      schedule: AaliyahEvaluationScheduleRecord;
      message: string;
    }
  | {
      ok: false;
      denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
      errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
      retryable: boolean;
      message: string;
    };

export type AaliyahEvaluationRunMutationResult =
  | {
      ok: true;
      run: AaliyahEvaluationRunRecord;
      schedule: AaliyahEvaluationScheduleRecord;
      replayed: boolean;
      message: string;
    }
  | {
      ok: false;
      denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
      errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
      retryable: boolean;
      message: string;
    };

export type FounderCommandRequest = {
  mode: AaliyahMode;
  commandType: FounderCommandType;
  target: {
    targetType: FounderCommandTargetType;
    targetId: string;
  };
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export type FounderCommandResult =
  | {
      ok: true;
      commandId: string;
      commandType: FounderCommandType;
      target: {
        targetType: FounderCommandTargetType;
        targetId: string;
      };
      status: "executed" | "noop";
      summary: string;
      auditEventId: string | null;
      executedAtIso: string;
    }
  | {
      ok: false;
      denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
      errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
      retryable: boolean;
      message: string;
    };

export type AaliyahInboxSummary = {
  inboxId: string;
  generatedAt: string;
  activeMode: AaliyahMode;
  manifestVersion: string;
  totalItems: number;
  countsByTriageClass: Record<AaliyahTriageClass, number>;
  countsByPriorityBand: Record<AaliyahPriorityBand, number>;
  topActionableItems: AaliyahInboxItem[];
  blockedItems: AaliyahInboxItem[];
  staleItems: AaliyahInboxItem[];
  items: AaliyahInboxItem[];
};

export type AaliyahInterruptionItem = {
  sourceItemId: string;
  title: string;
  summary: string;
  recommendedAction: string;
  visibilityAction: AaliyahInterruptionClass;
  confidenceLevel: AaliyahConfidenceLevel;
  founderRelevance: boolean;
  reasonCodes: string[];
};

export type AaliyahInterruptionSummary = {
  generatedAt: string;
  activeMode: AaliyahMode;
  items: AaliyahInterruptionItem[];
  interruptNowCount: number;
  sameDayBriefingCount: number;
  passiveQueueCount: number;
  silentLogCount: number;
};

export type AaliyahConfidenceAssessment = {
  confidenceId: string;
  sourceSubsystem: string;
  assessedItemType: string;
  confidenceLevel: AaliyahConfidenceLevel;
  confidenceBand: number;
  reasonCodes: string[];
  recommendedFallbackAction: "proceed" | "defer" | "escalate" | "suppress";
};

export type AaliyahConfidenceSummary = {
  generatedAt: string;
  activeMode: AaliyahMode;
  overallConfidenceLevel: AaliyahConfidenceLevel;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  deferredCount: number;
  suppressedCount: number;
  topReasonCodes: string[];
  items: AaliyahConfidenceAssessment[];
};

export type AaliyahCommandSurface = {
  shellId: string;
  generatedAt: string;
  activeMode: AaliyahMode;
  manifestVersion: string;
  founderBriefingSummary: {
    briefingId: string;
    generatedAt: string;
    activeMode: AaliyahMode;
    manifestVersion: string;
    topPriorities: AaliyahBriefingItem[];
    waitingOnMe: AaliyahBriefingItem[];
    revenueWatch: AaliyahBriefingItem[];
    operationsWatch: AaliyahBriefingItem[];
    calendarWatch: AaliyahBriefingItem[];
    relationshipWatch: AaliyahBriefingItem[];
    recommendedActions: AaliyahRecommendedAction[];
  };
  whatMattersNow: AaliyahBriefingItem[];
  waitingOnMe: AaliyahBriefingItem[];
  openApprovals: {
    totalPending: number;
    items: AaliyahEmailReviewItem[];
  };
  openIncidentSummary: {
    statusLevel: "healthy" | "warning" | "critical";
    openIncidentCountsBySeverity: Record<string, number>;
    releaseBlockingIncidentCount: number;
    degradedSurfaces: string[];
  };
  opsStatusSummary: {
    statusLevel: "healthy" | "warning" | "critical";
    degradedSurfaces: string[];
    routingFailureCount: number;
    policyRejectionCount: number;
  };
  openVoiceEscalations: {
    totalPending: number;
    items: AaliyahVoiceCall[];
    interruptNowCount: number;
  };
  recommendedNextActions: AaliyahRecommendedAction[];
  interruptQueueSummary: {
    interruptNowCount: number;
    sameDayBriefingCount: number;
    passiveQueueCount: number;
    silentLogCount: number;
  };
  confidenceSummary: AaliyahConfidenceSummary;
  interruptionQueue: AaliyahInterruptionSummary;
  founderReviewQueue: AaliyahReviewQueueSummary;
  founderInbox: AaliyahInboxSummary;
  quickActions: AaliyahQuickAction[];
  provenanceSummary: {
    orgManifestVersion: string;
    aaliyahRegistryVersion: string;
    generatedFrom: {
      pendingApprovalCount: number;
      pendingVoiceEscalationCount: number;
      releaseBlockingIncidentCount: number;
      degradedSurfaceCount: number;
    };
  };
};

export type AaliyahSessionSnapshot = {
  sessionId: string;
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  activeModeState: {
    activeMode: AaliyahMode;
    previousMode: AaliyahMode | null;
    switchedAt: string;
    switchReason: string;
    boundaryDecisionId: string | null;
  };
  interactionState: {
    lastInteractionAt: string | null;
    lastIntent: string | null;
    lastResolvedIntent: string | null;
    intentTrail: Array<{
      entryId: string;
      requestedIntent: string;
      resolvedIntent: string | null;
      outcomeType: "completed" | "fallback";
      activeMode: AaliyahMode;
      confidenceLevel: AaliyahConfidenceLevel;
      createdAt: string;
    }>;
    currentWorkingItem: {
      contextId: string;
      workingItemType: string;
      sourceSubsystem: string;
      sourceItemId: string;
      queueItemId: string | null;
      reviewItemId: string | null;
      callId: string | null;
      title: string;
      summary: string;
      closureState: "open" | "completed" | "abandoned" | "escalated" | "invalidated" | "reset";
      closureReason: string | null;
      closedAt: string | null;
    } | null;
    activeReviewContext: {
      reviewItemId: string;
      reviewStatus: "pending_review" | "approved" | "rejected" | "revision_requested";
      dispatchReady: boolean;
      invalidatedAt: string | null;
      invalidationReason: string | null;
    } | null;
    pendingDisambiguation: {
      reason: string;
      requestedIntent: string | null;
      createdAt: string;
    } | null;
  };
  retentionPolicy: {
    intentTrailMaxEntries: number;
    idleTtlSeconds: number;
    hardTtlSeconds: number;
    snapshotIntentTrailEntries: number;
  };
  expiresAt: string;
  hardExpiresAt: string;
  lastResetAt: string | null;
  lastResetReason: string | null;
  updatedAt: string;
  version: number;
};

export type AaliyahRuntimeResponse = {
  manifestVersion: string;
  resourceType: "aaliyah_runtime_result";
  result:
    | {
        runtimeRequestId: string;
        resolvedIntent: string;
        outcomeType: "completed";
        activeMode: AaliyahMode;
        payloadType: string;
        payload: unknown;
        provenance: {
          requestId: string | null;
          generatedAt: string;
          invokedSurface: string;
        };
        fallback: null;
      }
    | {
        runtimeRequestId: string;
        resolvedIntent: string | null;
        outcomeType: "fallback";
        activeMode: AaliyahMode;
        payloadType: null;
        payload: null;
        provenance: {
          requestId: string | null;
          generatedAt: string;
          invokedSurface: string;
        };
        fallback: {
          outcome: string;
          reason: string;
          delegateToAgentId: string | null;
        };
      };
};

export type ApiEnv = {
  VITE_POLICY_BASE_URL: string;
  VITE_POLICY_BEARER: string;
  VITE_POLICY_INTROSPECTION_TOKEN?: string;
  VITE_APP_API_BASE_URL?: string;
};

type FetchClient = ReturnType<typeof createFetchClient>;

function required(raw: Record<string, unknown>, key: keyof ApiEnv): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${String(key)} is required`);
  }
  return value.trim();
}

export function readApiEnv(raw: Record<string, unknown>): ApiEnv {
  return {
    VITE_POLICY_BASE_URL: required(raw, "VITE_POLICY_BASE_URL"),
    VITE_POLICY_BEARER: required(raw, "VITE_POLICY_BEARER"),
    VITE_POLICY_INTROSPECTION_TOKEN:
      typeof raw.VITE_POLICY_INTROSPECTION_TOKEN === "string" ? raw.VITE_POLICY_INTROSPECTION_TOKEN.trim() : undefined,
    VITE_APP_API_BASE_URL:
      typeof raw.VITE_APP_API_BASE_URL === "string" ? raw.VITE_APP_API_BASE_URL.trim() : undefined
  };
}

export function resolveAppApiBaseUrl(raw: Record<string, unknown>): string {
  const env = readApiEnv(raw);
  return env.VITE_APP_API_BASE_URL || env.VITE_POLICY_BASE_URL;
}

export function createFetchClient(args: { correlationId: () => string }) {
  return async function fetchJson<T>(input: {
    url: string;
    method?: "GET" | "POST" | "PUT";
    bearer?: string;
    introspectionToken?: string;
    body?: unknown;
  }): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-correlation-id": args.correlationId()
    };
    if (input.bearer) headers.authorization = `Bearer ${input.bearer}`;
    if (input.introspectionToken) headers["x-policy-introspection-token"] = input.introspectionToken;

    const res = await fetch(input.url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });

    const raw = await res.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = raw;
    }

    if (!res.ok) {
      const message =
        typeof json === "object" && json && "message" in json ? String((json as { message: unknown }).message) : `HTTP ${res.status}`;
      throw new Error(message);
    }

    return json as T;
  };
}

export async function fetchGovernanceSnapshot(args: {
  baseUrl: string;
  bearer: string;
  introspectionToken?: string;
  fetchClient: FetchClient;
}): Promise<GovernanceSnapshot> {
  return args.fetchClient<GovernanceSnapshot>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/policy/internal/governance`,
    bearer: args.bearer,
    introspectionToken: args.introspectionToken
  });
}

export async function scoreContentDraft(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  targetId: string;
  platform: string;
  body: string;
}): Promise<Record<string, unknown>> {
  return args.fetchClient<Record<string, unknown>>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/content/score`,
    method: "POST",
    bearer: args.bearer,
    body: {
      targetId: args.targetId,
      platform: args.platform,
      body: args.body
    }
  });
}

export async function startDossierExport(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  targetId: string;
  reason: string;
}): Promise<{ job_id: string; status: "queued" | "running" | "complete" | "failed" }> {
  return args.fetchClient<{ job_id: string; status: "queued" | "running" | "complete" | "failed" }>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/research/dossier-export`,
    method: "POST",
    bearer: args.bearer,
    body: {
      targetId: args.targetId,
      reason: args.reason
    }
  });
}

export async function getDossierExportStatus(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  jobId: string;
}): Promise<{ job_id: string; status: "queued" | "running" | "complete" | "failed"; artifact_url?: string; error?: string }> {
  return args.fetchClient<{ job_id: string; status: "queued" | "running" | "complete" | "failed"; artifact_url?: string; error?: string }>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/research/dossier-export/${args.jobId}`,
    bearer: args.bearer
  });
}

function withQuery(url: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

export async function getAaliyahCommandSurface(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{ manifestVersion: string; resourceType: "aaliyah_command_surface"; shell: AaliyahCommandSurface }> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/command-surface`, { mode: args.mode }),
    bearer: args.bearer,
  });
}

export async function getAaliyahReviewQueue(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{ manifestVersion: string; resourceType: "aaliyah_review_queue"; queue: AaliyahReviewQueue }> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/review-queue`, { mode: args.mode }),
    bearer: args.bearer,
  });
}

export async function getAaliyahInbox(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{ manifestVersion: string; resourceType: "aaliyah_inbox"; inbox: AaliyahInboxSummary }> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/inbox`, { mode: args.mode }),
    bearer: args.bearer,
  });
}

export async function getAaliyahOpenTasks(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_task_list_result";
  result:
    | {
        ok: true;
        tasks: AaliyahTask[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/tasks`, { mode: args.mode, status: "open" }),
    bearer: args.bearer,
  });
}

export async function executeFounderCommand(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  request: FounderCommandRequest;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_command_result";
  result: FounderCommandResult;
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder/commands`,
    method: "POST",
    bearer: args.bearer,
    body: args.request,
  });
}

export async function getFounderCommandHistory(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_command_list_result";
  result:
    | {
        ok: true;
        commands: FounderCommandRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder/commands`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
    }),
    bearer: args.bearer,
  });
}

export async function getAaliyahFollowThroughEngineRecords(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_follow_through_engine_list_result";
  result:
    | {
        ok: true;
        records: AaliyahFollowThroughEngineRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/follow-through/engine`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
    }),
    bearer: args.bearer,
  });
}

export async function evaluateAaliyahRecommendation(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  source: {
    sourceType: "follow_through_record" | "founder_command" | "task" | "gmail_draft" | "calendar_event" | "contact" | "account";
    sourceId: string;
  };
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_recommendation_result";
  result:
    | {
        ok: true;
        recommendation: AaliyahRecommendationRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/recommendations/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      source: args.source,
    },
  });
}

export async function getAaliyahRecommendations(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_recommendation_list_result";
  result:
    | {
        ok: true;
        recommendations: AaliyahRecommendationRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/recommendations`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
    }),
    bearer: args.bearer,
  });
}

export async function getAaliyahNotifications(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  status?: "active" | "acknowledged" | "dismissed";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_notification_list_result";
  result:
    | {
        ok: true;
        notifications: AaliyahNotificationRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/notifications`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      status: args.status,
    }),
    bearer: args.bearer,
  });
}

export async function acknowledgeAaliyahNotification(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  notificationId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_notification_result";
  result:
    | {
        ok: true;
        notification: AaliyahNotificationRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/notifications/${args.notificationId}/acknowledge`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function dismissAaliyahNotification(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  notificationId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_notification_result";
  result:
    | {
        ok: true;
        notification: AaliyahNotificationRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/notifications/${args.notificationId}/dismiss`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function evaluateAaliyahOpportunity(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  source: {
    sourceType: "contact" | "account" | "task" | "calendar_event" | "follow_through_record" | "recommendation" | "founder_command";
    sourceId: string;
  };
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_opportunity_result";
  result:
    | {
        ok: true;
        opportunity: AaliyahOpportunityRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/opportunities/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      source: args.source,
    },
  });
}

export async function getAaliyahOpportunities(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  status?: "active" | "acknowledged" | "converted" | "dismissed" | "noop";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_opportunity_list_result";
  result:
    | {
        ok: true;
        opportunities: AaliyahOpportunityRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/opportunities`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      status: args.status,
    }),
    bearer: args.bearer,
  });
}

export async function acknowledgeAaliyahOpportunity(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  opportunityId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_opportunity_result";
  result:
    | {
        ok: true;
        opportunity: AaliyahOpportunityRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/opportunities/${args.opportunityId}/acknowledge`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function dismissAaliyahOpportunity(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  opportunityId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_opportunity_result";
  result:
    | {
        ok: true;
        opportunity: AaliyahOpportunityRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/opportunities/${args.opportunityId}/dismiss`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function evaluateAaliyahStrategicIntelligence(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  scope?: "current" | "daily" | "weekly";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_strategic_intelligence_result";
  result:
    | {
        ok: true;
        insights: AaliyahStrategicInsightRecord[];
        replayedCount: number;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/strategic-intelligence/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      scope: args.scope ?? "current",
    },
  });
}

export async function getAaliyahStrategicInsights(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  status?: "active" | "superseded" | "acknowledged" | "dismissed";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_strategic_intelligence_list_result";
  result:
    | {
        ok: true;
        insights: AaliyahStrategicInsightRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/strategic-intelligence`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      status: args.status,
    }),
    bearer: args.bearer,
  });
}

export async function acknowledgeAaliyahStrategicInsight(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  insightId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_strategic_intelligence_detail_result";
  result:
    | {
        ok: true;
        insight: AaliyahStrategicInsightRecord;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/strategic-intelligence/${args.insightId}/acknowledge`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function dismissAaliyahStrategicInsight(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  insightId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_strategic_intelligence_detail_result";
  result:
    | {
        ok: true;
        insight: AaliyahStrategicInsightRecord;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/strategic-intelligence/${args.insightId}/dismiss`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function evaluateAaliyahCoalescedSignals(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_coalesced_signal_result";
  result:
    | {
        ok: true;
        signals: AaliyahCoalescedSignalRecord[];
        replayedCount: number;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/coalesced-signals/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
    },
  });
}

export async function getAaliyahCoalescedSignals(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  status?: "active" | "acknowledged" | "dismissed" | "resolved";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_coalesced_signal_list_result";
  result:
    | {
        ok: true;
        signals: AaliyahCoalescedSignalRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/coalesced-signals`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      status: args.status,
    }),
    bearer: args.bearer,
  });
}

export async function acknowledgeAaliyahCoalescedSignal(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  signalId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_coalesced_signal_detail_result";
  result:
    | {
        ok: true;
        signal: AaliyahCoalescedSignalRecord;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/coalesced-signals/${args.signalId}/acknowledge`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function dismissAaliyahCoalescedSignal(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  signalId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_coalesced_signal_detail_result";
  result:
    | {
        ok: true;
        signal: AaliyahCoalescedSignalRecord;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/coalesced-signals/${args.signalId}/dismiss`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function sendAaliyahDelivery(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  channel: AaliyahDeliveryRecord["channel"];
  sourceType: AaliyahDeliveryRecord["sourceType"];
  sourceId: string;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_delivery_result";
  result:
    | {
        ok: true;
        delivery: AaliyahDeliveryRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/deliveries/send`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      channel: args.channel,
      source: {
        sourceType: args.sourceType,
        sourceId: args.sourceId
      }
    }
  });
}

export async function getAaliyahDeliveries(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  sourceType?: AaliyahDeliveryRecord["sourceType"];
  sourceId?: string;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_delivery_list_result";
  result:
    | {
        ok: true;
        deliveries: AaliyahDeliveryRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/deliveries`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      sourceType: args.sourceType,
      sourceId: args.sourceId
    }),
    bearer: args.bearer
  });
}

export async function retryAaliyahDelivery(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  deliveryId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_delivery_result";
  result:
    | {
        ok: true;
        delivery: AaliyahDeliveryRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/deliveries/${args.deliveryId}/retry`, {
      mode: args.mode
    }),
    method: "POST",
    bearer: args.bearer
  });
}

export async function composeAaliyahDigest(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  digestType: AaliyahDigestRecord["digestType"];
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_digest_result";
  result:
    | {
        ok: true;
        digest: AaliyahDigestRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/digests/compose`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      digestType: args.digestType
    }
  });
}

export async function getAaliyahDigests(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  digestType?: AaliyahDigestRecord["digestType"];
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_digest_list_result";
  result:
    | {
        ok: true;
        digests: AaliyahDigestRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/digests`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      digestType: args.digestType
    }),
    bearer: args.bearer
  });
}

export async function sendAaliyahDigest(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  digestId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_digest_result";
  result:
    | {
        ok: true;
        digest: AaliyahDigestRecord;
        replayed: boolean;
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/digests/${args.digestId}/send`, {
      mode: args.mode
    }),
    method: "POST",
    bearer: args.bearer
  });
}

export async function evaluateAaliyahEscalations(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_escalation_result";
  result:
    | { ok: true; escalations: AaliyahEscalationRecord[]; replayedCount: number; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/escalations/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: { mode: args.mode ?? "founder" }
  });
}

export async function getAaliyahEscalations(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  status?: "active" | "acknowledged" | "dismissed" | "resolved";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_escalation_list_result";
  result:
    | { ok: true; escalations: AaliyahEscalationRecord[]; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/escalations`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      status: args.status
    }),
    bearer: args.bearer
  });
}

async function postEscalationLifecycle(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  escalationId: string;
  action: "acknowledge" | "dismiss" | "resolve";
  mode?: AaliyahMode;
}) {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/escalations/${args.escalationId}/${args.action}`, {
      mode: args.mode
    }),
    method: "POST",
    bearer: args.bearer
  }) as Promise<{
    manifestVersion: string;
    resourceType: "aaliyah_escalation_detail_result";
    result:
      | { ok: true; escalation: AaliyahEscalationRecord; message: string }
      | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
  }>;
}

export function acknowledgeAaliyahEscalation(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  escalationId: string;
  mode?: AaliyahMode;
}) {
  return postEscalationLifecycle({ ...args, action: "acknowledge" });
}

export function dismissAaliyahEscalation(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  escalationId: string;
  mode?: AaliyahMode;
}) {
  return postEscalationLifecycle({ ...args, action: "dismiss" });
}

export function resolveAaliyahEscalation(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  escalationId: string;
  mode?: AaliyahMode;
}) {
  return postEscalationLifecycle({ ...args, action: "resolve" });
}

export async function evaluateAaliyahOperatorQueue(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_result";
  result:
    | { ok: true; queueItems: AaliyahOperatorQueueRecord[]; replayedCount: number; suppressedCount: number; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/evaluate`,
    method: "POST",
    bearer: args.bearer,
    body: { mode: args.mode ?? "founder" }
  });
}

export async function getAaliyahOperatorQueue(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  priorityBand?: "critical" | "high" | "normal";
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_list_result";
  result:
    | { ok: true; queueItems: AaliyahOperatorQueueRecord[]; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      priorityBand: args.priorityBand
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahOperatorQueueItem(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  queueItemId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_detail_result";
  result:
    | { ok: true; queueItem: AaliyahOperatorQueueRecord; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/${args.queueItemId}`, {
      mode: args.mode
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahOperatorQueueTop(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  immediateLimit?: number;
  overallLimit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_top_result";
  result:
    | { ok: true; immediateActions: AaliyahOperatorQueueRecord[]; topQueueItems: AaliyahOperatorQueueRecord[]; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/top`, {
      mode: args.mode,
      immediateLimit: args.immediateLimit ? String(args.immediateLimit) : undefined,
      overallLimit: args.overallLimit ? String(args.overallLimit) : undefined
    }),
    bearer: args.bearer
  });
}

export async function executeAaliyahOperatorQueueItem(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  queueItemId: string;
  idempotencyKey: string;
  mode?: AaliyahMode;
  requestedAt?: string;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_execute_result";
  result:
    | {
        ok: true;
        result: {
          executionStatus: "success" | "failure" | "invalidated" | "already_executed" | "superseded" | "not_actionable";
          queueItemId: string;
          commandId?: string;
          canonicalIssueKey?: string | null;
          executedAtIso: string;
          auditId: string;
        };
        log: AaliyahOperatorActionLogRecord;
      }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/${args.queueItemId}/execute`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      idempotencyKey: args.idempotencyKey,
      requestedAt: args.requestedAt
    }
  });
}

export async function refreshAaliyahOperatorQueueItem(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  queueItemId: string;
  mode?: AaliyahMode;
  generatedAt?: string;
  force?: boolean;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_refresh_result";
  result:
    | {
        ok: true;
        queueItem: AaliyahOperatorQueueRecord;
        refreshed: boolean;
        invalidated: boolean;
        message: string;
      }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/${args.queueItemId}/refresh`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      generatedAt: args.generatedAt,
      force: args.force ?? false
    }
  });
}

export async function refreshAaliyahOperatorQueue(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  generatedAt?: string;
  force?: boolean;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_operator_queue_refresh_all_result";
  result:
    | {
        ok: true;
        queueItems: AaliyahOperatorQueueRecord[];
        refreshedCount: number;
        invalidatedCount: number;
        message: string;
      }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/operator-queue/refresh`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      generatedAt: args.generatedAt,
      force: args.force ?? false
    }
  });
}

export async function recordAaliyahOutcomeFeedback(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  queueItemId: string;
  operatorActionLogId: string | null;
  outcomeType: AaliyahOutcomeFeedbackRecord["outcomeType"];
  outcomeStatus: AaliyahOutcomeFeedbackRecord["outcomeStatus"];
  reasonCode?: string | null;
  notes?: string | null;
  idempotencyKey: string;
  reportedAtIso?: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_outcome_feedback_result";
  result:
    | {
        ok: true;
        outcome: AaliyahOutcomeFeedbackRecord;
        issueState: AaliyahIssueStateRecord;
        replayed: boolean;
        message: string;
      }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/outcomes`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      queueItemId: args.queueItemId,
      operatorActionLogId: args.operatorActionLogId,
      outcomeType: args.outcomeType,
      outcomeStatus: args.outcomeStatus,
      reasonCode: args.reasonCode ?? null,
      notes: args.notes ?? null,
      idempotencyKey: args.idempotencyKey,
      reportedAtIso: args.reportedAtIso
    }
  });
}

export async function getAaliyahOutcomeFeedback(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  outcomeId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_outcome_feedback_detail_result";
  result:
    | { ok: true; outcome: AaliyahOutcomeFeedbackRecord; issueState: AaliyahIssueStateRecord | null; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/outcomes/${args.outcomeId}`, {
      mode: args.mode
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahOutcomeFeedbackByIssue(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  canonicalIssueKey: string;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_outcome_feedback_list_result";
  result:
    | { ok: true; outcomes: AaliyahOutcomeFeedbackRecord[]; issueState: AaliyahIssueStateRecord | null; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/outcomes/issue/${encodeURIComponent(args.canonicalIssueKey)}`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahOutcomeFeedbackByQueueItem(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  queueItemId: string;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_outcome_feedback_list_result";
  result:
    | { ok: true; outcomes: AaliyahOutcomeFeedbackRecord[]; issueState: AaliyahIssueStateRecord | null; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/outcomes/queue-item/${args.queueItemId}`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined
    }),
    bearer: args.bearer
  });
}

export async function generateAaliyahFounderBrief(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  briefKind?: AaliyahFounderBriefRecord["briefKind"];
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_brief_result";
  result:
    | { ok: true; brief: AaliyahFounderBriefRecord; items: AaliyahFounderBriefItemRecord[]; replayed: boolean; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-briefs/generate`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      briefKind: args.briefKind ?? "daily"
    }
  });
}

export async function getLatestAaliyahFounderBrief(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  briefKind?: AaliyahFounderBriefRecord["briefKind"];
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_brief_result";
  result:
    | { ok: true; brief: AaliyahFounderBriefRecord; items: AaliyahFounderBriefItemRecord[]; replayed: boolean; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-briefs/latest`, {
      mode: args.mode,
      briefKind: args.briefKind
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahFounderBrief(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  briefId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_brief_result";
  result:
    | { ok: true; brief: AaliyahFounderBriefRecord; items: AaliyahFounderBriefItemRecord[]; replayed: boolean; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-briefs/${args.briefId}`, {
      mode: args.mode
    }),
    bearer: args.bearer
  });
}

export async function listAaliyahFounderBriefs(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  briefKind?: AaliyahFounderBriefRecord["briefKind"];
  limit?: number;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_brief_list_result";
  result:
    | { ok: true; briefs: AaliyahFounderBriefRecord[]; message: string }
    | { ok: false; denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null; errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null; retryable: boolean; message: string };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-briefs`, {
      mode: args.mode,
      briefKind: args.briefKind,
      limit: args.limit ? String(args.limit) : undefined
    }),
    bearer: args.bearer
  });
}

export async function getAaliyahFounderPreferenceControls(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_preference_controls_result";
  result: AaliyahFounderPreferenceControlsMutationResult;
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-preferences`, {
      mode: args.mode
    }),
    bearer: args.bearer
  });
}

export async function putAaliyahFounderPreferenceControls(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  preferences: Partial<AaliyahFounderPreferenceControlsRecord>;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_founder_preference_controls_result";
  result: AaliyahFounderPreferenceControlsMutationResult;
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/founder-preferences`,
    method: "PUT",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      preferences: args.preferences
    }
  });
}

export async function createAaliyahEvaluationSchedule(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  engineType: AaliyahEvaluationScheduleRecord["engineType"];
  cadenceType: AaliyahEvaluationScheduleRecord["cadenceType"];
  cadenceValue?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_schedule_result";
  result: AaliyahEvaluationScheduleMutationResult;
}> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-schedules`,
    method: "POST",
    bearer: args.bearer,
    body: {
      mode: args.mode ?? "founder",
      engineType: args.engineType,
      cadenceType: args.cadenceType,
      cadenceValue: args.cadenceValue,
      metadata: args.metadata,
    },
  });
}

export async function getAaliyahEvaluationSchedules(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_schedule_list_result";
  result:
    | {
        ok: true;
        schedules: AaliyahEvaluationScheduleRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-schedules`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
    }),
    bearer: args.bearer,
  });
}

export async function pauseAaliyahEvaluationSchedule(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  scheduleId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_schedule_result";
  result: AaliyahEvaluationScheduleMutationResult;
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-schedules/${args.scheduleId}/pause`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function resumeAaliyahEvaluationSchedule(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  scheduleId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_schedule_result";
  result: AaliyahEvaluationScheduleMutationResult;
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-schedules/${args.scheduleId}/resume`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function runAaliyahEvaluationSchedule(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  scheduleId: string;
  mode?: AaliyahMode;
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_run_result";
  result: AaliyahEvaluationRunMutationResult;
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-schedules/${args.scheduleId}/run`, {
      mode: args.mode,
    }),
    method: "POST",
    bearer: args.bearer,
  });
}

export async function getAaliyahEvaluationRuns(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  mode?: AaliyahMode;
  limit?: number;
  engineType?: AaliyahEvaluationRunRecord["engineType"];
}): Promise<{
  manifestVersion: string;
  resourceType: "aaliyah_evaluation_run_list_result";
  result:
    | {
        ok: true;
        runs: AaliyahEvaluationRunRecord[];
        message: string;
      }
    | {
        ok: false;
        denialCode: "ACCESS_DENIED" | "INVALID_MODE" | null;
        errorCode: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | null;
        retryable: boolean;
        message: string;
      };
}> {
  return args.fetchClient({
    url: withQuery(`${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/evaluation-runs`, {
      mode: args.mode,
      limit: args.limit ? String(args.limit) : undefined,
      engineType: args.engineType,
    }),
    bearer: args.bearer,
  });
}

export async function getAaliyahSessionSnapshot(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
}): Promise<{ manifestVersion: string; resourceType: "aaliyah_session_snapshot"; session: AaliyahSessionSnapshot }> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/session`,
    bearer: args.bearer,
  });
}

export async function resetAaliyahSession(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  scope?: "soft" | "hard";
}): Promise<{ manifestVersion: string; resourceType: "aaliyah_session_reset"; reset: { session: AaliyahSessionSnapshot; resetReason: string } }> {
  return args.fetchClient({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/session/reset`,
    method: "POST",
    bearer: args.bearer,
    body: { scope: args.scope ?? "soft" },
  });
}

export async function runAaliyahRuntime(args: {
  baseUrl: string;
  bearer: string;
  fetchClient: FetchClient;
  intent: string;
  mode?: AaliyahMode;
  parameters?: Record<string, unknown>;
}): Promise<AaliyahRuntimeResponse> {
  return args.fetchClient<AaliyahRuntimeResponse>({
    url: `${args.baseUrl.replace(/\/+$/, "")}/v1/agent-os/aaliyah/runtime`,
    method: "POST",
    bearer: args.bearer,
    body: {
      intent: args.intent,
      mode: args.mode,
      parameters: args.parameters ?? {},
    },
  });
}
