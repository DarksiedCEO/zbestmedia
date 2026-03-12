import type { AgentExecutionLedgerService } from "../execution/ledger.js";
import type { AgentIncidentService } from "../incidents/service.js";
import {
  JINGLE_ROUTING_MODES,
  ROUTING_TASK_CATEGORIES,
  type RoutingRequest
} from "../org/routing-types.js";
import {
  JINGLE_MODE_TO_RESPONSIBILITY,
  ROUTING_CATEGORY_TO_RESPONSIBILITY,
  ROUTING_CATEGORY_TO_SIGNAL,
  AgentOrgRoutingService
} from "../org/routing.js";
import { AgentOrgService } from "../org/service.js";
import { validateOrgSystemIntegrity } from "../org/guards.js";
import type { AgentTelemetryService } from "../telemetry/service.js";

import type {
  AdminExecutionRecordList,
  AdminExecutionRunList,
  AdminIncidentList,
  AdminRoutingCategoryDescriptor,
  AdminSummary,
  AgentOrgIntegrityStatus
} from "./types.js";

export class AgentAdminService {
  constructor(
    private readonly org: AgentOrgService,
    private readonly routing: AgentOrgRoutingService,
    private readonly ledger: AgentExecutionLedgerService,
    private readonly incidents: AgentIncidentService,
    private readonly telemetry: AgentTelemetryService
  ) {}

  getIntegrityStatus(): AgentOrgIntegrityStatus {
    const validatedAt = new Date().toISOString();
    try {
      validateOrgSystemIntegrity();
      return {
        manifestVersion: this.org.getManifestVersion(),
        valid: true,
        validatedAt,
        error: null
      };
    } catch (error) {
      return {
        manifestVersion: this.org.getManifestVersion(),
        valid: false,
        validatedAt,
        error: error instanceof Error ? error.message : "unknown_integrity_error"
      };
    }
  }

  getSupportedRoutingCategories(): AdminRoutingCategoryDescriptor[] {
    return ROUTING_TASK_CATEGORIES.map((category) => ({
      category,
      responsibilityKey: ROUTING_CATEGORY_TO_RESPONSIBILITY[category],
      operationalSignalType: ROUTING_CATEGORY_TO_SIGNAL[category] ?? null,
      requiresDisambiguation: category === "jingle_music",
      supported: category === "jingle_music" || ROUTING_CATEGORY_TO_RESPONSIBILITY[category] !== null,
      supportedJingleModes: category === "jingle_music" ? [...JINGLE_ROUTING_MODES] : undefined
    }));
  }

  previewRoutingDecision(request: RoutingRequest) {
    return this.routing.resolve(request);
  }

  async listExecutionRecords(args: { tenantId: string; limit?: number }): Promise<AdminExecutionRecordList> {
    return {
      items: await this.ledger.listAssignmentRecords(args)
    };
  }

  async getExecutionRecord(args: { tenantId: string; assignmentRecordId: string }) {
    return this.ledger.getAssignmentRecord(args);
  }

  async listExecutionRuns(args: {
    tenantId: string;
    currentState?: Parameters<AgentExecutionLedgerService["listExecutionRunRecords"]>[0]["currentState"];
    limit?: number;
  }): Promise<AdminExecutionRunList> {
    return {
      items: await this.ledger.listExecutionRunRecords(args)
    };
  }

  async getExecutionRun(args: { tenantId: string; runRecordId: string }) {
    return this.ledger.getExecutionRunRecord(args);
  }

  async listIncidents(args: {
    tenantId: string;
    status?: Parameters<AgentIncidentService["listIncidents"]>[0]["status"];
    severity?: Parameters<AgentIncidentService["listIncidents"]>[0]["severity"];
    incidentType?: Parameters<AgentIncidentService["listIncidents"]>[0]["incidentType"];
    limit?: number;
  }): Promise<AdminIncidentList> {
    return {
      items: await this.incidents.listIncidents(args)
    };
  }

  async getIncident(args: { tenantId: string; incidentId: string }) {
    return this.incidents.getIncident(args);
  }

  async getControlPlaneSummary(args: { tenantId: string }): Promise<AdminSummary> {
    const generatedAt = new Date().toISOString();
    const [integrity, ops] = await Promise.all([
      Promise.resolve(this.getIntegrityStatus()),
      this.telemetry.getOpsStatusSummary({ tenantId: args.tenantId })
    ]);

    const openIncidentCount = Object.values(ops.incidents.openBySeverity).reduce((sum, count) => sum + count, 0);
    const recentExecutionFailureCount =
      (ops.executions.recentFailuresByCategory.execution_runtime_failure ?? 0) +
      (ops.executions.recentFailuresByCategory.policy_rejection ?? 0) +
      (ops.executions.recentFailuresByCategory.routing_failure ?? 0);

    return {
      manifestVersion: this.org.getManifestVersion(),
      generatedAt,
      integrity,
      ops,
      releaseBlockingIncidentCount: ops.incidents.releaseBlockingOpenCount,
      openIncidentCount,
      recentExecutionFailureCount,
      degradedSurfaces: ops.degradedSurfaces
    };
  }
}
