import { describe, expect, it } from "vitest";
import { driftThresholds, latencyBudgets, regenCaps, retryRules } from "../src/index";

describe("falcon rules", () => {
  it("exposes latency budgets", () => {
    expect(latencyBudgets.ArtifactRequested.p50Ms).toBeGreaterThan(0);
    expect(latencyBudgets.ArtifactGenerated.p99Ms).toBeGreaterThan(0);
  });

  it("exposes retry rules", () => {
    expect(retryRules.forgeJob.maxAttempts).toBeGreaterThan(0);
    expect(retryRules.evaluator.backoffMultiplier).toBeGreaterThan(0);
  });

  it("exposes regen caps", () => {
    expect(regenCaps.BrandBible.maxAttempts).toBeGreaterThan(0);
  });

  it("exposes drift thresholds", () => {
    expect(driftThresholds.voiceToneSimilarity.maxDelta).toBeGreaterThan(0);
  });
});
