import type { LoadRun } from "./schema";

export type LoadRunSlice = {
  totalRequests: number;
  successCount: number;
  failStatusCount: number;
  transportFailureCount: number;
  successRate: number;
  failRate: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  timeoutErrors: number;
  latencyMs: {
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  breakerOpenRate: number;
  breakerHalfOpenRate: number;
  halfOpenSuccessRate: number;
  retryAmplification: number;
  blockedMutateTotal: number;
  cacheStates: Record<string, number>;
  retryDistribution: Record<string, number>;
  errorCodes: Record<string, number>;
};

function sumObjectValues(input: Record<string, number>): number {
  return Object.values(input).reduce((acc, value) => acc + value, 0);
}

export function computeRetryAmplification(args: {
  retryCountDistribution: Record<string, number>;
  totalRequests: number;
}): number {
  if (args.totalRequests <= 0) return 0;
  let additionalAttempts = 0;
  for (const [retryCount, count] of Object.entries(args.retryCountDistribution)) {
    const retries = Number(retryCount);
    if (Number.isFinite(retries) && retries > 0) {
      additionalAttempts += retries * count;
    }
  }
  return additionalAttempts / args.totalRequests;
}

export function computeBreakerOpenRate(args: {
  breakerStates: Record<string, number>;
  totalRequests: number;
}): number {
  if (args.totalRequests <= 0) return 0;
  return (args.breakerStates.OPEN ?? 0) / args.totalRequests;
}

export function computeBreakerHalfOpenRate(args: {
  breakerStates: Record<string, number>;
  totalRequests: number;
}): number {
  if (args.totalRequests <= 0) return 0;
  return (args.breakerStates.HALF_OPEN ?? 0) / args.totalRequests;
}

export function computeHalfOpenSuccessRate(args: {
  breakerStates: Record<string, number>;
}): number {
  const halfOpen = args.breakerStates.HALF_OPEN ?? 0;
  if (halfOpen === 0) return 1;
  const closed = args.breakerStates.CLOSED ?? 0;
  return Math.min(1, closed / (closed + halfOpen));
}

export function computeSlices(run: LoadRun): LoadRunSlice {
  const totalRequests = run.config.total;
  const status2xx = Object.entries(run.counts.status)
    .filter(([code]) => Number(code) >= 200 && Number(code) < 300)
    .reduce((acc, [, count]) => acc + count, 0);
  const status4xx = Object.entries(run.counts.status)
    .filter(([code]) => Number(code) >= 400 && Number(code) < 500)
    .reduce((acc, [, count]) => acc + count, 0);
  const status5xx = Object.entries(run.counts.status)
    .filter(([code]) => Number(code) >= 500 && Number(code) < 600)
    .reduce((acc, [, count]) => acc + count, 0);
  const timeoutErrors = Object.entries(run.counts.transport_failure_types)
    .filter(([name]) => name.toLowerCase().includes("timeout"))
    .reduce((acc, [, count]) => acc + count, 0);

  const blockedMutateTotal = sumObjectValues(run.counts.blocked_mutate);
  const retryAmplification = computeRetryAmplification({
    retryCountDistribution: run.retry_count_distribution,
    totalRequests
  });

  return {
    totalRequests,
    successCount: run.counts.success,
    failStatusCount: run.counts.fail_status,
    transportFailureCount: run.counts.transport_failures,
    successRate: totalRequests > 0 ? run.counts.success / totalRequests : 0,
    failRate: totalRequests > 0 ? run.counts.fail_status / totalRequests : 0,
    status2xx,
    status4xx,
    status5xx,
    timeoutErrors,
    latencyMs: {
      mean: run.latency_ms.mean,
      p50: run.latency_ms.p50,
      p95: run.latency_ms.p95,
      p99: run.latency_ms.p99
    },
    breakerOpenRate: computeBreakerOpenRate({ breakerStates: run.breaker_states, totalRequests }),
    breakerHalfOpenRate: computeBreakerHalfOpenRate({ breakerStates: run.breaker_states, totalRequests }),
    halfOpenSuccessRate: computeHalfOpenSuccessRate({ breakerStates: run.breaker_states }),
    retryAmplification,
    blockedMutateTotal,
    cacheStates: run.cache_states,
    retryDistribution: run.retry_count_distribution,
    errorCodes: run.counts.error_codes
  };
}
