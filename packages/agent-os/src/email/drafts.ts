import { randomUUID } from "node:crypto";

import { getEmailIntentPolicy } from "./intent.js";
import type { EmailDraftSuggestion, EmailIntentCategory, EmailRiskLevel, EmailRoutingResolution } from "./types.js";

const HIGH_RISK_LEVELS: EmailRiskLevel[] = ["high", "critical"];
const ALWAYS_ESCALATE_INTENTS: EmailIntentCategory[] = ["technical_issue", "legal_or_sensitive", "billing_question", "partnership_inquiry"];

export type BuildEmailDraftSuggestionArgs = {
  threadId: string;
  intentCategory: EmailIntentCategory;
  summary: string;
  proposedReplySubject: string;
  proposedReplyBody: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: EmailRiskLevel;
  routingProvenance: EmailRoutingResolution;
};

export function buildEmailDraftSuggestion(args: BuildEmailDraftSuggestionArgs): EmailDraftSuggestion {
  const policy = getEmailIntentPolicy(args.intentCategory);
  const escalationRecommended =
    policy.escalationRequired ||
    args.routingProvenance.target.requiresEscalation ||
    HIGH_RISK_LEVELS.includes(args.riskLevel) ||
    ALWAYS_ESCALATE_INTENTS.includes(args.intentCategory);

  return {
    draftId: `draft:${randomUUID()}`,
    threadId: args.threadId,
    summary: args.summary,
    proposedReplySubject: args.proposedReplySubject,
    proposedReplyBody: args.proposedReplyBody,
    confidenceScore: args.confidenceScore,
    riskScore: args.riskScore,
    approvalRequirement: "required",
    approvalRequired: true,
    blockedAutoSend: true,
    escalationRecommended,
    recommendedOwner: args.routingProvenance.target,
    routingProvenance: args.routingProvenance
  };
}

export function assertDraftOnlySafety(draft: EmailDraftSuggestion): void {
  if (!draft.approvalRequired) {
    throw new Error(`email_draft_requires_approval:${draft.threadId}`);
  }
  if (!draft.blockedAutoSend) {
    throw new Error(`email_draft_must_block_auto_send:${draft.threadId}`);
  }
}
