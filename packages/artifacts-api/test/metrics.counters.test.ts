import { beforeEach, describe, expect, it } from "vitest";

import {
  incArtifactsCreated,
  incArtifactsSuperseded,
  incPolicyDenials,
  incSealVerificationFailures,
  incTenantBudgetViolations,
  resetMetricsForTests,
  snapshotMetrics
} from "../src/metrics/counters";

describe("metrics counters", () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it("increments and snapshots expected values", () => {
    expect(snapshotMetrics()).toEqual({
      artifactsCreated: 0,
      artifactsSuperseded: 0,
      sealVerificationFailures: 0,
      tenantBudgetViolations: 0,
      policyDenials: 0
    });

    incArtifactsCreated();
    incArtifactsSuperseded();
    incSealVerificationFailures();
    incTenantBudgetViolations();
    incPolicyDenials();

    expect(snapshotMetrics()).toEqual({
      artifactsCreated: 1,
      artifactsSuperseded: 1,
      sealVerificationFailures: 1,
      tenantBudgetViolations: 1,
      policyDenials: 1
    });
  });

  it("returns snapshot copies", () => {
    incArtifactsCreated();
    const snapshot = snapshotMetrics();
    snapshot.artifactsCreated = 999;

    expect(snapshotMetrics().artifactsCreated).toBe(1);
  });
});
