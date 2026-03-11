import fs from "node:fs";
import path from "node:path";

import { AGENT_MEMORY_PARTITIONS } from "../memory/partitions.js";
import { AGENT_POLICY_PROFILES } from "../policy/profiles.js";
import { getAgentDefinition, type AgentId } from "../agents/registry.js";
import { AGENT_EVAL_PROFILES } from "../evals/specs.js";
import { AGENT_HANDOFFS } from "../workflows/routing.js";

export type PromptAlignedExecutionOutput = {
  summary: string;
  actions: string[];
  risks: string[];
  approvalRequired: boolean;
  handoffTarget: AgentId | null;
  evidence: string[];
};

export type AgentPromptExecutionInput = {
  tenantId: string;
  agentId: AgentId;
  correlationId: string;
  payload: Record<string, unknown>;
};

export interface AgentPromptExecutor {
  execute(args: AgentPromptExecutionInput): Promise<PromptAlignedExecutionOutput>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function nextHandoffTarget(agentId: AgentId, payload: Record<string, unknown>): AgentId | null {
  if (agentId === "maestro") {
    const delegatedAgents = Array.isArray(payload.delegatedAgents)
      ? payload.delegatedAgents.filter((item): item is AgentId => typeof item === "string")
      : [];
    return delegatedAgents[0] ?? null;
  }

  const next = AGENT_HANDOFFS[agentId];
  return next?.[0] ?? null;
}

function summarizeObjective(payload: Record<string, unknown>) {
  if (typeof payload.objective === "string" && payload.objective.trim().length > 0) {
    return payload.objective.trim();
  }
  if (typeof payload.subjectSummary === "string" && payload.subjectSummary.trim().length > 0) {
    return payload.subjectSummary.trim();
  }
  return null;
}

export function buildDeterministicExecutionOutput(
  agentId: AgentId,
  payload: Record<string, unknown>
): PromptAlignedExecutionOutput {
  const definition = getAgentDefinition(agentId);
  const policy = AGENT_POLICY_PROFILES[agentId];
  const memory = AGENT_MEMORY_PARTITIONS[agentId];
  const evalProfile = AGENT_EVAL_PROFILES[agentId];
  const objective = summarizeObjective(payload);
  const actions = [
    objective
      ? `Execute ${definition.taskDomain} objective: ${objective}`
      : `Advance ${definition.displayName}'s ${definition.taskDomain} work within policy`,
    `Apply policy profile ${policy.profileId} without crossing denied capabilities`,
    `Use memory partition ${memory.partitionId} and preserve eval profile ${evalProfile.profileId}`
  ];

  const risks = [
    `Denied capabilities: ${policy.denied.join(", ")}`,
    `Prohibited domains: ${definition.prohibitedDomains.join(", ")}`
  ];

  const evidence = [
    `allowedCapabilities=${policy.allowed.join(", ")}`,
    `memoryCollections=${memory.ownedCollections.join(", ")}`,
    `evalMetrics=${evalProfile.metrics.map((metric) => metric.metric).join(", ")}`
  ];

  if (agentId === "maestro") {
    const delegatedAgents = asStringArray(payload.delegatedAgents);
    const routedWorkflow = typeof payload.routedWorkflow === "string" ? payload.routedWorkflow : "unknown_workflow";
    actions[0] = `Route workflow ${routedWorkflow} across delegated agents: ${delegatedAgents.join(" -> ") || "none"}`;
    evidence.push("delegationTargets=brandyn, jordyn, kobe, oracle, titan");
  }

  return {
    summary: `${definition.displayName} executed ${definition.taskDomain} as ${definition.workflowRole}.`,
    actions,
    risks,
    approvalRequired: false,
    handoffTarget: nextHandoffTarget(agentId, payload),
    evidence
  };
}

export class DeterministicAgentPromptExecutor implements AgentPromptExecutor {
  async execute(args: AgentPromptExecutionInput): Promise<PromptAlignedExecutionOutput> {
    return buildDeterministicExecutionOutput(args.agentId, args.payload);
  }
}

type OrcaAgentPromptExecutorConfig = {
  baseUrl: string;
  token: string;
  model: string;
  timeoutMs: number;
  promptRoot: string;
};

const PROMPT_FILES: Record<AgentId, string> = {
  brandyn: "brandyn.governance.v1.md",
  jordyn: "jordyn.visual.v1.md",
  kobe: "kobe.deployment.v1.md",
  oracle: "oracle.intelligence.v1.md",
  titan: "titan.revenue.v1.md",
  maestro: "maestro.orchestration.v1.md"
};

function validatePromptAlignedOutput(value: unknown): PromptAlignedExecutionOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ORCA agent execution returned non-object JSON");
  }
  const out = value as Record<string, unknown>;
  const actions = asStringArray(out.actions);
  const risks = asStringArray(out.risks);
  const evidence = asStringArray(out.evidence);
  const handoffTarget =
    typeof out.handoffTarget === "string"
      ? (out.handoffTarget as AgentId)
      : out.handoffTarget === null || out.handoffTarget === undefined
        ? null
        : (() => {
            throw new Error("ORCA agent execution returned invalid handoffTarget");
          })();
  if (typeof out.summary !== "string" || out.summary.trim().length === 0) {
    throw new Error("ORCA agent execution missing summary");
  }
  if (!Array.isArray(out.actions) || actions.length === 0) {
    throw new Error("ORCA agent execution missing actions");
  }
  if (!Array.isArray(out.risks) || !Array.isArray(out.evidence)) {
    throw new Error("ORCA agent execution missing risks or evidence");
  }
  if (typeof out.approvalRequired !== "boolean") {
    throw new Error("ORCA agent execution missing approvalRequired");
  }

  return {
    summary: out.summary,
    actions,
    risks,
    approvalRequired: out.approvalRequired,
    handoffTarget,
    evidence
  };
}

