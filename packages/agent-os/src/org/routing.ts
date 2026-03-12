import { AgentOrgPolicyService } from "./policy.js";
import { AgentOrgService } from "./service.js";
import type { ResponsibilityKey, OperationalSignalType } from "./selectors.js";
import type { LeadAgentId, SubAgentId } from "./types.js";
import type { JingleRoutingMode, RoutingDecision, RoutingRequest, RoutingTaskCategory } from "./routing-types.js";

const CATEGORY_TO_RESPONSIBILITY: Record<RoutingTaskCategory, ResponsibilityKey | null> = {
  brand_identity: "brand_identity_governance",
  campaign_growth: "social_campaign_deployment",
  visual_design: "visual_identity_governance",
  jingle_music: null,
  build_integrity_monitoring: "build_breakage_detection",
  dependency_integrity_monitoring: "dependency_drift_detection",
  runtime_health_monitoring: "runtime_health_monitoring",
  migration_integrity_monitoring: "migration_integrity_monitoring",
  route_contract_monitoring: "route_contract_monitoring",
  slo_integrity_monitoring: "slo_release_gate_monitoring"
};

const CATEGORY_TO_SIGNAL: Partial<Record<RoutingTaskCategory, OperationalSignalType>> = {
  build_integrity_monitoring: "build_breakage",
  dependency_integrity_monitoring: "dependency_drift",
  runtime_health_monitoring: "runtime_health",
  migration_integrity_monitoring: "migration_integrity",
  route_contract_monitoring: "route_contract",
  slo_integrity_monitoring: "slo_release_gate"
};

const JINGLE_MODE_TO_RESPONSIBILITY: Record<JingleRoutingMode, ResponsibilityKey> = {
  composition: "sonic_brand_composition",
  packaging: "sonic_campaign_packaging"
};

export class AgentOrgRoutingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AgentOrgRoutingService {
  constructor(
    private readonly org: AgentOrgService = new AgentOrgService(),
    private readonly policy: AgentOrgPolicyService = new AgentOrgPolicyService(org)
  ) {}

  resolve(args: RoutingRequest): RoutingDecision {
    const trace = [`requested_category:${args.category}`];

    const responsibilityKey = this.resolveResponsibility(args, trace);
    const leadAgent = this.org.resolveResponsibilityOwner(responsibilityKey);
    if (!leadAgent) {
      throw new AgentOrgRoutingError(`unsupported_route:${args.category}`);
    }

    if (args.requestedAgentId) {
      trace.push(`requested_agent:${args.requestedAgentId}`);
      if (!this.matchesRequestedAgent(args.requestedAgentId, leadAgent.leadAgentId)) {
        throw new AgentOrgRoutingError(
          `route_owner_mismatch:${args.category}:${args.requestedAgentId}:${leadAgent.leadAgentId}`
        );
      }
    }

    this.policy.assertLeadAgentAssignment({
      leadAgentId: leadAgent.leadAgentId,
      departmentId: leadAgent.departmentId,
      responsibilityKey
    });
    trace.push(`policy_validated:${responsibilityKey}`);

    const signalType = CATEGORY_TO_SIGNAL[args.category] ?? null;
    let subAgentId: SubAgentId | null = null;
    if (signalType) {
      const ownership = this.org.resolveOperationalSignalOwner(signalType);
      this.policy.assertOperationalSignalOwnership({
        leadAgentId: ownership.leadAgent.leadAgentId,
        subAgentId: ownership.subAgent.subAgentId,
        signalType
      });
      subAgentId = ownership.subAgent.subAgentId;
      trace.push(`resolved_signal_owner:${signalType}:${subAgentId}`);
    }

    trace.push(`resolved_lead:${leadAgent.leadAgentId}`);

    return {
      requestedCategory: args.category,
      resolvedDepartment: leadAgent.departmentId,
      resolvedExecutive: leadAgent.reportsToExecutiveId,
      resolvedLeadAgentId: leadAgent.leadAgentId,
      resolvedSubAgentId: subAgentId,
      executionAgentId: leadAgent.executionAgentId ?? null,
      responsibilityKey,
      operationalSignalType: signalType,
      policyValidated: true,
      trace
    };
  }

  private resolveResponsibility(args: RoutingRequest, trace: string[]): ResponsibilityKey {
    if (args.category === "jingle_music") {
      if (!args.jingleMode) {
        throw new AgentOrgRoutingError("ambiguous_route:jingle_music");
      }
      trace.push(`jingle_mode:${args.jingleMode}`);
      return JINGLE_MODE_TO_RESPONSIBILITY[args.jingleMode];
    }

    const responsibilityKey = CATEGORY_TO_RESPONSIBILITY[args.category];
    if (!responsibilityKey) {
      throw new AgentOrgRoutingError(`unsupported_route:${args.category}`);
    }
    return responsibilityKey;
  }

  private matchesRequestedAgent(requestedAgentId: string, expectedLeadAgentId: LeadAgentId): boolean {
    if (this.org.isLeadAgentId(requestedAgentId)) {
      return requestedAgentId === expectedLeadAgentId;
    }
    if (this.org.isSubAgentId(requestedAgentId)) {
      return this.org.getSubAgent(requestedAgentId).parentLeadAgentId === expectedLeadAgentId;
    }
    const lead = this.org.getLeadAgent(expectedLeadAgentId);
    return lead.executionAgentId === requestedAgentId;
  }
}
