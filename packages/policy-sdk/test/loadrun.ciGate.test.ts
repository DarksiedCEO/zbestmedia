import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCiGate } from "../src/loadrun/ciGate";
import { parseLoadRun } from "../src/loadrun/schema";
import { computeSlices } from "../src/loadrun/slice";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("ci gate thresholds", () => {
  it("passes for identical candidate and baseline", () => {
    const baseline = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8")));
    const gate = evaluateCiGate({
      baseline: computeSlices(baseline),
      candidate: computeSlices(baseline)
    });
    expect(gate.passed).toBe(true);
  });

  it("fails for high regression candidate", () => {
    const baseline = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8")));
    const candidate = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "chaos.sample.json"), "utf8")));
    const gate = evaluateCiGate({
      baseline: computeSlices(baseline),
      candidate: computeSlices(candidate)
    });
    expect(gate.passed).toBe(false);
    expect(gate.checks.some((check) => check.passed === false)).toBe(true);
  });
});
