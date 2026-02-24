import { beforeEach, describe, expect, it } from "vitest";

import {
  incArtifactsCreated,
  incArtifactsSuperseded,
  incLeadConversionsTotal,
  incLeadEventsTotal,
  incLeadIntakeTotal,
  incLeadStageTransitionsTotal,
  incPolicyDenials,
  incPolicyDenialsByCodes,
  incSealVerificationFailures,
  incTenantBudgetViolations,
  observeLeadConversionDurationMs,
  observeLeadIntakeDurationMs,
  observeLeadScoreRecomputeDurationMs,
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
      policyDenials: 0,
      policyDenialsByCode: {},
      leadIntakeTotalBySource: {},
      leadEventsTotalByType: {},
      leadConversionsTotalByType: {},
      leadStageTransitionsTotalByTo: {},
      leadIntakeDurationMs: { count: 0, sum: 0 },
      leadConversionDurationMs: { count: 0, sum: 0 },
      leadScoreRecomputeDurationMs: { count: 0, sum: 0 }
    });

    incArtifactsCreated();
    incArtifactsSuperseded();
    incSealVerificationFailures();
    incTenantBudgetViolations();
    incPolicyDenials();
    incLeadIntakeTotal("website");
    incLeadEventsTotal("intake");
    incLeadConversionsTotal("meeting_booked");
    incLeadStageTransitionsTotal("sql");
    observeLeadIntakeDurationMs(12);
    observeLeadConversionDurationMs(9);
    observeLeadScoreRecomputeDurationMs(7);

    expect(snapshotMetrics()).toEqual({
      artifactsCreated: 1,
      artifactsSuperseded: 1,
      sealVerificationFailures: 1,
      tenantBudgetViolations: 1,
      policyDenials: 1,
      policyDenialsByCode: {},
      leadIntakeTotalBySource: { website: 1 },
      leadEventsTotalByType: { intake: 1 },
      leadConversionsTotalByType: { meeting_booked: 1 },
      leadStageTransitionsTotalByTo: { sql: 1 },
      leadIntakeDurationMs: { count: 1, sum: 12 },
      leadConversionDurationMs: { count: 1, sum: 9 },
      leadScoreRecomputeDurationMs: { count: 1, sum: 7 }
    });
  });

  it("increments policyDenialsByCode for each violation code", () => {
    incPolicyDenialsByCodes(["artifact_type_forbidden", "payload_forbidden_phrase", "artifact_type_forbidden"]);

    expect(snapshotMetrics().policyDenialsByCode).toEqual({
      artifact_type_forbidden: 2,
      payload_forbidden_phrase: 1
    });
  });

  it("returns snapshot copies", () => {
    incArtifactsCreated();
    incPolicyDenialsByCodes(["artifact_type_forbidden"]);
    const snapshot = snapshotMetrics();
    snapshot.artifactsCreated = 999;
    snapshot.policyDenialsByCode.artifact_type_forbidden = 999;

    expect(snapshotMetrics().artifactsCreated).toBe(1);
    expect(snapshotMetrics().policyDenialsByCode.artifact_type_forbidden).toBe(1);
  });
});
