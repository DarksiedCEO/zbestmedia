import type { LoadRunSlice } from "./slice";

export type LoadRunComparison = {
  baseline: LoadRunSlice;
  chaos: LoadRunSlice;
  delta: {
    p50InflationPct: number;
    p95InflationPct: number;
    p99InflationPct: number;
    successRateDropPctPoints: number;
    status5xxIncreasePctPoints: number;
    retryAmplificationDelta: number;
    breakerOpenRateDeltaPctPoints: number;
  };
  signals: {
    transportStable: boolean;
    chaosErrorContained: boolean;
    latencyInflationSevere: boolean;
    breakerFlappingRisk: boolean;
  };
};

function pctDelta(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return ((to - from) / from) * 100;
}

export function compareRuns(baseline: LoadRunSlice, chaos: LoadRunSlice): LoadRunComparison {
  const p50InflationPct = pctDelta(baseline.latencyMs.p50, chaos.latencyMs.p50);
  const p95InflationPct = pctDelta(baseline.latencyMs.p95, chaos.latencyMs.p95);
  const p99InflationPct = pctDelta(baseline.latencyMs.p99, chaos.latencyMs.p99);
  const successRateDropPctPoints = (baseline.successRate - chaos.successRate) * 100;
  const status5xxIncreasePctPoints =
    ((chaos.status5xx / chaos.totalRequests) - (baseline.status5xx / baseline.totalRequests)) * 100;
  const retryAmplificationDelta = chaos.retryAmplification - baseline.retryAmplification;
  const breakerOpenRateDeltaPctPoints = (chaos.breakerOpenRate - baseline.breakerOpenRate) * 100;

  return {
    baseline,
    chaos,
    delta: {
      p50InflationPct,
      p95InflationPct,
      p99InflationPct,
      successRateDropPctPoints,
      status5xxIncreasePctPoints,
      retryAmplificationDelta,
      breakerOpenRateDeltaPctPoints
    },
    signals: {
      transportStable: baseline.transportFailureCount === 0 && chaos.transportFailureCount === 0,
      chaosErrorContained: chaos.status5xx / chaos.totalRequests <= 0.2,
      latencyInflationSevere: p95InflationPct > 250 || p99InflationPct > 250,
      breakerFlappingRisk: chaos.breakerOpenRate > 0.05 || chaos.breakerHalfOpenRate > 0.1
    }
  };
}
