import { describe, it, expect } from "vitest";

import { PolicyCache } from "../src/cache";

describe("PolicyCache key determinism", () => {
  it("builds stable keys", () => {
    const c = new PolicyCache();
    const k1 = c.makeKey({ client_id: "a", campaign_id: "b", role: "r", asOf: "2026-02-28T00:00:00.000Z" });
    const k2 = c.makeKey({ client_id: "a", campaign_id: "b", role: "r", asOf: "2026-02-28T00:00:00.000Z" });
    expect(k1).toBe(k2);
  });
});
