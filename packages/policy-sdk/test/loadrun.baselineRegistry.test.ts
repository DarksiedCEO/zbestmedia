import { describe, expect, it } from "vitest";

import { parseBaselineRegistry, resolveTargetBaselineEntry } from "../src/loadrun/baselineRegistry";

describe("baseline registry schema", () => {
  it("accepts valid registry v2 payload", () => {
    const parsed = parseBaselineRegistry({
      version: 2,
      targets: {
        "prod/us-west/policy": {
          baseline_report_path: "ops/load_runs/baselines/accepted-report.json",
          baseline_hash: "a".repeat(64),
          baseline_run_path: "ops/load_runs/baselines/accepted-run.json",
          accepted_at: "2026-03-01T00:00:00.000Z",
          accepted_by: "andre",
          notes: "note",
          chaos_report_path: ""
        }
      }
    });
    expect(parsed.version).toBe(2);
    expect(parsed.targets["prod/us-west/policy"]?.accepted_by).toBe("andre");
  });

  it("migrates v1 payload into default target", () => {
    const parsed = parseBaselineRegistry({
      baseline_report_path: "ops/load_runs/baselines/accepted-report.json",
      baseline_hash: "a".repeat(64),
      baseline_run_path: "ops/load_runs/baselines/accepted-run.json",
      accepted_at: "2026-03-01T00:00:00.000Z",
      accepted_by: "andre",
      notes: "note",
      chaos_report_path: ""
    });
    expect(parsed.version).toBe(2);
    expect(parsed.targets["prod/us-west/policy"]).toBeTruthy();
  });

  it("resolves baseline with exact then env/service fallback", () => {
    const parsed = parseBaselineRegistry({
      version: 2,
      targets: {
        "prod/policy": {
          baseline_report_path: "ops/load_runs/baselines/prod-policy-report.json",
          baseline_hash: "b".repeat(64),
          baseline_run_path: "ops/load_runs/baselines/prod-policy-run.json",
          accepted_at: "2026-03-01T00:00:00.000Z",
          accepted_by: "andre",
          notes: "env fallback",
          chaos_report_path: ""
        }
      }
    });
    const entry = resolveTargetBaselineEntry({ registry: parsed, targetId: "prod/us-west/policy" });
    expect(entry.baseline_run_path).toContain("prod-policy-run.json");
  });

  it("fails on missing required keys", () => {
    expect(() =>
      parseBaselineRegistry({
        baseline_report_path: "x"
      })
    ).toThrow();
  });
});
