import Fastify, { type FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { agentRoutes } from "../src/agents/routes";
import {
  CodeSentinelSignalDetailResponseSchema,
  CodeSentinelSignalListResponseSchema,
  DepartmentDetailResponseSchema,
  ExecutiveDetailResponseSchema,
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
  const memoryService = {
    readPartition: vi.fn(async () => [{ memoryEntryId: "memory:1" }]),
    writeOwnedEntry: vi.fn(async () => ({ memoryEntryId: "memory:1" })),
    writeSharedPolicyEntry: vi.fn(async () => ({ memoryEntryId: "memory:policy" }))
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
    }))
  } as never;
  const versionService = {
    createVersion: vi.fn(async () => ({ agentVersionId: "brandyn:foundation-v2" })),
    promoteVersion: vi.fn(async () => ({
      promotedVersion: { agentVersionId: "brandyn:foundation-v2" },
      previousVersionId: "brandyn:foundation-v1"
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
