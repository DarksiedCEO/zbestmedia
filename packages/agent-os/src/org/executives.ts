import type { ExecutiveDefinition } from "./types.js";

export const EXECUTIVES: Record<ExecutiveDefinition["executiveId"], ExecutiveDefinition> = {
  "maestro-orchestrator": {
    executiveId: "maestro-orchestrator",
    title: "Maestro / Orchestrator",
    mission: "Own cross-agent routing law, executive coordination, and system-wide handoff integrity.",
    ownsDepartments: ["operations", "strategy-security-risk"],
    reportsTo: null
  },
  cro: {
    executiveId: "cro",
    title: "Chief Revenue Officer",
    mission: "Own revenue system performance, sales execution discipline, and monetization accountability.",
    ownsDepartments: ["revenue-sales"],
    reportsTo: "maestro-orchestrator"
  },
  cmo: {
    executiveId: "cmo",
    title: "Chief Marketing Officer",
    mission: "Own brand distribution, campaign deployment, and external market messaging coordination.",
    ownsDepartments: ["marketing", "creative-content"],
    reportsTo: "maestro-orchestrator"
  },
  cio: {
    executiveId: "cio",
    title: "Chief Intelligence Officer",
    mission: "Own research, insight synthesis, and intelligence quality across decision-making lanes.",
    ownsDepartments: ["intelligence-research"],
    reportsTo: "maestro-orchestrator"
  },
  cco: {
    executiveId: "cco",
    title: "Chief Creative Officer",
    mission: "Own creative system direction, content standards, and expressive consistency across surfaces.",
    ownsDepartments: ["creative-content"],
    reportsTo: "maestro-orchestrator"
  },
  cto: {
    executiveId: "cto",
    title: "Chief Technology Officer",
    mission: "Own engineering quality, runtime reliability, and system integrity for the production platform.",
    ownsDepartments: ["technology-engineering"],
    reportsTo: "maestro-orchestrator"
  },
  cpo: {
    executiveId: "cpo",
    title: "Chief Product Officer",
    mission: "Own product direction, product operating model, and feature accountability.",
    ownsDepartments: ["product"],
    reportsTo: "maestro-orchestrator"
  },
  coo: {
    executiveId: "coo",
    title: "Chief Operating Officer",
    mission: "Own operational reliability, service readiness, and execution throughput across the organization.",
    ownsDepartments: ["operations"],
    reportsTo: "maestro-orchestrator"
  },
  cgo: {
    executiveId: "cgo",
    title: "Chief Growth Officer",
    mission: "Own growth experimentation, compounding demand systems, and scalable acquisition leverage.",
    ownsDepartments: ["growth"],
    reportsTo: "maestro-orchestrator"
  },
  cso: {
    executiveId: "cso",
    title: "Chief Strategy and Security Officer",
    mission: "Own strategic risk, security posture, governance integrity, and high-impact decision guardrails.",
    ownsDepartments: ["strategy-security-risk"],
    reportsTo: "maestro-orchestrator"
  }
};
