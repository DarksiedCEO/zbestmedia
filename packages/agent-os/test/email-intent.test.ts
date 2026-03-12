import { describe, expect, it } from "vitest";

import {
  EMAIL_INTENT_CATEGORIES,
  getEmailIntentPolicy,
  getPriorityForIntent,
  getRiskForIntent,
  requiresEscalationForIntent
} from "../src/email/intent.js";

describe("email intent policy", () => {
  it("defines the supported email intent taxonomy", () => {
    expect(EMAIL_INTENT_CATEGORIES).toContain("lead_inquiry");
    expect(EMAIL_INTENT_CATEGORIES).toContain("technical_issue");
    expect(EMAIL_INTENT_CATEGORIES).toContain("legal_or_sensitive");
  });

  it("marks technical and legal categories as high-risk and escalation-required", () => {
    expect(getPriorityForIntent("technical_issue")).toBe("urgent");
    expect(getRiskForIntent("technical_issue")).toBe("critical");
    expect(requiresEscalationForIntent("technical_issue")).toBe(true);

    expect(getRiskForIntent("legal_or_sensitive")).toBe("critical");
    expect(requiresEscalationForIntent("legal_or_sensitive")).toBe(true);
  });

  it("never allows auto-send in draft-only mode", () => {
    for (const intent of EMAIL_INTENT_CATEGORIES) {
      expect(getEmailIntentPolicy(intent).autoSendAllowed).toBe(false);
      expect(getEmailIntentPolicy(intent).approvalRequirement).toBe("required");
    }
  });
});
