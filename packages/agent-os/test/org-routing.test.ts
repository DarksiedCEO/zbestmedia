import { describe, expect, it } from "vitest";

import { AgentOrgRoutingError, AgentOrgRoutingService } from "../src/index.js";

describe("agent-os org routing", () => {
  const routing = new AgentOrgRoutingService();

  it("routes brand identity deterministically to Brandyn", () => {
    const decision = routing.resolve({
      category: "brand_identity",
      requestedAgentId: "brandyn"
    });

    expect(decision.resolvedLeadAgentId).toBe("brandyn");
    expect(decision.executionAgentId).toBe("brandyn");
    expect(decision.responsibilityKey).toBe("brand_identity_governance");
  });

  it("routes route contract monitoring to Code Sentinel Route Contract Watcher", () => {
    const decision = routing.resolve({
      category: "route_contract_monitoring"
    });

    expect(decision.resolvedLeadAgentId).toBe("code-sentinel");
    expect(decision.resolvedSubAgentId).toBe("route-contract-watcher");
    expect(decision.operationalSignalType).toBe("route_contract");
    expect(decision.executionAgentId).toBeNull();
  });

  it("fails fast on ambiguous jingle routing", () => {
    expect(() => routing.resolve({ category: "jingle_music" })).toThrow(
      new AgentOrgRoutingError("ambiguous_route:jingle_music")
    );
  });

  it("fails fast when a requested agent does not own the route", () => {
    expect(() =>
      routing.resolve({
        category: "migration_integrity_monitoring",
        requestedAgentId: "brandyn"
      })
    ).toThrow("route_owner_mismatch:migration_integrity_monitoring:brandyn:code-sentinel");
  });
});
