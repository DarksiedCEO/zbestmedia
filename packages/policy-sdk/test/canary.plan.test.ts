import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCanaryPlan } from "../src/canary/plan";

describe("canary plan", () => {
  it("builds deterministic structure from defaults proposal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-plan-"));
    const proposal = path.join(dir, "proposal.json");
    fs.writeFileSync(
      proposal,
      JSON.stringify(
        {
          generated_at: "2026-03-01T00:00:00.000Z",
          report_file: "r.json",
          report_sha256: "a",
          current_file: "c.json",
          current_sha256: "b",
          current: {
            POLICY_BREAKER_FAILURE_THRESHOLD: 5,
            POLICY_BREAKER_RESET_AFTER_MS: 15000,
            POLICY_RETRY_MAX: 2,
            POLICY_RETRY_BASE_DELAY_MS: 80,
            POLICY_RETRY_MAX_DELAY_MS: 400,
            POLICY_MAX_CONCURRENCY_SAFE: 200
          },
          proposed: {
            POLICY_BREAKER_FAILURE_THRESHOLD: 6,
            POLICY_BREAKER_RESET_AFTER_MS: 16000,
            POLICY_RETRY_MAX: 2,
            POLICY_RETRY_BASE_DELAY_MS: 80,
            POLICY_RETRY_MAX_DELAY_MS: 400,
            POLICY_MAX_CONCURRENCY_SAFE: 220
          },
          diff: [],
          no_change: false,
          rationale: ["ok"],
          guardrails: {
            passed: true,
            checks: [],
            thresholds: {
              retryAmplificationCap: 1.4,
              breakerOpenRateCap: 0.05,
              p95InflationRatioCap: 2,
              chaosSuccessRateFloorRatio: 0.85,
              maxStatus5xxRateIncreasePctPoints: 2,
              maxBreakerThresholdChangePct: 25,
              maxRetryStepChange: 1,
              maxResetAfterMsChangePct: 30
            }
          }
        },
        null,
        2
      )
    );

    const plan = buildCanaryPlan({
      proposalFile: proposal,
      targetId: "prod/us-west/policy",
      baselineHash: "baseline-hash",
      guardrailsProfileKey: "prod/*",
      guardrailsProfileHash: "guardrails-hash",
      expectedGovernanceFingerprint: "fp",
      rollbackPacketPointer: "rollback.env",
      approvedBy: "andre",
      approvalReason: "ship"
    });

    expect(plan.steps).toEqual([5, 25, 50, 100]);
    expect(plan.target_id).toBe("prod/us-west/policy");
    expect(plan.baseline_hash).toBe("baseline-hash");
    expect(plan.guardrails_profile_hash).toBe("guardrails-hash");
    expect(plan.expected_governance_fingerprint).toBe("fp");
  });
});
