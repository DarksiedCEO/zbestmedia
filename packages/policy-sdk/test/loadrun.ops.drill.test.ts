import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildDrillSteps, runDrill, writeDrillArtifacts } from "../src/ops/drill";

describe("ops drill", () => {
  it("builds canonical fortress step sequence", () => {
    const steps = buildDrillSteps({ profile: "fortress", targetId: "prod/us-west/policy" });
    expect(steps[0]?.id).toBe("targets_validate");
    expect(steps.some((s) => s.id === "ledger_rollover")).toBe(true);
    expect(steps.some((s) => s.id === "audit_export")).toBe(true);
  });

  it("stops on required step failure and writes artifacts", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "drill-"));
    const result = runDrill({
      profile: "audit-only",
      targetId: "prod/us-west/policy",
      outDir: out,
      runner: (cmd) => ({
        exitCode: cmd.includes("ops:audit:verify-ledger --strict") ? 1 : 0,
        durationMs: 5
      })
    });
    expect(result.passed).toBe(false);
    writeDrillArtifacts({
      result,
      stepsPath: path.join(out, "steps.jsonl"),
      drillPath: path.join(out, "drill.json"),
      resultsMdPath: path.join(out, "results.md")
    });
    expect(fs.existsSync(path.join(out, "steps.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(out, "drill.json"))).toBe(true);
    expect(fs.existsSync(path.join(out, "results.md"))).toBe(true);
  });
});
