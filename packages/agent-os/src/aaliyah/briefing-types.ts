import type { AssignmentRecord, ExecutionRunRecord } from "../execution/record-types.js";
import type { IncidentSeverity, IncidentType } from "../incidents/types.js";
import type { OpsStatusLevel, TelemetrySurface } from "../telemetry/types.js";
import type { EmailIntentCategory, EmailPriority } from "../email/types.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";

export type FounderBriefingMode = "founder" | "zbestmedia";
export type FounderBriefingSection =
  | "top_priorities"
  | "waiting_on_me"
  | "revenue_watch"
  | "operations_watch"
  | "calendar_watch"
  | "relationship_watch"
  | "recommended_actions";

export type FounderInterruptClass = "interrupt_now" | "review_soon" | "can_wait";

export type FounderBriefingOwner = {
  executiveId: ExecutiveId | null;
  departmentId: DepartmentId | null;
  leadAgentId: LeadAgentId | null;
  subAgentId: SubAgentId | null;
  sourceLane: string;
};

export type FounderBriefingItem = {
  itemId: string;
  category: FounderBriefingSection;
  title: string;
  summary: string;
  urgency: EmailPriority;
  owner: FounderBriefingOwner;
  recommendedAction: string;
  interruptionClass: FounderInterruptClass;
  requiresFounderAttention: boolean;
  provenanceReferences: string[];
};

export type FounderRecommendedAction = {
  actionId: string;
  title: string;
  action: string;
  urgency: EmailPriority;
  sourceItemId: string;
};

export type FounderBriefingSourceMetadata = {
  orgManifestVersion: string;
  aaliyahRegistryVersion: string;
  generatedFrom: {
    pendingReviewCount: number;
    openIncidentCount: number;
    releaseBlockingIncidentCount: number;
    recentExecutionFailureCount: number;
  };
};

export type FounderBriefingInterruptSummary = {
  interruptNowCount: number;
  reviewSoonCount: number;
  canWaitCount: number;
};

export type FounderBriefingConfidenceSummary = {
  status: OpsStatusLevel;
  lowConfidenceSignals: number;
  degradedSurfaces: TelemetrySurface[];
};

export type FounderBriefing = {
  briefingId: string;
  generatedAt: string;
  activeMode: FounderBriefingMode;
  manifestVersion: string;
  topPriorities: FounderBriefingItem[];
  waitingOnMe: FounderBriefingItem[];
  revenueWatch: FounderBriefingItem[];
  operationsWatch: FounderBriefingItem[];
  calendarWatch: FounderBriefingItem[];
  relationshipWatch: FounderBriefingItem[];
  recommendedActions: FounderRecommendedAction[];
  interruptSummary: FounderBriefingInterruptSummary;
  confidenceSummary: FounderBriefingConfidenceSummary;
  sourceMetadata: FounderBriefingSourceMetadata;
};

export type FounderBriefingContext = {
  tenantId: string;
  mode: FounderBriefingMode;
  generatedAt?: string;
};

export type FounderReviewSource = {
  reviewItemId: string;
  threadId: string;
  assignmentRecordId: string | null;
  runRecordId: string | null;
  intentCategory: EmailIntentCategory;
  priority: EmailPriority;
  riskLevel: "low" | "medium" | "high" | "critical";
  draftSummary: string;
  proposedReplySubject: string;
  recommendedExecutiveId: string | null;
  recommendedDepartmentId: string | null;
  recommendedLeadAgentId: string | null;
  recommendedSubAgentId: string | null;
  confidenceScore: number;
  riskScore: number;
  escalationRecommended: boolean;
};

export type FounderIncidentSource = {
  incidentId: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  summary: string;
  recommendedAction: string;
  releaseBlocking: boolean;
  owningExecutiveId: ExecutiveId;
  owningDepartmentId: DepartmentId;
  owningLeadAgentId: LeadAgentId;
  owningSubAgentId: SubAgentId;
};

export type FounderExecutionFailureSource = Pick<ExecutionRunRecord, "runRecordId" | "assignmentRecordId" | "failureCategory" | "failureMessage">;
export type FounderAssignmentSource = Pick<AssignmentRecord, "assignmentRecordId" | "requestedTaskCategory" | "policyDecisionReason">;
