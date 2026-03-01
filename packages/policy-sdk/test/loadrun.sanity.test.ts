import { describe, expect, it } from "vitest";

import { computeBreakerOpenRate, computeRetryAmplification } from "../src/loadrun/slice";

describe("load run sanity calculations", () => {
  it("computes retry amplification", () => {
    const value = computeRetryAmplification({
      retryCountDistribution: { "0": 80, "1": 15, "2": 5 },
      totalRequests: 100
    });
    expect(value).toBeCloseTo(0.25, 6);
  });

  it("computes breaker open rate", () => {
    const value = computeBreakerOpenRate({
      breakerStates: { OPEN: 12, CLOSED: 88 },
      totalRequests: 100
    });
    expect(value).toBeCloseTo(0.12, 6);
  });
});
