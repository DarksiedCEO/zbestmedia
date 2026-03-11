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
    getHandoffAudit: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-2", status: "COMPLETED" },
      handoffs: [{ stepName: "handoff_planned:brandyn->jordyn" }]
    })),
    buildApprovalSlaReport: vi.fn(async () => ({
      olderThanMinutes: 30,
      totals: { pending: 1, stale: 0, escalated: 0 },
      byAgent: { maestro: { pending: 1, stale: 0, escalated: 0 } }
    })),
    escalateApprovals: vi.fn(async () => [{ approvalRequestId: "approval:escalated", status: "PENDING" }]),
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
        runtimeService
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
    const handoffRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/executions/execution:maestro:campaign-2/handoffs"
    });
    const slaRes = await app.inject({
      method: "GET",
      url: "/v1/orchestration/approvals/sla?olderThanMinutes=30"
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
      payload: {}
    });

    expect(planRes.statusCode).toBe(201);
    expect(planRes.json()).toMatchObject({
      workflow: "brand_pipeline",
      delegatedAgents: ["brandyn", "jordyn", "kobe", "oracle", "titan"]
    });
    expect(orchestrationListRes.statusCode).toBe(200);
    expect(orchestrationDetailRes.statusCode).toBe(200);
    expect(replayBundleRes.statusCode).toBe(200);
    expect(replayBundleRes.json().replay.workflow).toBe("brand_pipeline");
    expect(handoffRes.statusCode).toBe(200);
    expect(handoffRes.json().handoffs[0].stepName).toBe("handoff_planned:brandyn->jordyn");
    expect(slaRes.statusCode).toBe(200);
    expect(slaRes.json().totals).toEqual({ pending: 1, stale: 0, escalated: 0 });
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
