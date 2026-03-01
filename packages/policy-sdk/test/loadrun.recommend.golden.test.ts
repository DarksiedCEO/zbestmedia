import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compareRuns } from "../src/loadrun/compare";
import { recommendDefaults } from "../src/loadrun/recommend";
import { parseLoadRun } from "../src/loadrun/schema";
import { computeSlices } from "../src/loadrun/slice";

const fixturesDir = path.resolve(__dirname, "fixtures", "loadrun");

describe("load run recommender golden", () => {
  it("produces deterministic defaults and rationale", () => {
    const baseline = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "baseline.sample.json"), "utf8")));
    const chaos = parseLoadRun(JSON.parse(fs.readFileSync(path.join(fixturesDir, "chaos.sample.json"), "utf8")));
    const comparison = compareRuns(computeSlices(baseline), computeSlices(chaos));
    const recommendation = recommendDefaults(comparison);

    expect(recommendation).toEqual({
      defaults: {
        POLICY_BREAKER_FAILURE_THRESHOLD: 5,
        POLICY_BREAKER_RESET_AFTER_MS: 45564,
        POLICY_RETRY_MAX: 2,
        POLICY_RETRY_BASE_DELAY_MS: 380,
        POLICY_RETRY_MAX_DELAY_MS: 1383,
        POLICY_MAX_CONCURRENCY_SAFE: 200
      },
      rationale: [
        "Chaos 5xx rate=13.00% drives breaker threshold=5 and retry max=2.",
        "Chaos p95=3796.99ms and p99=3951.51ms drive reset/backoff windows.",
        "Baseline success=100.00% and chaos inflation p95=184.61% drive max safe concurrency=200."
      ]
    });
  });
});
