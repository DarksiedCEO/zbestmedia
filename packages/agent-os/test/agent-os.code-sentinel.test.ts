import { describe, expect, it } from "vitest";

import {
  AgentOrgService,
  assertCodeSentinelSignalType,
  buildCodeSentinelSignal,
  getCodeSentinelSignalDefinition,
  listCodeSentinelSignals
} from "../src/index.js";

describe("agent-os Code Sentinel integration", () => {
  const org = new AgentOrgService();

  it("maps each supported signal to the correct Code Sentinel sub-agent", () => {
    expect(org.getCodeSentinelSignal("build_breakage").subAgent.subAgentId).toBe("build-monitor");
    expect(org.getCodeSentinelSignal("dependency_drift").subAgent.subAgentId).toBe("dependency-watcher");
    expect(org.getCodeSentinelSignal("runtime_health").subAgent.subAgentId).toBe("runtime-health-monitor");
    expect(org.getCodeSentinelSignal("migration_integrity").subAgent.subAgentId).toBe("migration-guardian");
    expect(org.getCodeSentinelSignal("route_contract").subAgent.subAgentId).toBe("route-contract-watcher");
    expect(org.getCodeSentinelSignal("slo_release_gate").subAgent.subAgentId).toBe("slo-enforcer");
  });

  it("fails fast on unsupported signal types", () => {
    expect(() => assertCodeSentinelSignalType("unknown")).toThrow("unknown_code_sentinel_signal:unknown");
  });

  it("builds normalized signal payloads with ownership", () => {
    const payload = buildCodeSentinelSignal({
      signalType: "migration_integrity",
      status: "critical",
      source: "scripts/agent-os/verify-migrations.ts",
      message: "missing required tables",
      metadata: { missing: ["agents"] },
      observedAt: "2026-03-11T20:00:00.000Z"
    });

    expect(payload).toEqual({
      signalType: "migration_integrity",
      status: "critical",
      owningLeadAgentId: "code-sentinel",
      owningSubAgentId: "migration-guardian",
      source: "scripts/agent-os/verify-migrations.ts",
      message: "missing required tables",
      metadata: { missing: ["agents"] },
      observedAt: "2026-03-11T20:00:00.000Z"
    });
  });

  it("lists deterministic definitions for all six supported signals", () => {
    const signals = listCodeSentinelSignals();
    expect(signals).toHaveLength(6);
    expect(getCodeSentinelSignalDefinition("route_contract").responsibilityKey).toBe(
      "route_contract_monitoring"
    );
    expect(signals.every((signal) => signal.leadAgentId === "code-sentinel")).toBe(true);
  });
});
