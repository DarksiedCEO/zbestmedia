import { describe, expect, it } from "vitest";

import { AaliyahMemoryBoundaryService } from "../src/aaliyah/memory-boundary.js";

describe("Aaliyah memory boundary service", () => {
  it("allows founder-summary aggregation across allowed companies", () => {
    const service = new AaliyahMemoryBoundaryService(["zbestmedia", "orca"]);
    const decision = service.validate({
      activeMode: "founder",
      requestedMode: "founder",
      requestedCompanies: ["zbestmedia", "orca"],
      detailLevel: "summary"
    });

    expect(decision.access).toBe("allowed_founder_summary_only");
    expect(decision.founderSummaryOnly).toBe(true);
  });

  it("denies company-specific detail leakage across scopes", () => {
    const service = new AaliyahMemoryBoundaryService(["zbestmedia", "orca"]);
    const decision = service.validate({
      activeMode: "zbestmedia",
      requestedMode: "zbestmedia",
      requestedCompanies: ["orca"],
      detailLevel: "detail"
    });

    expect(decision.access).toBe("denied");
    expect(decision.reasonCodes).toContain("company_detail_scope_denied");
  });
});
