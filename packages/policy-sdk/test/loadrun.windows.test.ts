import { describe, expect, it } from "vitest";

import { resolveActiveDeployWindow } from "../src/loadrun/windows";

describe("deploy window suppression", () => {
  it("resolves active window for target", () => {
    const active = resolveActiveDeployWindow({
      targetId: "prod/us-west/policy",
      now: new Date("2026-03-01T12:00:00.000Z"),
      windows: [
        {
          target: "prod/*/*",
          start_utc: "2026-03-01T11:00:00.000Z",
          end_utc: "2026-03-01T13:00:00.000Z",
          reason: "deploy"
        }
      ]
    });
    expect(active?.reason).toBe("deploy");
  });
});
