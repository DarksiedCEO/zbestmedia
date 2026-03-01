import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildDefaultsProposal } from "../src/loadrun/propose";
import { parseRuntimeDefaults } from "../src/loadrun/defaults";
import type { LoadRunReportPayload } from "../src/loadrun/report";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("loadrun proposal generation", () => {
  it("produces deterministic diff and hashes", () => {
    const reportRaw = fs.readFileSync(path.join(fixturesDir, "report.sample.json"), "utf8");
    const report = JSON.parse(reportRaw) as LoadRunReportPayload;
    const currentRaw = JSON.stringify(
      {
        POLICY_BREAKER_FAILURE_THRESHOLD: 5,
        POLICY_BREAKER_RESET_AFTER_MS: 15000,
        POLICY_RETRY_MAX: 2,
        POLICY_RETRY_BASE_DELAY_MS: 80,
        POLICY_RETRY_MAX_DELAY_MS: 400,
        POLICY_MAX_CONCURRENCY_SAFE: 200
      },
      null,
      2
    );
    const current = parseRuntimeDefaults(JSON.parse(currentRaw));

    const proposal = buildDefaultsProposal({
      report,
      reportFile: "/tmp/report.sample.json",
      reportRaw,
      currentFile: "/tmp/runtime.defaults.json",
      currentRaw,
      current
    });

    expect(proposal.report_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.current_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.no_change).toBe(false);
    expect(proposal.diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "POLICY_BREAKER_RESET_AFTER_MS",
          current: 15000,
          proposed: 45564,
          delta: 30564
        }),
        expect.objectContaining({
          key: "POLICY_RETRY_BASE_DELAY_MS",
          current: 80,
          proposed: 380,
          delta: 300
        })
      ])
    );
    expect(proposal.rationale.length).toBeGreaterThan(0);
  });
});
