import { describe, expect, it } from "vitest";

import { AgentOrgPolicyError, AgentOrgPolicyService } from "../src/index.js";

describe("agent-os org policy", () => {
  const policy = new AgentOrgPolicyService();

  it("allows valid lead-agent ownership assignments", () => {
    expect(
      policy.assertLeadAgentAssignment({
        leadAgentId: "brandyn",
        departmentId: "marketing",
        responsibilityKey: "brand_identity_governance"
      }).leadAgentId
    ).toBe("brandyn");
  });

  it("rejects cross-lane misuse for lead-agent ownership", () => {
    expect(() =>
      policy.assertLeadAgentAssignment({
        leadAgentId: "brandyn",
        departmentId: "marketing",
        responsibilityKey: "migration_integrity_monitoring"
      })
    ).toThrow(AgentOrgPolicyError);
  });

  it("rejects execution agents when routed outside their owned responsibility", () => {
    expect(() =>
      policy.assertExecutionAgentResponsibility({
        agentId: "kobe",
        subjectType: "social_campaign_deployment",
        payload: { responsibilityKey: "migration_integrity_monitoring" }
      })
    ).toThrow("org_policy_responsibility_mismatch:kobe:migration_integrity_monitoring");
  });

  it("maps Code Sentinel operational signals to the correct sub-agent owner", () => {
    const owner = policy.assertOperationalSignalOwnership({
      leadAgentId: "code-sentinel",
      subAgentId: "route-contract-watcher",
      signalType: "route_contract"
    });

    expect(owner.leadAgent.leadAgentId).toBe("code-sentinel");
    expect(owner.subAgent.subAgentId).toBe("route-contract-watcher");
  });
});
