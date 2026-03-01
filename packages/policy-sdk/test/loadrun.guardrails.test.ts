import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { LoadRunReportPayload } from "../src/loadrun/report";
import { evaluateGuardrails } from "../src/loadrun/guardrails";
import { parseRuntimeDefaults } from "../src/loadrun/defaults";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("loadrun guardrails", () => {
  it("fails when breaker open rate exceeds cap", () => {
    const report = JSON.parse(fs.readFileSync(path.join(fixturesDir, "report.sample.json"), "utf8")) as LoadRunReportPayload;
    const current = parseRuntimeDefaults({
      POLICY_BREAKER_FAILURE_THRESHOLD: 5,
      POLICY_BREAKER_RESET_AFTER_MS: 15000,
      POLICY_RETRY_MAX: 2,
      POLICY_RETRY_BASE_DELAY_MS: 80,
      POLICY_RETRY_MAX_DELAY_MS: 400,
      POLICY_MAX_CONCURRENCY_SAFE: 200
    });
    const proposed = report.recommendation.defaults;

    const evalResult = evaluateGuardrails({ report, current, proposed });
    expect(evalResult.passed).toBe(false);
    expect(evalResult.checks.find((c) => c.name === "breaker_open_rate_cap")?.passed).toBe(false);
  });

  it("passes with relaxed threshold overrides", () => {
    const report = JSON.parse(fs.readFileSync(path.join(fixturesDir, "report.sample.json"), "utf8")) as LoadRunReportPayload;
    const current = parseRuntimeDefaults({
      POLICY_BREAKER_FAILURE_THRESHOLD: 5,
      POLICY_BREAKER_RESET_AFTER_MS: 45564,
      POLICY_RETRY_MAX: 2,
      POLICY_RETRY_BASE_DELAY_MS: 380,
      POLICY_RETRY_MAX_DELAY_MS: 1383,
      POLICY_MAX_CONCURRENCY_SAFE: 200
    });
    const proposed = report.recommendation.defaults;

    const evalResult = evaluateGuardrails({
      report,
      current,
      proposed,
      thresholds: {
        breakerOpenRateCap: 0.2,
        p95InflationRatioCap: 3,
        maxResetAfterMsChangePct: 100
      }
    });
    expect(evalResult.passed).toBe(true);
  });
});
