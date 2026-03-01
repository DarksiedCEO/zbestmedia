import type { LoadRunComparison } from "./compare";

export type LoadRunRecommendation = {
  defaults: {
    POLICY_BREAKER_FAILURE_THRESHOLD: number;
    POLICY_BREAKER_RESET_AFTER_MS: number;
    POLICY_RETRY_MAX: number;
    POLICY_RETRY_BASE_DELAY_MS: number;
    POLICY_RETRY_MAX_DELAY_MS: number;
    POLICY_MAX_CONCURRENCY_SAFE: number;
  };
  rationale: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function recommendDefaults(comparison: LoadRunComparison): LoadRunRecommendation {
  const chaos5xxRate = comparison.chaos.status5xx / comparison.chaos.totalRequests;
  const baselineSuccessRate = comparison.baseline.successRate;
  const chaosP95 = comparison.chaos.latencyMs.p95;
  const chaosP99 = comparison.chaos.latencyMs.p99;

  const breakerFailureThreshold = chaos5xxRate >= 0.15 ? 6 : chaos5xxRate >= 0.08 ? 5 : 4;
  const breakerResetAfterMs = clamp(Math.round(Math.max(15_000, Math.min(60_000, chaosP95 * 12))), 15_000, 60_000);

  const retryMax = chaos5xxRate >= 0.2 ? 1 : 2;
  const retryBaseDelayMs = clamp(Math.round(Math.max(80, chaosP95 * 0.1)), 80, 600);
  const retryMaxDelayMs = clamp(Math.round(Math.max(300, chaosP99 * 0.35)), 300, 2_500);

  let maxConcurrencySafe = comparison.baseline.totalRequests > 0 ? 200 : 100;
  if (baselineSuccessRate < 0.98 || comparison.delta.p95InflationPct > 200) {
    maxConcurrencySafe = 150;
  }
  if (baselineSuccessRate < 0.95 || comparison.delta.p95InflationPct > 300) {
    maxConcurrencySafe = 100;
  }

  const rationale: string[] = [
    `Chaos 5xx rate=${(chaos5xxRate * 100).toFixed(2)}% drives breaker threshold=${breakerFailureThreshold} and retry max=${retryMax}.`,
    `Chaos p95=${chaosP95.toFixed(2)}ms and p99=${chaosP99.toFixed(2)}ms drive reset/backoff windows.`,
    `Baseline success=${(baselineSuccessRate * 100).toFixed(2)}% and chaos inflation p95=${comparison.delta.p95InflationPct.toFixed(2)}% drive max safe concurrency=${maxConcurrencySafe}.`
  ];

  return {
    defaults: {
      POLICY_BREAKER_FAILURE_THRESHOLD: breakerFailureThreshold,
      POLICY_BREAKER_RESET_AFTER_MS: breakerResetAfterMs,
      POLICY_RETRY_MAX: retryMax,
      POLICY_RETRY_BASE_DELAY_MS: retryBaseDelayMs,
      POLICY_RETRY_MAX_DELAY_MS: retryMaxDelayMs,
      POLICY_MAX_CONCURRENCY_SAFE: maxConcurrencySafe
    },
    rationale
  };
}
