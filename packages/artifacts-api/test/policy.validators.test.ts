import { describe, expect, it } from "vitest";

import { validatePolicyValue } from "../src/agency/policy/validators";

describe("policy validators", () => {
  it("validates performance_limits", () => {
    const ok = validatePolicyValue("performance_limits", {
      maxCPA: 150,
      maxRouteLatencyP95: 220,
      maxErrorRate: 0.02,
      maxPodFailureRate: 0.05,
      minMargin: 0.3
    });
    expect(ok.success).toBe(true);
  });

  it("rejects bad errorRate", () => {
    const bad = validatePolicyValue("performance_limits", {
      maxCPA: 150,
      maxRouteLatencyP95: 220,
      maxErrorRate: 2,
      maxPodFailureRate: 0.05
    });
    expect(bad.success).toBe(false);
  });

  it("rejects creative maxRevisionCycles above hard limit", () => {
    const bad = validatePolicyValue("creative_limits", {
      minCreativeScore: 0.82,
      brandRiskTolerance: "low",
      experimentationLevel: "moderate",
      maxRevisionCycles: 99
    });
    expect(bad.success).toBe(false);
  });
});
