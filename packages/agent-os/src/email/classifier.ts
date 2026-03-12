import {
  getEmailIntentPolicy,
  getPriorityForIntent,
  getRiskForIntent,
  requiresEscalationForIntent
} from "./intent.js";
import type { EmailThreadClassification, EmailIntentCategory, NormalizedEmailThread } from "./types.js";

const KEYWORD_RULES: Array<{ intentCategory: EmailIntentCategory; keywords: string[]; rationale: string }> = [
  {
    intentCategory: "legal_or_sensitive",
    keywords: ["contract", "agreement", "lawsuit", "legal", "attorney", "dispute", "refund", "chargeback"],
    rationale: "legal_or_sensitive_keywords"
  },
  {
    intentCategory: "technical_issue",
    keywords: ["outage", "down", "error", "bug", "broken", "api", "incident", "500", "login issue"],
    rationale: "technical_issue_keywords"
  },
  {
    intentCategory: "billing_question",
    keywords: ["invoice", "billing", "payment", "receipt", "paid", "subscription"],
    rationale: "billing_question_keywords"
  },
  {
    intentCategory: "meeting_request",
    keywords: ["meeting", "call", "calendar", "availability", "schedule", "reschedule"],
    rationale: "meeting_request_keywords"
  },
  {
    intentCategory: "partnership_inquiry",
    keywords: ["partnership", "collaboration", "collab", "joint venture", "affiliate"],
    rationale: "partnership_inquiry_keywords"
  },
  {
    intentCategory: "vendor_outreach",
    keywords: ["vendor", "procurement", "quote for services", "supplier", "proposal deck"],
    rationale: "vendor_outreach_keywords"
  },
  {
    intentCategory: "lead_inquiry",
    keywords: ["interested", "quote", "proposal", "help with marketing", "need branding", "looking for"],
    rationale: "lead_inquiry_keywords"
  },
  {
    intentCategory: "support_request",
    keywords: ["help", "support", "question about", "issue with", "can you assist"],
    rationale: "support_request_keywords"
  }
];

const SPAM_HINTS = ["casino", "crypto", "seo agency", "guest post", "backlink", "unsubscribe"];

export class EmailClassificationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailThreadClassifier {
  classifyThread(thread: NormalizedEmailThread): EmailThreadClassification {
    const latestMessage = thread.messages[thread.messages.length - 1];
    if (!latestMessage) {
      throw new EmailClassificationError(`empty_email_thread:${thread.providerThreadId}`);
    }

    const haystack = [thread.subject, latestMessage.subject, latestMessage.textBody, latestMessage.snippet]
      .join("\n")
      .toLowerCase();

    if (SPAM_HINTS.some((keyword) => haystack.includes(keyword))) {
      return this.buildClassification("spam_or_irrelevant", ["spam_signal_detected"]);
    }

    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
        return this.buildClassification(rule.intentCategory, [rule.rationale]);
      }
    }

    const externalSender = !latestMessage.from.domain.endsWith("zbestmedia.com");
    if (externalSender && haystack.includes("client")) {
      return this.buildClassification("client_request", ["external_sender_client_language"]);
    }

    return this.buildClassification("general_inquiry", ["default_general_inquiry"]);
  }

  private buildClassification(
    intentCategory: EmailIntentCategory,
    rationale: string[]
  ): EmailThreadClassification {
    return {
      intentCategory,
      priority: getPriorityForIntent(intentCategory),
      riskLevel: getRiskForIntent(intentCategory),
      approvalRequirement: getEmailIntentPolicy(intentCategory).approvalRequirement,
      escalationRequired: requiresEscalationForIntent(intentCategory),
      rationale
    };
  }
}
