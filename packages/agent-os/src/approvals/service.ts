import type { AgentId } from "../agents/registry.js";
import type { AgentOsRepository } from "../persistence/repository.js";

export type ApprovalPolicyDecision = {
  required: boolean;
  requiredApprovers: string[];
  reason: string;
};

export type ApprovalWorkflowInput = {
  agentId: AgentId;
  subjectType: string;
  subjectId: string;
  actorId: string;
  payload: Record<string, unknown>;
};

function requiresTruthy(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

export function resolveApprovalPolicy(input: ApprovalWorkflowInput): ApprovalPolicyDecision {
  switch (input.agentId) {
    case "brandyn":
      if (requiresTruthy(input.payload, "customerFacing") || requiresTruthy(input.payload, "majorPositioningChange")) {
        return {
          required: true,
          requiredApprovers: ["founder", "brand-lead"],
          reason: "customer-facing or major positioning changes require dual approval"
        };
      }
      return {
        required: false,
        requiredApprovers: [],
        reason: "internal brand governance draft"
      };
    case "jordyn":
      if (requiresTruthy(input.payload, "publicAssetChange") || requiresTruthy(input.payload, "brandSystemChange")) {
        return {
          required: true,
          requiredApprovers: ["creative-lead"],
          reason: "public-facing visual changes require creative approval"
        };
      }
      return {
        required: false,
        requiredApprovers: [],
        reason: "internal design recommendation"
      };
    case "kobe":
      if (requiresTruthy(input.payload, "publishNow") || requiresTruthy(input.payload, "sensitiveRelease")) {
        return {
          required: true,
          requiredApprovers: ["campaign-manager", "compliance-lead"],
          reason: "live or sensitive campaign deployment requires approval"
        };
      }
      return {
        required: false,
        requiredApprovers: [],
        reason: "scheduled deployment from approved content package"
      };
    case "oracle":
      return {
        required: false,
        requiredApprovers: [],
        reason: "growth intelligence analysis remains advisory"
      };
  }
}

export class ApprovalWorkflowService {
  constructor(private readonly repository: AgentOsRepository) {}

  async ensureApproval(args: {
    tenantId: string;
    agentId: AgentId;
    subjectType: string;
    subjectId: string;
    actorId: string;
    payload: Record<string, unknown>;
    createdAt?: string;
  }): Promise<
    | { approvalRequired: false; reason: string }
    | {
        approvalRequired: true;
        reason: string;
        approvalRequestId: string;
        requiredApprovers: string[];
      }
  > {
    const decision = resolveApprovalPolicy({
      agentId: args.agentId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      actorId: args.actorId,
      payload: args.payload
    });

    if (!decision.required) {
      return { approvalRequired: false, reason: decision.reason };
    }

    const approval = await this.repository.createApprovalRequest({
      tenantId: args.tenantId,
      agentId: args.agentId,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      requestedBy: args.actorId,
      requiredApprovers: decision.requiredApprovers,
      payload: args.payload,
      createdAt: args.createdAt
    });

    return {
      approvalRequired: true,
      reason: decision.reason,
      approvalRequestId: approval.approvalRequestId,
      requiredApprovers: approval.requiredApprovers
    };
  }
}
