import { describe, expect, it } from "vitest";

import { TenantWriteBudget } from "../src/budgets/tenantBudget";

describe("TenantWriteBudget", () => {
  it("allows up to configured writes per minute", () => {
    const budget = new TenantWriteBudget(2, () => 1_000);

    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: true });
    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: true });
    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: false });
  });

  it("resets after one minute window", () => {
    let now = 1_000;
    const budget = new TenantWriteBudget(1, () => now);

    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: true });
    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: false });

    now = 61_001;
    expect(budget.checkAndIncrement("tenant-a")).toEqual({ allowed: true });
  });
});
