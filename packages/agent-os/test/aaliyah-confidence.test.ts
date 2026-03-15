import { describe, expect, it } from "vitest";

import { AaliyahConfidenceControlService } from "../src/aaliyah/confidence.js";

describe("Aaliyah confidence and interruption control", () => {
  const service = new AaliyahConfidenceControlService();

  it("keeps clean release-blocking signals high confidence and interrupt-now", () => {
    const result = service.evaluate({
      sourceSubsystem: "ops",
      assessedItemType: "incident",
      sourceItemId: "incident:1",
      urgency: "urgent",
      risk: "critical",
      founderRelevance: true,
      founderApprovalRequired: false,
      releaseBlocking: true,
      timeSensitivity: "immediate",
      dataComplete: true,
      routingCertain: true,
      policyCertain: true,
      modeCertain: true,
      sourceReliability: "high"
    });

    expect(result.assessment.confidenceLevel).toBe("high");
    expect(result.interruption.recommendedVisibilityAction).toBe("interrupt_now");
  });

  it("downgrades ambiguous low-reliability signals safely", () => {
    const result = service.evaluate({
      sourceSubsystem: "voice_intake",
      assessedItemType: "voice_call",
      sourceItemId: "voice:1",
      urgency: "normal",
      risk: "medium",
      founderRelevance: false,
      founderApprovalRequired: false,
      releaseBlocking: false,
      timeSensitivity: "routine",
      dataComplete: false,
      routingCertain: false,
      policyCertain: true,
      modeCertain: false,
      sourceReliability: "low"
    });

    expect(result.assessment.confidenceLevel).toBe("low");
    expect(result.assessment.recommendedFallbackAction).toBe("suppress");
    expect(result.interruption.recommendedVisibilityAction).toBe("silent_log");
  });
});
