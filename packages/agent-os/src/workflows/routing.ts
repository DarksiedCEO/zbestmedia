import type { AgentId } from "../agents/registry.js";

export const MAESTRO_DELEGATION_GRAPH: Record<AgentId, AgentId[]> = {
  brandyn: [],
  jordyn: [],
  kobe: [],
  oracle: [],
  titan: [],
  maestro: ["brandyn", "jordyn", "kobe", "oracle", "titan"]
};

export const AGENT_HANDOFFS: Record<Exclude<AgentId, "maestro">, AgentId[]> = {
  brandyn: ["jordyn"],
  jordyn: ["kobe"],
  kobe: ["oracle"],
  oracle: ["titan"],
  titan: []
};

export function canDelegateTo(sourceAgent: AgentId, targetAgent: AgentId): boolean {
  return MAESTRO_DELEGATION_GRAPH[sourceAgent]?.includes(targetAgent) ?? false;
}

export function canHandOffTo(sourceAgent: Exclude<AgentId, "maestro">, targetAgent: AgentId): boolean {
  return AGENT_HANDOFFS[sourceAgent].includes(targetAgent);
}

