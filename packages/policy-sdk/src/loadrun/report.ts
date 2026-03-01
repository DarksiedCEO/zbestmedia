import fs from "node:fs";
import path from "node:path";

import type { LoadRunComparison } from "./compare";
import type { LoadRunRecommendation } from "./recommend";

export type LoadRunReportPayload = {
  generated_at: string;
  baseline_file: string;
  chaos_file: string;
  comparison: LoadRunComparison;
  recommendation: LoadRunRecommendation;
};

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function buildMarkdownReport(payload: LoadRunReportPayload): string {
  const { comparison, recommendation } = payload;
  const b = comparison.baseline;
  const c = comparison.chaos;

  return [
    "# Load Run Analysis",
    "",
    `- Generated: ${payload.generated_at}`,
    `- Baseline file: ${payload.baseline_file}`,
    `- Chaos file: ${payload.chaos_file}`,
    "",
    "## Metrics",
    `- Baseline latency (p50/p95/p99 ms): ${b.latencyMs.p50.toFixed(2)} / ${b.latencyMs.p95.toFixed(2)} / ${b.latencyMs.p99.toFixed(2)}`,
    `- Chaos latency (p50/p95/p99 ms): ${c.latencyMs.p50.toFixed(2)} / ${c.latencyMs.p95.toFixed(2)} / ${c.latencyMs.p99.toFixed(2)}`,
    `- Max latency proxy (p99 ms): baseline=${b.latencyMs.p99.toFixed(2)}, chaos=${c.latencyMs.p99.toFixed(2)}`,
    `- Success rate: baseline=${formatPct(b.successRate * 100)}, chaos=${formatPct(c.successRate * 100)}`,
    `- Error split (baseline 4xx/5xx/timeouts): ${b.status4xx}/${b.status5xx}/${b.timeoutErrors}`,
    `- Error split (chaos 4xx/5xx/timeouts): ${c.status4xx}/${c.status5xx}/${c.timeoutErrors}`,
    `- Breaker open rate: baseline=${formatPct(b.breakerOpenRate * 100)}, chaos=${formatPct(c.breakerOpenRate * 100)}`,
    `- Breaker half-open success rate: baseline=${formatPct(b.halfOpenSuccessRate * 100)}, chaos=${formatPct(c.halfOpenSuccessRate * 100)}`,
    `- Retry amplification: baseline=${b.retryAmplification.toFixed(3)}, chaos=${c.retryAmplification.toFixed(3)}`,
    "",
    "## Deltas",
    `- p50 inflation: ${formatPct(comparison.delta.p50InflationPct)}`,
    `- p95 inflation: ${formatPct(comparison.delta.p95InflationPct)}`,
    `- p99 inflation: ${formatPct(comparison.delta.p99InflationPct)}`,
    `- Success rate drop: ${formatPct(comparison.delta.successRateDropPctPoints)}`,
    `- 5xx increase: ${formatPct(comparison.delta.status5xxIncreasePctPoints)}`,
    `- Breaker open delta: ${formatPct(comparison.delta.breakerOpenRateDeltaPctPoints)}`,
    `- Retry amplification delta: ${comparison.delta.retryAmplificationDelta.toFixed(3)}`,
    "",
    "## Proposed Defaults",
    "```bash",
    `POLICY_BREAKER_FAILURE_THRESHOLD=${recommendation.defaults.POLICY_BREAKER_FAILURE_THRESHOLD}`,
    `POLICY_BREAKER_RESET_AFTER_MS=${recommendation.defaults.POLICY_BREAKER_RESET_AFTER_MS}`,
    `POLICY_RETRY_MAX=${recommendation.defaults.POLICY_RETRY_MAX}`,
    `POLICY_RETRY_BASE_DELAY_MS=${recommendation.defaults.POLICY_RETRY_BASE_DELAY_MS}`,
    `POLICY_RETRY_MAX_DELAY_MS=${recommendation.defaults.POLICY_RETRY_MAX_DELAY_MS}`,
    `POLICY_MAX_CONCURRENCY_SAFE=${recommendation.defaults.POLICY_MAX_CONCURRENCY_SAFE}`,
    "```",
    "",
    "## Rationale",
    ...recommendation.rationale.map((line) => `- ${line}`),
    ""
  ].join("\n");
}

export function writeReports(args: {
  reportDir: string;
  basename: string;
  payload: LoadRunReportPayload;
}): { jsonPath: string; markdownPath: string } {
  fs.mkdirSync(args.reportDir, { recursive: true });
  const jsonPath = path.join(args.reportDir, `${args.basename}.json`);
  const markdownPath = path.join(args.reportDir, `${args.basename}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(args.payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, `${buildMarkdownReport(args.payload)}\n`, "utf8");

  return { jsonPath, markdownPath };
}
