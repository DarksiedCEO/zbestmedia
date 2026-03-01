import { describe, expect, it } from "vitest";

import type { CiGateResult } from "../src/loadrun/ciGate";
import { classifyIncidentSeverity } from "../src/loadrun/severity";

const gateBase: CiGateResult = {
  passed: false,
  thresholds: {
    p95InflationRatioCap: 1.25,
    p99InflationRatioCap: 1.5,
    errorRateIncreasePctPointsCap: 0.25,
    timeoutIncreasePctPointsCap: 0.1,
    breakerOpenRateIncreasePctPointsCap: 2,
    retryAmplificationIncreaseCap: 0.15
  },
  checks: [{ name: "p95_inflation_cap", passed: false, details: "ratio=2.1" }],
  baseline: {
    totalRequests: 1000,
    successCount: 990,
    failStatusCount: 10,
    transportFailureCount: 0,
    successRate: 0.99,
    failRate: 0.01,
    status2xx: 990,
    status4xx: 0,
    status5xx: 10,
    timeoutErrors: 0,
    latencyMs: { mean: 20, p50: 10, p95: 50, p99: 80 },
    breakerOpenRate: 0.01,
    breakerHalfOpenRate: 0.01,
    halfOpenSuccessRate: 1,
    retryAmplification: 0.05,
    blockedMutateTotal: 0,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  },
  candidate: {
    totalRequests: 1000,
    successCount: 900,
    failStatusCount: 100,
    transportFailureCount: 0,
    successRate: 0.9,
    failRate: 0.1,
    status2xx: 900,
    status4xx: 0,
    status5xx: 100,
    timeoutErrors: 4,
    latencyMs: { mean: 55, p50: 25, p95: 110, p99: 260 },
    breakerOpenRate: 0.22,
    breakerHalfOpenRate: 0.03,
    halfOpenSuccessRate: 0.5,
    retryAmplification: 0.3,
    blockedMutateTotal: 0,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  }
};

describe("incident severity classifier", () => {
  it("returns CRITICAL for fingerprint mismatch and kill switch", () => {
    expect(classifyIncidentSeverity({ fingerprintMismatch: true })).toBe("CRITICAL");
    expect(classifyIncidentSeverity({ killSwitchActive: true })).toBe("CRITICAL");
  });

  it("returns CRITICAL for extreme latency/error shifts", () => {
    expect(classifyIncidentSeverity({ gate: gateBase })).toBe("CRITICAL");
  });

  it("returns INFO when gate passes and no risk flags", () => {
    const gate: CiGateResult = { ...gateBase, passed: true, checks: [], candidate: { ...gateBase.baseline } };
    expect(classifyIncidentSeverity({ gate })).toBe("INFO");
  });
});
