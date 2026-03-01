import { describe, expect, it } from "vitest";

import type { BaselineRegistryEntry } from "../src/loadrun/baselineRegistry";
import type { CiGateResult } from "../src/loadrun/ciGate";
import { buildTriage } from "../src/loadrun/triage";

const baselineEntry: BaselineRegistryEntry = {
  baseline_report_path: "ops/load_runs/baselines/a.json",
  baseline_hash: "abc",
  baseline_run_path: "ops/load_runs/baselines/b.json",
  accepted_at: "2026-03-01T00:00:00.000Z",
  accepted_by: "andre",
  notes: "test",
  chaos_report_path: ""
};

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
  checks: [
    { name: "p95_inflation_cap", passed: false, details: "ratio=1.8" }
  ],
  baseline: {
    totalRequests: 1000,
    successCount: 995,
    failStatusCount: 5,
    transportFailureCount: 0,
    successRate: 0.995,
    failRate: 0.005,
    status2xx: 995,
    status4xx: 0,
    status5xx: 5,
    timeoutErrors: 0,
    latencyMs: { mean: 20, p50: 10, p95: 50, p99: 80 },
    breakerOpenRate: 0.005,
    breakerHalfOpenRate: 0.01,
    halfOpenSuccessRate: 0.9,
    retryAmplification: 0.05,
    blockedMutateTotal: 0,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  },
  candidate: {
    totalRequests: 1000,
    successCount: 960,
    failStatusCount: 40,
    transportFailureCount: 0,
    successRate: 0.96,
    failRate: 0.04,
    status2xx: 960,
    status4xx: 0,
    status5xx: 40,
    timeoutErrors: 3,
    latencyMs: { mean: 45, p50: 30, p95: 100, p99: 160 },
    breakerOpenRate: 0.05,
    breakerHalfOpenRate: 0.02,
    halfOpenSuccessRate: 0.7,
    retryAmplification: 0.35,
    blockedMutateTotal: 2,
    cacheStates: {},
    retryDistribution: {},
    errorCodes: {}
  }
};

describe("triage builder", () => {
  it("assigns deterministic tags and top offender", () => {
    const triage = buildTriage({
      gate: gateBase,
      baselineRegistryEntry: baselineEntry,
      targetId: "prod/us-west/policy",
      generatedAt: "2026-03-01T00:00:00.000Z"
    });

    expect(triage.tags).toEqual(expect.arrayContaining(["5xx_spike", "retry_amp_spike", "breaker_open_spike", "timeout_spike"]));
    expect(triage.top_offender).toBe("breaker_retries");
    expect(triage.recommended_actions).toEqual(
      expect.arrayContaining(["lower retry attempts", "increase breaker window"])
    );
  });
});
