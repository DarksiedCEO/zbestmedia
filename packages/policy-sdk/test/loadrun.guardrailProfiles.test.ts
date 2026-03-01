import { describe, expect, it } from "vitest";

import { resolveThresholdsForTarget, type GuardrailProfiles } from "../src/loadrun/guardrailProfiles";

const profiles: GuardrailProfiles = {
  profiles: {
    "*": {
      p95InflationRatioCap: 1.3,
      p99InflationRatioCap: 1.6,
      errorRateIncreasePctPointsCap: 0.3,
      timeoutIncreasePctPointsCap: 0.2,
      breakerOpenRateIncreasePctPointsCap: 3,
      retryAmplificationIncreaseCap: 0.2
    },
    "prod/*": {
      p95InflationRatioCap: 1.25,
      p99InflationRatioCap: 1.5,
      errorRateIncreasePctPointsCap: 0.25,
      timeoutIncreasePctPointsCap: 0.1,
      breakerOpenRateIncreasePctPointsCap: 2,
      retryAmplificationIncreaseCap: 0.15
    },
    "prod/us-east/policy": {
      p95InflationRatioCap: 1.2,
      p99InflationRatioCap: 1.45,
      errorRateIncreasePctPointsCap: 0.2,
      timeoutIncreasePctPointsCap: 0.08,
      breakerOpenRateIncreasePctPointsCap: 1.8,
      retryAmplificationIncreaseCap: 0.12
    }
  }
};

describe("guardrail profile resolution", () => {
  it("uses exact target match before wildcard", () => {
    const resolved = resolveThresholdsForTarget({ targetId: "prod/us-east/policy", profiles });
    expect(resolved.profileKey).toBe("prod/us-east/policy");
    expect(resolved.thresholds.p95InflationRatioCap).toBe(1.2);
  });

  it("falls back to env wildcard", () => {
    const resolved = resolveThresholdsForTarget({ targetId: "prod/us-west/policy", profiles });
    expect(resolved.profileKey).toBe("prod/*");
    expect(resolved.thresholds.p95InflationRatioCap).toBe(1.25);
  });

  it("falls back to global profile", () => {
    const resolved = resolveThresholdsForTarget({ targetId: "staging/eu/policy", profiles });
    expect(resolved.profileKey).toBe("*");
    expect(resolved.thresholds.p95InflationRatioCap).toBe(1.3);
  });
});
