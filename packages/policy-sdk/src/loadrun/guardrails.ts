import type { LoadRunReportPayload } from "./report";
import type { RuntimeDefaults } from "./defaults";

export type GuardrailThresholds = {
  retryAmplificationCap: number;
  breakerOpenRateCap: number;
  p95InflationRatioCap: number;
  chaosSuccessRateFloorRatio: number;
  maxStatus5xxRateIncreasePctPoints: number;
  maxBreakerThresholdChangePct: number;
  maxRetryStepChange: number;
  maxResetAfterMsChangePct: number;
};

export type GuardrailCheck = {
  name: string;
  passed: boolean;
  details: string;
};

export type GuardrailEvaluation = {
  passed: boolean;
  checks: GuardrailCheck[];
  thresholds: GuardrailThresholds;
};

export const defaultGuardrailThresholds: GuardrailThresholds = {
  retryAmplificationCap: 1.4,
  breakerOpenRateCap: 0.05,
  p95InflationRatioCap: 2.0,
  chaosSuccessRateFloorRatio: 0.85,
  maxStatus5xxRateIncreasePctPoints: 20,
  maxBreakerThresholdChangePct: 25,
  maxRetryStepChange: 1,
  maxResetAfterMsChangePct: 30
};

function pctChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return Math.abs(((to - from) / from) * 100);
}

export function evaluateGuardrails(args: {
  report: LoadRunReportPayload;
  current: RuntimeDefaults;
  proposed: RuntimeDefaults;
  thresholds?: Partial<GuardrailThresholds>;
}): GuardrailEvaluation {
  const t: GuardrailThresholds = { ...defaultGuardrailThresholds, ...(args.thresholds ?? {}) };
  const checks: GuardrailCheck[] = [];
  const { comparison } = args.report;
  const baseline = comparison.baseline;
  const chaos = comparison.chaos;

  checks.push({
    name: "retry_amplification_cap",
    passed: chaos.retryAmplification <= t.retryAmplificationCap,
    details: `chaos.retryAmplification=${chaos.retryAmplification.toFixed(3)} cap=${t.retryAmplificationCap.toFixed(3)}`
  });
  checks.push({
    name: "breaker_open_rate_cap",
    passed: chaos.breakerOpenRate <= t.breakerOpenRateCap,
    details: `chaos.breakerOpenRate=${(chaos.breakerOpenRate * 100).toFixed(2)}% cap=${(t.breakerOpenRateCap * 100).toFixed(2)}%`
  });
  checks.push({
    name: "p95_inflation_cap",
    passed: chaos.latencyMs.p95 <= baseline.latencyMs.p95 * t.p95InflationRatioCap,
    details: `chaos.p95=${chaos.latencyMs.p95.toFixed(2)} baseline.p95=${baseline.latencyMs.p95.toFixed(2)} ratioCap=${t.p95InflationRatioCap.toFixed(2)}x`
  });
  checks.push({
    name: "chaos_throughput_floor",
    passed: chaos.successRate >= baseline.successRate * t.chaosSuccessRateFloorRatio,
    details: `chaos.successRate=${(chaos.successRate * 100).toFixed(2)}% floor=${(baseline.successRate * t.chaosSuccessRateFloorRatio * 100).toFixed(2)}%`
  });
  checks.push({
    name: "status_5xx_increase_cap",
    passed: comparison.delta.status5xxIncreasePctPoints <= t.maxStatus5xxRateIncreasePctPoints,
    details: `delta.status5xx=${comparison.delta.status5xxIncreasePctPoints.toFixed(2)}pp cap=${t.maxStatus5xxRateIncreasePctPoints.toFixed(2)}pp`
  });

  checks.push({
    name: "breaker_threshold_change_cap",
    passed:
      pctChange(args.current.POLICY_BREAKER_FAILURE_THRESHOLD, args.proposed.POLICY_BREAKER_FAILURE_THRESHOLD) <=
      t.maxBreakerThresholdChangePct,
    details: `change=${pctChange(args.current.POLICY_BREAKER_FAILURE_THRESHOLD, args.proposed.POLICY_BREAKER_FAILURE_THRESHOLD).toFixed(2)}% cap=${t.maxBreakerThresholdChangePct.toFixed(2)}%`
  });
  checks.push({
    name: "retry_step_change_cap",
    passed: Math.abs(args.proposed.POLICY_RETRY_MAX - args.current.POLICY_RETRY_MAX) <= t.maxRetryStepChange,
    details: `retryStepChange=${Math.abs(args.proposed.POLICY_RETRY_MAX - args.current.POLICY_RETRY_MAX)} cap=${t.maxRetryStepChange}`
  });
  checks.push({
    name: "reset_window_change_cap",
    passed:
      pctChange(args.current.POLICY_BREAKER_RESET_AFTER_MS, args.proposed.POLICY_BREAKER_RESET_AFTER_MS) <=
      t.maxResetAfterMsChangePct,
    details: `change=${pctChange(args.current.POLICY_BREAKER_RESET_AFTER_MS, args.proposed.POLICY_BREAKER_RESET_AFTER_MS).toFixed(2)}% cap=${t.maxResetAfterMsChangePct.toFixed(2)}%`
  });

  return {
    passed: checks.every((check) => check.passed),
    checks,
    thresholds: t
  };
}
