import { describe, expect, it } from "vitest";

import { defaultProdCanaryProfile, resolveProdCanaryProfile } from "../src/loadrun/prodProfiles";

describe("prod canary profile", () => {
  it("uses locked defaults", () => {
    expect(defaultProdCanaryProfile).toEqual({
      total: 1000,
      concurrency: 25,
      mutateRatio: 0.2,
      timeoutSec: 2,
      maxRps: 100,
      maxDurationSec: 180
    });
  });

  it("applies overrides deterministically", () => {
    const profile = resolveProdCanaryProfile({ concurrency: 10, maxRps: 50 });
    expect(profile.concurrency).toBe(10);
    expect(profile.maxRps).toBe(50);
    expect(profile.total).toBe(1000);
  });
});
