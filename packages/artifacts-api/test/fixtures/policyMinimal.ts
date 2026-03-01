export function performanceLimitsPolicy(overrides?: Partial<{
  maxCPA: number;
  maxRouteLatencyP95: number;
  maxErrorRate: number;
  maxPodFailureRate: number;
  minMargin: number;
}>): {
  maxCPA: number;
  maxRouteLatencyP95: number;
  maxErrorRate: number;
  maxPodFailureRate: number;
  minMargin: number;
} {
  return {
    maxCPA: overrides?.maxCPA ?? 150,
    maxRouteLatencyP95: overrides?.maxRouteLatencyP95 ?? 220,
    maxErrorRate: overrides?.maxErrorRate ?? 0.02,
    maxPodFailureRate: overrides?.maxPodFailureRate ?? 0.05,
    minMargin: overrides?.minMargin ?? 0.3
  };
}
