import { AgentOrgService } from "../org/service.js";
import type { VoiceCallClassification, VoiceRoutingResolution, VoiceRoutingTarget } from "./types.js";

export class VoiceRoutingService {
  constructor(private readonly org = new AgentOrgService()) {}

  resolve(classification: VoiceCallClassification): VoiceRoutingResolution {
    switch (classification.intent) {
      case "sales_inquiry": {
        const lead = this.org.getLeadAgent("kobe");
        return {
          intent: classification.intent,
          target: {
            targetType: "lead_agent",
            executiveId: lead.reportsToExecutiveId,
            departmentId: lead.departmentId,
            leadAgentId: lead.leadAgentId,
            subAgentId: null,
            executionAgentId: lead.executionAgentId ?? null,
            requiresEscalation: classification.escalationRecommended
          },
          trace: ["sales inquiry routed to Kobe revenue/growth lane"]
        };
      }
      case "emergency_service_request":
      case "appointment_request":
      case "service_inquiry":
      case "existing_customer_followup":
      case "billing_question":
      case "general_information":
        return {
          intent: classification.intent,
          target: this.executiveLane("coo", "operations", classification.escalationRecommended),
          trace: [`${classification.intent} routed to operations executive lane`]
        };
      case "executive_access_request":
        return {
          intent: classification.intent,
          target: {
            targetType: "founder_review",
            executiveId: "coo",
            departmentId: "operations",
            leadAgentId: null,
            subAgentId: null,
            executionAgentId: null,
            requiresEscalation: true
          },
          trace: ["executive access request requires founder review through Aaliyah"]
        };
      case "legal_or_sensitive":
        return {
          intent: classification.intent,
          target: {
            targetType: "founder_review",
            executiveId: "cso",
            departmentId: "strategy-security-risk",
            leadAgentId: null,
            subAgentId: null,
            executionAgentId: null,
            requiresEscalation: true
          },
          trace: ["legal or sensitive intake escalated to founder review and security/risk lane"]
        };
      case "wrong_number_or_irrelevant":
        return {
          intent: classification.intent,
          target: {
            targetType: "suppressed",
            executiveId: null,
            departmentId: null,
            leadAgentId: null,
            subAgentId: null,
            executionAgentId: null,
            requiresEscalation: false
          },
          trace: ["wrong number or irrelevant intake safely suppressed"]
        };
    }
  }

  private executiveLane(executiveId: "coo", departmentId: "operations", requiresEscalation: boolean): VoiceRoutingTarget {
    return {
      targetType: "executive_lane",
      executiveId,
      departmentId,
      leadAgentId: null,
      subAgentId: null,
      executionAgentId: null,
      requiresEscalation
    };
  }
}
