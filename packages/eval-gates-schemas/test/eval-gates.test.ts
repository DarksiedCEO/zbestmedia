import { describe, expect, it } from "vitest";
import {
  EvalReportSchema,
  GateResultSchema,
  RegenDirectiveSchema
} from "../src/index";

describe("eval gates schemas", () => {
  it("validates gate results", () => {
    expect(GateResultSchema.parse({
      gateId: "gate-1",
      status: "pass",
      reasonCodes: ["LOW_SCORE"],
      summary: "ok",
      metrics: [
        { name: "clarity", score: 0.9, threshold: 0.7, weight: 0.4 }
      ]
    })).toBeTruthy();
  });

  it("validates regen directives", () => {
    expect(RegenDirectiveSchema.parse({
      regen: true,
      maxAttempts: 3,
      strategy: "rewrite",
      focusAreas: ["clarity"],
      notes: "tighten"
    })).toBeTruthy();
  });

  it("validates reports", () => {
    expect(EvalReportSchema.parse({
      reportId: "rep-1",
      artifactId: "art-1",
      artifactType: "BrandBible",
      schemaVersion: "1.0.0",
      overallScore: 0.8,
      recommendation: "accept",
      gateResults: [
        {
          gateId: "gate-1",
          status: "pass",
          reasonCodes: ["LOW_SCORE"],
          summary: "good",
          metrics: [
            { name: "clarity", score: 0.9, threshold: 0.7, weight: 0.4 }
          ]
        }
      ]
    })).toBeTruthy();
  });
});
