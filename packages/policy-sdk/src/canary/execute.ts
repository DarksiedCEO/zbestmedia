import fs from "node:fs";
import path from "node:path";

import { isCanaryExposureAllowed, readBlastRadiusCaps } from "../loadrun/blastRadius";
import { assertGovernanceMutableOperationAllowed, isRuntimeKillSwitchEnabled } from "../loadrun/governanceControls";
import { applyStateForStep, observeStateForStep, validateTransition } from "./stateMachine";
import {
  parseCanaryObservation,
  parseCanaryPlan,
  parseCanaryRollout,
  type CanaryObservation,
  type CanaryPlan,
  type CanaryRollout,
  type CanaryState,
  type CanaryStep,
  type CanaryTransition
} from "./types";

export type ExecuteCanaryArgs = {
  plan: CanaryPlan;
  rolloutsDir: string;
  rollbacksDir: string;
  approved: boolean;
  reason?: string;
  mode: "simulation" | "manual_apply";
  applyStep: (step: CanaryStep) => Promise<{ artifactPath: string }>;
  observeStep: (step: CanaryStep) => Promise<CanaryObservation>;
};

function timestampSlug(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function transition(args: {
  rollout: CanaryRollout;
  to: CanaryState;
  reason: string;
  step?: CanaryStep;
  metadata?: Record<string, unknown>;
}): void {
  validateTransition({ from: args.rollout.state, to: args.to, step: args.step });
  const tr: CanaryTransition = {
    at: new Date().toISOString(),
    from: args.rollout.state,
    to: args.to,
    reason: args.reason,
    step: args.step,
    metadata: args.metadata
  };
  args.rollout.transitions.push(tr);
  args.rollout.state = args.to;
  args.rollout.current_step = args.step ?? null;
}

function saveRollout(filePath: string, rollout: CanaryRollout): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(rollout, null, 2)}\n`, "utf8");
}

async function runRollback(args: {
  rollout: CanaryRollout;
  rolloutsPath: string;
  rollbacksDir: string;
  reason: string;
}): Promise<void> {
  transition({ rollout: args.rollout, to: "ROLLBACK", reason: args.reason });
  const rollbackPath = path.join(args.rollbacksDir, `${timestampSlug(new Date())}__rollback.json`);
  fs.mkdirSync(args.rollbacksDir, { recursive: true });
  fs.writeFileSync(
    rollbackPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        rollout_id: args.rollout.rollout_id,
        plan_id: args.rollout.plan_id,
        reason: args.reason,
        rollback_packet_pointer: args.rollout.transitions[0]?.metadata?.rollback_packet_pointer ?? null
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  args.rollout.rollback_artifact = rollbackPath;
  transition({ rollout: args.rollout, to: "FAILED", reason: "rollback_completed" });
  args.rollout.status = "FAILED";
  args.rollout.finished_at = new Date().toISOString();
  args.rollout.failure_reason = args.reason;
  saveRollout(args.rolloutsPath, args.rollout);
}

export async function executeCanaryRollout(args: ExecuteCanaryArgs): Promise<CanaryRollout> {
  assertGovernanceMutableOperationAllowed({ operation: "canary-execute" });
  const plan = parseCanaryPlan(args.plan);
  if (!args.approved) {
    throw new Error("Approval required: pass --approve");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("Approval reason required: pass --reason \"...\"");
  }

  const rollout: CanaryRollout = parseCanaryRollout({
    rollout_id: `canary-rollout-${timestampSlug(new Date())}`,
    plan_id: plan.plan_id,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "RUNNING",
    state: "IDLE",
    current_step: null,
    transitions: [],
    apply_artifacts: [],
    observation_artifacts: [],
    rollback_artifact: null,
    failure_reason: null
  });

  const rolloutsPath = path.join(args.rolloutsDir, `${timestampSlug(new Date())}__rollout.json`);
  saveRollout(rolloutsPath, rollout);

  if (isRuntimeKillSwitchEnabled()) {
    await runRollback({
      rollout,
      rolloutsPath,
      rollbacksDir: args.rollbacksDir,
      reason: "runtime_kill_switch_active"
    });
    return rollout;
  }

  for (const step of plan.steps) {
    const caps = readBlastRadiusCaps();
    if (!isCanaryExposureAllowed(step, caps)) {
      await runRollback({
        rollout,
        rolloutsPath,
        rollbacksDir: args.rollbacksDir,
        reason: `BLAST_RADIUS_CANARY_CAP_EXCEEDED: step=${step} cap=${caps.maxCanaryExposurePct}`
      });
      return rollout;
    }
    const applyState = applyStateForStep(step);
    transition({
      rollout,
      to: applyState,
      step,
      reason: `apply_${step}`,
      metadata: {
        mode: args.mode,
        rollback_packet_pointer: plan.rollback_packet_pointer
      }
    });

    try {
      const applyResult = await args.applyStep(step);
      rollout.apply_artifacts.push(applyResult.artifactPath);
    } catch (error) {
      await runRollback({
        rollout,
        rolloutsPath,
        rollbacksDir: args.rollbacksDir,
        reason: `apply_failed_step_${step}: ${error instanceof Error ? error.message : String(error)}`
      });
      return rollout;
    }

    saveRollout(rolloutsPath, rollout);

    if (step === 100) {
      transition({ rollout, to: "DONE", step, reason: "promoted_100" });
      rollout.status = "DONE";
      rollout.finished_at = new Date().toISOString();
      saveRollout(rolloutsPath, rollout);
      return rollout;
    }

    const observeState = observeStateForStep(step);
    transition({ rollout, to: observeState, step, reason: `observe_${step}` });

    const observation = parseCanaryObservation(await args.observeStep(step));
    const observeArtifactPath = path.join(args.rolloutsDir, `${timestampSlug(new Date())}__observe_${step}.json`);
    fs.writeFileSync(observeArtifactPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
    rollout.observation_artifacts.push(observeArtifactPath);

    const fingerprintOk = observation.current_governance_fingerprint === plan.expected_governance_fingerprint;
    const guardrailsOk = observation.drift_passed && observation.error_rate_passed;

    if (!guardrailsOk || !fingerprintOk) {
      const failReasons = [
        !observation.drift_passed ? "drift_gate_failed" : null,
        !observation.error_rate_passed ? "error_rate_guardrail_failed" : null,
        !fingerprintOk ? "fingerprint_mismatch" : null,
        ...observation.reasons
      ].filter(Boolean);
      await runRollback({
        rollout,
        rolloutsPath,
        rollbacksDir: args.rollbacksDir,
        reason: `observe_failed_step_${step}: ${failReasons.join(",")}`
      });
      return rollout;
    }

    saveRollout(rolloutsPath, rollout);
  }

  rollout.status = "FAILED";
  rollout.failure_reason = "invalid_plan_missing_100";
  rollout.finished_at = new Date().toISOString();
  saveRollout(rolloutsPath, rollout);
  return rollout;
}
