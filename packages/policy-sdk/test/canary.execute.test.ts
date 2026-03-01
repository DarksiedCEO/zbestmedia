import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeCanaryRollout } from "../src/canary/execute";
import type { CanaryPlan, CanaryStep } from "../src/canary/types";

function mkPlan(): CanaryPlan {
  return {
    plan_id: "p1",
    generated_at: "2026-03-01T00:00:00.000Z",
    target_id: "prod/us-west/policy",
    defaults_proposal_file: "proposal.json",
    defaults_proposal_sha256: "abc",
    baseline_hash: "baseline-hash",
    guardrails_profile_key: "prod/*",
    guardrails_profile_hash: "guardrails-hash",
    steps: [5, 25, 50, 100],
    observe_window_minutes: 10,
    rollback_packet_pointer: "rollback.env",
    expected_governance_fingerprint: "fp-good",
    approvals: [{ by: "andre", at: "2026-03-01T00:00:00.000Z", reason: "ship" }]
  };
}

describe("canary execute", () => {
  afterEach(() => {
    delete process.env.POLICY_GOVERNANCE_FREEZE;
    delete process.env.POLICY_RUNTIME_KILL_SWITCH;
    delete process.env.POLICY_CANARY_MAX_EXPOSURE_PCT;
  });

  it("requires approval", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    await expect(
      executeCanaryRollout({
        plan: mkPlan(),
        rolloutsDir: path.join(root, "rollouts"),
        rollbacksDir: path.join(root, "rollbacks"),
        approved: false,
        reason: undefined,
        mode: "simulation",
        applyStep: async () => ({ artifactPath: "a" }),
        observeStep: async (step) => ({
          step,
          drift_passed: true,
          error_rate_passed: true,
          current_governance_fingerprint: "fp-good",
          reasons: []
        })
      })
    ).rejects.toThrow("Approval required");
  });

  it("blocks execution while governance freeze is active", async () => {
    process.env.POLICY_GOVERNANCE_FREEZE = "true";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    await expect(
      executeCanaryRollout({
        plan: mkPlan(),
        rolloutsDir: path.join(root, "rollouts"),
        rollbacksDir: path.join(root, "rollbacks"),
        approved: true,
        reason: "ship",
        mode: "simulation",
        applyStep: async () => ({ artifactPath: "a" }),
        observeStep: async (step) => ({
          step,
          drift_passed: true,
          error_rate_passed: true,
          current_governance_fingerprint: "fp-good",
          reasons: []
        })
      })
    ).rejects.toThrow("GOVERNANCE_FREEZE_ACTIVE");
  });

  it("fails at 25% and rolls back", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    const res = await executeCanaryRollout({
      plan: mkPlan(),
      rolloutsDir: path.join(root, "rollouts"),
      rollbacksDir: path.join(root, "rollbacks"),
      approved: true,
      reason: "ship",
      mode: "simulation",
      applyStep: async (step) => ({ artifactPath: path.join(root, `apply-${step}.json`) }),
      observeStep: async (step: CanaryStep) => ({
        step,
        drift_passed: step !== 25,
        error_rate_passed: true,
        current_governance_fingerprint: "fp-good",
        reasons: step === 25 ? ["forced_fail"] : []
      })
    });

    expect(res.status).toBe("FAILED");
    expect(res.rollback_artifact).not.toBeNull();
    expect(res.failure_reason).toContain("observe_failed_step_25");
  });

  it("blocks promotion on fingerprint mismatch", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    const res = await executeCanaryRollout({
      plan: mkPlan(),
      rolloutsDir: path.join(root, "rollouts"),
      rollbacksDir: path.join(root, "rollbacks"),
      approved: true,
      reason: "ship",
      mode: "simulation",
      applyStep: async (step) => ({ artifactPath: path.join(root, `apply-${step}.json`) }),
      observeStep: async (step) => ({
        step,
        drift_passed: true,
        error_rate_passed: true,
        current_governance_fingerprint: step === 50 ? "fp-bad" : "fp-good",
        reasons: []
      })
    });

    expect(res.status).toBe("FAILED");
    expect(res.failure_reason).toContain("fingerprint_mismatch");
  });

  it("fails immediately when runtime kill switch is active", async () => {
    process.env.POLICY_RUNTIME_KILL_SWITCH = "true";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    const res = await executeCanaryRollout({
      plan: mkPlan(),
      rolloutsDir: path.join(root, "rollouts"),
      rollbacksDir: path.join(root, "rollbacks"),
      approved: true,
      reason: "ship",
      mode: "simulation",
      applyStep: async (step) => ({ artifactPath: path.join(root, `apply-${step}.json`) }),
      observeStep: async (step) => ({
        step,
        drift_passed: true,
        error_rate_passed: true,
        current_governance_fingerprint: "fp-good",
        reasons: []
      })
    });
    expect(res.status).toBe("FAILED");
    expect(res.failure_reason).toContain("runtime_kill_switch_active");
  });

  it("blocks promotion when canary exposure cap is exceeded", async () => {
    process.env.POLICY_CANARY_MAX_EXPOSURE_PCT = "25";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "canary-test-"));
    const res = await executeCanaryRollout({
      plan: mkPlan(),
      rolloutsDir: path.join(root, "rollouts"),
      rollbacksDir: path.join(root, "rollbacks"),
      approved: true,
      reason: "ship",
      mode: "simulation",
      applyStep: async (step) => ({ artifactPath: path.join(root, `apply-${step}.json`) }),
      observeStep: async (step) => ({
        step,
        drift_passed: true,
        error_rate_passed: true,
        current_governance_fingerprint: "fp-good",
        reasons: []
      })
    });
    expect(res.status).toBe("FAILED");
    expect(res.failure_reason).toContain("BLAST_RADIUS_CANARY_CAP_EXCEEDED");
  });
});
