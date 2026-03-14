export type VoiceCallIntent =
  | "emergency_service_request"
  | "appointment_request"
  | "service_inquiry"
  | "existing_customer_followup"
  | "billing_question"
  | "sales_inquiry"
  | "executive_access_request"
  | "general_information"
  | "wrong_number_or_irrelevant"
  | "legal_or_sensitive";

export type VoiceCallUrgency = "low" | "normal" | "high" | "critical";
export type VoiceCallRiskLevel = "low" | "moderate" | "high";
export type VoiceInterruptionClass = "interrupt_now" | "review_soon" | "can_wait";
export type VoiceCompanyMode = "founder" | "zbestmedia";
export type VoiceCallOutcome = "routed" | "escalated" | "suppressed";

export type InboundCaller = {
  phoneNumber: string;
  displayName: string | null;
  organizationName: string | null;
};

export type VoiceIntakePayload = {
  externalCallId?: string | null;
  sourceSystem: string;
  receivedAt?: string;
  caller: {
    phoneNumber: string;
    displayName?: string | null;
    organizationName?: string | null;
  };
  transcript: string;
  callSummary?: string | null;
  durationSeconds?: number | null;
};

export type NormalizedVoiceCall = {
  externalCallId: string | null;
  sourceSystem: string;
  receivedAt: string;
  caller: InboundCaller;
  transcript: string;
  callSummary: string | null;
  durationSeconds: number | null;
};

export type VoiceCallClassification = {
  intent: VoiceCallIntent;
  urgency: VoiceCallUrgency;
  riskLevel: VoiceCallRiskLevel;
  companyMode: VoiceCompanyMode;
  escalationRecommended: boolean;
  founderAttentionRequired: boolean;
};

export type VoiceRoutingTarget =
  | {
      targetType: "lead_agent";
      executiveId: string;
      departmentId: string;
      leadAgentId: string;
      subAgentId: string | null;
      executionAgentId: string | null;
      requiresEscalation: boolean;
    }
  | {
      targetType: "executive_lane";
      executiveId: string;
      departmentId: string;
      leadAgentId: null;
      subAgentId: null;
      executionAgentId: null;
      requiresEscalation: boolean;
    }
  | {
      targetType: "founder_review";
      executiveId: string | null;
      departmentId: string | null;
      leadAgentId: null;
      subAgentId: null;
      executionAgentId: null;
      requiresEscalation: true;
    }
  | {
      targetType: "suppressed";
      executiveId: null;
      departmentId: null;
      leadAgentId: null;
      subAgentId: null;
      executionAgentId: null;
      requiresEscalation: false;
    };

export type VoiceRoutingResolution = {
  intent: VoiceCallIntent;
  target: VoiceRoutingTarget;
  trace: string[];
};

export type VoiceCallSummary = {
  callerDisplay: string;
  intent: VoiceCallIntent;
  urgency: VoiceCallUrgency;
  riskLevel: VoiceCallRiskLevel;
  companyMode: VoiceCompanyMode;
  routingTarget: VoiceRoutingTarget;
  recommendedNextAction: string;
  founderAttentionRequired: boolean;
  interruptionClass: VoiceInterruptionClass;
};

export type VoiceCallRecord = {
  tenantId: string;
  callId: string;
  externalCallId: string | null;
  sourceSystem: string;
  callerPhoneNumber: string;
  callerDisplayName: string | null;
  callerOrganizationName: string | null;
  transcript: string;
  callSummaryText: string | null;
  durationSeconds: number | null;
  intent: VoiceCallIntent;
  urgency: VoiceCallUrgency;
  riskLevel: VoiceCallRiskLevel;
  companyMode: VoiceCompanyMode;
  routingTarget: VoiceRoutingTarget;
  assignmentRecordId: string | null;
  runRecordId: string | null;
  outcome: VoiceCallOutcome;
  founderAttentionRequired: boolean;
  escalationRecommended: boolean;
  interruptionClass: VoiceInterruptionClass;
  recommendedNextAction: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceProcessingResult = {
  call: VoiceCallRecord;
  summary: VoiceCallSummary;
};
