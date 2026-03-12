import { describe, expect, it } from "vitest";

import { buildEmailDraftSuggestion, assertDraftOnlySafety } from "../src/email/drafts.js";
import { EmailRoutingService } from "../src/email/routing.js";

describe("email draft suggestions", () => {
  const routing = new EmailRoutingService();

  it("blocks auto-send and requires approval for every draft", () => {
    const draft = buildEmailDraftSuggestion({
      threadId: "thread-1",
      intentCategory: "lead_inquiry",
      summary: "New inbound lead asking for campaign help.",
      proposedReplySubject: "Re: Growth support",
      proposedReplyBody: "Thanks for reaching out. We are reviewing your request and will follow up shortly.",
      confidenceScore: 0.82,
      riskScore: 0.24,
      riskLevel: "medium",
      routingProvenance: routing.resolveIntent("lead_inquiry")
    });

    expect(draft.approvalRequired).toBe(true);
    expect(draft.blockedAutoSend).toBe(true);
    expect(draft.recommendedOwner.leadAgentId).toBe("kobe");
    expect(() => assertDraftOnlySafety(draft)).not.toThrow();
  });

  it("forces escalation for technical issues", () => {
    const draft = buildEmailDraftSuggestion({
      threadId: "thread-2",
      intentCategory: "technical_issue",
      summary: "Customer reported API downtime.",
      proposedReplySubject: "Re: Technical issue",
      proposedReplyBody: "Thank you for flagging this. We are escalating the issue to the appropriate owner for review.",
      confidenceScore: 0.7,
      riskScore: 0.91,
      riskLevel: "critical",
      routingProvenance: routing.resolveIntent("technical_issue")
    });

    expect(draft.escalationRecommended).toBe(true);
    expect(draft.recommendedOwner.leadAgentId).toBe("code-sentinel");
  });

  it("forces escalation for legal or sensitive matters", () => {
    const draft = buildEmailDraftSuggestion({
      threadId: "thread-3",
      intentCategory: "legal_or_sensitive",
      summary: "Counterparty requested a contract revision.",
      proposedReplySubject: "Re: Agreement update",
      proposedReplyBody: "Thank you. We are reviewing this request with the appropriate owner before responding.",
      confidenceScore: 0.61,
      riskScore: 0.88,
      riskLevel: "critical",
      routingProvenance: routing.resolveIntent("legal_or_sensitive")
    });

    expect(draft.escalationRecommended).toBe(true);
    expect(draft.recommendedOwner.executiveId).toBe("cso");
  });
});
