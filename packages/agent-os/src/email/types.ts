import type { AgentId } from "../agents/registry.js";
import type { RoutingDecision } from "../org/routing-types.js";
import type { DepartmentId, ExecutiveId, LeadAgentId, SubAgentId } from "../org/types.js";

export type EmailProvider = "gmail";
export type EmailConnectionMode = "draft_only";

export type NormalizedEmailParty = {
  displayName: string | null;
  emailAddress: string;
  domain: string;
};

export type NormalizedEmailMessage = {
  providerMessageId: string;
  providerThreadId: string;
  subject: string;
  sentAt: string;
  from: NormalizedEmailParty;
  to: NormalizedEmailParty[];
  cc: NormalizedEmailParty[];
  bcc: NormalizedEmailParty[];
  textBody: string;
  htmlBody: string | null;
  snippet: string;
};

export type EmailIntentCategory =
  | "lead_inquiry"
  | "client_request"
  | "billing_question"
  | "meeting_request"
  | "vendor_outreach"
  | "partnership_inquiry"
  | "technical_issue"
  | "support_request"
  | "general_inquiry"
  | "spam_or_irrelevant"
  | "legal_or_sensitive";

export type EmailPriority = "low" | "normal" | "high" | "urgent";
export type EmailRiskLevel = "low" | "medium" | "high" | "critical";
export type EmailApprovalRequirement = "required";

export type NormalizedEmailThread = {
  provider: EmailProvider;
  providerThreadId: string;
  accountId: string;
  subject: string;
  messages: NormalizedEmailMessage[];
  labels: string[];
  lastMessageAt: string;
};

export type EmailRoutingTarget =
  | {
      targetType: "lead_agent";
      departmentId: DepartmentId;
      executiveId: ExecutiveId;
      leadAgentId: LeadAgentId;
      subAgentId: SubAgentId | null;
      executionAgentId: AgentId | null;
      requiresEscalation: boolean;
    }
  | {
      targetType: "executive_lane";
      departmentId: DepartmentId;
      executiveId: ExecutiveId;
      leadAgentId: null;
      subAgentId: null;
      executionAgentId: null;
      requiresEscalation: boolean;
    }
  | {
      targetType: "suppressed";
      departmentId: null;
      executiveId: null;
      leadAgentId: null;
      subAgentId: null;
      executionAgentId: null;
      requiresEscalation: false;
    };

export type EmailRoutingResolution = {
  intentCategory: EmailIntentCategory;
  target: EmailRoutingTarget;
  routingDecision: RoutingDecision | null;
  trace: string[];
};

export type EmailDraftSuggestion = {
  draftId: string;
  threadId: string;
  summary: string;
  proposedReplySubject: string;
  proposedReplyBody: string;
  confidenceScore: number;
  riskScore: number;
  approvalRequirement: EmailApprovalRequirement;
  approvalRequired: true;
  blockedAutoSend: true;
  escalationRecommended: boolean;
  recommendedOwner: EmailRoutingTarget;
  routingProvenance: EmailRoutingResolution;
};

export type EmailAssignmentIntegrationRequest = {
  tenantId: string;
  requestedBy: string;
  correlationId: string;
  thread: NormalizedEmailThread;
  intentCategory: EmailIntentCategory;
  routing: EmailRoutingResolution;
};

export type EmailIncidentIntegrationRequest = {
  tenantId: string;
  correlationId: string;
  source: string;
  threadId: string;
  intentCategory: EmailIntentCategory;
  message: string;
  metadata?: Record<string, unknown>;
};

export type EmailThreadClassification = {
  intentCategory: EmailIntentCategory;
  priority: EmailPriority;
  riskLevel: EmailRiskLevel;
  approvalRequirement: EmailApprovalRequirement;
  escalationRequired: boolean;
  rationale: string[];
};

export type EmailProcessingResult = {
  status: "drafted" | "escalated" | "suppressed" | "failed";
  threadId: string;
  intentCategory: EmailIntentCategory;
  priority: EmailPriority;
  riskLevel: EmailRiskLevel;
  classification: EmailThreadClassification;
  routing: EmailRoutingResolution;
  draft: EmailDraftSuggestion | null;
  assignmentIntegration: EmailAssignmentIntegrationRequest | null;
  incidentIntegration: EmailIncidentIntegrationRequest | null;
};
