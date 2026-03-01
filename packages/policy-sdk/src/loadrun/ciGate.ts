import type { LoadRunSlice } from "./slice";

export type CiGateThresholds = {
  p95InflationRatioCap: number;
  p99InflationRatioCap: number;
  errorRateIncreasePctPointsCap: number;
  timeoutIncreasePctPointsCap: number;
  breakerOpenRateIncreasePctPointsCap: number;
  retryAmplificationIncreaseCap: number;
};

export type CiGateCheck = {
  name: string;
  passed: boolean;
  details: string;
};

export type CiGateResult = {
  passed: boolean;
  checks: CiGateCheck[];
  thresholds: CiGateThresholds;
  baseline: LoadRunSlice;
  candidate: LoadRunSlice;
};

export const defaultCiGateThresholds: CiGateThresholds = {
  p95InflationRatioCap: 1.25,
  p99InflationRatioCap: 1.5,
  errorRateIncreasePctPointsCap: 0.25,
  timeoutIncreasePctPointsCap: 0.1,
  breakerOpenRateIncreasePctPointsCap: 2,
  retryAmplificationIncreaseCap: 0.15
};

export function evaluateCiGate(args: {
  baseline: LoadRunSlice;
  candidate: LoadRunSlice;
  thresholds?: Partial<CiGateThresholds>;
}): CiGateResult {
  const thresholds: CiGateThresholds = { ...defaultCiGateThresholds, ...(args.thresholds ?? {}) };
  const checks: CiGateCheck[] = [];
  const baseline = args.baseline;
  const candidate = args.candidate;

  const p95Ratio = baseline.latencyMs.p95 > 0 ? candidate.latencyMs.p95 / baseline.latencyMs.p95 : Infinity;
  const p99Ratio = baseline.latencyMs.p99 > 0 ? candidate.latencyMs.p99 / baseline.latencyMs.p99 : Infinity;
  const errorRateIncreasePctPoints = (candidate.failRate - baseline.failRate) * 100;
  const timeoutIncreasePctPoints = ((candidate.timeoutErrors - baseline.timeoutErrors) / Math.max(1, baseline.totalRequests)) * 100;
  const breakerOpenIncreasePctPoints = (candidate.breakerOpenRate - baseline.breakerOpenRate) * 100;
  const retryAmplificationIncrease = candidate.retryAmplification - baseline.retryAmplification;

  checks.push({
    name: "p95_inflation_cap",
    passed: p95Ratio <= thresholds.p95InflationRatioCap,
    details: `ratio=${p95Ratio.toFixed(3)} cap=${thresholds.p95InflationRatioCap.toFixed(3)}`
  });
  checks.push({
    name: "p99_inflation_cap",
    passed: p99Ratio <= thresholds.p99InflationRatioCap,
    details: `ratio=${p99Ratio.toFixed(3)} cap=${thresholds.p99InflationRatioCap.toFixed(3)}`
  });
  checks.push({
    name: "error_rate_increase_cap",
    passed: errorRateIncreasePctPoints <= thresholds.errorRateIncreasePctPointsCap,
    details: `increase=${errorRateIncreasePctPoints.toFixed(3)}pp cap=${thresholds.errorRateIncreasePctPointsCap.toFixed(3)}pp`
  });
  checks.push({
    name: "timeout_increase_cap",
    passed: timeoutIncreasePctPoints <= thresholds.timeoutIncreasePctPointsCap,
    details: `increase=${timeoutIncreasePctPoints.toFixed(3)}pp cap=${thresholds.timeoutIncreasePctPointsCap.toFixed(3)}pp`
  });
  checks.push({
    name: "breaker_open_increase_cap",
    passed: breakerOpenIncreasePctPoints <= thresholds.breakerOpenRateIncreasePctPointsCap,
    details: `increase=${breakerOpenIncreasePctPoints.toFixed(3)}pp cap=${thresholds.breakerOpenRateIncreasePctPointsCap.toFixed(3)}pp`
  });
  checks.push({
    name: "retry_amplification_increase_cap",
    passed: retryAmplificationIncrease <= thresholds.retryAmplificationIncreaseCap,
    details: `increase=${retryAmplificationIncrease.toFixed(3)} cap=${thresholds.retryAmplificationIncreaseCap.toFixed(3)}`
  });

  return {
    passed: checks.every((check) => check.passed),
    checks,
    thresholds,
    baseline,
    candidate
  };
}
