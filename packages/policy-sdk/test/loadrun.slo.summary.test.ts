import { describe, expect, it } from "vitest";

import { buildSloSummary, parseEventsJsonl, renderSloSummaryMarkdown } from "../src/slo/summary";

const jsonl = [
  JSON.stringify({
    event_id: "e1",
    ts: "2026-03-01T00:00:00.000Z",
    source: "ci",
    service: "policy",
    baseline: { path: "a", hash: "h1", accepted_at: "2026-03-01T00:00:00.000Z" },
    candidate: { path: "c1", hash: "hc1" },
    verdict: { passed: true, reasons: [] },
    metrics: {
      latency: { p50: 10, p95: 20, p99: 30, max: 30 },
      throughput_rps: 20,
      error_rate_total: 0,
      error_rate_4xx: 0,
      error_rate_5xx: 0,
      error_rate_timeout: 0,
      breaker_open_rate: 0,
      retry_amplification: 0
    },
    deltas: {
      latency_p50_ratio: 1,
      latency_p95_ratio: 1,
      latency_p99_ratio: 1,
      latency_max_ratio: 1,
      throughput_rps_delta: 0,
      error_rate_total_delta: 0,
      error_rate_4xx_delta: 0,
      error_rate_5xx_delta: 0,
      error_rate_timeout_delta: 0,
      breaker_open_rate_delta: 0,
      retry_amplification_delta: 0
    },
    tags: []
  }),
  JSON.stringify({
    event_id: "e2",
    ts: "2026-03-01T01:00:00.000Z",
    source: "prod",
    service: "policy",
    baseline: { path: "a", hash: "h1", accepted_at: "2026-03-01T00:00:00.000Z" },
    candidate: { path: "c2", hash: "hc2" },
    verdict: { passed: false, reasons: ["p95_inflation_cap"] },
    metrics: {
      latency: { p50: 15, p95: 40, p99: 80, max: 80 },
      throughput_rps: 15,
      error_rate_total: 0.05,
      error_rate_4xx: 0.01,
      error_rate_5xx: 0.03,
      error_rate_timeout: 0.01,
      breaker_open_rate: 0.02,
      retry_amplification: 0.2
    },
    deltas: {
      latency_p50_ratio: 1.5,
      latency_p95_ratio: 2,
      latency_p99_ratio: 2.6,
      latency_max_ratio: 2.6,
      throughput_rps_delta: -5,
      error_rate_total_delta: 0.05,
      error_rate_4xx_delta: 0.01,
      error_rate_5xx_delta: 0.03,
      error_rate_timeout_delta: 0.01,
      breaker_open_rate_delta: 0.02,
      retry_amplification_delta: 0.2
    },
    tags: ["5xx_spike"]
  })
].join("\n");

describe("slo summary", () => {
  it("builds summary and markdown", () => {
    const events = parseEventsJsonl(jsonl);
    const summary = buildSloSummary(events, 30);
    const md = renderSloSummaryMarkdown(summary);

    expect(summary.total_runs).toBe(2);
    expect(summary.pass_rate).toBe(0.5);
    expect(summary.top_fail_reasons[0]?.reason).toBe("p95_inflation_cap");
    expect(md).toContain("# Loadrun SLO Summary");
    expect(md).toContain("Last Failure Tags");
  });
});
