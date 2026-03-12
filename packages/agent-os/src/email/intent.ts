import type { EmailApprovalRequirement, EmailIntentCategory, EmailPriority, EmailRiskLevel } from "./types.js";

export const EMAIL_INTENT_CATEGORIES = [
  "lead_inquiry",
  "client_request",
  "billing_question",
  "meeting_request",
  "vendor_outreach",
  "partnership_inquiry",
  "technical_issue",
  "support_request",
  "general_inquiry",
  "spam_or_irrelevant",
  "legal_or_sensitive"
] as const satisfies readonly EmailIntentCategory[];

export type EmailIntentPolicy = {
  intentCategory: EmailIntentCategory;
  defaultPriority: EmailPriority;
  defaultRisk: EmailRiskLevel;
  approvalRequirement: EmailApprovalRequirement;
  escalationRequired: boolean;
  autoSendAllowed: false;
};

export const EMAIL_INTENT_POLICY: Record<EmailIntentCategory, EmailIntentPolicy> = {
  lead_inquiry: {
    intentCategory: "lead_inquiry",
    defaultPriority: "high",
    defaultRisk: "medium",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  client_request: {
    intentCategory: "client_request",
    defaultPriority: "high",
    defaultRisk: "medium",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  billing_question: {
    intentCategory: "billing_question",
    defaultPriority: "high",
    defaultRisk: "high",
    approvalRequirement: "required",
    escalationRequired: true,
    autoSendAllowed: false
  },
  meeting_request: {
    intentCategory: "meeting_request",
    defaultPriority: "normal",
    defaultRisk: "medium",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  vendor_outreach: {
    intentCategory: "vendor_outreach",
    defaultPriority: "normal",
    defaultRisk: "medium",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  partnership_inquiry: {
    intentCategory: "partnership_inquiry",
    defaultPriority: "high",
    defaultRisk: "high",
    approvalRequirement: "required",
    escalationRequired: true,
    autoSendAllowed: false
  },
  technical_issue: {
    intentCategory: "technical_issue",
    defaultPriority: "urgent",
    defaultRisk: "critical",
    approvalRequirement: "required",
    escalationRequired: true,
    autoSendAllowed: false
  },
  support_request: {
    intentCategory: "support_request",
    defaultPriority: "high",
    defaultRisk: "medium",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  general_inquiry: {
    intentCategory: "general_inquiry",
    defaultPriority: "normal",
    defaultRisk: "low",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  spam_or_irrelevant: {
    intentCategory: "spam_or_irrelevant",
    defaultPriority: "low",
    defaultRisk: "low",
    approvalRequirement: "required",
    escalationRequired: false,
    autoSendAllowed: false
  },
  legal_or_sensitive: {
    intentCategory: "legal_or_sensitive",
    defaultPriority: "urgent",
    defaultRisk: "critical",
    approvalRequirement: "required",
    escalationRequired: true,
    autoSendAllowed: false
  }
};

export function getEmailIntentPolicy(intentCategory: EmailIntentCategory): EmailIntentPolicy {
  return EMAIL_INTENT_POLICY[intentCategory];
}

export function requiresEscalationForIntent(intentCategory: EmailIntentCategory): boolean {
  return getEmailIntentPolicy(intentCategory).escalationRequired;
}

export function getPriorityForIntent(intentCategory: EmailIntentCategory): EmailPriority {
  return getEmailIntentPolicy(intentCategory).defaultPriority;
}

export function getRiskForIntent(intentCategory: EmailIntentCategory): EmailRiskLevel {
  return getEmailIntentPolicy(intentCategory).defaultRisk;
}
