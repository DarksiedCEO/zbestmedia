import { describe, expect, it } from "vitest";

import { readPolicyChaosConfig, shouldInjectChaosError } from "../src/agency/policy/http/chaos";

describe("policy resolve chaos config", () => {
  it("parses env with defaults and clamps error rate", () => {
    const c1 = readPolicyChaosConfig({});
    expect(c1.enabled).toBe(false);
    expect(c1.latencyMs).toBe(0);
    expect(c1.errorRate).toBe(0);
    expect(c1.seed).toBe("1337");

    const c2 = readPolicyChaosConfig({
      POLICY_CHAOS_ENABLED: "true",
      POLICY_CHAOS_LATENCY_MS: "150",
      POLICY_CHAOS_ERROR_RATE: "2.5",
      POLICY_CHAOS_SEED: "42"
    });
    expect(c2.enabled).toBe(true);
    expect(c2.latencyMs).toBe(150);
    expect(c2.errorRate).toBe(1);
    expect(c2.seed).toBe("42");
  });

  it("injects deterministically for same fingerprint", () => {
    const cfg = readPolicyChaosConfig({
      POLICY_CHAOS_ENABLED: "true",
      POLICY_CHAOS_ERROR_RATE: "0.15",
      POLICY_CHAOS_SEED: "1337"
    });
    const a = shouldInjectChaosError(cfg, "tenant:policy:client:campaign:req1");
    const b = shouldInjectChaosError(cfg, "tenant:policy:client:campaign:req1");
    expect(a).toBe(b);
  });
});
