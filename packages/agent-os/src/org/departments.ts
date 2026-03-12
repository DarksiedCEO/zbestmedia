import type { DepartmentDefinition } from "./types.js";

export const DEPARTMENTS: Record<DepartmentDefinition["departmentId"], DepartmentDefinition> = {
  "revenue-sales": {
    departmentId: "revenue-sales",
    displayName: "Revenue / Sales",
    mission: "Convert demand into revenue with disciplined sales execution and offer accountability.",
    executiveOwnerId: "cro"
  },
  marketing: {
    departmentId: "marketing",
    displayName: "Marketing",
    mission: "Drive message distribution, campaign sequencing, and market-facing demand creation.",
    executiveOwnerId: "cmo"
  },
  "intelligence-research": {
    departmentId: "intelligence-research",
    displayName: "Intelligence / Research",
    mission: "Generate research-backed intelligence, signal interpretation, and decision support.",
    executiveOwnerId: "cio"
  },
  "creative-content": {
    departmentId: "creative-content",
    displayName: "Creative / Content",
    mission: "Produce and govern creative systems, content packaging, and expressive brand assets.",
    executiveOwnerId: "cco"
  },
  "technology-engineering": {
    departmentId: "technology-engineering",
    displayName: "Technology / Engineering",
    mission: "Build, secure, monitor, and sustain the production software platform.",
    executiveOwnerId: "cto"
  },
  product: {
    departmentId: "product",
    displayName: "Product",
    mission: "Define product priorities, user-facing outcomes, and roadmap execution standards.",
    executiveOwnerId: "cpo"
  },
  operations: {
    departmentId: "operations",
    displayName: "Operations",
    mission: "Maintain operational continuity, handoff discipline, and execution readiness.",
    executiveOwnerId: "coo"
  },
  growth: {
    departmentId: "growth",
    displayName: "Growth",
    mission: "Run controlled growth loops, experiments, and expansion initiatives with clear signal quality.",
    executiveOwnerId: "cgo"
  },
  "strategy-security-risk": {
    departmentId: "strategy-security-risk",
    displayName: "Strategy / Security / Risk",
    mission: "Govern strategic posture, security controls, and operational risk boundaries.",
    executiveOwnerId: "cso"
  }
};
