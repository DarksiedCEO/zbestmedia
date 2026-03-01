import { describe, expect, it } from "vitest";

import { HARD_INVARIANTS, validateResolvedPolicy } from "../src/agency/policy/hardInvariants";

describe("hard invariants", () => {
  it("blocks margin below absolute floor", () => {
    const res = validateResolvedPolicy({ finance: { minMargin: 0.2 } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.some((v) => v.code === "ABSOLUTE_MARGIN_FLOOR_BREACH")).toBe(true);
    }
  });

  it("allows margin at or above absolute floor", () => {
    const res = validateResolvedPolicy({ finance: { minMargin: HARD_INVARIANTS.absoluteMarginFloor } });
    expect(res.ok).toBe(true);
  });

  it("blocks maxRevisionCycles above hard limit", () => {
    const res = validateResolvedPolicy({ creative: { maxRevisionCycles: HARD_INVARIANTS.maxRevisionCycles + 1 } });
    expect(res.ok).toBe(false);
  });
});
