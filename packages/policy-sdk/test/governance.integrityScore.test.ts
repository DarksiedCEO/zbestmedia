import { describe, expect, it } from "vitest";

import { computeIntegrityScore } from "../src/governance/integrityScore";

describe("governance integrity score", () => {
  it("forces score 0 for critical flags", () => {
    const score = computeIntegrityScore(["LEDGER_CHAIN_BROKEN"]);
    expect(score.integrity_score).toBe(0);
    expect(score.critical).toBe(true);
  });

  it("subtracts weighted non-critical flags deterministically", () => {
    const score = computeIntegrityScore(["PROD_BASELINE_MISSING", "RETENTION_STALE"]);
    expect(score.integrity_score).toBe(40);
    expect(score.critical).toBe(false);
  });
});
