import Fastify, { type FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { agentRoutes } from "../src/agents/routes";
import {
  IncidentDetailResponseSchema,
  IncidentListResponseSchema,
  EmailAccountDetailResponseSchema,
  EmailAccountListResponseSchema,
  EmailAccountProcessBatchResponseSchema,
  EmailAccountProcessSingleResponseSchema,
  EmailReviewActionResponseSchema,
  EmailReviewDetailResponseSchema,
  EmailReviewListResponseSchema,
  EmailDispatchDetailResponseSchema,
  EmailDispatchResultResponseSchema,
  GmailOauthCallbackResponseSchema,
  GmailOauthStartResponseSchema,
  CodeSentinelSignalDetailResponseSchema,
  CodeSentinelSignalListResponseSchema,
  DepartmentDetailResponseSchema,
  ExecutiveDetailResponseSchema,
  OpsCodeSentinelSummaryResponseSchema,
  OpsExecutionSummaryResponseSchema,
  OpsIncidentSummaryResponseSchema,
  OpsStatusSummaryResponseSchema,
  AdminIntegrityResponseSchema,
  AdminRoutingCategoriesResponseSchema,
  AdminRoutingPreviewResponseSchema,
  AdminSummaryResponseSchema,
  AaliyahBriefingResponseSchema,
  AaliyahCommandSurfaceResponseSchema,
  AaliyahConfidenceSummaryResponseSchema,
  AaliyahInterruptionsResponseSchema,
  AaliyahMemoryBoundaryResponseSchema,
  AaliyahPreferenceDetailResponseSchema,
  AaliyahPreferenceListResponseSchema,
  AaliyahQuickActionsResponseSchema,
  AaliyahRuntimeResponseSchema,
  VoiceIntakeResponseSchema,
  VoiceCallDetailResponseSchema,
  VoiceEscalationListResponseSchema,
  AdminExecutionRecordListResponseSchema,
  AdminExecutionRecordDetailResponseSchema,
  AdminExecutionRunListResponseSchema,
  AdminExecutionRunDetailResponseSchema,
  AdminIncidentListResponseSchema,
  AdminIncidentDetailResponseSchema,
  OperationalSignalOwnershipResponseSchema,
  OrgAgentDetailResponseSchema,
  OrgManifestResponseSchema,
  RoutingResolveResponseSchema,
  ReportingChainResponseSchema,
  ResponsibilityOwnershipResponseSchema
} from "../src/agents/schemas";
import { requestIdPlugin } from "../src/http/requestId";

describe("agent routes", () => {
  let app: ReturnType<typeof Fastify>;
  const repository = {
    provisionFoundation: vi.fn(async () => ({
      agents: [{ agentId: "brandyn" }, { agentId: "jordyn" }, { agentId: "kobe" }, { agentId: "oracle" }, { agentId: "titan" }, { agentId: "maestro" }]
    })),
    getAgent: vi.fn(async () => ({ agentId: "brandyn", currentVersionId: "brandyn:foundation-v1" })),
    listAgents: vi.fn(async () => [
      { agentId: "brandyn", taskDomain: "brand_identity_governance", currentStatus: "draft" },
      { agentId: "jordyn", taskDomain: "visual_identity_governance", currentStatus: "draft" },
      { agentId: "kobe", taskDomain: "social_campaign_deployment", currentStatus: "draft" },
      { agentId: "oracle", taskDomain: "growth_intelligence", currentStatus: "draft" },
      { agentId: "titan", taskDomain: "revenue_optimization", currentStatus: "draft" },
      { agentId: "maestro", taskDomain: "orchestration", currentStatus: "draft" }
    ]),
    listAgentVersions: vi.fn(async () => [{ agentVersionId: "brandyn:foundation-v1" }]),
    appendLifecycleEvent: vi.fn(async () => ({ lifecycleEventId: "lifecycle:brandyn", toStatus: "training" })),
    recordApprovalDecision: vi.fn(async () => ({ approvalDecisionId: "decision:1" })),
    listApprovalRequests: vi.fn(async () => [{ approvalRequestId: "approval:1", status: "PENDING" }]),
    getApprovalRequest: vi.fn(async () => ({
      request: { approvalRequestId: "approval:1", status: "PENDING" },
      decisions: []
    })),
    listExecutions: vi.fn(async () => [{ executionId: "execution:1", status: "QUEUED" }]),
    getExecution: vi.fn(async () => ({
      execution: { executionId: "execution:1", status: "QUEUED" },
      steps: []
    }))
  } as never;
  const executionService = {
    execute: vi.fn(async () => ({
      execution: { executionId: "execution:brandyn:subject-1", status: "COMPLETED" },
      approvalRequired: false,
      output: {
        summary: "Brandyn executed brand_identity_governance as brand_brain.",
        actions: ["Execute brand_identity_governance objective: define proof-led positioning"],
        risks: ["Denied capabilities: posting.direct_outbound"],
        approvalRequired: false,
        handoffTarget: "jordyn",
        evidence: ["allowedCapabilities=brand_rules.generate"]
      }
    }))
  } as never;
  const ledgerService = {
    listAssignmentRecords: vi.fn(async () => [
      { assignmentRecordId: "assignment:1", manifestVersion: "2026-03-12.v1", policyDecision: "approved" }
    ]),
    getAssignmentRecord: vi.fn(async () => ({
      assignmentRecordId: "assignment:1",
      manifestVersion: "2026-03-12.v1",
      policyDecision: "approved"
    })),
    listExecutionRunRecords: vi.fn(async () => [
      { runRecordId: "run:1", currentState: "succeeded", assignmentRecordId: "assignment:1" }
    ]),
    getExecutionRunRecord: vi.fn(async () => ({
      runRecordId: "run:1",
      currentState: "succeeded",
      assignmentRecordId: "assignment:1"
    }))
  } as never;
  const incidentService = {
    listIncidents: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        incidentId: "incident:1",
        incidentType: "route_contract_failure",
        severity: "critical",
        status: "open",
        owningExecutiveId: "cto",
        owningDepartmentId: "technology-engineering",
        owningLeadAgentId: "code-sentinel",
        owningSubAgentId: "route-contract-watcher",
        sourceSystem: "execution-smoke",
        relatedSignalType: "route_contract",
        relatedAssignmentRecordId: "assignment:1",
        relatedRunRecordId: "run:1",
        title: "Route contract failure",
        summary: "Brandyn route failed.",
        details: {},
        recommendedAction: "Restore expected API behavior.",
        releaseBlocking: true,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null
      }
    ]),
    getIncident: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:1",
      incidentType: "route_contract_failure",
      severity: "critical",
      status: "open",
      owningExecutiveId: "cto",
      owningDepartmentId: "technology-engineering",
      owningLeadAgentId: "code-sentinel",
      owningSubAgentId: "route-contract-watcher",
      sourceSystem: "execution-smoke",
      relatedSignalType: "route_contract",
      relatedAssignmentRecordId: "assignment:1",
      relatedRunRecordId: "run:1",
      title: "Route contract failure",
      summary: "Brandyn route failed.",
      details: {},
      recommendedAction: "Restore expected API behavior.",
      releaseBlocking: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null
    })),
    createFromOperationalSignal: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:created",
      incidentType: "route_contract_failure",
      severity: "critical",
      status: "open",
      owningExecutiveId: "cto",
      owningDepartmentId: "technology-engineering",
      owningLeadAgentId: "code-sentinel",
      owningSubAgentId: "route-contract-watcher",
      sourceSystem: "execution-smoke",
      relatedSignalType: "route_contract",
      relatedAssignmentRecordId: null,
      relatedRunRecordId: null,
      title: "Route contract failure",
      summary: "Route contract broken.",
      details: {},
      recommendedAction: "Restore expected API behavior.",
      releaseBlocking: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null
    })),
    acknowledgeIncident: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:1",
      incidentType: "route_contract_failure",
      severity: "critical",
      status: "acknowledged",
      owningExecutiveId: "cto",
      owningDepartmentId: "technology-engineering",
      owningLeadAgentId: "code-sentinel",
      owningSubAgentId: "route-contract-watcher",
      sourceSystem: "execution-smoke",
      relatedSignalType: "route_contract",
      relatedAssignmentRecordId: "assignment:1",
      relatedRunRecordId: "run:1",
      title: "Route contract failure",
      summary: "Brandyn route failed.",
      details: {},
      recommendedAction: "Restore expected API behavior.",
      releaseBlocking: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      acknowledgedAt: "2026-03-12T00:01:00.000Z",
      acknowledgedBy: "actor-1",
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null
    })),
    resolveIncident: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      incidentId: "incident:1",
      incidentType: "route_contract_failure",
      severity: "critical",
      status: "resolved",
      owningExecutiveId: "cto",
      owningDepartmentId: "technology-engineering",
      owningLeadAgentId: "code-sentinel",
      owningSubAgentId: "route-contract-watcher",
      sourceSystem: "execution-smoke",
      relatedSignalType: "route_contract",
      relatedAssignmentRecordId: "assignment:1",
      relatedRunRecordId: "run:1",
      title: "Route contract failure",
      summary: "Brandyn route failed.",
      details: {},
      recommendedAction: "Restore expected API behavior.",
      releaseBlocking: true,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:02:00.000Z",
      acknowledgedAt: "2026-03-12T00:01:00.000Z",
      acknowledgedBy: "actor-1",
      resolvedAt: "2026-03-12T00:02:00.000Z",
      resolvedBy: "actor-1",
      resolutionNote: "fixed"
    }))
  };
  const telemetryService = {
    getOpsStatusSummary: vi.fn(async () => ({
      status: "critical",
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-12T00:00:00.000Z",
      incidents: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-12T00:00:00.000Z",
        openBySeverity: { info: 0, warning: 1, critical: 1 },
        openByType: {
          build_integrity_failure: 0,
          dependency_integrity_failure: 0,
          runtime_health_failure: 0,
          migration_integrity_failure: 0,
          route_contract_failure: 1,
          slo_integrity_failure: 1,
          execution_policy_failure: 0,
          execution_runtime_failure: 0
        },
        releaseBlockingOpenCount: 1,
        degradedSurfaces: ["route_contracts", "slo"]
      },
      executions: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-12T00:00:00.000Z",
        recentByState: {
          requested: 0,
          validated: 0,
          routed: 0,
          blocked: 0,
          executing: 0,
          retriable: 0,
          succeeded: 1,
          failed: 1
        },
        recentFailuresByCategory: { routing_failure: 1 },
        routingFailureCount: 1,
        policyRejectionCount: 0
      },
      codeSentinel: {
        manifestVersion: "2026-03-12.v1",
        generatedAt: "2026-03-12T00:00:00.000Z",
        openIncidentCountBySubAgent: {
          "build-monitor": 0,
          "dependency-watcher": 0,
          "runtime-health-monitor": 0,
          "migration-guardian": 0,
          "route-contract-watcher": 1,
          "slo-enforcer": 1
        },
        openIncidentCountBySignal: {
          build_breakage: 0,
          dependency_drift: 0,
          runtime_health: 0,
          migration_integrity: 0,
          route_contract: 1,
          slo_release_gate: 1
        },
        mostImpactedSubAgent: "route-contract-watcher"
      },
      degradedSurfaces: ["route_contracts", "slo", "policy_routing"]
    })),
    getIncidentSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-12T00:00:00.000Z",
      openBySeverity: { info: 0, warning: 1, critical: 1 },
      openByType: {
        build_integrity_failure: 0,
        dependency_integrity_failure: 0,
        runtime_health_failure: 0,
        migration_integrity_failure: 0,
        route_contract_failure: 1,
        slo_integrity_failure: 1,
        execution_policy_failure: 0,
        execution_runtime_failure: 0
      },
      releaseBlockingOpenCount: 1,
      degradedSurfaces: ["route_contracts", "slo"]
    })),
    getExecutionSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-12T00:00:00.000Z",
      recentByState: {
        requested: 0,
        validated: 0,
        routed: 0,
        blocked: 0,
        executing: 0,
        retriable: 0,
        succeeded: 1,
        failed: 1
      },
      recentFailuresByCategory: { routing_failure: 1 },
      routingFailureCount: 1,
      policyRejectionCount: 0
    })),
    getCodeSentinelSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-12T00:00:00.000Z",
      openIncidentCountBySubAgent: {
        "build-monitor": 0,
        "dependency-watcher": 0,
        "runtime-health-monitor": 0,
        "migration-guardian": 0,
        "route-contract-watcher": 1,
        "slo-enforcer": 1
      },
      openIncidentCountBySignal: {
        build_breakage: 0,
        dependency_drift: 0,
        runtime_health: 0,
        migration_integrity: 0,
        route_contract: 1,
        slo_release_gate: 1
      },
      mostImpactedSubAgent: "route-contract-watcher"
    }))
  };
  const adminService = {
    getControlPlaneSummary: vi.fn(async () => ({
      manifestVersion: "2026-03-12.v1",
      generatedAt: "2026-03-12T00:00:00.000Z",
      integrity: {
        manifestVersion: "2026-03-12.v1",
        valid: true,
        validatedAt: "2026-03-12T00:00:00.000Z",
        error: null
      },
      ops: await telemetryService.getOpsStatusSummary(),
      releaseBlockingIncidentCount: 1,
      openIncidentCount: 2,
      recentExecutionFailureCount: 1,
      degradedSurfaces: ["route_contracts", "slo", "policy_routing"]
    })),
    getIntegrityStatus: vi.fn(() => ({
      manifestVersion: "2026-03-12.v1",
      valid: true,
      validatedAt: "2026-03-12T00:00:00.000Z",
      error: null
    })),
    getSupportedRoutingCategories: vi.fn(() => [
      {
        category: "brand_identity",
        responsibilityKey: "brand_identity_governance",
        operationalSignalType: null,
        requiresDisambiguation: false,
        supported: true
      },
      {
        category: "jingle_music",
        responsibilityKey: null,
        operationalSignalType: null,
        requiresDisambiguation: true,
        supported: true,
        supportedJingleModes: ["composition", "packaging"]
      }
    ]),
    previewRoutingDecision: vi.fn((input: unknown) => orgRoutingService.resolve(input as never)),
    listExecutionRecords: vi.fn(async () => ({
      items: [
        {
          assignmentRecordId: "assignment:1",
          manifestVersion: "2026-03-12.v1",
          policyDecision: "approved",
          tenantId: "11111111-1111-4111-8111-111111111111",
          correlationId: "corr-1",
          requestSource: "artifacts-api",
          requestedBy: "actor-1",
          requestedTaskCategory: "brand_identity",
          requestedResponsibilityKey: "brand_identity_governance",
          requestMetadata: {},
          requestedExecutionTarget: "brandyn",
          resolvedExecutiveId: "cmo",
          resolvedDepartmentId: "marketing",
          resolvedLeadAgentId: "brandyn",
          resolvedSubAgentId: null,
          executionAgentId: "brandyn",
          policyDecisionReason: "within scope",
          routingDecision: null,
          routingTrace: [],
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z"
        }
      ]
    })),
    getExecutionRecord: vi.fn(async () => ({
      assignmentRecordId: "assignment:1",
      manifestVersion: "2026-03-12.v1",
      policyDecision: "approved",
      tenantId: "11111111-1111-4111-8111-111111111111",
      correlationId: "corr-1",
      requestSource: "artifacts-api",
      requestedBy: "actor-1",
      requestedTaskCategory: "brand_identity",
      requestedResponsibilityKey: "brand_identity_governance",
      requestMetadata: {},
      requestedExecutionTarget: "brandyn",
      resolvedExecutiveId: "cmo",
      resolvedDepartmentId: "marketing",
      resolvedLeadAgentId: "brandyn",
      resolvedSubAgentId: null,
      executionAgentId: "brandyn",
      policyDecisionReason: "within scope",
      routingDecision: null,
      routingTrace: [],
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })),
    listExecutionRuns: vi.fn(async () => ({
      items: [
        {
          runRecordId: "run:1",
          assignmentRecordId: "assignment:1",
          executionId: "execution:1",
          currentState: "succeeded",
          tenantId: "11111111-1111-4111-8111-111111111111",
          requestedAt: "2026-03-12T00:00:00.000Z",
          validatedAt: "2026-03-12T00:00:01.000Z",
          routedAt: "2026-03-12T00:00:02.000Z",
          blockedAt: null,
          executionStartedAt: "2026-03-12T00:00:03.000Z",
          retriableAt: null,
          executionEndedAt: "2026-03-12T00:00:04.000Z",
          failureCategory: null,
          failureMessage: null,
          retryable: false,
          metadata: {},
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:04.000Z"
        }
      ]
    })),
    getExecutionRun: vi.fn(async () => ({
      runRecordId: "run:1",
      assignmentRecordId: "assignment:1",
      executionId: "execution:1",
      currentState: "succeeded",
      tenantId: "11111111-1111-4111-8111-111111111111",
      requestedAt: "2026-03-12T00:00:00.000Z",
      validatedAt: "2026-03-12T00:00:01.000Z",
      routedAt: "2026-03-12T00:00:02.000Z",
      blockedAt: null,
      executionStartedAt: "2026-03-12T00:00:03.000Z",
      retriableAt: null,
      executionEndedAt: "2026-03-12T00:00:04.000Z",
      failureCategory: null,
      failureMessage: null,
      retryable: false,
      metadata: {},
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:04.000Z"
    })),
    listIncidents: vi.fn(async () => ({
      items: await incidentService.listIncidents()
    })),
    getIncident: vi.fn(async () => incidentService.getIncident())
  };
  const memoryService = {
    readPartition: vi.fn(async () => [{ memoryEntryId: "memory:1" }]),
    writeOwnedEntry: vi.fn(async () => ({ memoryEntryId: "memory:1" })),
    writeSharedPolicyEntry: vi.fn(async () => ({ memoryEntryId: "memory:policy" }))
  } as never;
  const emailService = {
    listAccounts: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        accountId: "email-account:1",
        provider: "gmail",
        principalId: "principal-1",
        accountEmailAddress: "ops@zbestmedia.com",
        connectionStatus: "connected",
        grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        tokenReference: "secret:gmail:ops",
        externalAccountId: "gmail-user-1",
        draftOnlyMode: true,
        processingEnabled: true,
        processingMode: "poll",
        maxBatchThreads: 10,
        allowedLabelIds: ["INBOX", "UNREAD"],
        oauthState: null,
        oauthStateExpiresAt: null,
        lastProcessedAt: null,
        lastError: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]),
    getAccount: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: "email-account:1",
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      connectionStatus: "connected",
      grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      tokenReference: "secret:gmail:ops",
      externalAccountId: "gmail-user-1",
      draftOnlyMode: true,
      processingEnabled: true,
      processingMode: "poll",
      maxBatchThreads: 10,
      allowedLabelIds: ["INBOX", "UNREAD"],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })),
    beginGmailOAuthConnection: vi.fn(async () => ({
      account: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        accountId: "email-account:oauth",
        provider: "gmail",
        principalId: "principal-1",
        accountEmailAddress: "ops@zbestmedia.com",
        connectionStatus: "oauth_pending",
        grantedScopes: [],
        tokenReference: null,
        externalAccountId: null,
        draftOnlyMode: true,
        processingEnabled: false,
        processingMode: "poll",
        maxBatchThreads: 10,
        allowedLabelIds: ["INBOX", "UNREAD"],
        oauthState: "gmail-oauth:1",
        oauthStateExpiresAt: "2026-03-12T00:15:00.000Z",
        lastProcessedAt: null,
        lastError: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
      state: "gmail-oauth:1",
      redirectUri: "https://example.com/oauth/callback",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
    })),
    completeGmailOAuthConnection: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      accountId: "email-account:oauth",
      provider: "gmail",
      principalId: "principal-1",
      accountEmailAddress: "ops@zbestmedia.com",
      connectionStatus: "connected",
      grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      tokenReference: "secret:gmail:ops",
      externalAccountId: "gmail-user-1",
      draftOnlyMode: true,
      processingEnabled: false,
      processingMode: "poll",
      maxBatchThreads: 10,
      allowedLabelIds: ["INBOX", "UNREAD"],
      oauthState: null,
      oauthStateExpiresAt: null,
      lastProcessedAt: null,
      lastError: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z"
    })),
    processEligibleInboxThreads: vi.fn(async () => ({
      account: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        accountId: "email-account:1",
        provider: "gmail",
        principalId: "principal-1",
        accountEmailAddress: "ops@zbestmedia.com",
        connectionStatus: "connected",
        grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        tokenReference: "secret:gmail:ops",
        externalAccountId: "gmail-user-1",
        draftOnlyMode: true,
        processingEnabled: true,
        processingMode: "poll",
        maxBatchThreads: 10,
        allowedLabelIds: ["INBOX", "UNREAD"],
        oauthState: null,
        oauthStateExpiresAt: null,
        lastProcessedAt: "2026-03-12T00:05:00.000Z",
        lastError: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:05:00.000Z"
      },
      processedCount: 1,
      nextPageToken: null,
      outcomes: [
        {
          threadId: "thread-1",
          assignmentRecordId: "assignment:email:1",
          runRecordId: "run:email:1",
          status: "drafted",
          intentCategory: "lead_inquiry",
          approvalRequired: true,
          blockedAutoSend: true,
          reviewItemId: "email-review:1"
        }
      ]
    })),
    processAccountThreadById: vi.fn(async () => ({
      account: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        accountId: "email-account:1",
        provider: "gmail",
        principalId: "principal-1",
        accountEmailAddress: "ops@zbestmedia.com",
        connectionStatus: "connected",
        grantedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        tokenReference: "secret:gmail:ops",
        externalAccountId: "gmail-user-1",
        draftOnlyMode: true,
        processingEnabled: true,
        processingMode: "poll",
        maxBatchThreads: 10,
        allowedLabelIds: ["INBOX", "UNREAD"],
        oauthState: null,
        oauthStateExpiresAt: null,
        lastProcessedAt: "2026-03-12T00:05:00.000Z",
        lastError: null,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:05:00.000Z"
      },
      outcome: {
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        status: "drafted",
        intentCategory: "lead_inquiry",
        approvalRequired: true,
        blockedAutoSend: true,
        reviewItemId: "email-review:1"
      }
    })),
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "summary",
        proposedReplySubject: "Re: Need help with marketing strategy",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ]),
    getReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    approveReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "approved",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "rejected",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "revision_requested",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "needs revision"
    })),
    dispatchApprovedReviewItem: vi.fn(async () => ({
      sent: true,
      dispatch: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        dispatchId: "email-dispatch:1",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        dispatchStatus: "dispatch_succeeded",
        dispatchPolicy: {
          allowed: true,
          reason: "email_dispatch_policy_approved",
          hardBlocked: false
        },
        requestedAt: "2026-03-12T00:02:00.000Z",
        dispatchedAt: "2026-03-12T00:02:00.000Z",
        failureCategory: null,
        failureMessage: null,
        gmailMessageId: "gmail-message-1",
        gmailThreadId: "thread-1",
        auditMetadata: { actorId: "actor-1" },
        createdAt: "2026-03-12T00:02:00.000Z",
        updatedAt: "2026-03-12T00:02:00.000Z"
      }
    })),
    getDispatchRecord: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      dispatchId: "email-dispatch:1",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      dispatchStatus: "dispatch_succeeded",
      dispatchPolicy: {
        allowed: true,
        reason: "email_dispatch_policy_approved",
        hardBlocked: false
      },
      requestedAt: "2026-03-12T00:02:00.000Z",
      dispatchedAt: "2026-03-12T00:02:00.000Z",
      failureCategory: null,
      failureMessage: null,
      gmailMessageId: "gmail-message-1",
      gmailThreadId: "thread-1",
      auditMetadata: { actorId: "actor-1" },
      createdAt: "2026-03-12T00:02:00.000Z",
      updatedAt: "2026-03-12T00:02:00.000Z"
    }))
  } as never;
  const evalRunner = {
    runSuite: vi.fn(async () => ({ passed: true, missingMetrics: [], evalRun: { evalRunId: "eval:1" }, scores: [] }))
  } as never;
  const workflow = {
    advance: vi.fn(async () => ({
      completedSteps: ["brandyn_direction_approved"],
      remainingSteps: ["jordyn_visual_alignment_approved"],
      execution: {
        execution: { executionId: "execution:brandyn:campaign-1", status: "COMPLETED" },
        approvalRequired: false,
        output: {
          summary: "Brandyn executed brand_identity_governance as brand_brain.",
          actions: ["Execute brand_identity_governance objective: define proof-led positioning"],
          risks: [],
          approvalRequired: false,
          handoffTarget: "jordyn",
          evidence: ["allowedCapabilities=brand_rules.generate"]
        }
      },
      evalResult: null
    })),
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "summary",
        proposedReplySubject: "Re: Need help with marketing strategy",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ]),
    getReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    approveReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "approved",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "rejected",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "revision_requested",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "needs revision"
    }))
  } as never;
  const versionService = {
    createVersion: vi.fn(async () => ({ agentVersionId: "brandyn:foundation-v2" })),
    promoteVersion: vi.fn(async () => ({
      promotedVersion: { agentVersionId: "brandyn:foundation-v2" },
      previousVersionId: "brandyn:foundation-v1"
    })),
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "summary",
        proposedReplySubject: "Re: Need help with marketing strategy",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ]),
    getReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    approveReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "approved",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "rejected",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "revision_requested",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "needs revision"
    }))
  } as never;
  const workerService = {
    claimExecutionJobs: vi.fn(async () => [{ executionId: "execution:1", status: "RUNNING" }]),
    queueEvalJob: vi.fn(async () => ({ evalRunId: "eval:1", status: "PENDING" })),
    claimEvalJobs: vi.fn(async () => [{ evalRunId: "eval:1", status: "RUNNING" }])
  } as never;
  const orchestrationService = {
    createDelegatedPlan: vi.fn(async () => ({
      workflow: "brand_pipeline",
      delegatedAgents: ["brandyn", "jordyn", "kobe", "oracle", "titan"],
      handoffPlan: [
        { fromAgent: "brandyn", toAgent: "jordyn" },
        { fromAgent: "jordyn", toAgent: "kobe" },
        { fromAgent: "kobe", toAgent: "oracle" },
        { fromAgent: "oracle", toAgent: "titan" }
      ],
      execution: {
        execution: { executionId: "execution:maestro:campaign-2", status: "COMPLETED" },
        approvalRequired: false,
        output: {
          summary: "Maestro executed orchestration as orchestrator.",
          actions: ["Route workflow brand_pipeline across delegated agents: brandyn -> jordyn -> kobe -> oracle -> titan"],
          risks: [],
          approvalRequired: false,
          handoffTarget: "brandyn",
          evidence: ["delegationTargets=brandyn, jordyn, kobe, oracle, titan"]
        }
      }
    })),
    listWorkflowExecutions: vi.fn(async () => [
      { executionId: "execution:maestro:campaign-2", agentId: "maestro", status: "COMPLETED", deadLetteredAt: null }
    ]),
    getWorkflowExecution: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-2", agentId: "maestro", status: "COMPLETED" },
      steps: [{ stepName: "handoff_planned:brandyn->jordyn" }]
    })),
    buildReplayBundle: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-2", agentId: "maestro", status: "COMPLETED" },
      replay: { workflow: "brand_pipeline", delegatedAgents: ["brandyn", "jordyn", "kobe", "oracle", "titan"] },
      handoffs: [{ stepName: "handoff_planned:brandyn->jordyn" }],
      auditTrail: [{ stepName: "handoff_planned:brandyn->jordyn" }]
    })),
    exportSignedReplayBundle: vi.fn(async () => ({
      exportRecord: {
        exportId: "bundle-export:1",
        executionId: "execution:maestro:campaign-2",
        exportedBy: "actor-1"
      },
      bundle: {
        execution: { executionId: "execution:maestro:campaign-2", agentId: "maestro", status: "COMPLETED" }
      },
      signature: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    })),
    listReplayBundleExports: vi.fn(async () => [
      {
        exportId: "bundle-export:1",
        executionId: "execution:maestro:campaign-2",
        exportedBy: "actor-1",
        payloadHash: "abc123",
        signature: "sig456",
        sealedAt: "2026-03-11T00:00:00.000Z"
      }
    ]),
    verifyReplayBundleHistory: vi.fn(async () => ({
      verified: true,
      matchedExport: {
        exportId: "bundle-export:1",
        executionId: "execution:maestro:campaign-2"
      },
      verification: {
        verified: true,
        payloadHashMatches: true,
        signatureMatches: true,
        expectedPayloadHash: "abc123",
        expectedSignature: "sig456",
        trustChain: {
          algorithm: "hmac-sha256",
          artifactId: "execution:maestro:campaign-2",
          sealedAt: "2026-03-11T00:00:00.000Z",
          payloadHash: "abc123"
        }
      },
      exportCount: 1
    })),
    getHandoffAudit: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-2", status: "COMPLETED" },
      handoffs: [{ stepName: "handoff_planned:brandyn->jordyn" }]
    })),
    buildApprovalSlaReport: vi.fn(async () => ({
      olderThanMinutes: 30,
      totals: { pending: 1, stale: 0, escalated: 0 },
      byAgent: { maestro: { pending: 1, stale: 0, escalated: 0 } },
      policies: { maestro: { staleAfterMinutes: 45, maxEscalations: 3 } }
    })),
    getDiagnostics: vi.fn(async () => ({
      executions: {
        total: 1,
        deadLettered: 0,
        queuedRetries: 0,
        pendingApproval: 0,
        byStatus: { COMPLETED: 1 }
      },
      approvalSla: {
        olderThanMinutes: 30,
        totals: { pending: 1, stale: 0, escalated: 0 },
        byAgent: { maestro: { pending: 1, stale: 0, escalated: 0 } },
        policies: { maestro: { staleAfterMinutes: 45, maxEscalations: 3 } }
      }
    })),
    exportDiagnosticsSnapshot: vi.fn(async () => ({
      exportRecord: {
        exportId: "ops-export:diagnostics:1",
        snapshotType: "diagnostics",
        exportedBy: "actor-1"
      },
      snapshot: {
        executions: { total: 1 }
      },
      signature: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    })),
    getOperationsInventory: vi.fn(async () => ({
      deadLettered: [
        {
          executionId: "execution:maestro:dead-1",
          status: "FAILED",
          failureClass: "TRANSIENT_RUNTIME_ERROR",
          retryCount: 3,
          deadLetteredAt: "2026-03-11T00:10:00.000Z"
        }
      ],
      retryQueue: [
        {
          executionId: "execution:maestro:retry-1",
          status: "QUEUED",
          retryCount: 2,
          nextRetryAt: "2026-03-11T00:15:00.000Z",
          maxRetries: 3
        }
      ]
    })),
    exportInventorySnapshot: vi.fn(async () => ({
      exportRecord: {
        exportId: "ops-export:inventory:1",
        snapshotType: "inventory",
        exportedBy: "actor-1"
      },
      snapshot: {
        deadLettered: [],
        retryQueue: []
      },
      signature: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    })),
    getWorkerHealth: vi.fn(async () => ({
      totalWorkers: 1,
      items: [
        {
          workerId: "worker-daemon:1",
          workerKind: "agent-os",
          agentId: "maestro",
          status: "idle",
          observedAt: "2026-03-11T00:00:00.000Z"
        }
      ]
    })),
    getWorkerSloSummary: vi.fn(async () => ({
      staleAfterMinutes: 15,
      totalWorkers: 1,
      healthyWorkers: 1,
      staleWorkers: 0,
      freshnessCoverage: 1,
      status: "healthy",
      items: []
    })),
    getWorkerFreshnessReport: vi.fn(async () => ({
      staleAfterMinutes: 15,
      totalWorkers: 1,
      staleWorkers: 0,
      items: [
        {
          workerId: "worker-daemon:1",
          workerKind: "agent-os",
          agentId: "maestro",
          status: "idle",
          observedAt: "2026-03-11T00:00:00.000Z",
          ageMinutes: 5,
          stale: false
        }
      ]
    })),
    exportWorkerFreshnessSnapshot: vi.fn(async () => ({
      exportRecord: {
        exportId: "ops-export:worker-freshness:1",
        snapshotType: "worker_freshness",
        exportedBy: "actor-1"
      },
      snapshot: {
        staleAfterMinutes: 15,
        totalWorkers: 1,
        staleWorkers: 0,
        items: []
      },
      signature: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    })),
    getAlerts: vi.fn(async () => ({
      alerts: [
        {
          code: "dead_letter_backlog",
          severity: "warning",
          message: "Dead-lettered orchestration executions require operator review.",
          metrics: { deadLettered: 1 }
        }
      ],
      diagnostics: {
        executions: {
          total: 1,
          deadLettered: 1,
          queuedRetries: 0,
          pendingApproval: 0,
          byStatus: { FAILED: 1 },
          byFailureClass: { TRANSIENT_RUNTIME_ERROR: 1 }
        }
      }
    })),
    exportAlertsSnapshot: vi.fn(async () => ({
      exportRecord: {
        exportId: "ops-export:alerts:1",
        snapshotType: "alerts",
        exportedBy: "actor-1"
      },
      snapshot: {
        alerts: [
          {
            code: "dead_letter_backlog",
            severity: "warning"
          }
        ]
      },
      signature: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    })),
    listOpsSnapshotExports: vi.fn(async ({ snapshotType }: { snapshotType: string }) => [
      {
        exportId: `ops-export:${snapshotType}:1`,
        snapshotType,
        exportedBy: "actor-1",
        payloadHash: "abc123",
        signature: "sig456",
        sealedAt: "2026-03-11T00:00:00.000Z"
      }
    ]),
    verifyOpsSnapshotHistory: vi.fn(async () => ({
      verified: true,
      matchedExport: {
        exportId: "ops-export:1"
      },
      verification: {
        verified: true,
        payloadHashMatches: true,
        signatureMatches: true,
        expectedPayloadHash: "abc123",
        expectedSignature: "sig456",
        trustChain: {
          algorithm: "hmac-sha256",
          artifactId: "ops:worker-freshness",
          sealedAt: "2026-03-11T00:00:00.000Z",
          payloadHash: "abc123"
        }
      },
      exportCount: 1
    })),
    acknowledgeAlert: vi.fn(async () => ({
      alertAckId: "alert-ack:1",
      alertCode: "dead_letter_backlog",
      acknowledgedBy: "actor-1",
      reason: "triaged",
      createdAt: "2026-03-11T00:20:00.000Z"
    })),
    listAlertAcknowledgements: vi.fn(async () => [
      {
        alertAckId: "alert-ack:1",
        alertCode: "dead_letter_backlog",
        acknowledgedBy: "actor-1",
        reason: "triaged",
        createdAt: "2026-03-11T00:20:00.000Z",
        reopenedAt: null,
        reopenedBy: null,
        reopenReason: null
      }
    ]),
    getAlertAcknowledgementStatus: vi.fn(async () => ({
      alertCode: "dead_letter_backlog",
      acknowledged: true,
      expired: false,
      reopened: false,
      latestAck: {
        alertAckId: "alert-ack:1",
        alertCode: "dead_letter_backlog",
        acknowledgedBy: "actor-1",
        reason: "triaged",
        createdAt: "2026-03-11T00:20:00.000Z",
        reopenedAt: null,
        reopenedBy: null,
        reopenReason: null
      }
    })),
    escalateApprovals: vi.fn(async () => [{ approvalRequestId: "approval:escalated", status: "PENDING" }]),
    reopenAlert: vi.fn(async () => ({
      alertAckId: "alert-ack:1",
      alertCode: "dead_letter_backlog",
      acknowledgedBy: "actor-1",
      reason: "triaged",
      createdAt: "2026-03-11T00:20:00.000Z",
      reopenedAt: "2026-03-11T00:40:00.000Z",
      reopenedBy: "actor-1",
      reopenReason: "backlog persists"
    })),
    requestDeadLetterReplayApproval: vi.fn(async () => ({
      approvalRequestId: "approval:replay:1",
      status: "PENDING"
    })),
    requeueDeadLetteredExecution: vi.fn(async () => ({
      executionId: "execution:maestro:campaign-2",
      agentId: "maestro",
      status: "QUEUED",
      deadLetteredAt: null
    })),
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "summary",
        proposedReplySubject: "Re: Need help with marketing strategy",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ]),
    getReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    approveReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "approved",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "rejected",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "revision_requested",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "needs revision"
    }))
  } as never;
  const approvalEscalationService = {
    escalateStaleRequests: vi.fn(async () => [{ approvalRequestId: "approval:escalated", status: "PENDING" }])
  } as never;
  const runtimeService = {
    processExecutionJobs: vi.fn(async () => ({
      completed: [{ executionId: "execution:maestro:queued", status: "COMPLETED" }],
      retried: [],
      deadLettered: []
    })),
    listReviewItems: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        reviewItemId: "email-review:1",
        draftId: "draft:1",
        accountId: "email-account:1",
        threadId: "thread-1",
        assignmentRecordId: "assignment:email:1",
        runRecordId: "run:email:1",
        intentCategory: "lead_inquiry",
        priority: "high",
        riskLevel: "medium",
        requiredApproval: true,
        reviewStatus: "pending_review",
        recommendedExecutiveId: "cmo",
        recommendedDepartmentId: "marketing",
        recommendedLeadAgentId: "kobe",
        recommendedSubAgentId: null,
        draftSummary: "summary",
        proposedReplySubject: "Re: Need help with marketing strategy",
        proposedReplyBody: "reply",
        confidenceScore: 0.8,
        riskScore: 0.3,
        escalationRecommended: false,
        blockedAutoSend: true,
        manifestVersion: "2026-03-12.v1",
        routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null
      }
    ]),
    getReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "pending_review",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null
    })),
    approveReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "approved",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "approved"
    })),
    rejectReviewItem: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "rejected",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "rejected"
    })),
    requestReviewRevision: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reviewItemId: "email-review:1",
      draftId: "draft:1",
      accountId: "email-account:1",
      threadId: "thread-1",
      assignmentRecordId: "assignment:email:1",
      runRecordId: "run:email:1",
      intentCategory: "lead_inquiry",
      priority: "high",
      riskLevel: "medium",
      requiredApproval: true,
      reviewStatus: "revision_requested",
      recommendedExecutiveId: "cmo",
      recommendedDepartmentId: "marketing",
      recommendedLeadAgentId: "kobe",
      recommendedSubAgentId: null,
      draftSummary: "summary",
      proposedReplySubject: "Re: Need help with marketing strategy",
      proposedReplyBody: "reply",
      confidenceScore: 0.8,
      riskScore: 0.3,
      escalationRecommended: false,
      blockedAutoSend: true,
      manifestVersion: "2026-03-12.v1",
      routingProvenance: { intentCategory: "lead_inquiry", target: { targetType: "lead_agent", departmentId: "marketing", executiveId: "cmo", leadAgentId: "kobe", subAgentId: null, executionAgentId: "kobe", requiresEscalation: false }, routingDecision: null, trace: [] },
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:01:00.000Z",
      reviewedAt: "2026-03-12T00:01:00.000Z",
      reviewedBy: "actor-1",
      reviewNote: "needs revision"
    }))
  } as never;
  const signOrchestrationBundle = vi.fn(() => ({
    sealedAt: "2026-03-11T00:00:00.000Z",
    payloadHash: "abc123",
    signature: "sig456"
  }));
  const verifyOrchestrationBundle = vi.fn(() => ({
    verified: true,
    payloadHashMatches: true,
    signatureMatches: true,
    expectedPayloadHash: "abc123",
    expectedSignature: "sig456",
    trustChain: {
      algorithm: "hmac-sha256",
      artifactId: "execution:maestro:campaign-2",
      sealedAt: "2026-03-11T00:00:00.000Z",
      payloadHash: "abc123"
    }
  }));
  const orgRoutingService = {
    resolve: vi.fn((input: { category: string; requestedAgentId?: string; jingleMode?: string }) => ({
      requestedCategory: input.category,
      resolvedDepartment: input.category === "route_contract_monitoring" ? "technology-engineering" : "marketing",
      resolvedExecutive: input.category === "route_contract_monitoring" ? "cto" : "cmo",
      resolvedLeadAgentId: input.category === "route_contract_monitoring" ? "code-sentinel" : "brandyn",
      resolvedSubAgentId: input.category === "route_contract_monitoring" ? "route-contract-watcher" : null,
      executionAgentId: input.category === "route_contract_monitoring" ? null : "brandyn",
      responsibilityKey:
        input.category === "route_contract_monitoring" ? "route_contract_monitoring" : "brand_identity_governance",
      operationalSignalType: input.category === "route_contract_monitoring" ? "route_contract" : null,
      policyValidated: true,
      trace: [
        `requested_category:${input.category}`,
        input.requestedAgentId ? `requested_agent:${input.requestedAgentId}` : "requested_agent:none"
      ]
    }))
  };
  const aaliyahBriefingService = {
    generateBriefing: vi.fn(async ({ mode }: { tenantId?: string; mode: "founder" | "zbestmedia" }) => ({
      briefingId: "briefing:1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      topPriorities: [
        {
          itemId: "incident:1",
          category: "top_priorities",
          title: "Worker SLO degradation",
          summary: "Worker freshness is critical and blocking release.",
          urgency: "urgent",
          owner: {
            executiveId: "cto",
            departmentId: "technology-engineering",
            leadAgentId: "code-sentinel",
            subAgentId: "slo-enforcer",
            sourceLane: "code-sentinel"
          },
          recommendedAction: "Review the release gate and clear worker freshness immediately.",
          interruptionClass: "interrupt_now",
          requiresFounderAttention: true,
          provenanceReferences: ["incident:1"]
        }
      ],
      waitingOnMe: [],
      revenueWatch: [],
      operationsWatch: [],
      calendarWatch: [],
      relationshipWatch: [],
      recommendedActions: [
        {
          actionId: "action:1",
          title: "Worker SLO degradation",
          action: "Review the release gate and clear worker freshness immediately.",
          urgency: "urgent",
          sourceItemId: "incident:1"
        }
      ],
      interruptSummary: {
        interruptNowCount: 1,
        reviewSoonCount: 0,
        canWaitCount: 0
      },
      confidenceSummary: {
        status: "critical",
        lowConfidenceSignals: 0,
        degradedSurfaces: ["slo"]
      },
      sourceMetadata: {
        orgManifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        generatedFrom: {
          pendingReviewCount: 0,
          openIncidentCount: 1,
          releaseBlockingIncidentCount: 1,
          recentExecutionFailureCount: 1
        }
      }
    }))
  };
  const aaliyahRuntimeService = {
    execute: vi.fn(async ({ request }: { request: { intent: string; mode?: "founder" | "zbestmedia" } }) => ({
      runtimeRequestId: "aaliyah-runtime:1",
      resolvedIntent: request.intent === "do_everything" ? null : "get_founder_briefing",
      outcomeType: request.intent === "do_everything" ? "fallback" : "completed",
      activeMode: request.mode ?? "founder",
      payloadType: request.intent === "do_everything" ? null : "founder_briefing",
      payload:
        request.intent === "do_everything"
          ? null
          : {
              briefingId: "briefing:1",
              generatedAt: "2026-03-14T00:00:00.000Z",
              activeMode: request.mode ?? "founder",
              manifestVersion: "2026-03-12.v1",
              topPriorities: [],
              waitingOnMe: [],
              revenueWatch: [],
              operationsWatch: [],
              calendarWatch: [],
              relationshipWatch: [],
              recommendedActions: [],
              interruptSummary: {
                interruptNowCount: 0,
                reviewSoonCount: 0,
                canWaitCount: 0
              },
              confidenceSummary: {
                status: "healthy",
                lowConfidenceSignals: 0,
                degradedSurfaces: []
              },
              sourceMetadata: {
                orgManifestVersion: "2026-03-12.v1",
                aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
                generatedFrom: {
                  pendingReviewCount: 0,
                  openIncidentCount: 0,
                  releaseBlockingIncidentCount: 0,
                  recentExecutionFailureCount: 0
                }
              }
            },
      provenance: {
        manifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        requestId: "req-1",
        generatedAt: "2026-03-14T00:00:00.000Z",
        invokedSurface: "aaliyah-runtime",
        enforcement: {
          requestedAgentId: "aaliyah",
          requestedAtomicTaskId: "executive_orchestration_founder_protection",
          resolvedAgentId: "aaliyah",
          resolvedAtomicTaskId: "executive_orchestration_founder_protection",
          confidence: request.intent === "do_everything" ? "low" : "high",
          company: "zbestmedia",
          mode: "executive_assistant",
          principalContext: "founder",
          approvalState: "not_required",
          approvalClass: "orchestration_only",
          reason: request.intent === "do_everything" ? "unsupported founder runtime intent" : "request is inside atomic scope and passed runtime safety checks"
        }
      },
      fallback:
        request.intent === "do_everything"
          ? {
              outcome: "escalate_for_clarification",
              reason: "unsupported founder runtime intent",
              delegateToAgentId: null
            }
          : null
    }))
  };
  const aaliyahPreferenceService = {
    listPreferences: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode: mode,
      defaults: {
        activeMode: mode,
        briefingLength: "standard",
        interruptionTolerance: "standard",
        approvalVisibility: "all_pending",
        tonePreference: "balanced",
        modeVisibility: "strict",
        appliedPreferences: []
      },
      items: []
    })),
    createExplicitPreference: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      preferenceId: "pref:1",
      category: "briefing_length",
      value: "compact",
      scope: { mode: "founder", company: "all", founderOnly: true },
      sourceType: "explicit",
      confidenceLevel: "high",
      active: true,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      deactivatedAt: null,
      createdBy: "actor-1",
      deactivatedBy: null
    })),
    deactivatePreference: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      preferenceId: "pref:1",
      category: "briefing_length",
      value: "compact",
      scope: { mode: "founder", company: "all", founderOnly: true },
      sourceType: "explicit",
      confidenceLevel: "high",
      active: false,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T01:00:00.000Z",
      deactivatedAt: "2026-03-15T01:00:00.000Z",
      createdBy: "actor-1",
      deactivatedBy: "actor-1"
    }))
  };
  const aaliyahMemoryBoundaryService = {
    getSummary: vi.fn(({ activeMode }: { activeMode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-15T00:00:00.000Z",
      activeMode,
      supportedModes: ["founder", "zbestmedia"],
      supportedCompanies: ["zbestmedia"],
      founderAggregationRule: "single_company_detail_allowed_multi_company_summary_only",
      decisions: []
    }))
  };
  const aaliyahCommandSurfaceService = {
    generateCommandSurface: vi.fn(async ({ tenantId, mode }: { tenantId: string; mode: "founder" | "zbestmedia" }) => ({
      shellId: "shell:1",
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      manifestVersion: "2026-03-12.v1",
      founderBriefingSummary: await aaliyahBriefingService.generateBriefing({ tenantId, mode }),
      whatMattersNow: [
        {
          itemId: "incident:1",
          category: "top_priorities",
          title: "Worker SLO degradation",
          summary: "Worker freshness is critical and blocking release.",
          urgency: "urgent",
          owner: {
            executiveId: "cto",
            departmentId: "technology-engineering",
            leadAgentId: "code-sentinel",
            subAgentId: "slo-enforcer",
            sourceLane: "code-sentinel"
          },
          recommendedAction: "Review the release gate and clear worker freshness immediately.",
          interruptionClass: "interrupt_now",
          requiresFounderAttention: true,
          provenanceReferences: ["incident:1"]
        }
      ],
      waitingOnMe: [],
      openApprovals: {
        totalPending: 1,
        items: await (runtimeService as any).listReviewItems()
      },
      openIncidentSummary: await telemetryService.getIncidentSummary(),
      opsStatusSummary: await telemetryService.getOpsStatusSummary(),
      openVoiceEscalations: {
        totalPending: 1,
        items: await voiceService.listPendingEscalations(),
        interruptNowCount: 1
      },
      recommendedNextActions: [
        {
          actionId: "action:1",
          title: "Worker SLO degradation",
          action: "Review the release gate and clear worker freshness immediately.",
          urgency: "urgent",
          sourceItemId: "incident:1"
        }
      ],
      interruptQueueSummary: {
        interruptNowCount: 1,
        sameDayBriefingCount: 0,
        passiveQueueCount: 0,
        silentLogCount: 0
      },
      confidenceSummary: {
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        overallConfidenceLevel: "high",
        highConfidenceCount: 2,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        deferredCount: 0,
        suppressedCount: 0,
        topReasonCodes: ["data_complete"],
        items: []
      },
      interruptionQueue: {
        generatedAt: "2026-03-14T00:00:00.000Z",
        activeMode: mode,
        items: [],
        interruptNowCount: 1,
        sameDayBriefingCount: 0,
        passiveQueueCount: 0,
        silentLogCount: 0
      },
      quickActions: [
        {
          actionId: "open_approval_queue",
          actionType: "open_approval_queue",
          label: "Open approvals (1)",
          targetIntent: "get_waiting_approvals",
          allowedParameters: ["limit"],
          defaultParameters: {},
          approvalRequired: false,
          availabilityStatus: "available",
          availabilityReason: null
        }
      ],
      provenanceSummary: {
        orgManifestVersion: "2026-03-12.v1",
        aaliyahRegistryVersion: "2026-03-12.aaliyah.v1",
        generatedFrom: {
          pendingApprovalCount: 1,
          pendingVoiceEscalationCount: 1,
          releaseBlockingIncidentCount: 1,
          degradedSurfaceCount: 3
        }
      }
    })),
    listQuickActions: vi.fn(() => [
      {
        actionId: "open_approval_queue",
        actionType: "open_approval_queue",
        label: "Open approvals (1)",
        targetIntent: "get_waiting_approvals",
        allowedParameters: ["limit"],
        defaultParameters: {},
        approvalRequired: false,
        availabilityStatus: "available",
        availabilityReason: null
      }
    ]),
    getInterruptionQueue: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      items: [],
      interruptNowCount: 1,
      sameDayBriefingCount: 0,
      passiveQueueCount: 0,
      silentLogCount: 0
    })),
    getConfidenceSummary: vi.fn(async ({ mode }: { mode: "founder" | "zbestmedia" }) => ({
      generatedAt: "2026-03-14T00:00:00.000Z",
      activeMode: mode,
      overallConfidenceLevel: "high",
      highConfidenceCount: 2,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      deferredCount: 0,
      suppressedCount: 0,
      topReasonCodes: ["data_complete"],
      items: []
    }))
  };
  const voiceService = {
    processInboundCall: vi.fn(async () => ({
      call: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        callId: "voice-call:1",
        externalCallId: "external-call-1",
        sourceSystem: "voice-gateway",
        callerPhoneNumber: "+13105551212",
        callerDisplayName: "Taylor Client",
        callerOrganizationName: "Z Best Media",
        transcript: "I need to speak to the founder about an urgent partnership.",
        callSummaryText: "Urgent founder access request.",
        durationSeconds: 95,
        intent: "executive_access_request",
        urgency: "high",
        riskLevel: "high",
        companyMode: "zbestmedia",
        routingTarget: {
          targetType: "founder_review",
          executiveId: "coo",
          departmentId: "operations",
          leadAgentId: null,
          subAgentId: null,
          executionAgentId: null,
          requiresEscalation: true
        },
        assignmentRecordId: "assignment:voice:1",
        runRecordId: "run:voice:1",
        outcome: "escalated",
        founderAttentionRequired: true,
        escalationRecommended: true,
        interruptionClass: "interrupt_now",
        recommendedNextAction: "Route this call summary into Aaliyah founder review before any response or commitment.",
        createdAt: "2026-03-14T00:00:00.000Z",
        updatedAt: "2026-03-14T00:00:00.000Z"
      },
      summary: {
        callerDisplay: "Taylor Client",
        intent: "executive_access_request",
        urgency: "high",
        riskLevel: "high",
        companyMode: "zbestmedia",
        routingTarget: {
          targetType: "founder_review",
          executiveId: "coo",
          departmentId: "operations",
          leadAgentId: null,
          subAgentId: null,
          executionAgentId: null,
          requiresEscalation: true
        },
        recommendedNextAction: "Route this call summary into Aaliyah founder review before any response or commitment.",
        founderAttentionRequired: true,
        interruptionClass: "interrupt_now"
      }
    })),
    getCall: vi.fn(async () => ({
      tenantId: "11111111-1111-4111-8111-111111111111",
      callId: "voice-call:1",
      externalCallId: "external-call-1",
      sourceSystem: "voice-gateway",
      callerPhoneNumber: "+13105551212",
      callerDisplayName: "Taylor Client",
      callerOrganizationName: "Z Best Media",
      transcript: "I need to speak to the founder about an urgent partnership.",
      callSummaryText: "Urgent founder access request.",
      durationSeconds: 95,
      intent: "executive_access_request",
      urgency: "high",
      riskLevel: "high",
      companyMode: "zbestmedia",
      routingTarget: {
        targetType: "founder_review",
        executiveId: "coo",
        departmentId: "operations",
        leadAgentId: null,
        subAgentId: null,
        executionAgentId: null,
        requiresEscalation: true
      },
      assignmentRecordId: "assignment:voice:1",
      runRecordId: "run:voice:1",
      outcome: "escalated",
      founderAttentionRequired: true,
      escalationRecommended: true,
      interruptionClass: "interrupt_now",
      recommendedNextAction: "Route this call summary into Aaliyah founder review before any response or commitment.",
      createdAt: "2026-03-14T00:00:00.000Z",
      updatedAt: "2026-03-14T00:00:00.000Z"
    })),
    listPendingEscalations: vi.fn(async () => [
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        callId: "voice-call:1",
        externalCallId: "external-call-1",
        sourceSystem: "voice-gateway",
        callerPhoneNumber: "+13105551212",
        callerDisplayName: "Taylor Client",
        callerOrganizationName: "Z Best Media",
        transcript: "I need to speak to the founder about an urgent partnership.",
        callSummaryText: "Urgent founder access request.",
        durationSeconds: 95,
        intent: "executive_access_request",
        urgency: "high",
        riskLevel: "high",
        companyMode: "zbestmedia",
        routingTarget: {
          targetType: "founder_review",
          executiveId: "coo",
          departmentId: "operations",
          leadAgentId: null,
          subAgentId: null,
          executionAgentId: null,
          requiresEscalation: true
        },
        assignmentRecordId: "assignment:voice:1",
        runRecordId: "run:voice:1",
        outcome: "escalated",
        founderAttentionRequired: true,
        escalationRecommended: true,
        interruptionClass: "interrupt_now",
        recommendedNextAction: "Route this call summary into Aaliyah founder review before any response or commitment.",
        createdAt: "2026-03-14T00:00:00.000Z",
        updatedAt: "2026-03-14T00:00:00.000Z"
      }
    ])
  };

  const orgService = {
    getManifestVersion: vi.fn(() => "2026-03-12.v1"),
    getManifest: vi.fn(() => ({
      manifestVersion: "2026-03-12.v1",
      executives: [{ executiveId: "cto", title: "Chief Technology Officer" }],
      departments: [{ departmentId: "technology-engineering", executiveOwnerId: "cto" }],
      leadAgents: [{ leadAgentId: "code-sentinel", reportsToExecutiveId: "cto", departmentId: "technology-engineering" }],
      subAgents: [{ subAgentId: "route-contract-watcher", parentLeadAgentId: "code-sentinel" }]
    })),
    getExecutive: vi.fn((executiveId: string) => ({ executiveId, title: "Chief Technology Officer" })),
    getExecutiveAgents: vi.fn(() => ({
      departments: [{ departmentId: "technology-engineering", executiveOwnerId: "cto" }],
      leadAgents: [
        {
          leadAgentId: "code-sentinel",
          departmentId: "technology-engineering",
          reportsToExecutiveId: "cto"
        }
      ],
      subAgents: [
        {
          subAgentId: "route-contract-watcher",
          departmentId: "technology-engineering",
          parentLeadAgentId: "code-sentinel"
        }
      ]
    })),
    getDepartment: vi.fn((departmentId: string) => ({ departmentId, executiveOwnerId: "cto" })),
    getExecutiveOwnerForDepartment: vi.fn(() => ({ executiveId: "cto", title: "Chief Technology Officer" })),
    getDepartmentAgents: vi.fn(() => ({
      leadAgents: [
        {
          leadAgentId: "code-sentinel",
          departmentId: "technology-engineering",
          reportsToExecutiveId: "cto"
        }
      ],
      subAgents: [
        {
          subAgentId: "route-contract-watcher",
          departmentId: "technology-engineering",
          parentLeadAgentId: "code-sentinel"
        }
      ]
    })),
    isSubAgentId: vi.fn((agentId: string) => agentId === "route-contract-watcher"),
    getSubAgent: vi.fn((agentId: string) => ({ subAgentId: agentId, parentLeadAgentId: "code-sentinel" })),
    getLeadAgent: vi.fn((agentId: string) => ({ leadAgentId: agentId, reportsToExecutiveId: "cto", departmentId: "technology-engineering" })),
    getLeadAgentScope: vi.fn(() => ({
      allowedScope: ["build breakage detection"],
      forbiddenScope: ["brand strategy"]
    })),
    getSubAgentsForLead: vi.fn(() => [{ subAgentId: "route-contract-watcher", parentLeadAgentId: "code-sentinel" }]),
    getReportingChain: vi.fn(() => [
      { nodeType: "sub-agent", nodeId: "route-contract-watcher", displayName: "Route Contract Watcher" },
      { nodeType: "lead-agent", nodeId: "code-sentinel", displayName: "Code Sentinel" },
      { nodeType: "executive", nodeId: "cto", displayName: "Chief Technology Officer" }
    ]),
    resolveResponsibilityOwner: vi.fn(() => ({
      leadAgentId: "brandyn",
      departmentId: "marketing",
      reportsToExecutiveId: "cmo"
    })),
    resolveOperationalSignalOwner: vi.fn(() => ({
      leadAgent: {
        leadAgentId: "code-sentinel",
        departmentId: "technology-engineering",
        reportsToExecutiveId: "cto"
      },
      subAgent: { subAgentId: "route-contract-watcher", parentLeadAgentId: "code-sentinel" }
    })),
    listCodeSentinelSignals: vi.fn(() => [
      {
        signalType: "build_breakage",
        responsibilityKey: "build_breakage_detection",
        leadAgentId: "code-sentinel",
        subAgentId: "build-monitor",
        sourceSurface: "build-and-test-integrity",
        description: "Build/test breakage belongs to Code Sentinel Build Monitor."
      },
      {
        signalType: "dependency_drift",
        responsibilityKey: "dependency_drift_detection",
        leadAgentId: "code-sentinel",
        subAgentId: "dependency-watcher",
        sourceSurface: "dependency-integrity",
        description: "Dependency drift belongs to Code Sentinel Dependency Watcher."
      },
      {
        signalType: "runtime_health",
        responsibilityKey: "runtime_health_monitoring",
        leadAgentId: "code-sentinel",
        subAgentId: "runtime-health-monitor",
        sourceSurface: "runtime-health",
        description: "Runtime health degradation belongs to Code Sentinel Runtime Health Monitor."
      },
      {
        signalType: "migration_integrity",
        responsibilityKey: "migration_integrity_monitoring",
        leadAgentId: "code-sentinel",
        subAgentId: "migration-guardian",
        sourceSurface: "schema-migration-integrity",
        description: "Migration and schema integrity belongs to Code Sentinel Migration Guardian."
      },
      {
        signalType: "route_contract",
        responsibilityKey: "route_contract_monitoring",
        leadAgentId: "code-sentinel",
        subAgentId: "route-contract-watcher",
        sourceSurface: "route-contract-integrity",
        description: "Route and API contract regressions belong to Code Sentinel Route Contract Watcher."
      },
      {
        signalType: "slo_release_gate",
        responsibilityKey: "slo_release_gate_monitoring",
        leadAgentId: "code-sentinel",
        subAgentId: "slo-enforcer",
        sourceSurface: "release-gate-telemetry",
        description: "Release-gate and SLO degradation belongs to Code Sentinel SLO Enforcer."
      }
    ]),
    getCodeSentinelSignal: vi.fn((signalType: string) => ({
      definition: {
        signalType,
        responsibilityKey:
          signalType === "migration_integrity" ? "migration_integrity_monitoring" : "route_contract_monitoring",
        leadAgentId: "code-sentinel",
        subAgentId: signalType === "migration_integrity" ? "migration-guardian" : "route-contract-watcher",
        sourceSurface:
          signalType === "migration_integrity" ? "schema-migration-integrity" : "route-contract-integrity",
        description:
          signalType === "migration_integrity"
            ? "Migration and schema integrity belongs to Code Sentinel Migration Guardian."
            : "Route and API contract regressions belong to Code Sentinel Route Contract Watcher."
      },
      leadAgent: {
        leadAgentId: "code-sentinel",
        departmentId: "technology-engineering",
        reportsToExecutiveId: "cto"
      },
      subAgent: {
        subAgentId: signalType === "migration_integrity" ? "migration-guardian" : "route-contract-watcher",
        parentLeadAgentId: "code-sentinel"
      }
    }))
  } as never;

  beforeAll(async () => {
    app = Fastify();
    await app.register(requestIdPlugin);
    app.addHook("preHandler", async (req: FastifyRequest) => {
      req.auth = {
        tenantId: "11111111-1111-4111-8111-111111111111",
        actorId: "actor-1",
        roles: ["admin"]
      };
    });
    await app.register(
      agentRoutes({
        repository,
        orgService,
        orgRoutingService: orgRoutingService as never,
        executionService,
        incidentService: incidentService as never,
        telemetryService: telemetryService as never,
        adminService: adminService as never,
        aaliyahBriefingService: aaliyahBriefingService as never,
        aaliyahCommandSurfaceService: aaliyahCommandSurfaceService as never,
        aaliyahPreferenceService: aaliyahPreferenceService as never,
        aaliyahMemoryBoundaryService: aaliyahMemoryBoundaryService as never,
        aaliyahRuntimeService: aaliyahRuntimeService as never,
        emailService,
        voiceService: voiceService as never,
        ledgerService,
        memoryService,
        evalRunner,
        workflow,
        versionService,
        workerService,
        orchestrationService,
        approvalEscalationService,
        runtimeService,
        signOrchestrationBundle,
        verifyOrchestrationBundle
      })
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("provisions the brand agent foundation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/provision-foundation",
      payload: { versionLabel: "foundation-v1" }
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().agents).toHaveLength(6);
  });

  it("exposes the org manifest and ownership routes", async () => {
    const manifestRes = await app.inject({ method: "GET", url: "/v1/agent-os/org" });
    const departmentRes = await app.inject({ method: "GET", url: "/v1/agent-os/org/departments/technology-engineering" });
    const agentRes = await app.inject({ method: "GET", url: "/v1/agent-os/org/agents/code-sentinel" });
    const chainRes = await app.inject({ method: "GET", url: "/v1/agent-os/org/reporting-chain/route-contract-watcher" });
    const responsibilityRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/ownership/responsibilities/brand_identity_governance"
    });
    const signalRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/ownership/operational-signals/route_contract"
    });
    const codeSentinelSignalsRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/code-sentinel/signals"
    });
    const codeSentinelSignalRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/code-sentinel/signals/migration_integrity"
    });

    expect(manifestRes.statusCode).toBe(200);
    const manifest = OrgManifestResponseSchema.parse(manifestRes.json());
    expect(manifest.manifestVersion).toBe("2026-03-12.v1");
    expect(manifest.manifest.leadAgents[0].leadAgentId).toBe("code-sentinel");
    expect(departmentRes.statusCode).toBe(200);
    const department = DepartmentDetailResponseSchema.parse(departmentRes.json());
    expect(department.executiveOwner.executiveId).toBe("cto");
    expect(agentRes.statusCode).toBe(200);
    const agent = OrgAgentDetailResponseSchema.parse(agentRes.json());
    expect(agent.leadAgent?.leadAgentId).toBe("code-sentinel");
    expect(chainRes.statusCode).toBe(200);
    const chain = ReportingChainResponseSchema.parse(chainRes.json());
    expect(chain.chain[0].nodeId).toBe("route-contract-watcher");
    expect(responsibilityRes.statusCode).toBe(200);
    const responsibility = ResponsibilityOwnershipResponseSchema.parse(responsibilityRes.json());
    expect(responsibility.ownership?.leadAgent.leadAgentId).toBe("brandyn");
    expect(signalRes.statusCode).toBe(200);
    const signal = OperationalSignalOwnershipResponseSchema.parse(signalRes.json());
    expect(signal.ownership.subAgent.subAgentId).toBe("route-contract-watcher");
    expect(codeSentinelSignalsRes.statusCode).toBe(200);
    const codeSentinelSignals = CodeSentinelSignalListResponseSchema.parse(codeSentinelSignalsRes.json());
    expect(codeSentinelSignals.items).toHaveLength(6);
    expect(codeSentinelSignalRes.statusCode).toBe(200);
    const codeSentinelSignal = CodeSentinelSignalDetailResponseSchema.parse(codeSentinelSignalRes.json());
    expect(codeSentinelSignal.ownership.subAgent.subAgentId).toBe("migration-guardian");
  });

  it("fails fast on invalid org path parameters", async () => {
    const invalidSignalRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/code-sentinel/signals/not-a-real-signal"
    });
    const invalidDepartmentRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/org/departments/not-a-real-department"
    });

    expect(invalidSignalRes.statusCode).toBe(400);
    expect(invalidDepartmentRes.statusCode).toBe(400);
  });

  it("resolves deterministic org routing decisions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agent-os/org/routing/resolve",
      payload: {
        category: "route_contract_monitoring"
      }
    });

    expect(res.statusCode).toBe(200);
    const decision = RoutingResolveResponseSchema.parse(res.json());
    expect(decision.decision.resolvedLeadAgentId).toBe("code-sentinel");
    expect(decision.decision.resolvedSubAgentId).toBe("route-contract-watcher");
    expect(orgRoutingService.resolve).toHaveBeenCalledWith({ category: "route_contract_monitoring" });
  });

  it("exposes gmail account setup and processing routes", async () => {
    const listRes = await app.inject({ method: "GET", url: "/v1/agent-os/email/accounts?limit=10" });
    const detailRes = await app.inject({ method: "GET", url: "/v1/agent-os/email/accounts/email-account:1" });
    const oauthStartRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/email/accounts/gmail/oauth/start",
      payload: {
        principalId: "principal-1",
        accountEmailAddress: "ops@zbestmedia.com"
      }
    });
    const oauthCallbackRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/email/accounts/gmail/oauth/callback",
      payload: {
        state: "gmail-oauth:1",
        code: "oauth-code"
      }
    });
    const processRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/email/accounts/email-account:1/process",
      payload: { maxThreads: 5 }
    });
    const threadProcessRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/email/accounts/email-account:1/threads/thread-1/process",
      payload: {}
    });

    expect(EmailAccountListResponseSchema.parse(listRes.json()).items[0].accountId).toBe("email-account:1");
    expect(EmailAccountDetailResponseSchema.parse(detailRes.json()).account.accountEmailAddress).toBe("ops@zbestmedia.com");
    expect(GmailOauthStartResponseSchema.parse(oauthStartRes.json()).state).toBe("gmail-oauth:1");
    expect(GmailOauthCallbackResponseSchema.parse(oauthCallbackRes.json()).account.connectionStatus).toBe("connected");
    expect(EmailAccountProcessBatchResponseSchema.parse(processRes.json()).processedCount).toBe(1);
    expect(EmailAccountProcessSingleResponseSchema.parse(threadProcessRes.json()).outcome.threadId).toBe("thread-1");
  });

  it("exposes the founder briefing route", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/briefing?mode=zbestmedia"
    });

    expect(res.statusCode).toBe(200);
    const briefing = AaliyahBriefingResponseSchema.parse(res.json());
    expect(briefing.briefing.activeMode).toBe("zbestmedia");
    expect(aaliyahBriefingService.generateBriefing).toHaveBeenCalledWith({
      tenantId: "11111111-1111-4111-8111-111111111111",
      mode: "zbestmedia"
    });
  });

  it("exposes the founder runtime route", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agent-os/aaliyah/runtime",
      payload: {
        intent: "get_founder_briefing",
        mode: "zbestmedia"
      }
    });

    expect(res.statusCode).toBe(200);
    const runtime = AaliyahRuntimeResponseSchema.parse(res.json());
    expect(runtime.result.outcomeType).toBe("completed");
    expect(aaliyahRuntimeService.execute).toHaveBeenCalledWith({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorId: "actor-1",
      requestId: expect.any(String),
      principalContext: "founder",
      request: {
        intent: "get_founder_briefing",
        mode: "zbestmedia",
        parameters: {}
      }
    });
  });

  it("exposes the founder command surface routes", async () => {
    const shellRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/command-surface?mode=founder"
    });
    const quickActionsRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/quick-actions?mode=zbestmedia"
    });
    const interruptionsRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/interruptions?mode=founder"
    });
    const confidenceRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/confidence-summary?mode=zbestmedia"
    });
    const preferencesRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/preferences?mode=founder"
    });
    const boundariesRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/aaliyah/memory-boundaries?mode=zbestmedia"
    });

    expect(shellRes.statusCode).toBe(200);
    const shell = AaliyahCommandSurfaceResponseSchema.parse(shellRes.json());
    expect(shell.shell.activeMode).toBe("founder");
    expect(shell.shell.quickActions[0]?.actionId).toBe("open_approval_queue");

    expect(quickActionsRes.statusCode).toBe(200);
    const quickActions = AaliyahQuickActionsResponseSchema.parse(quickActionsRes.json());
    expect(quickActions.activeMode).toBe("zbestmedia");
    expect(quickActions.items[0]?.targetIntent).toBe("get_waiting_approvals");

    expect(interruptionsRes.statusCode).toBe(200);
    const interruptions = AaliyahInterruptionsResponseSchema.parse(interruptionsRes.json());
    expect(interruptions.summary.interruptNowCount).toBe(1);

    expect(confidenceRes.statusCode).toBe(200);
    const confidence = AaliyahConfidenceSummaryResponseSchema.parse(confidenceRes.json());
    expect(confidence.summary.overallConfidenceLevel).toBe("high");

    expect(preferencesRes.statusCode).toBe(200);
    const preferences = AaliyahPreferenceListResponseSchema.parse(preferencesRes.json());
    expect(preferences.preferences.activeMode).toBe("founder");

    expect(boundariesRes.statusCode).toBe(200);
    const boundaries = AaliyahMemoryBoundaryResponseSchema.parse(boundariesRes.json());
    expect(boundaries.summary.activeMode).toBe("zbestmedia");
  });

  it("exposes founder preference mutation routes", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/aaliyah/preferences",
      payload: {
        category: "briefing_length",
        value: "compact",
        scope: {
          mode: "founder",
          company: "all",
          founderOnly: true
        }
      }
    });

    expect(createRes.statusCode).toBe(201);
    const created = AaliyahPreferenceDetailResponseSchema.parse(createRes.json());
    expect(created.preference.category).toBe("briefing_length");

    const deactivateRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/aaliyah/preferences/pref:1/deactivate"
    });

    expect(deactivateRes.statusCode).toBe(200);
    const deactivated = AaliyahPreferenceDetailResponseSchema.parse(deactivateRes.json());
    expect(deactivated.preference.active).toBe(false);
  });

  it("exposes governed voice intake routes", async () => {
    const intakeRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/voice/intake",
      payload: {
        sourceSystem: "voice-gateway",
        caller: {
          phoneNumber: "+13105551212",
          displayName: "Taylor Client"
        },
        transcript: "I need to speak to the founder about an urgent partnership."
      }
    });
    const detailRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/voice/calls/voice-call:1"
    });
    const escalationsRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/voice/escalations?limit=10"
    });

    expect(VoiceIntakeResponseSchema.parse(intakeRes.json()).result.call.callId).toBe("voice-call:1");
    expect(VoiceCallDetailResponseSchema.parse(detailRes.json()).call.intent).toBe("executive_access_request");
    expect(VoiceEscalationListResponseSchema.parse(escalationsRes.json()).items).toHaveLength(1);
  });

  it("exposes email review queue routes", async () => {
    const listRes = await app.inject({ method: "GET", url: "/v1/agent-os/email/review?limit=10&status=pending_review" });
    const detailRes = await app.inject({ method: "GET", url: "/v1/agent-os/email/review/email-review:1" });
    const approveRes = await app.inject({ method: "POST", url: "/v1/agent-os/email/review/email-review:1/approve", payload: { note: "approved" } });
    const rejectRes = await app.inject({ method: "POST", url: "/v1/agent-os/email/review/email-review:1/reject", payload: { note: "rejected" } });
    const revisionRes = await app.inject({ method: "POST", url: "/v1/agent-os/email/review/email-review:1/request-revision", payload: { note: "please revise" } });

    expect(EmailReviewListResponseSchema.parse(listRes.json()).items[0].reviewItemId).toBe("email-review:1");
    expect(EmailReviewDetailResponseSchema.parse(detailRes.json()).item.reviewItemId).toBe("email-review:1");
    expect(EmailReviewActionResponseSchema.parse(approveRes.json()).item.reviewStatus).toBe("approved");
    expect(EmailReviewActionResponseSchema.parse(rejectRes.json()).item.reviewStatus).toBe("rejected");
    expect(EmailReviewActionResponseSchema.parse(revisionRes.json()).item.reviewStatus).toBe("revision_requested");
  });

  it("dispatches only through the approved review route and exposes dispatch detail", async () => {
    const dispatchRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/email/review/email-review:1/dispatch",
      payload: {}
    });
    const detailRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/email/dispatch/email-dispatch:1"
    });

    expect(EmailDispatchResultResponseSchema.parse(dispatchRes.json()).dispatch.dispatchStatus).toBe("dispatch_succeeded");
    expect(EmailDispatchDetailResponseSchema.parse(detailRes.json()).dispatch.gmailMessageId).toBe("gmail-message-1");
  });

  it("executes an agent request with normalized response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/brandyn/execute",
      payload: {
        subjectType: "copy",
        subjectId: "subject-1",
        payload: { messagingPillars: ["proof"] }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      approvalRequired: false,
      output: {
        summary: "Brandyn executed brand_identity_governance as brand_brain.",
        handoffTarget: "jordyn"
      }
    });
  });

  it("exposes assignment ledger records and execution runs", async () => {
    const recordsRes = await app.inject({ method: "GET", url: "/v1/agent-os/execution/records?limit=10" });
    const recordRes = await app.inject({ method: "GET", url: "/v1/agent-os/execution/records/assignment:1" });
    const runsRes = await app.inject({ method: "GET", url: "/v1/agent-os/execution/runs?limit=10" });
    const runRes = await app.inject({ method: "GET", url: "/v1/agent-os/execution/runs/run:1" });

    expect(recordsRes.statusCode).toBe(200);
    expect(recordsRes.json().items[0].assignmentRecordId).toBe("assignment:1");
    expect(recordRes.statusCode).toBe(200);
    expect(recordRes.json().assignmentRecordId).toBe("assignment:1");
    expect(runsRes.statusCode).toBe(200);
    expect(runsRes.json().items[0].runRecordId).toBe("run:1");
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().runRecordId).toBe("run:1");
  });

  it("exposes incident records and incident actions", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/incidents"
    });
    expect(listRes.statusCode).toBe(200);
    expect(IncidentListResponseSchema.parse(listRes.json()).items).toHaveLength(1);

    const detailRes = await app.inject({
      method: "GET",
      url: "/v1/agent-os/incidents/incident:1"
    });
    expect(detailRes.statusCode).toBe(200);
    expect(IncidentDetailResponseSchema.parse(detailRes.json()).incident.incidentId).toBe("incident:1");

    const ingestRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/incidents/signals",
      payload: {
        signalType: "route_contract",
        status: "critical",
        sourceSystem: "execution-smoke",
        message: "Route contract broken."
      }
    });
    expect(ingestRes.statusCode).toBe(201);
    expect(IncidentDetailResponseSchema.parse(ingestRes.json()).incident.incidentId).toBe("incident:created");

    const ackRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/incidents/incident:1/acknowledge",
      payload: {}
    });
    expect(ackRes.statusCode).toBe(200);
    expect(IncidentDetailResponseSchema.parse(ackRes.json()).incident.status).toBe("acknowledged");

    const resolveRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/incidents/incident:1/resolve",
      payload: { resolutionNote: "fixed" }
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(IncidentDetailResponseSchema.parse(resolveRes.json()).incident.status).toBe("resolved");
  });

  it("exposes telemetry summaries", async () => {
    const statusRes = await app.inject({ method: "GET", url: "/v1/agent-os/ops/status" });
    const incidentsRes = await app.inject({ method: "GET", url: "/v1/agent-os/ops/incidents/summary" });
    const executionRes = await app.inject({ method: "GET", url: "/v1/agent-os/ops/execution/summary" });
    const codeSentinelRes = await app.inject({ method: "GET", url: "/v1/agent-os/ops/code-sentinel/summary" });

    expect(statusRes.statusCode).toBe(200);
    const status = OpsStatusSummaryResponseSchema.parse(statusRes.json());
    expect(status.summary.status).toBe("critical");
    expect(status.summary.codeSentinel.openIncidentCountBySubAgent["slo-enforcer"]).toBe(1);

    expect(incidentsRes.statusCode).toBe(200);
    const incidents = OpsIncidentSummaryResponseSchema.parse(incidentsRes.json());
    expect(incidents.summary.releaseBlockingOpenCount).toBe(1);

    expect(executionRes.statusCode).toBe(200);
    const execution = OpsExecutionSummaryResponseSchema.parse(executionRes.json());
    expect(execution.summary.routingFailureCount).toBe(1);

    expect(codeSentinelRes.statusCode).toBe(200);
    const codeSentinel = OpsCodeSentinelSummaryResponseSchema.parse(codeSentinelRes.json());
    expect(codeSentinel.summary.mostImpactedSubAgent).toBe("route-contract-watcher");
  });

  it("exposes admin control-plane routes", async () => {
    const summaryRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/summary" });
    const integrityRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/integrity" });
    const categoriesRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/routing/categories" });
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/agent-os/admin/routing/preview",
      payload: { category: "route_contract_monitoring" }
    });
    const recordsRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/execution/records?limit=10" });
    const recordRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/execution/records/assignment:1" });
    const runsRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/execution/runs?limit=10" });
    const runRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/execution/runs/run:1" });
    const incidentsRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/incidents?limit=10" });
    const incidentRes = await app.inject({ method: "GET", url: "/v1/agent-os/admin/incidents/incident:1" });

    expect(AdminSummaryResponseSchema.parse(summaryRes.json()).summary.openIncidentCount).toBe(2);
    expect(AdminIntegrityResponseSchema.parse(integrityRes.json()).integrity.valid).toBe(true);
    expect(AdminRoutingCategoriesResponseSchema.parse(categoriesRes.json()).items).toHaveLength(2);
    expect(AdminRoutingPreviewResponseSchema.parse(previewRes.json()).decision.resolvedLeadAgentId).toBe("code-sentinel");
    expect(AdminExecutionRecordListResponseSchema.parse(recordsRes.json()).items[0].assignmentRecordId).toBe("assignment:1");
    expect(AdminExecutionRecordDetailResponseSchema.parse(recordRes.json()).item.assignmentRecordId).toBe("assignment:1");
    expect(AdminExecutionRunListResponseSchema.parse(runsRes.json()).items[0].runRecordId).toBe("run:1");
    expect(AdminExecutionRunDetailResponseSchema.parse(runRes.json()).item.runRecordId).toBe("run:1");
    expect(AdminIncidentListResponseSchema.parse(incidentsRes.json()).items[0].incidentId).toBe("incident:1");
    expect(AdminIncidentDetailResponseSchema.parse(incidentRes.json()).item.incidentId).toBe("incident:1");
  });

  it("records eval runs and exposes memory reads", async () => {
    const evalRes = await app.inject({
      method: "POST",
      url: "/v1/agents/jordyn/evals/run",
      payload: {
        suiteName: "visual-consistency",
        observations: [{ metric: "design_token_compliance", score: 0.99 }]
      }
    });
    const memoryRes = await app.inject({
      method: "GET",
      url: "/v1/agents/jordyn/memory?collection=company_policy"
    });

    expect(evalRes.statusCode).toBe(200);
    expect(evalRes.json().passed).toBe(true);
    expect(memoryRes.statusCode).toBe(200);
    expect(memoryRes.json().items[0].memoryEntryId).toBe("memory:1");
  });

  it("advances the brand pipeline route", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/workflows/brand-pipeline/advance",
      payload: {
        subjectId: "campaign-1",
        completedSteps: [],
        nextStep: "brandyn_direction_approved",
        payload: { messagingPillars: ["proof"] }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().completedSteps).toEqual(["brandyn_direction_approved"]);
  });

  it("creates orchestration plans, exposes handoff audit, and escalates stale approvals", async () => {
    const planRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/plans",
      payload: {
        workflow: "brand_pipeline",
        subjectId: "campaign-2",
        payload: { campaign: "spring" },
        queueForWorker: true
      }
    });
    const orchestrationListRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions?deadLetteredOnly=false"
    });
    const orchestrationDetailRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2"
    });
    const replayBundleRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/replay-bundle"
    });
    const replayRequestRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/replay-request",
      payload: {}
    });
    const replayVerifyRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/replay-bundle/verify",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const replayHistoryVerifyRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/exports/verify-history",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const exportBundleRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/export-bundle"
    });
    const exportHistoryRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/exports"
    });
    const handoffRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/handoffs"
    });
    const slaRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/approvals/sla?olderThanMinutes=30"
    });
    const diagnosticsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/diagnostics?olderThanMinutes=30"
    });
    const diagnosticsExportRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/diagnostics/export?olderThanMinutes=30"
    });
    const diagnosticsExportsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/diagnostics/exports"
    });
    const diagnosticsVerifyHistoryRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/diagnostics/exports/verify-history",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const inventoryRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/inventory"
    });
    const inventoryExportRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/inventory/export"
    });
    const inventoryExportsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/inventory/exports"
    });
    const inventoryVerifyHistoryRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/inventory/exports/verify-history",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const workerHealthRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers"
    });
    const workerSloRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers/slo?staleAfterMinutes=15"
    });
    const workerFreshnessRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers/freshness?staleAfterMinutes=15"
    });
    const workerFreshnessExportRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers/freshness/export?staleAfterMinutes=15"
    });
    const workerFreshnessPersistRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/workers/freshness/export?staleAfterMinutes=15"
    });
    const workerFreshnessExportsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers/freshness/exports"
    });
    const workerFreshnessVerifyHistoryRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/workers/freshness/exports/verify-history",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const alertsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/alerts?olderThanMinutes=30&heartbeatStaleMinutes=15"
    });
    const alertsExportRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/alerts/export?olderThanMinutes=30&heartbeatStaleMinutes=15"
    });
    const alertsExportsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/alerts/exports"
    });
    const alertsVerifyHistoryRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/alerts/exports/verify-history",
      payload: {
        sealedAt: "2026-03-11T00:00:00.000Z",
        payloadHash: "abc123",
        signature: "sig456"
      }
    });
    const alertAcksRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/alerts/acks?alertCode=dead_letter_backlog"
    });
    const alertAckStatusRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/alerts/dead_letter_backlog/ack-status?expiresAfterMinutes=60"
    });
    const alertAckCreateRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/alerts/dead_letter_backlog/ack",
      payload: { reason: "triaged" }
    });
    const alertAckReopenRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/ops/alerts/dead_letter_backlog/reopen",
      payload: { reason: "backlog persists" }
    });
    const runbookRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/runbook"
    });
    const escalateRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/approvals/escalate",
      payload: {
        olderThanMinutes: 30,
        agentId: "maestro"
      }
    });
    const processRes = await app.inject({
      method: "POST",
      url: "/v1/internal/workers/orchestration/process",
      payload: { limit: 2 }
    });
    const requeueRes = await app.inject({
      method: "POST",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/requeue",
      payload: { approvalRequestId: "approval:replay:1" }
    });

    expect(planRes.statusCode).toBe(201);
    expect(planRes.json()).toMatchObject({
      workflow: "brand_pipeline",
      delegatedAgents: ["brandyn", "jordyn", "kobe", "oracle", "titan"]
    });
    expect(orchestrationListRes.statusCode).toBe(200);
    expect(orchestrationDetailRes.statusCode).toBe(200);
    expect(replayBundleRes.statusCode).toBe(200);
    expect(replayBundleRes.json().bundle.replay.workflow).toBe("brand_pipeline");
    expect(replayBundleRes.json().signature.signature).toBe("sig456");
    expect(replayRequestRes.statusCode).toBe(202);
    expect(replayVerifyRes.statusCode).toBe(200);
    expect(replayVerifyRes.json().verified).toBe(true);
    expect(verifyOrchestrationBundle).toHaveBeenCalledOnce();
    expect(replayHistoryVerifyRes.statusCode).toBe(200);
    expect(replayHistoryVerifyRes.json().verified).toBe(true);
    expect(exportBundleRes.statusCode).toBe(201);
    expect(exportBundleRes.json().exportRecord.exportId).toBe("bundle-export:1");
    expect(exportHistoryRes.statusCode).toBe(200);
    expect(exportHistoryRes.json().items[0].exportId).toBe("bundle-export:1");
    expect(handoffRes.statusCode).toBe(200);
    expect(handoffRes.json().handoffs[0].stepName).toBe("handoff_planned:brandyn->jordyn");
    expect(slaRes.statusCode).toBe(200);
    expect(slaRes.json().totals).toEqual({ pending: 1, stale: 0, escalated: 0 });
    expect(diagnosticsRes.statusCode).toBe(200);
    expect(diagnosticsRes.json().approvalSla.policies.maestro.maxEscalations).toBe(3);
    expect(diagnosticsRes.json().executions.queuedRetries).toBe(0);
    expect(diagnosticsExportRes.statusCode).toBe(201);
    expect(diagnosticsExportRes.json().exportRecord.snapshotType).toBe("diagnostics");
    expect(diagnosticsExportsRes.statusCode).toBe(200);
    expect(diagnosticsExportsRes.json().items[0].snapshotType).toBe("diagnostics");
    expect(diagnosticsVerifyHistoryRes.statusCode).toBe(200);
    expect(diagnosticsVerifyHistoryRes.json().verified).toBe(true);
    expect(inventoryRes.statusCode).toBe(200);
    expect(inventoryRes.json().deadLettered[0].executionId).toBe("execution:maestro:dead-1");
    expect(inventoryExportRes.statusCode).toBe(201);
    expect(inventoryExportRes.json().exportRecord.snapshotType).toBe("inventory");
    expect(inventoryExportsRes.statusCode).toBe(200);
    expect(inventoryExportsRes.json().items[0].snapshotType).toBe("inventory");
    expect(inventoryVerifyHistoryRes.statusCode).toBe(200);
    expect(inventoryVerifyHistoryRes.json().verified).toBe(true);
    expect(workerHealthRes.statusCode).toBe(200);
    expect(workerHealthRes.json().totalWorkers).toBe(1);
    expect(workerSloRes.statusCode).toBe(200);
    expect(workerSloRes.json().status).toBe("healthy");
    expect(workerFreshnessRes.statusCode).toBe(200);
    expect(workerFreshnessRes.json().staleWorkers).toBe(0);
    expect(workerFreshnessExportRes.statusCode).toBe(200);
    expect(workerFreshnessExportRes.json().snapshot.staleWorkers).toBe(0);
    expect(workerFreshnessExportRes.json().signature.signature).toBe("sig456");
    expect(workerFreshnessPersistRes.statusCode).toBe(201);
    expect(workerFreshnessPersistRes.json().exportRecord.snapshotType).toBe("worker_freshness");
    expect(workerFreshnessExportsRes.statusCode).toBe(200);
    expect(workerFreshnessExportsRes.json().items[0].snapshotType).toBe("worker_freshness");
    expect(workerFreshnessVerifyHistoryRes.statusCode).toBe(200);
    expect(workerFreshnessVerifyHistoryRes.json().verified).toBe(true);
    expect(alertsRes.statusCode).toBe(200);
    expect(alertsRes.json().alerts[0].code).toBe("dead_letter_backlog");
    expect(alertsExportRes.statusCode).toBe(201);
    expect(alertsExportRes.json().exportRecord.snapshotType).toBe("alerts");
    expect(alertsExportsRes.statusCode).toBe(200);
    expect(alertsExportsRes.json().items[0].snapshotType).toBe("alerts");
    expect(alertsVerifyHistoryRes.statusCode).toBe(200);
    expect(alertsVerifyHistoryRes.json().verified).toBe(true);
    expect(alertAcksRes.statusCode).toBe(200);
    expect(alertAcksRes.json().items[0].alertAckId).toBe("alert-ack:1");
    expect(alertAckStatusRes.statusCode).toBe(200);
    expect(alertAckStatusRes.json().acknowledged).toBe(true);
    expect(alertAckCreateRes.statusCode).toBe(201);
    expect(alertAckCreateRes.json().alertCode).toBe("dead_letter_backlog");
    expect(alertAckReopenRes.statusCode).toBe(200);
    expect(alertAckReopenRes.json().reopenedAt).toBe("2026-03-11T00:40:00.000Z");
    expect(runbookRes.statusCode).toBe(200);
    expect(runbookRes.json().commands.envPreflight).toBe("pnpm agent-os:env:preflight");
    expect(runbookRes.json().commands.runLoop).toBe("pnpm agent-os:worker:loop");
    expect(runbookRes.json().commands.daemon).toBe("pnpm agent-os:worker:daemon");
    expect(runbookRes.json().commands.smoke).toBe("pnpm agent-os:worker:smoke");
    expect(runbookRes.json().commands.opsSmoke).toBe("pnpm agent-os:ops:smoke");
    expect(runbookRes.json().commands.opsSmokeDeployed).toBe("pnpm agent-os:ops:smoke:deployed");
    expect(runbookRes.json().commands.releaseCheck).toBe("pnpm agent-os:worker:release:check");
    expect(runbookRes.json().commands.fullReleaseCheck).toBe("pnpm agent-os:release:check");
    expect(runbookRes.json().commands.deployedReleaseCheck).toBe("pnpm agent-os:release:check:deployed");
    expect(runbookRes.json().validation.deploymentProfileCheck).toBe("pnpm agent-os:deployment:check");
    expect(runbookRes.json().validation.migrationCheck).toBe("pnpm agent-os:verify:migrations");
    expect(escalateRes.statusCode).toBe(200);
    expect(escalateRes.json().items[0].approvalRequestId).toBe("approval:escalated");
    expect(processRes.statusCode).toBe(200);
    expect(processRes.json().completed[0].executionId).toBe("execution:maestro:queued");
    expect(requeueRes.statusCode).toBe(200);
    expect(requeueRes.json().status).toBe("QUEUED");
  });

  it("exposes versions, approvals, executions, and worker hooks", async () => {
    const versionsRes = await app.inject({
      method: "GET",
      url: "/v1/agents/brandyn/versions"
    });
    const createVersionRes = await app.inject({
      method: "POST",
      url: "/v1/agents/brandyn/versions",
      payload: {
        versionLabel: "foundation-v2",
        definitionSnapshot: { toneGuardrails: ["clear"] }
      }
    });
    const promoteVersionRes = await app.inject({
      method: "POST",
      url: "/v1/agents/brandyn/versions/promote",
      payload: {
        agentVersionId: "brandyn:foundation-v2",
        reason: "improved tone system"
      }
    });
    const approvalsRes = await app.inject({
      method: "GET",
      url: "/v1/approvals?status=PENDING"
    });
    const approvalDetailRes = await app.inject({
      method: "GET",
      url: "/v1/approvals/approval:1"
    });
    const executionsRes = await app.inject({
      method: "GET",
      url: "/v1/executions?status=QUEUED"
    });
    const executionDetailRes = await app.inject({
      method: "GET",
      url: "/v1/executions/execution:1"
    });
    const claimRes = await app.inject({
      method: "POST",
      url: "/v1/internal/workers/executions/claim",
      payload: { agentId: "kobe", limit: 2 }
    });
    const queueEvalRes = await app.inject({
      method: "POST",
      url: "/v1/internal/workers/evals/queue",
      payload: { agentId: "brandyn", suiteName: "brand-suite" }
    });
    const claimEvalRes = await app.inject({
      method: "POST",
      url: "/v1/internal/workers/evals/claim",
      payload: { agentId: "brandyn", limit: 2 }
    });

    expect(versionsRes.statusCode).toBe(200);
    expect(createVersionRes.statusCode).toBe(201);
    expect(promoteVersionRes.statusCode).toBe(200);
    expect(approvalsRes.statusCode).toBe(200);
    expect(approvalDetailRes.statusCode).toBe(200);
    expect(executionsRes.statusCode).toBe(200);
    expect(executionDetailRes.statusCode).toBe(200);
    expect(claimRes.statusCode).toBe(200);
    expect(queueEvalRes.statusCode).toBe(201);
    expect(claimEvalRes.statusCode).toBe(200);
  });
});
