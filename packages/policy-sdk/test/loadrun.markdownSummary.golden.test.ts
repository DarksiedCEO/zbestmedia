import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCiGate } from "../src/loadrun/ciGate";
import { buildCiGateMarkdownSummary } from "../src/loadrun/markdownSummary";
import { parseLoadRun } from "../src/loadrun/schema";
import { computeSlices } from "../src/loadrun/slice";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("ci gate markdown summary", () => {
  it("emits stable markdown sections", () => {
    const baseline = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8")));
    const candidate = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "chaos.sample.json"), "utf8")));
    const gate = evaluateCiGate({
      baseline: computeSlices(baseline),
      candidate: computeSlices(candidate)
    });

    const md = buildCiGateMarkdownSummary({
      baselineFile: "baseline.json",
      candidateFile: "candidate.json",
      gate
    });

    expect(md).toContain("# Load Regression Gate");
    expect(md).toContain("- Status: **FAIL**");
    expect(md).toContain("## Checks");
    expect(md).toContain("p95_inflation_cap");
  });
});
