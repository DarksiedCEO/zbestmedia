import { describe, expect, it } from "vitest";

import { parseLoadRunSloEvent } from "../src/slo/schema";

describe("slo schema validation", () => {
  it("fails fast on missing required fields", () => {
    expect(() => parseLoadRunSloEvent({ ts: "2026-03-01T00:00:00.000Z" })).toThrow();
  });
});
