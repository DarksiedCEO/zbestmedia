import type { BaselineRegistryEntry } from "./baselineRegistry";
import type { CiGateResult } from "./ciGate";

export type TriageTag =
  | "latency_shift_no_error_shift"
  | "timeout_spike"
  | "5xx_spike"
  | "retry_amp_spike"
  | "breaker_open_spike";

export type TriageTopOffender = "latency" | "errors" | "breaker_retries";

export type LoadRunTriage = {
  generated_at: string;
  baseline_registry: {
    target_id: string;
    entry: BaselineRegistryEntry;
  };
  gate: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  };
  deltas: {
    p95_ratio: number;
    p99_ratio: number;
    fail_rate_increase_pct_points: number;
    timeout_increase_pct_points: number;
    status5xx_increase_pct_points: number;
    breaker_open_increase_pct_points: number;
    retry_amplification_increase: number;
  };
  tags: TriageTag[];
  top_offender: TriageTopOffender;
  recommended_actions: string[];
};

function pctPointsIncrease(args: { baseline: number; candidate: number; totalBaseline: number; totalCandidate: number }): number {
  const left = args.totalBaseline > 0 ? args.baseline / args.totalBaseline : 0;
  const right = args.totalCandidate > 0 ? args.candidate / args.totalCandidate : 0;
  return (right - left) * 100;
}

export function buildTriage(args: {
  gate: CiGateResult;
  baselineRegistryEntry: BaselineRegistryEntry;
  targetId: string;
  generatedAt?: string;
}): LoadRunTriage {
  const baseline = args.gate.baseline;
  const candidate = args.gate.candidate;
  const p95Ratio = baseline.latencyMs.p95 > 0 ? candidate.latencyMs.p95 / baseline.latencyMs.p95 : Infinity;
  const p99Ratio = baseline.latencyMs.p99 > 0 ? candidate.latencyMs.p99 / baseline.latencyMs.p99 : Infinity;
  const failRateIncreasePctPoints = (candidate.failRate - baseline.failRate) * 100;
  const timeoutIncreasePctPoints = pctPointsIncrease({
    baseline: baseline.timeoutErrors,
    candidate: candidate.timeoutErrors,
    totalBaseline: baseline.totalRequests,
    totalCandidate: candidate.totalRequests
  });
  const status5xxIncreasePctPoints = pctPointsIncrease({
    baseline: baseline.status5xx,
    candidate: candidate.status5xx,
    totalBaseline: baseline.totalRequests,
    totalCandidate: candidate.totalRequests
  });
  const breakerOpenIncreasePctPoints = (candidate.breakerOpenRate - baseline.breakerOpenRate) * 100;
  const retryAmplificationIncrease = candidate.retryAmplification - baseline.retryAmplification;

  const tags: TriageTag[] = [];
  if (p95Ratio > 1.25 && status5xxIncreasePctPoints <= 0.25 && timeoutIncreasePctPoints <= 0.1) {
    tags.push("latency_shift_no_error_shift");
  }
  if (timeoutIncreasePctPoints > 0.1) {
    tags.push("timeout_spike");
  }
  if (status5xxIncreasePctPoints > 0.25) {
    tags.push("5xx_spike");
  }
  if (retryAmplificationIncrease > 0.15) {
    tags.push("retry_amp_spike");
  }
  if (breakerOpenIncreasePctPoints > 2) {
    tags.push("breaker_open_spike");
  }

  const latencyScore = Math.max(0, p95Ratio - 1) + Math.max(0, p99Ratio - 1);
  const errorsScore = Math.max(0, failRateIncreasePctPoints) + Math.max(0, status5xxIncreasePctPoints) + Math.max(0, timeoutIncreasePctPoints);
  const breakerScore = Math.max(0, breakerOpenIncreasePctPoints) + Math.max(0, retryAmplificationIncrease * 100);

  let topOffender: TriageTopOffender = "latency";
  if (errorsScore >= latencyScore && errorsScore >= breakerScore) {
    topOffender = "errors";
  } else if (breakerScore >= latencyScore && breakerScore >= errorsScore) {
    topOffender = "breaker_retries";
  }

  const actions = new Set<string>();
  if (tags.includes("retry_amp_spike")) {
    actions.add("lower retry attempts");
  }
  if (tags.includes("breaker_open_spike")) {
    actions.add("increase breaker window");
  }
  if (tags.includes("timeout_spike")) {
    actions.add("investigate upstream dependency latency/timeouts");
  }
  if (tags.includes("5xx_spike")) {
    actions.add("investigate server regression and recent deploys");
  }
  if (tags.includes("latency_shift_no_error_shift")) {
    actions.add("investigate infra contention and capacity saturation");
  }
  if (actions.size === 0) {
    actions.add("monitor next canary run before changing defaults");
  }

  return {
    generated_at: args.generatedAt ?? new Date().toISOString(),
    baseline_registry: {
      target_id: args.targetId,
      entry: args.baselineRegistryEntry
    },
    gate: {
      passed: args.gate.passed,
      checks: args.gate.checks
    },
    deltas: {
      p95_ratio: Number(p95Ratio.toFixed(6)),
      p99_ratio: Number(p99Ratio.toFixed(6)),
      fail_rate_increase_pct_points: Number(failRateIncreasePctPoints.toFixed(6)),
      timeout_increase_pct_points: Number(timeoutIncreasePctPoints.toFixed(6)),
      status5xx_increase_pct_points: Number(status5xxIncreasePctPoints.toFixed(6)),
      breaker_open_increase_pct_points: Number(breakerOpenIncreasePctPoints.toFixed(6)),
      retry_amplification_increase: Number(retryAmplificationIncrease.toFixed(6))
    },
    tags,
    top_offender: topOffender,
    recommended_actions: [...actions]
  };
}
