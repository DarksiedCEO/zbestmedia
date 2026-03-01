import { describe, expect, it } from "vitest";
import path from "node:path";

import { buildLoadRunSloEvent } from "../src/slo/emit";
import { parseLoadRunSloEvent } from "../src/slo/schema";
import type { CiGateResult } from "../src/loadrun/ciGate";

const gate: CiGateResult = {
  passed: false,
  thresholds: {
    p95InflationRatioCap: 1.25,
    p99InflationRatioCap: 1.5,
    errorRateIncreasePctPointsCap: 0.25,
    timeoutIncreasePctPointsCap: 0.1,
    breakerOpenRateIncreasePctPointsCap: 2,
    retryAmplificationIncreaseCap: 0.15
  },
  checks: [{ name: "p95_inflation_cap", passed: false, details: "ratio=1.4" }],
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
    latencyMs: { mean: 20, p50: 10, p95: 30, p99: 45 },
    breakerOpenRate: 0.001,
    breakerHalfOpenRate: 0.005,
    halfOpenSuccessRate: 1,
    retryAmplification: 0.01,
    blockedMutateTotal: 0,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  },
  candidate: {
    totalRequests: 1000,
    successCount: 950,
    failStatusCount: 50,
    transportFailureCount: 0,
    successRate: 0.95,
    failRate: 0.05,
    status2xx: 950,
    status4xx: 0,
    status5xx: 50,
    timeoutErrors: 2,
    latencyMs: { mean: 40, p50: 15, p95: 60, p99: 90 },
    breakerOpenRate: 0.03,
    breakerHalfOpenRate: 0.02,
    halfOpenSuccessRate: 0.8,
    retryAmplification: 0.2,
    blockedMutateTotal: 3,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  }
};

describe("slo event", () => {
  it("builds deterministic, valid event shape", () => {
    const baselinePath = path.resolve(process.cwd(), "packages/policy-sdk/test/fixtures/loadrun/baseline.sample.json");
    const candidatePath = path.resolve(process.cwd(), "packages/policy-sdk/test/fixtures/loadrun/chaos.sample.json");

    const event = buildLoadRunSloEvent({
      ts: "2026-03-01T12:00:00.000Z",
      source: "ci",
      service: "policy",
      targetId: "prod/us-west/policy",
      baselinePath,
      candidatePath,
      gate,
      baselineConcurrency: 50,
      candidateConcurrency: 50,
      tags: ["5xx_spike"]
    });

    const parsed = parseLoadRunSloEvent(event);
    expect(parsed.event_id).toHaveLength(64);
    expect(parsed.source).toBe("ci");
    expect(parsed.target_id).toBe("prod/us-west/policy");
    expect(parsed.verdict.passed).toBe(false);
    expect(parsed.tags).toContain("5xx_spike");
  });
});
