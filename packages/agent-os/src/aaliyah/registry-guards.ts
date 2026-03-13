import { ZodError } from "zod";

import { AALIYAH_ATOMIC_REGISTRY } from "./registry.js";
import {
  AaliyahAtomicRegistrySchema,
  type AaliyahAtomicAgentRecord,
  type AaliyahAtomicRegistry,
  type AaliyahAtomicTaskId
} from "./registry-types.js";

const BUNDLED_TASK_PATTERNS = [
  /,/, /\//, /&/, /;/,
  /\bthen\b/i,
  /\band\s+(perform|compose|dispatch|classify|score|resolve|assign|determine|decide|create|apply|validate|record|enforce|detect|choose)\b/i,
  /\bor\s+(perform|compose|dispatch|classify|score|resolve|assign|determine|decide|create|apply|validate|record|enforce|detect|choose)\b/i
];
let validatedRegistry: AaliyahAtomicRegistry | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[aaliyah-registry] ${message}`);
  }
}

function hasBundledTaskText(value: string): boolean {
  return BUNDLED_TASK_PATTERNS.some((pattern) => pattern.test(value));
}

function mapSchemaError(error: ZodError): never {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "unknown";
  if (path.endsWith("fallbackBehavior")) {
    throw new Error("[aaliyah-registry] missing fallback behavior");
  }
  if (path.endsWith("escalationTriggers")) {
    throw new Error("[aaliyah-registry] missing escalation triggers");
  }
  if (path.endsWith("forbiddenScope")) {
    throw new Error("[aaliyah-registry] missing forbidden scope");
  }
  if (path.endsWith("exactAtomicTask")) {
    throw new Error("[aaliyah-registry] missing exact atomic task");
  }
  throw new Error(`[aaliyah-registry] schema validation failed at ${path}`);
}

function validateRecord(record: AaliyahAtomicAgentRecord): void {
  assert(record.exactAtomicTask.trim().length > 0, `${record.agentId} is missing exactAtomicTask`);
  assert(!hasBundledTaskText(record.exactAtomicTask), `${record.agentId} has bundled or ambiguous task text`);
  assert(record.forbiddenScope.length > 0, `${record.agentId} is missing forbidden scope`);
  assert(record.escalationTriggers.length > 0, `${record.agentId} is missing escalation triggers`);
  assert(record.fallbackBehavior.trim().length > 0, `${record.agentId} is missing fallback behavior`);
  assert(record.companyVisibility.length > 0, `${record.agentId} is missing company visibility`);
  assert(record.modeVisibility.length > 0, `${record.agentId} is missing mode visibility`);
}

function validateUniqueTaskOwnership(items: readonly AaliyahAtomicAgentRecord[]): void {
  const taskOwners = new Map<AaliyahAtomicTaskId, string>();
  for (const item of items) {
    const currentOwner = taskOwners.get(item.exactAtomicTaskId);
    assert(!currentOwner, `duplicate atomic task ownership for ${item.exactAtomicTaskId}: ${currentOwner} and ${item.agentId}`);
    taskOwners.set(item.exactAtomicTaskId, item.agentId);
  }
}

function validateAaliyahRoot(items: readonly AaliyahAtomicAgentRecord[]): void {
  const aaliyah = items.find((item) => item.agentId === "aaliyah");
  assert(aaliyah, "registry is missing Aaliyah root agent");
  assert(
    aaliyah.exactAtomicTaskId === "executive_orchestration_founder_protection",
    "Aaliyah must own executive orchestration and founder protection only"
  );
  assert(
    aaliyah.forbiddenScope.includes("specialist execution"),
    "Aaliyah must explicitly forbid specialist execution"
  );
}

export function validateAaliyahAtomicRegistry(
  registry: AaliyahAtomicRegistry = AALIYAH_ATOMIC_REGISTRY
): AaliyahAtomicRegistry {
  let parsed: AaliyahAtomicRegistry;
  try {
    parsed = AaliyahAtomicRegistrySchema.parse(registry);
  } catch (error) {
    if (error instanceof ZodError) {
      mapSchemaError(error);
    }
    throw error;
  }

  const seenIds = new Set<string>();
  for (const item of parsed.items) {
    assert(!seenIds.has(item.agentId), `duplicate agent id ${item.agentId}`);
    seenIds.add(item.agentId);
  }

  for (const item of parsed.items) {
    validateRecord(item);
  }

  validateAaliyahRoot(parsed.items);
  validateUniqueTaskOwnership(parsed.items);
  return parsed;
}

export function ensureAaliyahAtomicRegistryIntegrity(): AaliyahAtomicRegistry {
  if (!validatedRegistry) {
    validatedRegistry = validateAaliyahAtomicRegistry();
  }
  return validatedRegistry;
}
