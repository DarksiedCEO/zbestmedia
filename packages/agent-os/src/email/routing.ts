import { AgentOrgRoutingService } from "../org/routing.js";
import { AgentOrgService } from "../org/service.js";
import type { RoutingDecision, RoutingTaskCategory } from "../org/routing-types.js";
import type { DepartmentId, ExecutiveId, LeadAgentId } from "../org/types.js";
import type { EmailIntentCategory, EmailRoutingResolution, EmailRoutingTarget } from "./types.js";

export type EmailIntentRouteDefinition = {
  intentCategory: EmailIntentCategory;
  routeMode: "org-routing" | "executive-lane" | "suppressed";
  routingCategory: RoutingTaskCategory | null;
  departmentId: DepartmentId | null;
  executiveId: ExecutiveId | null;
  leadAgentId: LeadAgentId | null;
  requiresEscalation: boolean;
  traceLabel: string;
};

export const EMAIL_INTENT_ROUTE_MAP: Record<EmailIntentCategory, EmailIntentRouteDefinition> = {
  lead_inquiry: {
    intentCategory: "lead_inquiry",
    routeMode: "org-routing",
    routingCategory: "campaign_growth",
    departmentId: "marketing",
    executiveId: "cmo",
    leadAgentId: "kobe",
    requiresEscalation: false,
    traceLabel: "lead_owner:kobe"
  },
  client_request: {
    intentCategory: "client_request",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "operations_triage:coo"
  },
  billing_question: {
    intentCategory: "billing_question",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: true,
    traceLabel: "billing_escalation:coo"
  },
  meeting_request: {
    intentCategory: "meeting_request",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "principal_access_control:coo"
  },
  vendor_outreach: {
    intentCategory: "vendor_outreach",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "vendor_triage:coo"
  },
  partnership_inquiry: {
    intentCategory: "partnership_inquiry",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "growth",
    executiveId: "cgo",
    leadAgentId: null,
    requiresEscalation: true,
    traceLabel: "partnership_review:cgo"
  },
  technical_issue: {
    intentCategory: "technical_issue",
    routeMode: "org-routing",
    routingCategory: "runtime_health_monitoring",
    departmentId: "technology-engineering",
    executiveId: "cto",
    leadAgentId: "code-sentinel",
    requiresEscalation: true,
    traceLabel: "technical_owner:code-sentinel"
  },
  support_request: {
    intentCategory: "support_request",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "support_triage:coo"
  },
  general_inquiry: {
    intentCategory: "general_inquiry",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "operations",
    executiveId: "coo",
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "general_triage:coo"
  },
  spam_or_irrelevant: {
    intentCategory: "spam_or_irrelevant",
    routeMode: "suppressed",
    routingCategory: null,
    departmentId: null,
    executiveId: null,
    leadAgentId: null,
    requiresEscalation: false,
    traceLabel: "suppress:spam"
  },
  legal_or_sensitive: {
    intentCategory: "legal_or_sensitive",
    routeMode: "executive-lane",
    routingCategory: null,
    departmentId: "strategy-security-risk",
    executiveId: "cso",
    leadAgentId: null,
    requiresEscalation: true,
    traceLabel: "sensitive_escalation:cso"
  }
};

export class EmailRoutingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class EmailRoutingService {
  constructor(
    private readonly org: AgentOrgService = new AgentOrgService(),
    private readonly routing: AgentOrgRoutingService = new AgentOrgRoutingService(org)
  ) {}

  resolveIntent(intentCategory: EmailIntentCategory): EmailRoutingResolution {
    const definition = EMAIL_INTENT_ROUTE_MAP[intentCategory];
    const trace = [`intent:${intentCategory}`, definition.traceLabel];

    if (definition.routeMode === "suppressed") {
      return {
        intentCategory,
        target: {
          targetType: "suppressed",
          departmentId: null,
          executiveId: null,
          leadAgentId: null,
          subAgentId: null,
          executionAgentId: null,
          requiresEscalation: false
        },
        routingDecision: null,
        trace
      };
    }

    if (definition.routeMode === "org-routing") {
      if (!definition.routingCategory || !definition.leadAgentId) {
        throw new EmailRoutingError(`invalid_email_route_definition:${intentCategory}`);
      }
      const routingDecision = this.routing.resolve({
        category: definition.routingCategory,
        requestedAgentId: definition.leadAgentId
      });
      trace.push(...routingDecision.trace);
      return {
        intentCategory,
        target: this.targetFromRoutingDecision(routingDecision, definition.requiresEscalation),
        routingDecision,
        trace
      };
    }

    if (!definition.departmentId || !definition.executiveId) {
      throw new EmailRoutingError(`invalid_email_route_definition:${intentCategory}`);
    }

    const department = this.org.getDepartment(definition.departmentId);
    const executive = this.org.getExecutive(definition.executiveId);
    trace.push(`resolved_department:${department.departmentId}`);
    trace.push(`resolved_executive:${executive.executiveId}`);

    return {
      intentCategory,
      target: {
        targetType: "executive_lane",
        departmentId: department.departmentId,
        executiveId: executive.executiveId,
        leadAgentId: null,
        subAgentId: null,
        executionAgentId: null,
        requiresEscalation: definition.requiresEscalation
      },
      routingDecision: null,
      trace
    };
  }

  private targetFromRoutingDecision(routingDecision: RoutingDecision, requiresEscalation: boolean): EmailRoutingTarget {
    return {
      targetType: "lead_agent",
      departmentId: routingDecision.resolvedDepartment,
      executiveId: routingDecision.resolvedExecutive,
      leadAgentId: routingDecision.resolvedLeadAgentId,
      subAgentId: routingDecision.resolvedSubAgentId,
      executionAgentId: routingDecision.executionAgentId,
      requiresEscalation
    };
  }
}
