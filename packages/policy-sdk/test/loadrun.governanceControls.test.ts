import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isGovernanceFreezeEnabled, isRuntimeKillSwitchEnabled } from "../src/loadrun/governanceControls";

describe("governance controls", () => {
  const prev = process.env.POLICY_CONTROLS_PATH;

  afterEach(() => {
    if (prev == null) delete process.env.POLICY_CONTROLS_PATH;
    else process.env.POLICY_CONTROLS_PATH = prev;
    delete process.env.POLICY_GOVERNANCE_FREEZE;
    delete process.env.POLICY_RUNTIME_KILL_SWITCH;
  });

  it("reads freeze/kill switch from controls file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "controls-"));
    const controls = path.join(dir, "controls.json");
    fs.writeFileSync(
      controls,
      JSON.stringify({ freeze: true, runtime_kill_switch: true, updated_at: new Date().toISOString(), reason: "test" }),
      "utf8"
    );
    process.env.POLICY_CONTROLS_PATH = controls;
    expect(isGovernanceFreezeEnabled()).toBe(true);
    expect(isRuntimeKillSwitchEnabled()).toBe(true);
  });
});
