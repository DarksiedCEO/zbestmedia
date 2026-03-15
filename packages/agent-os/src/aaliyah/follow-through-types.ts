import type { FounderBriefingMode } from "./briefing-types.js";
import type {
  AaliyahWorkingItemClosureReason,
  AaliyahWorkingItemClosureState,
  AaliyahWorkingItemType
} from "./session-types.js";

export type FollowThroughStatus =
  | "active"
  | "completed"
  | "abandoned"
  | "escalated"
  | "invalidated"
  | "reset";

export type WorkingItemClosureState = Exclude<AaliyahWorkingItemClosureState, "open"> | "active";

export type WorkingItemClosureReason =
  | AaliyahWorkingItemClosureReason
  | "founder_declared_completed"
  | "founder_declared_abandoned"
  | "founder_declared_escalated"
  | "founder_declared_invalidated"
  | "dispatch_confirmed"
  | "review_completed"
  | "voice_escalated"
  | "incident_acknowledged"
  | "incident_resolved";

export type NextGovernedAction =
  | "none_terminal"
  | "await_founder_review"
  | "dispatch_approved_email"
  | "open_voice_escalation"
  | "refresh_briefing"
  | "select_new_queue_item"
  | "resolve_disambiguation";

export type FollowThroughActionType = "complete" | "abandon" | "escalate" | "invalidate";

export type FollowThroughEscalationClass =
  | "founder_attention"
  | "operator_review"
  | "incident_response"
  | "specialist_handoff";

export type FollowThroughActionRequest = {
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  mode: FounderBriefingMode;
  action: FollowThroughActionType;
  generatedAt?: string;
  idempotencyKey?: string | null;
  queueItemId?: string | null;
  founderDeclaredCompletion?: boolean;
  closureReason: WorkingItemClosureReason;
  closureNote?: string | null;
  downstreamActionRef?: string | null;
  escalationTarget?: string | null;
  escalationClass?: FollowThroughEscalationClass | null;
  escalationRationale?: string | null;
  escalationProvenance?: Record<string, unknown> | null;
};

export type FollowThroughEligibilityResult = {
  allowed: boolean;
  reason: string;
  sessionId: string | null;
  activeMode: FounderBriefingMode;
  workingItemId: string | null;
  followThroughId: string | null;
  nextGovernedAction: NextGovernedAction | null;
};

export type WorkingItemClosureEvent = {
  tenantId: string;
  eventId: string;
  followThroughId: string;
  action: FollowThroughActionType;
  previousStatus: FollowThroughStatus;
  resultingStatus: FollowThroughStatus;
  closureState: WorkingItemClosureState;
  closureReason: WorkingItemClosureReason;
  nextGovernedAction: NextGovernedAction;
  founderDeclaredCompletion: boolean;
  downstreamActionRef: string | null;
  escalationTarget: string | null;
  escalationClass: FollowThroughEscalationClass | null;
  escalationRationale: string | null;
  escalationProvenance: Record<string, unknown> | null;
  note: string | null;
  actorId: string;
  createdAt: string;
};

export type FollowThroughHistoryEntry = WorkingItemClosureEvent;

export type FollowThroughRecord = {
  tenantId: string;
  followThroughId: string;
  version: number;
  sessionId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  activeMode: FounderBriefingMode;
  companyScope: "zbestmedia";
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
  status: FollowThroughStatus;
  closureState: WorkingItemClosureState;
  closureReason: WorkingItemClosureReason | null;
  nextGovernedAction: NextGovernedAction;
  founderDeclaredCompletion: boolean;
  downstreamActionRef: string | null;
  escalationTarget: string | null;
  escalationClass: FollowThroughEscalationClass | null;
  escalationRationale: string | null;
  escalationProvenance: Record<string, unknown> | null;
  note: string | null;
  provenance: {
    queueItemId: string | null;
    reviewItemId: string | null;
    callId: string | null;
    incidentId: string | null;
    dispatchId: string | null;
    sessionVersion: number;
  };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type FollowThroughActionResult = {
  record: FollowThroughRecord;
  historyEntry: FollowThroughHistoryEntry;
  nextGovernedAction: NextGovernedAction;
};