function buildPromptInput(agentId: AgentId, payload: Record<string, unknown>) {
  const definition = getAgentDefinition(agentId);
  const policy = AGENT_POLICY_PROFILES[agentId];
  const memory = AGENT_MEMORY_PARTITIONS[agentId];

  return {
    agentId,
    taskDomain: definition.taskDomain,
    objective: summarizeObjective(payload) ?? `Advance ${definition.displayName}'s ${definition.taskDomain} task`,
    context: asStringArray(payload.context),
    policyConstraints: [...policy.denied],
    memoryContext: [...memory.ownedCollections],
    handoffFrom: typeof payload.handoffFrom === "string" ? payload.handoffFrom : null,
    handoffTo: nextHandoffTarget(agentId, payload),
    approvalContext:
      typeof payload.customerFacing === "boolean" ||
      typeof payload.publicAssetChange === "boolean" ||
      typeof payload.publishNow === "boolean" ||
      typeof payload.pricingChange === "boolean"
        ? {
            required: Boolean(
              payload.customerFacing ?? payload.publicAssetChange ?? payload.publishNow ?? payload.pricingChange
            ),
            roles: Array.isArray(payload.requiredApprovers)
              ? payload.requiredApprovers.filter((item): item is string => typeof item === "string")
              : []
          }
        : undefined
  };
}

export class OrcaAgentPromptExecutor implements AgentPromptExecutor {
  constructor(private readonly config: OrcaAgentPromptExecutorConfig) {}

  async execute(args: AgentPromptExecutionInput): Promise<PromptAlignedExecutionOutput> {
    const promptPath = path.join(this.config.promptRoot, PROMPT_FILES[args.agentId]);
    const promptText = fs.readFileSync(promptPath, "utf8");
    const input = buildPromptInput(args.agentId, args.payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.token}`,
          "x-tenant-id": args.tenantId,
          "x-correlation-id": args.correlationId
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are Agent OS prompt execution runtime. Return JSON only."
            },
            {
              role: "user",
              content: promptText.replace("{{input_json}}", JSON.stringify(input))
            }
          ]
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`ORCA agent execution HTTP ${response.status}: ${raw.slice(0, 200)}`);
      }

      const envelope = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
      const content = envelope?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("ORCA agent execution missing choices[0].message.content");
      }

      return validatePromptAlignedOutput(JSON.parse(content));
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new Error("ORCA agent execution timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAgentPromptExecutorFromEnv(
  cwd: string = process.cwd()
): AgentPromptExecutor {
  const baseUrl = process.env.ORCA_ROUTER_URL?.trim();
  const token = process.env.ORCA_ROUTER_TOKEN?.trim();
  const model = process.env.ORCA_MODEL?.trim();
  const timeoutMs = Number(process.env.ORCA_TIMEOUT_MS ?? 20_000);

  if (baseUrl && token && model && Number.isFinite(timeoutMs) && timeoutMs >= 1000) {
    return new OrcaAgentPromptExecutor({
      baseUrl: baseUrl.replace(/\/+$/, ""),
      token,
      model,
      timeoutMs,
      promptRoot: path.resolve(cwd, "intelligence", "prompts", "agent-os")
    });
  }

  return new DeterministicAgentPromptExecutor();
}
