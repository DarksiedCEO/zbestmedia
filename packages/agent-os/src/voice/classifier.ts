import type { NormalizedVoiceCall, VoiceCallClassification, VoiceCallIntent, VoiceCallRiskLevel, VoiceCallUrgency } from "./types.js";

type IntentRule = {
  intent: VoiceCallIntent;
  keywords: string[];
};

const INTENT_RULES: IntentRule[] = [
  { intent: "legal_or_sensitive", keywords: ["attorney", "lawyer", "legal", "sue", "complaint", "cease and desist"] },
  { intent: "executive_access_request", keywords: ["owner", "founder", "andre", "executive", "boss", "urgent callback from andré", "speak to the founder"] },
  { intent: "emergency_service_request", keywords: ["emergency", "urgent", "flood", "no power", "burst pipe", "leak", "fire", "immediately"] },
  { intent: "billing_question", keywords: ["billing", "invoice", "charge", "refund", "payment", "receipt"] },
  { intent: "sales_inquiry", keywords: ["quote", "estimate", "pricing", "proposal", "new project", "buy", "service package"] },
  { intent: "appointment_request", keywords: ["appointment", "schedule", "book", "calendar", "availability", "reschedule"] },
  { intent: "existing_customer_followup", keywords: ["follow up", "existing customer", "last time", "returning customer", "service completed"] },
  { intent: "service_inquiry", keywords: ["service", "help", "question", "availability", "can you do", "support"] },
  { intent: "wrong_number_or_irrelevant", keywords: ["wrong number", "not interested", "telemarketer", "spam"] }
];

export class VoiceCallClassifier {
  classify(call: NormalizedVoiceCall): VoiceCallClassification {
    const haystack = `${call.transcript} ${call.callSummary ?? ""} ${call.caller.organizationName ?? ""}`.toLowerCase();
    const intent = this.resolveIntent(haystack);
    const urgency = this.resolveUrgency(haystack, intent);
    const riskLevel = this.resolveRisk(intent, haystack);
    const founderAttentionRequired = intent === "executive_access_request" || intent === "legal_or_sensitive";
    const escalationRecommended =
      founderAttentionRequired || intent === "emergency_service_request" || urgency === "critical" || riskLevel === "high";

    return {
      intent,
      urgency,
      riskLevel,
      companyMode: "zbestmedia",
      escalationRecommended,
      founderAttentionRequired
    };
  }

  private resolveIntent(haystack: string): VoiceCallIntent {
    for (const rule of INTENT_RULES) {
      if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
        return rule.intent;
      }
    }
    if (haystack.includes("information") || haystack.includes("hours") || haystack.includes("location")) {
      return "general_information";
    }
    return "service_inquiry";
  }

  private resolveUrgency(haystack: string, intent: VoiceCallIntent): VoiceCallUrgency {
    if (intent === "emergency_service_request" || haystack.includes("asap") || haystack.includes("right now")) {
      return "critical";
    }
    if (intent === "executive_access_request" || intent === "legal_or_sensitive" || haystack.includes("today")) {
      return "high";
    }
    if (intent === "appointment_request" || intent === "sales_inquiry" || intent === "billing_question") {
      return "normal";
    }
    return "low";
  }

  private resolveRisk(intent: VoiceCallIntent, haystack: string): VoiceCallRiskLevel {
    if (intent === "legal_or_sensitive" || intent === "executive_access_request" || haystack.includes("threat")) {
      return "high";
    }
    if (intent === "billing_question" || intent === "emergency_service_request" || intent === "sales_inquiry") {
      return "moderate";
    }
    return "low";
  }
}
