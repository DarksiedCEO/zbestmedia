import type { AgentId } from "../agents/registry.js";

import { AgentOrgService } from "./service.js";
import {
  EXECUTION_AGENT_TO_LEAD_AGENT,
  type OperationalSignalType,
  type ResponsibilityKey
} from "./selectors.js";
import type { DepartmentId, LeadAgentId } from "./types.js";

export class AgentOrgPolicyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type OrgTaskAssignment = {
  leadAgentId: LeadAgentId;
  departmentId: DepartmentId;
  responsibilityKey: ResponsibilityKey;
};

export class AgentOrgPolicyService {
  constructor(private readonly org: AgentOrgService = new AgentOrgService()) {}

  assertLeadAgentAssignment(args: OrgTaskAssignment) {
    const leadAgent = this.org.getLeadAgent(args.leadAgentId);
    if (leadAgent.departmentId !== args.departmentId) {
      throw new AgentOrgPolicyError(
        `org_policy_department_mismatch:${args.leadAgentId}:${args.departmentId}`
      );
    }

    const owner = this.org.resolveResponsibilityOwner(args.responsibilityKey);
    if (!owner || owner.leadAgentId !== args.leadAgentId) {
      throw new AgentOrgPolicyError(
        `org_policy_responsibility_mismatch:${args.leadAgentId}:${args.responsibilityKey}`
      );
    }

    return leadAgent;
  }

  assertOperationalSignalOwnership(args: {
    leadAgentId: LeadAgentId;
    subAgentId: string;
    signalType: OperationalSignalType;
  }) {
    const owner = this.org.resolveOperationalSignalOwner(args.signalType);
    if (owner.leadAgent.leadAgentId !== args.leadAgentId || owner.subAgent.subAgentId !== args.subAgentId) {
      throw new AgentOrgPolicyError(
        `org_policy_signal_mismatch:${args.subAgentId}:${args.signalType}`
      );
    }

    return owner;
  }

  assertExecutionAgentResponsibility(args: {
    agentId: AgentId;
    subjectType: string;
    payload: Record<string, unknown>;
  }) {
    const leadAgentId = EXECUTION_AGENT_TO_LEAD_AGENT[args.agentId];
    if (!leadAgentId) {
      return null;
    }

    const responsibilityKey = this.resolveResponsibilityFromExecution(args);
    if (!responsibilityKey) {
      return this.org.getLeadAgent(leadAgentId);
    }

    return this.assertLeadAgentAssignment({
      leadAgentId,
      departmentId: this.org.getLeadAgent(leadAgentId).departmentId,
      responsibilityKey
    });
  }

  private resolveResponsibilityFromExecution(args: {
    agentId: AgentId;
    subjectType: string;
    payload: Record<string, unknown>;
  }): ResponsibilityKey | null {
    const explicit = args.payload.responsibilityKey;
    if (typeof explicit === "string") {
      const normalized = explicit.trim();
      if (normalized && this.isResponsibilityKey(normalized)) {
        return normalized;
      }
    }

    if (args.agentId === "brandyn" && (args.subjectType === "brand_smoke" || args.subjectType === "brand_identity_governance")) {
      return "brand_identity_governance";
    }
    if (args.agentId === "jordyn" && args.subjectType === "visual_identity_governance") {
      return "visual_identity_governance";
    }
    if (args.agentId === "kobe" && args.subjectType === "social_campaign_deployment") {
      return "social_campaign_deployment";
    }

    return null;
  }

  private isResponsibilityKey(value: string): value is ResponsibilityKey {
    return [
      "brand_identity_governance",
      "visual_identity_governance",
      "social_campaign_deployment",
      "sonic_brand_composition",
      "sonic_campaign_packaging",
      "build_breakage_detection",
      "dependency_drift_detection",
      "runtime_health_monitoring",
      "migration_integrity_monitoring",
      "route_contract_monitoring",
      "slo_release_gate_monitoring",
      "growth_intelligence",
      "revenue_optimization",
      "orchestration_workflow"
    ].includes(value);
  }
}
