import { ensureAaliyahAtomicRegistryIntegrity } from "./registry-guards.js";
import { AALIYAH_ATOMIC_REGISTRY } from "./registry.js";
import type { AaliyahAtomicAgentRecord, AaliyahAtomicAgentId, AaliyahAtomicTaskId } from "./registry-types.js";
import type { AaliyahRuntimeDecision, AaliyahRuntimeRequest } from "./runtime-types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[aaliyah-runtime] ${message}`);
  }
}

export class AaliyahRuntimeEnforcementService {
  private readonly itemsByAgentId = new Map<AaliyahAtomicAgentId, AaliyahAtomicAgentRecord>();
  private readonly itemsByTaskId = new Map<AaliyahAtomicTaskId, AaliyahAtomicAgentRecord>();

  constructor() {
    const registry = ensureAaliyahAtomicRegistryIntegrity();
    for (const item of registry.items) {
      this.itemsByAgentId.set(item.agentId, item);
      this.itemsByTaskId.set(item.exactAtomicTaskId, item);
    }
  }

  getSupportedAgentIds(): AaliyahAtomicAgentId[] {
    return [...this.itemsByAgentId.keys()];
  }

  evaluate(request: AaliyahRuntimeRequest): AaliyahRuntimeDecision {
    const requestedAgent = this.itemsByAgentId.get(request.requestedAgentId);
    assert(requestedAgent, `unknown runtime agent ${request.requestedAgentId}`);

    if (!requestedAgent.modeVisibility.includes(request.mode)) {
      return this.block(request, requestedAgent, "deny_due_to_mode_boundary", "requested mode is outside the agent visibility boundary");
    }

    if (!requestedAgent.companyVisibility.includes(request.company)) {
      return this.block(request, requestedAgent, "deny_due_to_mode_boundary", "requested company is outside the agent visibility boundary");
    }

    if (request.memoryRequest) {
      const invalidCompany = request.memoryRequest.companies.some((company) => !requestedAgent.companyVisibility.includes(company));
      const invalidMode = request.memoryRequest.modes.some((mode) => !requestedAgent.modeVisibility.includes(mode));
      if (invalidCompany || invalidMode) {
        return this.block(request, requestedAgent, "deny_due_to_mode_boundary", "requested memory access exceeds the agent memory boundary");
      }
    }

    if (request.requestedAgentId === "aaliyah" && request.principalContext !== "founder") {
      return this.block(request, requestedAgent, "deny_due_to_scope", "Aaliyah is founder-only and cannot operate outside founder context");
    }

    if (!request.requestedAtomicTaskId) {
      return this.block(request, requestedAgent, "escalate_for_clarification", "missing atomic task id prevents deterministic routing");
    }

    const resolvedOwner = this.itemsByTaskId.get(request.requestedAtomicTaskId);
    assert(resolvedOwner, `unknown atomic task ${request.requestedAtomicTaskId}`);

    if (request.confidence === "low") {
      return this.blockWithResolved(request, resolvedOwner, "defer_due_to_low_confidence", "confidence is too low to continue safely");
    }

    if (request.confidence === "medium" && resolvedOwner.agentId !== "aaliyah") {
      return this.blockWithResolved(request, resolvedOwner, "escalate_for_clarification", "medium-confidence specialist work requires escalation or explicit delegation");
    }

    if (request.approvalState === "required_missing" && resolvedOwner.approvalClass !== "orchestration_only") {
      return this.blockWithResolved(request, resolvedOwner, "escalate_for_clarification", "approval is required before this runtime action may proceed");
    }

    if (request.requestedAgentId === "aaliyah" && resolvedOwner.agentId !== "aaliyah") {
      return {
        allowed: false,
        fallbackOutcome: "delegate_to_specialist",
        resolvedAgentId: resolvedOwner.agentId,
        resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
        delegateToAgentId: resolvedOwner.agentId,
        trace: {
          requestedAgentId: request.requestedAgentId,
          requestedAtomicTaskId: request.requestedAtomicTaskId,
          resolvedAgentId: resolvedOwner.agentId,
          resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
          confidence: request.confidence,
          company: request.company,
          mode: request.mode,
          principalContext: request.principalContext,
          approvalState: request.approvalState,
          approvalClass: resolvedOwner.approvalClass,
          reason: "specialist-owned work must be delegated and cannot be absorbed by Aaliyah"
        }
      };
    }

    if (request.requestedAgentId !== resolvedOwner.agentId) {
      return this.blockWithResolved(request, resolvedOwner, "deny_due_to_scope", "requested agent does not own the atomic task");
    }

    if (resolvedOwner.forbiddenScope.some((scope) => scope.toLowerCase().includes("specialist execution")) && resolvedOwner.agentId !== "aaliyah") {
      return this.blockWithResolved(request, resolvedOwner, "deny_due_to_scope", "forbidden scope configuration is invalid for this specialist agent");
    }

    return {
      allowed: true,
      fallbackOutcome: "proceed_with_orchestration",
      resolvedAgentId: resolvedOwner.agentId,
      resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
      delegateToAgentId: null,
      trace: {
        requestedAgentId: request.requestedAgentId,
        requestedAtomicTaskId: request.requestedAtomicTaskId,
        resolvedAgentId: resolvedOwner.agentId,
        resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
        confidence: request.confidence,
        company: request.company,
        mode: request.mode,
        principalContext: request.principalContext,
        approvalState: request.approvalState,
        approvalClass: resolvedOwner.approvalClass,
        reason: "request is inside atomic scope and passed runtime safety checks"
      }
    };
  }

  private block(
    request: AaliyahRuntimeRequest,
    resolvedOwner: AaliyahAtomicAgentRecord,
    fallbackOutcome: AaliyahRuntimeDecision["fallbackOutcome"],
    reason: string
  ): AaliyahRuntimeDecision {
    return {
      allowed: false,
      fallbackOutcome,
      resolvedAgentId: resolvedOwner.agentId,
      resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
      delegateToAgentId: fallbackOutcome === "delegate_to_specialist" ? resolvedOwner.agentId : null,
      trace: {
        requestedAgentId: request.requestedAgentId,
        requestedAtomicTaskId: request.requestedAtomicTaskId ?? null,
        resolvedAgentId: resolvedOwner.agentId,
        resolvedAtomicTaskId: resolvedOwner.exactAtomicTaskId,
        confidence: request.confidence,
        company: request.company,
        mode: request.mode,
        principalContext: request.principalContext,
        approvalState: request.approvalState,
        approvalClass: resolvedOwner.approvalClass,
        reason
      }
    };
  }

  private blockWithResolved(
    request: AaliyahRuntimeRequest,
    resolvedOwner: AaliyahAtomicAgentRecord,
    fallbackOutcome: AaliyahRuntimeDecision["fallbackOutcome"],
    reason: string
  ): AaliyahRuntimeDecision {
    return this.block(request, resolvedOwner, fallbackOutcome, reason);
  }
}

export function evaluateAaliyahRuntimeRequest(request: AaliyahRuntimeRequest): AaliyahRuntimeDecision {
  return new AaliyahRuntimeEnforcementService().evaluate(request);
}

export function getAaliyahAtomicTaskOwner(taskId: AaliyahAtomicTaskId): AaliyahAtomicAgentRecord {
  const owner = AALIYAH_ATOMIC_REGISTRY.items.find((item) => item.exactAtomicTaskId === taskId);
  assert(owner, `unknown atomic task ${taskId}`);
  return owner;
}
