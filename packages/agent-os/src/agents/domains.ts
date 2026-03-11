import { z } from "zod";

export const AgentTaskDomainSchema = z.enum([
  "brand_identity_governance",
  "visual_identity_governance",
  "social_campaign_deployment",
  "lead_generation",
  "sdr_outreach",
  "voice_reception",
  "executive_assistance",
  "tax_strategy",
  "legal_compliance",
  "growth_intelligence",
  "revenue_optimization",
  "orchestration"
]);

export type AgentTaskDomain = z.infer<typeof AgentTaskDomainSchema>;

export const BRANDYN_TASK_DOMAIN: AgentTaskDomain = "brand_identity_governance";
export const JORDYN_TASK_DOMAIN: AgentTaskDomain = "visual_identity_governance";
export const KOBE_TASK_DOMAIN: AgentTaskDomain = "social_campaign_deployment";
export const ORACLE_TASK_DOMAIN: AgentTaskDomain = "growth_intelligence";
