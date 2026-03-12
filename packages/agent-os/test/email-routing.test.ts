import { describe, expect, it } from "vitest";

import { EmailRoutingService } from "../src/email/routing.js";

describe("email routing", () => {
  const routing = new EmailRoutingService();

  it("routes lead inquiries to Kobe through org routing", () => {
    const decision = routing.resolveIntent("lead_inquiry");
    expect(decision.target.targetType).toBe("lead_agent");
    expect(decision.target.leadAgentId).toBe("kobe");
    expect(decision.routingDecision?.requestedCategory).toBe("campaign_growth");
  });

  it("routes technical issues to Code Sentinel", () => {
    const decision = routing.resolveIntent("technical_issue");
    expect(decision.target.targetType).toBe("lead_agent");
    expect(decision.target.leadAgentId).toBe("code-sentinel");
    expect(decision.target.subAgentId).toBe("runtime-health-monitor");
    expect(decision.target.requiresEscalation).toBe(true);
  });

  it("suppresses spam instead of escalating it", () => {
    const decision = routing.resolveIntent("spam_or_irrelevant");
    expect(decision.target.targetType).toBe("suppressed");
    expect(decision.routingDecision).toBeNull();
  });

  it("routes legal and sensitive matters to the CSO lane", () => {
    const decision = routing.resolveIntent("legal_or_sensitive");
    expect(decision.target.targetType).toBe("executive_lane");
    expect(decision.target.executiveId).toBe("cso");
    expect(decision.target.requiresEscalation).toBe(true);
  });
});
