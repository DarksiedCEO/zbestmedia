import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseLoadRun } from "../src/loadrun/schema";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("load run schema validation", () => {
  it("accepts valid baseline fixture", () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8"));
    expect(() => parseLoadRun(baseline)).not.toThrow();
  });

  it("fails hard when required field is missing", () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8"));
    delete baseline.counts.status;
    expect(() => parseLoadRun(baseline)).toThrow();
  });

  it("fails hard when field type is wrong", () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8"));
    baseline.config.total = "500";
    expect(() => parseLoadRun(baseline)).toThrow();
  });
});
