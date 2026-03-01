import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { consumeBudget, getBudgetStatus } from "../src/loadrun/budget";

describe("loadrun budget controller", () => {
  it("blocks when daily budget is exceeded", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-"));
    const env = {
      POLICY_BUDGET_STATE_PATH: path.join(dir, "state.json"),
      POLICY_LOAD_BUDGET_DAILY_MAX_REQUESTS: "5",
      POLICY_LOAD_BUDGET_MONTHLY_MAX_REQUESTS: "100",
      POLICY_CANARY_MAX_OBSERVE_RUNS_PER_DAY: "2"
    };

    const a = consumeBudget({ kind: "ci_loadrun", requests: 3, env });
    expect(a.allowed).toBe(true);
    const b = consumeBudget({ kind: "prod_drift", requests: 3, env });
    expect(b.allowed).toBe(false);
    expect(b.reason).toBe("daily_budget_exceeded");
  });

  it("tracks canary observe daily cap", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-"));
    const env = {
      POLICY_BUDGET_STATE_PATH: path.join(dir, "state.json"),
      POLICY_LOAD_BUDGET_DAILY_MAX_REQUESTS: "100",
      POLICY_LOAD_BUDGET_MONTHLY_MAX_REQUESTS: "1000",
      POLICY_CANARY_MAX_OBSERVE_RUNS_PER_DAY: "1"
    };
    expect(consumeBudget({ kind: "canary_observe", requests: 0, env }).allowed).toBe(true);
    expect(consumeBudget({ kind: "canary_observe", requests: 0, env }).allowed).toBe(false);
    const status = getBudgetStatus(env);
    expect(status.remaining.canaryObserveRunsDaily).toBe(0);
  });
});
