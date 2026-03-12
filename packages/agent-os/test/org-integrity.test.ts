import { describe, expect, it } from "vitest";

import {
  AGENT_ORG_REGISTRY,
  CODE_SENTINEL_SIGNAL_OWNERS,
  ROUTING_CATEGORY_TO_RESPONSIBILITY,
  JINGLE_MODE_TO_RESPONSIBILITY,
  validateOrgSystemIntegrity
} from "../src/index.js";

describe("agent-os org integrity guards", () => {
  it("passes for the current canonical org system", () => {
    expect(() => validateOrgSystemIntegrity()).not.toThrow();
  });

  it("fails on duplicate lead-agent ids", () => {
    const mutated = {
      ...AGENT_ORG_REGISTRY,
      leadAgents: [...AGENT_ORG_REGISTRY.leadAgents, { ...AGENT_ORG_REGISTRY.leadAgents[0] }]
    };

    expect(() => validateOrgSystemIntegrity({ registry: mutated })).toThrow("duplicate lead agent ids");
  });

  it("fails on orphan sub-agents", () => {
    const mutated = {
      ...AGENT_ORG_REGISTRY,
      subAgents: AGENT_ORG_REGISTRY.subAgents.map((agent) =>
        agent.subAgentId === "build-monitor" ? { ...agent, parentLeadAgentId: "brandyn" as const } : agent
      )
    };

    expect(() => validateOrgSystemIntegrity({ registry: mutated })).toThrow(
      "sub-agent build-monitor department mismatch"
    );
  });

  it("fails on invalid department ownership", () => {
    const mutated = {
      ...AGENT_ORG_REGISTRY,
      departments: AGENT_ORG_REGISTRY.departments.map((department) =>
        department.departmentId === "marketing"
          ? { ...department, executiveOwnerId: "cto" as const }
          : department
      )
    };

    expect(() => validateOrgSystemIntegrity({ registry: mutated })).toThrow(
      "lead agent brandyn executive mismatch"
    );
  });

  it("fails on circular executive chains", () => {
    const mutated = {
      ...AGENT_ORG_REGISTRY,
      executives: AGENT_ORG_REGISTRY.executives.map((executive) => {
        if (executive.executiveId === "cto") return { ...executive, reportsTo: "cmo" as const };
        if (executive.executiveId === "cmo") return { ...executive, reportsTo: "cto" as const };
        return executive;
      })
    };

    expect(() => validateOrgSystemIntegrity({ registry: mutated })).toThrow("circular executive chain");
  });

  it("fails when jingle routing becomes ambiguous", () => {
    expect(() =>
      validateOrgSystemIntegrity({
        jingleModeResponsibility: {
          composition: "sonic_brand_composition",
          packaging: "sonic_brand_composition"
        }
      })
    ).toThrow("jingle routing is ambiguous");
  });

  it("fails when routed categories lose valid ownership", () => {
    expect(() =>
      validateOrgSystemIntegrity({
        routeResponsibility: {
          ...ROUTING_CATEGORY_TO_RESPONSIBILITY,
          brand_identity: null
        }
      })
    ).toThrow("unsupported routed category brand_identity");
  });

  it("fails when Code Sentinel coverage is incomplete or duplicated", () => {
    expect(() =>
      validateOrgSystemIntegrity({
        signalOwners: {
          ...CODE_SENTINEL_SIGNAL_OWNERS,
          dependency_drift: "build-monitor"
        }
      })
    ).toThrow("duplicate Code Sentinel signal owner build-monitor");
  });

  it("fails when policy and routing drift apart", () => {
    expect(() =>
      validateOrgSystemIntegrity({
        routeResponsibility: {
          ...ROUTING_CATEGORY_TO_RESPONSIBILITY,
          route_contract_monitoring: "brand_identity_governance"
        }
      })
    ).toThrow("Code Sentinel route route_contract_monitoring resolves outside code-sentinel");
  });
});
