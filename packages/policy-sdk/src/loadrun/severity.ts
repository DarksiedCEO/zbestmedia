import type { CiGateResult } from "./ciGate";

export type IncidentSeverity = "INFO" | "WARNING" | "SEVERE" | "CRITICAL";

export function classifyIncidentSeverity(args: {
  gate?: CiGateResult;
  fingerprintMismatch?: boolean;
  killSwitchActive?: boolean;
}): IncidentSeverity {
  if (args.killSwitchActive || args.fingerprintMismatch) {
    return "CRITICAL";
  }
  const gate = args.gate;
  if (!gate) return "INFO";

  const b = gate.baseline;
  const c = gate.candidate;
  const p95Ratio = b.latencyMs.p95 > 0 ? c.latencyMs.p95 / b.latencyMs.p95 : Infinity;
  const p99Ratio = b.latencyMs.p99 > 0 ? c.latencyMs.p99 / b.latencyMs.p99 : Infinity;
  const errorRateIncreasePctPoints = (c.failRate - b.failRate) * 100;
  const breakerOpenPct = c.breakerOpenRate * 100;

  if (p99Ratio > 3 || errorRateIncreasePctPoints > 1) return "CRITICAL";
  if (p95Ratio > 2 || breakerOpenPct > 20) return "SEVERE";
  if (!gate.passed) return "WARNING";
  return "INFO";
}
