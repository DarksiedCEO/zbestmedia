import { describe, expect, it } from "vitest";

import { parseBaselineRegistry } from "../src/loadrun/baselineRegistry";

describe("baseline registry schema", () => {
  it("accepts valid registry payload", () => {
    expect(() =>
      parseBaselineRegistry({
        baseline_report_path: "ops/load_runs/baselines/accepted-report.json",
        baseline_hash: "a".repeat(64),
        baseline_run_path: "ops/load_runs/baselines/accepted-run.json",
        accepted_at: "2026-03-01T00:00:00.000Z",
        accepted_by: "andre",
        notes: "note",
        chaos_report_path: ""
      })
    ).not.toThrow();
  });

  it("fails on missing required keys", () => {
    expect(() =>
      parseBaselineRegistry({
        baseline_report_path: "x"
      })
    ).toThrow();
  });
});
