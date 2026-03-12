import { describe, expect, it } from "vitest";

import {
  AGENT_ORG_REGISTRY,
  CODE_SENTINEL_SUB_AGENT_IDS,
  getAgentsByDepartment,
  getAgentsByExecutive,
  getDepartmentById,
  getExecutiveById,
  getLeadAgentById,
  getReportingChainForAgent,
  getSubAgentsByParent,
  listDepartments,
  listExecutives,
  listLeadAgents,
  listSubAgents,
  validateAgentOrgRegistry
} from "../src/index.js";

describe("agent-os organization registry", () => {
  it("loads the canonical organization registry", () => {
    expect(listExecutives()).toHaveLength(10);
    expect(listDepartments()).toHaveLength(9);
    expect(listLeadAgents().length).toBeGreaterThanOrEqual(6);
    expect(listSubAgents().length).toBeGreaterThanOrEqual(6);
    expect(AGENT_ORG_REGISTRY.leadAgents.some((agent) => agent.leadAgentId === "code-sentinel")).toBe(true);
  });

  it("validates unique ids and references", () => {
    expect(() => validateAgentOrgRegistry()).not.toThrow();
  });

  it("maps every lead agent to a valid department and executive", () => {
    for (const agent of listLeadAgents()) {
      expect(getDepartmentById(agent.departmentId).departmentId).toBe(agent.departmentId);
      expect(getExecutiveById(agent.reportsToExecutiveId).executiveId).toBe(agent.reportsToExecutiveId);
      expect(agent.primaryResponsibility.trim().length).toBeGreaterThan(0);
    }
  });

  it("maps every sub-agent to a valid parent and department", () => {
    for (const subAgent of listSubAgents()) {
      expect(getLeadAgentById(subAgent.parentLeadAgentId).leadAgentId).toBe(subAgent.parentLeadAgentId);
      expect(getDepartmentById(subAgent.departmentId).departmentId).toBe(subAgent.departmentId);
      expect(subAgent.primaryResponsibility.trim().length).toBeGreaterThan(0);
    }
  });

  it("places Code Sentinel under the CTO lane with its six narrow sub-agents", () => {
    const codeSentinel = getLeadAgentById("code-sentinel");
    expect(codeSentinel.reportsToExecutiveId).toBe("cto");
    expect(codeSentinel.departmentId).toBe("technology-engineering");

    const subAgents = getSubAgentsByParent("code-sentinel");
    expect(subAgents.map((agent) => agent.subAgentId).sort()).toEqual([...CODE_SENTINEL_SUB_AGENT_IDS].sort());
    expect(subAgents.map((agent) => agent.primaryResponsibility)).toEqual([
      "Detect build and test breakage only.",
      "Detect stale or vulnerable dependency drift only.",
      "Detect live service health degradation only.",
      "Detect schema and migration integrity issues only.",
      "Detect API and route contract regressions only.",
      "Detect SLO degradation and release gate telemetry violations only."
    ]);
  });

  it("supports department and executive registry queries", () => {
    const technology = getAgentsByDepartment("technology-engineering");
    expect(technology.leadAgents.map((agent) => agent.leadAgentId)).toEqual(["code-sentinel"]);
    expect(technology.subAgents).toHaveLength(6);

    const cto = getAgentsByExecutive("cto");
    expect(cto.departments.map((department) => department.departmentId)).toEqual(["technology-engineering"]);
    expect(cto.leadAgents.map((agent) => agent.leadAgentId)).toEqual(["code-sentinel"]);
  });

  it("returns deterministic reporting chains", () => {
    expect(getReportingChainForAgent("code-sentinel")).toEqual([
      { nodeType: "lead-agent", nodeId: "code-sentinel", displayName: "Code Sentinel" },
      { nodeType: "executive", nodeId: "cto", displayName: "Chief Technology Officer" }
    ]);

    expect(getReportingChainForAgent("route-contract-watcher")).toEqual([
      { nodeType: "sub-agent", nodeId: "route-contract-watcher", displayName: "Route Contract Watcher" },
      { nodeType: "lead-agent", nodeId: "code-sentinel", displayName: "Code Sentinel" },
      { nodeType: "executive", nodeId: "cto", displayName: "Chief Technology Officer" }
    ]);
  });
});
