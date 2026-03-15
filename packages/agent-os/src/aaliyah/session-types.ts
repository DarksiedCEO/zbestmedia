import type { FounderBriefingMode } from "./briefing-types.js";
import type { AaliyahRuntimeFallbackOutcome, AaliyahRuntimeMode } from "./runtime-types.js";
import type { AaliyahQueueConfidenceLevel, AaliyahQueueInterruptionClass } from "./review-queue-types.js";

export type AaliyahSessionSourceSurface = "aaliyah_runtime" | "aaliyah_admin";

export type AaliyahSessionResetReason =
  | "manual_reset"
  | "idle_expired"
  | "hard_expired"
  | "mode_switch"
  | "boundary_violation"
  | "ambiguity_reset"
  | "working_item_closed";

export type AaliyahModeSwitchReason =
  | "session_resume"
  | "explicit_request"
  | "runtime_switch_intent"
  | "fallback_to_default"
  | "boundary_enforced_reset";

export type AaliyahWorkingItemType =
  | "founder_queue_item"
  | "email_review_item"
  | "voice_call"
  | "incident"
  | "dispatch_candidate"
  | "routing_preview";

export type AaliyahWorkingItemClosureState =
  | "open"
  | "completed"
  | "abandoned"
  | "escalated"
  | "invalidated"
  | "reset";

export type AaliyahWorkingItemClosureReason =
  | "review_approved"
  | "review_rejected"
  | "revision_requested"
  | "email_dispatched"
  | "mode_switched"
  | "expired"
  | "manual_reset"
  | "boundary_denied"
  | "ambiguity"
  | "item_not_found"
  | "cleared_by_runtime";

export type AaliyahBoundaryViolationResult = {
  violationId: string;
  activeMode: FounderBriefingMode;
  requestedMode: FounderBriefingMode;
  requestedCompanies: string[];
  access: "denied" | "allowed_founder_summary_only";
  reasonCodes: string[];
  enforcedReset: boolean;
  createdAt: string;
};

export type AaliyahSessionRetentionPolicy = {
  intentTrailMaxEntries: number;
  idleTtlSeconds: number;
  hardTtlSeconds: number;
  snapshotIntentTrailEntries: number;
};

export type AaliyahActiveModeState = {
  activeMode: AaliyahRuntimeMode;
  previousMode: AaliyahRuntimeMode | null;
  switchedAt: string;
  switchReason: AaliyahModeSwitchReason;
  boundaryDecisionId: string | null;
};

export type AaliyahIntentTrailEntry = {
  entryId: string;
  sourceSurface: AaliyahSessionSourceSurface;
  requestId: string | null;
  requestedIntent: string;
  resolvedIntent: string | null;
  activeMode: AaliyahRuntimeMode;
  outcomeType: "completed" | "fallback";
  confidenceLevel: "high" | "medium" | "low";
  fallbackOutcome: Exclude<AaliyahRuntimeFallbackOutcome, "proceed_with_orchestration"> | null;
  parameterSummary: {
    queueItemId?: string;
    reviewItemId?: string;
    callId?: string;
    incidentId?: string;
    targetMode?: FounderBriefingMode;
  };
  createdAt: string;
};

export type AaliyahWorkingItemContext = {
  contextId: string;
  workingItemType: AaliyahWorkingItemType;
  sourceSubsystem: string;
  sourceItemId: string;
  queueItemId: string | null;
  reviewItemId: string | null;
  callId: string | null;
  incidentId: string | null;
  dispatchId: string | null;
  title: string;
  summary: string;
  founderAttentionRequired: boolean;
  confidenceLevel: AaliyahQueueConfidenceLevel | "high" | "medium" | "low";
  interruptionClass: AaliyahQueueInterruptionClass | null;
  setByIntent: string | null;
  setAt: string;
  updatedAt: string;
  closureState: AaliyahWorkingItemClosureState;
  closureReason: AaliyahWorkingItemClosureReason | null;
  closedAt: string | null;
  closedByIntent: string | null;
};

export type AaliyahReviewApprovalContext = {
  reviewItemId: string;
  draftId: string | null;
  accountId: string | null;
  threadId: string | null;
  reviewStatus: "pending_review" | "approved" | "rejected" | "revision_requested";
  dispatchReady: boolean;
  setAt: string;
  updatedAt: string;
  invalidatedAt: string | null;
  invalidationReason:
    | "review_approved"
    | "review_rejected"
    | "revision_requested"
    | "email_dispatched"
    | "mode_switched"
    | "expired"
    | "manual_reset"
    | "item_not_found"
    | null;
};

export type AaliyahFounderInteractionState = {
  lastInteractionAt: string | null;
  lastIntent: string | null;
  lastResolvedIntent: string | null;
  intentTrail: AaliyahIntentTrailEntry[];
  workingItem: AaliyahWorkingItemContext | null;
  reviewApprovalContext: AaliyahReviewApprovalContext | null;
  pendingDisambiguation: {
    reason: string;
    requestedIntent: string | null;
    createdAt: string;
  } | null;
};

export type AaliyahSessionContext = {
  sessionId: string;
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  companyScope: "zbestmedia";
  activeModeState: AaliyahActiveModeState;
  interactionState: AaliyahFounderInteractionState;
  retentionPolicy: AaliyahSessionRetentionPolicy;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  hardExpiresAt: string;
  lastResetAt: string | null;
  lastResetReason: AaliyahSessionResetReason | null;
  version: number;
};

export type AaliyahSessionSnapshotView = {
  sessionId: string;
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  activeModeState: AaliyahActiveModeState;
  interactionState: {
    lastInteractionAt: string | null;
    lastIntent: string | null;
    lastResolvedIntent: string | null;
    intentTrail: AaliyahIntentTrailEntry[];
    workingItem: AaliyahWorkingItemContext | null;
    reviewApprovalContext: AaliyahReviewApprovalContext | null;
    pendingDisambiguation: AaliyahFounderInteractionState["pendingDisambiguation"];
  };
  retentionPolicy: AaliyahSessionRetentionPolicy;
  expiresAt: string;
  hardExpiresAt: string;
  lastResetAt: string | null;
  lastResetReason: AaliyahSessionResetReason | null;
  updatedAt: string;
  version: number;
};

export type AaliyahSessionResetResult = {
  session: AaliyahSessionSnapshotView;
  resetReason: AaliyahSessionResetReason;
};
