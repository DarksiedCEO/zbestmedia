import fs from "node:fs";

import { parseLoadRunSloEvent, type LoadRunSloEvent } from "./schema";

export type SloSummary = {
  target_id: string | null;
  total_runs: number;
  pass_rate: number;
  p95: { min: number; median: number; max: number };
  top_fail_reasons: Array<{ reason: string; count: number }>;
  last_failure_tags: string[];
  current_baseline: string;
  rows: Array<{
    ts: string;
    source: "ci" | "prod";
    target_id: string;
    passed: boolean;
    p95: number;
    p99: number;
    error_rate_total: number;
    breaker_open_rate: number;
    retry_amplification: number;
  }>;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function parseEventsJsonl(raw: string): LoadRunSloEvent[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line) => parseLoadRunSloEvent(JSON.parse(line)));
}

export function readEventsFromJsonl(filePath: string): LoadRunSloEvent[] {
  if (!fs.existsSync(filePath)) return [];
  return parseEventsJsonl(fs.readFileSync(filePath, "utf8"));
}

export function buildSloSummary(events: LoadRunSloEvent[], last: number, targetId?: string): SloSummary {
  const filtered = targetId ? events.filter((event) => event.target_id === targetId) : events;
  const recent = [...filtered].sort((a, b) => a.ts.localeCompare(b.ts)).slice(-Math.max(1, last));
  const passedCount = recent.filter((event) => event.verdict.passed).length;
  const passRate = recent.length > 0 ? passedCount / recent.length : 0;
  const p95Values = recent.map((event) => event.metrics.latency.p95);

  const reasonCounts = new Map<string, number>();
  for (const event of recent.filter((item) => !item.verdict.passed)) {
    for (const reason of event.verdict.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  const topFailReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const lastFailure = [...recent].reverse().find((event) => !event.verdict.passed);

  return {
    target_id: targetId ?? null,
    total_runs: recent.length,
    pass_rate: Number(passRate.toFixed(6)),
    p95: {
      min: p95Values.length ? Math.min(...p95Values) : 0,
      median: percentile(p95Values, 50),
      max: p95Values.length ? Math.max(...p95Values) : 0
    },
    top_fail_reasons: topFailReasons,
    last_failure_tags: lastFailure?.tags ?? [],
    current_baseline: recent.length > 0 ? recent[recent.length - 1]?.baseline.path ?? "" : "",
    rows: recent.map((event) => ({
      ts: event.ts,
      source: event.source,
      target_id: event.target_id,
      passed: event.verdict.passed,
      p95: event.metrics.latency.p95,
      p99: event.metrics.latency.p99,
      error_rate_total: event.metrics.error_rate_total,
      breaker_open_rate: event.metrics.breaker_open_rate,
      retry_amplification: event.metrics.retry_amplification
    }))
  };
}

export function renderSloSummaryMarkdown(summary: SloSummary): string {
  const lines: string[] = [];
  lines.push("# Loadrun SLO Summary");
  lines.push("");
  lines.push(`- Total runs: ${summary.total_runs}`);
  lines.push(`- Target: ${summary.target_id ?? "all"}`);
  lines.push(`- Pass rate: ${(summary.pass_rate * 100).toFixed(2)}%`);
  lines.push(`- P95 range (min/median/max): ${summary.p95.min.toFixed(2)} / ${summary.p95.median.toFixed(2)} / ${summary.p95.max.toFixed(2)} ms`);
  lines.push(`- Current baseline: ${summary.current_baseline || "n/a"}`);
  lines.push("");
  lines.push("## Last Runs");
  lines.push("");
  lines.push("| ts | source | target_id | passed | p95 | p99 | error_rate_total | breaker_open_rate | retry_amplification |\n|---|---|---|---:|---:|---:|---:|---:|---:|");
  for (const row of summary.rows) {
    lines.push(
      `| ${row.ts} | ${row.source} | ${row.target_id} | ${row.passed ? "yes" : "no"} | ${row.p95.toFixed(2)} | ${row.p99.toFixed(2)} | ${(row.error_rate_total * 100).toFixed(3)}% | ${(row.breaker_open_rate * 100).toFixed(3)}% | ${row.retry_amplification.toFixed(3)} |`
    );
  }

  lines.push("");
  lines.push("## Top Fail Reasons");
  lines.push("");
  if (summary.top_fail_reasons.length === 0) {
    lines.push("- none");
  } else {
    for (const item of summary.top_fail_reasons) {
      lines.push(`- ${item.reason} (${item.count})`);
    }
  }

  lines.push("");
  lines.push(`## Last Failure Tags\n\n- ${summary.last_failure_tags.join(", ") || "none"}`);

  return lines.join("\n");
}
