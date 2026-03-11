import Fastify, { type FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { agentRoutes } from "../src/agents/routes";
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
      output: { kind: "brand_governance_output" }
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
        output: { kind: "brand_governance_output" }
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
        output: { kind: "orchestration_output" }
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
    escalateApprovals: vi.fn(async () => [{ approvalRequestId: "approval:escalated", status: "PENDING" }]),
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
        executionService,
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
      output: { kind: "brand_governance_output" }
    });
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
    const inventoryRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/inventory"
    });
    const workerHealthRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/workers"
    });
    const alertsRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/ops/alerts?olderThanMinutes=30&heartbeatStaleMinutes=15"
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
    expect(inventoryRes.statusCode).toBe(200);
    expect(inventoryRes.json().deadLettered[0].executionId).toBe("execution:maestro:dead-1");
    expect(workerHealthRes.statusCode).toBe(200);
    expect(workerHealthRes.json().totalWorkers).toBe(1);
    expect(alertsRes.statusCode).toBe(200);
    expect(alertsRes.json().alerts[0].code).toBe("dead_letter_backlog");
    expect(runbookRes.statusCode).toBe(200);
    expect(runbookRes.json().commands.runLoop).toBe("pnpm agent-os:worker:loop");
    expect(runbookRes.json().commands.daemon).toBe("pnpm agent-os:worker:daemon");
    expect(runbookRes.json().validation.deploymentProfileCheck).toBe("pnpm agent-os:deployment:check");
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
