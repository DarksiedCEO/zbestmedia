import { describe, expect, it } from "vitest";

import { VoiceCallClassifier } from "../src/voice/classifier.js";
import { VoiceIntakeService, VoiceIntakeValidationError } from "../src/voice/intake.js";

describe("voice intake and classification", () => {
  const intake = new VoiceIntakeService();
  const classifier = new VoiceCallClassifier();

  it("normalizes inbound call payloads", () => {
    const normalized = intake.normalize({
      sourceSystem: "voice-gateway",
      caller: {
        phoneNumber: " +13105551212 ",
        displayName: " Taylor ",
        organizationName: " Z Best Media "
      },
      transcript: " Need to speak to the founder about an urgent partnership. "
    });

    expect(normalized.caller.phoneNumber).toBe("+13105551212");
    expect(normalized.caller.displayName).toBe("Taylor");
    expect(normalized.transcript).toBe("Need to speak to the founder about an urgent partnership.");
  });

  it("fails fast on incomplete unsafe input", () => {
    expect(() =>
      intake.normalize({
        sourceSystem: "voice-gateway",
        caller: {
          phoneNumber: ""
        },
        transcript: ""
      })
    ).toThrow(VoiceIntakeValidationError);
  });

  it("classifies executive access requests as high-risk founder attention", () => {
    const classification = classifier.classify(
      intake.normalize({
        sourceSystem: "voice-gateway",
        caller: {
          phoneNumber: "+13105551212",
          displayName: "Taylor"
        },
        transcript: "I need to speak to the founder today about an urgent partnership."
      })
    );

    expect(classification.intent).toBe("executive_access_request");
    expect(classification.riskLevel).toBe("high");
    expect(classification.founderAttentionRequired).toBe(true);
  });

  it("classifies wrong-number calls for safe suppression", () => {
    const classification = classifier.classify(
      intake.normalize({
        sourceSystem: "voice-gateway",
        caller: {
          phoneNumber: "+13105551212"
        },
        transcript: "Sorry, wrong number."
      })
    );

    expect(classification.intent).toBe("wrong_number_or_irrelevant");
    expect(classification.escalationRecommended).toBe(false);
  });
});
