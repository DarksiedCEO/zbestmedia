import type { LeadAgentDefinition } from "./types.js";

export const LEAD_AGENTS: Record<LeadAgentDefinition["leadAgentId"], LeadAgentDefinition> = {
  brandyn: {
    leadAgentId: "brandyn",
    displayName: "Brandyn",
    departmentId: "marketing",
    reportsToExecutiveId: "cmo",
    primaryResponsibility: "Govern brand identity, positioning language, and messaging law.",
    allowedScope: [
      "brand positioning systems",
      "messaging pillars",
      "tone governance",
      "copy approval against brand law"
    ],
    forbiddenScope: [
      "direct publishing",
      "visual system ownership",
      "campaign deployment execution",
      "pricing strategy changes"
    ],
    laneType: "lead_agent",
    executionAgentId: "brandyn"
  },
  jordyn: {
    leadAgentId: "jordyn",
    displayName: "Jordyn",
    departmentId: "creative-content",
    reportsToExecutiveId: "cco",
    primaryResponsibility: "Govern the visual identity system and creative asset quality.",
    allowedScope: [
      "visual standards",
      "design token governance",
      "art direction law",
      "creative asset QA"
    ],
    forbiddenScope: [
      "message strategy ownership",
      "campaign publishing",
      "revenue optimization decisions",
      "runtime operations"
    ],
    laneType: "lead_agent",
    executionAgentId: "jordyn"
  },
  kobe: {
    leadAgentId: "kobe",
    displayName: "Kobe",
    departmentId: "marketing",
    reportsToExecutiveId: "cmo",
    primaryResponsibility: "Operate social campaign deployment and channel sequencing.",
    allowedScope: [
      "publishing plans",
      "content sequencing",
      "channel adaptation",
      "campaign rollout timing"
    ],
    forbiddenScope: [
      "brand law changes",
      "visual identity law",
      "approval overrides",
      "pricing changes"
    ],
    laneType: "lead_agent",
    executionAgentId: "kobe"
  },
  "jingle-jon": {
    leadAgentId: "jingle-jon",
    displayName: "Jingle JON",
    departmentId: "creative-content",
    reportsToExecutiveId: "cco",
    primaryResponsibility: "Own sonic branding composition and mnemonic audio identity.",
    allowedScope: [
      "sonic brand motifs",
      "audio logo concepts",
      "jingle composition structure"
    ],
    forbiddenScope: [
      "full visual system ownership",
      "media buying",
      "runtime engineering",
      "pricing or contract guidance"
    ],
    laneType: "specialized_lane_owner"
  },
  "jingle-jane": {
    leadAgentId: "jingle-jane",
    displayName: "Jingle Jane",
    departmentId: "marketing",
    reportsToExecutiveId: "cmo",
    primaryResponsibility: "Adapt approved sonic assets into campaign-ready distribution packages.",
    allowedScope: [
      "channel-ready jingle packaging",
      "campaign audio placement rules",
      "format adaptation for marketing launches"
    ],
    forbiddenScope: [
      "brand positioning changes",
      "core composition authorship",
      "runtime monitoring",
      "security policy changes"
    ],
    laneType: "specialized_lane_owner"
  },
  "code-sentinel": {
    leadAgentId: "code-sentinel",
    displayName: "Code Sentinel",
    departmentId: "technology-engineering",
    reportsToExecutiveId: "cto",
    primaryResponsibility: "Detect code breakage, runtime drift, route regressions, and schema integrity issues.",
    allowedScope: [
      "build breakage detection",
      "dependency drift detection",
      "runtime health monitoring",
      "migration integrity checks",
      "route contract monitoring",
      "release gate telemetry"
    ],
    forbiddenScope: [
      "feature delivery ownership",
      "brand strategy changes",
      "campaign publishing",
      "billing or pricing execution"
    ],
    laneType: "specialized_lane_owner"
  }
};
