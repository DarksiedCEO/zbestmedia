import type { CiGateResult } from "./ciGate";

export function buildCiGateMarkdownSummary(args: {
  baselineFile: string;
  candidateFile: string;
  gate: CiGateResult;
}): string {
  const status = args.gate.passed ? "PASS" : "FAIL";
  return [
    "# Load Regression Gate",
    "",
    `- Status: **${status}**`,
    `- Baseline: \`${args.baselineFile}\``,
    `- Candidate: \`${args.candidateFile}\``,
    "",
    "## Baseline",
    `- p95/p99: ${args.gate.baseline.latencyMs.p95.toFixed(2)} / ${args.gate.baseline.latencyMs.p99.toFixed(2)} ms`,
    `- success/fail rate: ${(args.gate.baseline.successRate * 100).toFixed(2)}% / ${(args.gate.baseline.failRate * 100).toFixed(2)}%`,
    `- breaker open rate: ${(args.gate.baseline.breakerOpenRate * 100).toFixed(2)}%`,
    `- retry amplification: ${args.gate.baseline.retryAmplification.toFixed(3)}`,
    "",
    "## Candidate",
    `- p95/p99: ${args.gate.candidate.latencyMs.p95.toFixed(2)} / ${args.gate.candidate.latencyMs.p99.toFixed(2)} ms`,
    `- success/fail rate: ${(args.gate.candidate.successRate * 100).toFixed(2)}% / ${(args.gate.candidate.failRate * 100).toFixed(2)}%`,
    `- breaker open rate: ${(args.gate.candidate.breakerOpenRate * 100).toFixed(2)}%`,
    `- retry amplification: ${args.gate.candidate.retryAmplification.toFixed(3)}`,
    "",
    "## Checks",
    ...args.gate.checks.map((check) => `- [${check.passed ? "x" : " "}] \`${check.name}\` — ${check.details}`),
    ""
  ].join("\n");
}
