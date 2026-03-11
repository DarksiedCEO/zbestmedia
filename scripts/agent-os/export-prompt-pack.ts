import fs from 'node:fs';
import path from 'node:path';

import {
  AGENT_DEFINITIONS,
  AGENT_EVAL_PROFILES,
  AGENT_HANDOFFS,
  AGENT_MEMORY_PARTITIONS,
  AGENT_POLICY_PROFILES,
  MAESTRO_DELEGATION_GRAPH,
  type AgentId
} from '../../packages/agent-os/src/index.js';

type PromptPackRecord = {
  agentId: AgentId;
  displayName: string;
  taskDomain: string;
  workflowRole: string;
  policyProfileId: string;
  memoryPartitionId: string;
  lifecycleProfileId: string;
  evalProfileId: string;
  allowedCapabilities: string[];
  deniedCapabilities: string[];
  ownedMemoryCollections: string[];
  sharedAccess: string[];
  evalMetrics: string[];
  handoffTargets: string[];
  delegationTargets: string[];
};

function buildPromptPack(): PromptPackRecord[] {
  return (Object.keys(AGENT_DEFINITIONS) as AgentId[]).map((agentId) => {
    const definition = AGENT_DEFINITIONS[agentId];
    const policy = AGENT_POLICY_PROFILES[agentId];
    const memory = AGENT_MEMORY_PARTITIONS[agentId];
    const evalProfile = AGENT_EVAL_PROFILES[agentId];
    return {
      agentId,
      displayName: definition.displayName,
      taskDomain: definition.taskDomain,
      workflowRole: definition.workflowRole,
      policyProfileId: definition.policyProfileId,
      memoryPartitionId: definition.memoryPartitionId,
      lifecycleProfileId: definition.lifecycleProfileId,
      evalProfileId: definition.evalProfileId,
      allowedCapabilities: [...policy.allowed],
      deniedCapabilities: [...policy.denied],
      ownedMemoryCollections: [...memory.ownedCollections],
      sharedAccess: [...memory.sharedAccess],
      evalMetrics: evalProfile.metrics.map((metric) => metric.metric),
      handoffTargets: agentId === 'maestro' ? [] : [...(AGENT_HANDOFFS[agentId as Exclude<AgentId, 'maestro'>] ?? [])],
      delegationTargets: [...(MAESTRO_DELEGATION_GRAPH[agentId] ?? [])]
    };
  });
}

async function main(): Promise<void> {
  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), 'output', 'agent-os', 'prompt-pack.json');
  const bundle = {
    generatedAt: new Date().toISOString(),
    agentCount: Object.keys(AGENT_DEFINITIONS).length,
    workflowOrder: ['brandyn', 'jordyn', 'kobe', 'oracle', 'titan'],
    orchestrator: 'maestro',
    prompts: buildPromptPack()
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  console.log(`[agent-os:prompt-pack:export] wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent-os:prompt-pack:export] ${message}`);
  process.exit(1);
});
