import { describe, expect, it, vi } from "vitest";

import { AgentExecutionService } from "../src/execution/service";
import { MaestroOrchestrationError, MaestroOrchestrationService } from "../src/orchestration/service";

describe("MaestroOrchestrationService", () => {
  const repository = {
    appendExecutionStep: vi.fn(async () => undefined),
    getExecution: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-1", status: "COMPLETED" },
      steps: [
        { stepName: "execution_started" },
        { stepName: "handoff_planned:brandyn->jordyn" },
        { stepName: "handoff_planned:jordyn->kobe" }
      ]
    }))
  } as any;
  const executionService = {
    execute: vi.fn(async () => ({
      execution: { executionId: "execution:maestro:campaign-1", status: "COMPLETED" },
      approvalRequired: false,
      output: {
        summary: "Maestro executed orchestration as orchestrator.",
        actions: ["Route workflow brand_pipeline across delegated agents: brandyn -> jordyn -> kobe -> oracle -> titan"],
        risks: ["Denied capabilities: orchestration.override_policy"],
        approvalRequired: false,
        handoffTarget: "brandyn",
        evidence: ["delegationTargets=brandyn, jordyn, kobe, oracle, titan"]
      }
    }))
  } as unknown as AgentExecutionService;
  const approvalEscalation = {
    escalateStaleRequests: vi.fn(async () => [{ approvalRequestId: "approval:1" }])
  } as any;

  const service = new MaestroOrchestrationService(repository, executionService, approvalEscalation);

  it("creates a delegated brand pipeline plan and appends handoff audit steps", async () => {
    const result = await service.createDelegatedPlan({
      tenantId: "tenant-1",
      actorId: "actor-1",
      correlationId: "corr-1",
      requestSource: "test",
      workflow: "brand_pipeline",
      subjectId: "campaign-1",
      payload: { campaign: "spring" }
    });

    expect(result.delegatedAgents).toEqual(["brandyn", "jordyn", "kobe", "oracle", "titan"]);
    expect(result.handoffPlan).toEqual([
      { fromAgent: "brandyn", toAgent: "jordyn" },
      { fromAgent: "jordyn", toAgent: "kobe" },
      { fromAgent: "kobe", toAgent: "oracle" },
      { fromAgent: "oracle", toAgent: "titan" }
    ]);
    expect(repository.appendExecutionStep).toHaveBeenCalledTimes(4);
  });

  it("rejects invalid delegates", async () => {
    await expect(
      service.createDelegatedPlan({
        tenantId: "tenant-1",
        actorId: "actor-1",
        correlationId: "corr-1",
        requestSource: "test",
        workflow: "brand_pipeline",
        subjectId: "campaign-1",
        payload: {},
        delegatedAgents: ["brandyn", "maestro"]
      })
    ).rejects.toBeInstanceOf(MaestroOrchestrationError);
  });

  it("returns only handoff steps in audit view", async () => {
    const result = await service.getHandoffAudit({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-1"
    });

    expect(result?.handoffs).toEqual([
      { stepName: "handoff_planned:brandyn->jordyn" },
      { stepName: "handoff_planned:jordyn->kobe" }
    ]);
  });

  it("delegates approval escalation", async () => {
    const items = await service.escalateApprovals({
      tenantId: "tenant-1",
      olderThanMinutes: 45,
      agentId: "maestro"
    });

    expect(items).toEqual([{ approvalRequestId: "approval:1" }]);
    expect(approvalEscalation.escalateStaleRequests).toHaveBeenCalledOnce();
  });

  it("lists maestro workflow executions and filters dead-lettered items", async () => {
    const repositoryWithExecutions = {
      ...repository,
      listExecutions: vi.fn(async () => [
        { executionId: "execution:maestro:1", agentId: "maestro", deadLetteredAt: null },
        { executionId: "execution:maestro:2", agentId: "maestro", deadLetteredAt: "2026-03-11T00:00:00.000Z" }
      ])
    } as any;
    const serviceWithExecutions = new MaestroOrchestrationService(
      repositoryWithExecutions,
      executionService,
      approvalEscalation
    );

    const all = await serviceWithExecutions.listWorkflowExecutions({
      tenantId: "tenant-1"
    });
    const deadOnly = await serviceWithExecutions.listWorkflowExecutions({
      tenantId: "tenant-1",
      deadLetteredOnly: true
    });

    expect(all).toHaveLength(2);
    expect(deadOnly).toEqual([{ executionId: "execution:maestro:2", agentId: "maestro", deadLetteredAt: "2026-03-11T00:00:00.000Z" }]);
  });

  it("builds approval SLA report from pending and stale approvals", async () => {
    const repositoryWithApprovals = {
      ...repository,
      listApprovalRequests: vi.fn(async () => [
        { agentId: "brandyn", escalatedAt: null },
        { agentId: "kobe", escalatedAt: "2026-03-11T00:00:00.000Z" }
      ]),
      listStaleApprovalRequests: vi.fn(async () => [{ agentId: "kobe" }])
    } as any;
    const serviceWithApprovals = new MaestroOrchestrationService(
      repositoryWithApprovals,
      executionService,
      approvalEscalation
    );

    const report = await serviceWithApprovals.buildApprovalSlaReport({
      tenantId: "tenant-1",
      olderThanMinutes: 60
    });

    expect(report.totals).toEqual({ pending: 2, stale: 1, escalated: 1 });
    expect(report.byAgent.kobe).toEqual({ pending: 1, stale: 1, escalated: 1 });
  });

  it("builds a replay bundle and can requeue dead-lettered maestro executions", async () => {
    const repositoryWithReplay = {
      ...repository,
      getApprovalRequest: vi.fn(async () => ({
        request: {
          status: "APPROVED",
          subjectType: "orchestration_dead_letter_replay",
          subjectId: "execution:maestro:campaign-3",
          resolvedAt: "2026-03-11T00:20:00.000Z",
          escalationCount: 1
        }
      })),
      getExecution: vi.fn(async () => ({
        execution: {
          executionId: "execution:maestro:campaign-3",
          agentId: "maestro",
          subjectType: "orchestration_workflow",
          subjectId: "campaign-3",
          inputPayload: { routedWorkflow: "brand_pipeline", delegatedAgents: ["brandyn", "jordyn"] },
          outputPayload: { summary: "Maestro executed orchestration as orchestrator." },
          failureClass: null,
          failureMessage: null,
          retryCount: 1,
          deadLetteredAt: "2026-03-11T00:00:00.000Z"
        },
        steps: [
          { stepName: "handoff_planned:brandyn->jordyn" },
          { stepName: "handoff_executed:brandyn->jordyn" }
        ]
      })),
      requeueExecution: vi.fn(async () => ({
        executionId: "execution:maestro:campaign-3",
        agentId: "maestro",
        status: "QUEUED",
        deadLetteredAt: null
      })),
      appendExecutionStep: vi.fn(async () => undefined)
    } as any;
    const serviceWithReplay = new MaestroOrchestrationService(
      repositoryWithReplay,
      executionService,
      approvalEscalation
    );

    const bundle = await serviceWithReplay.buildReplayBundle({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-3"
    });
    const requeued = await serviceWithReplay.requeueDeadLetteredExecution({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-3",
      actorId: "ops-1",
      approvalRequestId: "approval:replay:1",
      createdAt: "2026-03-11T00:40:00.000Z"
    });

    expect(bundle?.handoffs).toHaveLength(2);
    expect(bundle?.replay.workflow).toBe("brand_pipeline");
    expect(requeued).toEqual({
      executionId: "execution:maestro:campaign-3",
      agentId: "maestro",
      status: "QUEUED",
      deadLetteredAt: null
    });
  });

  it("rejects replay requeue when approved replay authorization is stale", async () => {
    const staleReplayRepository = {
      ...repository,
      getApprovalRequest: vi.fn(async () => ({
        request: {
          status: "APPROVED",
          subjectType: "orchestration_dead_letter_replay",
          subjectId: "execution:maestro:campaign-5",
          resolvedAt: "2026-03-11T00:00:00.000Z",
          escalationCount: 0
        }
      })),
      getExecution: vi.fn(async () => ({
        execution: {
          executionId: "execution:maestro:campaign-5",
          agentId: "maestro",
          subjectType: "orchestration_workflow",
          subjectId: "campaign-5",
          inputPayload: { routedWorkflow: "brand_pipeline", delegatedAgents: ["brandyn", "jordyn"] },
          outputPayload: { summary: "Maestro executed orchestration as orchestrator." },
          failureClass: "TRANSIENT_RUNTIME_ERROR",
          failureMessage: "forced_runtime_failure",
          retryCount: 3,
          deadLetteredAt: "2026-03-11T00:05:00.000Z"
        },
        steps: []
      }))
    } as any;
    const staleReplayService = new MaestroOrchestrationService(
      staleReplayRepository,
      executionService,
      approvalEscalation
    );

    await expect(
      staleReplayService.requeueDeadLetteredExecution({
        tenantId: "tenant-1",
        executionId: "execution:maestro:campaign-5",
        actorId: "ops-1",
        approvalRequestId: "approval:replay:2",
        createdAt: "2026-03-11T01:00:00.000Z"
      })
    ).rejects.toThrow("replay_approval_expired");
  });

  it("builds operations inventory for dead letters and retry queue", async () => {
    const repositoryWithInventory = {
      ...repository,
      listExecutions: vi.fn(async () => [
        {
          executionId: "execution:maestro:retry-1",
          agentId: "maestro",
          status: "QUEUED",
          retryCount: 2,
          maxRetries: 3,
          nextRetryAt: "2026-03-11T00:15:00.000Z",
          deadLetteredAt: null
        },
        {
          executionId: "execution:maestro:dead-1",
          agentId: "maestro",
          status: "FAILED",
          retryCount: 3,
          maxRetries: 3,
          nextRetryAt: null,
          failureClass: "TRANSIENT_RUNTIME_ERROR",
          deadLetteredAt: "2026-03-11T00:20:00.000Z"
        }
      ])
    } as any;
    const inventoryService = new MaestroOrchestrationService(
      repositoryWithInventory,
      executionService,
      approvalEscalation
    );

    const inventory = await inventoryService.getOperationsInventory({
      tenantId: "tenant-1"
    });

    expect(inventory.retryQueue).toHaveLength(1);
    expect(inventory.deadLettered).toHaveLength(1);
    expect(inventory.deadLettered[0]?.failureClass).toBe("TRANSIENT_RUNTIME_ERROR");
  });

  it("persists signed replay exports, reports worker health, and emits ops alerts", async () => {
    const repositoryWithOps = {
      ...repository,
      createOrchestrationBundleExport: vi.fn(async () => ({
        exportId: "bundle-export:1",
        executionId: "execution:maestro:campaign-6",
        exportedBy: "ops-1",
        payloadHash: "hash-1",
        signature: "sig-1",
        sealedAt: "2026-03-11T00:10:00.000Z",
        bundleSnapshot: { replay: { workflow: "brand_pipeline" } },
        createdAt: "2026-03-11T00:10:00.000Z"
      })),
      listOrchestrationBundleExports: vi.fn(async () => [
        {
          exportId: "bundle-export:1",
          executionId: "execution:maestro:campaign-6",
          exportedBy: "ops-1",
          payloadHash: "hash-1",
          signature: "sig-1",
          sealedAt: "2026-03-11T00:10:00.000Z",
          bundleSnapshot: { replay: { workflow: "brand_pipeline" } },
          createdAt: "2026-03-11T00:10:00.000Z"
        }
      ]),
      createOrchestrationOpsSnapshotExport: vi.fn(async ({ snapshotType }: { snapshotType: string }) => ({
        exportId: `ops-export:${snapshotType}:1`,
        snapshotType,
        exportedBy: "ops-1",
        payloadHash: "hash-1",
        signature: "sig-1",
        sealedAt: "2026-03-11T00:10:00.000Z",
        snapshot: { ok: true },
        createdAt: "2026-03-11T00:10:00.000Z"
      })),
      listOrchestrationOpsSnapshotExports: vi.fn(async ({ snapshotType }: { snapshotType: string }) => [
        {
          exportId: `ops-export:${snapshotType}:1`,
          snapshotType,
          exportedBy: "ops-1",
          payloadHash: "hash-1",
          signature: "sig-1",
          sealedAt: "2026-03-11T00:10:00.000Z",
          snapshot:
            snapshotType === "worker_freshness"
              ? { staleAfterMinutes: 15, totalWorkers: 1, staleWorkers: 1, items: [] }
              : { alerts: [{ code: "dead_letter_backlog", severity: "warning" }] },
          createdAt: "2026-03-11T00:10:00.000Z"
        }
      ]),
      getExecution: vi.fn(async () => ({
        execution: {
          executionId: "execution:maestro:campaign-6",
          agentId: "maestro",
          subjectType: "orchestration_workflow",
          subjectId: "campaign-6",
          inputPayload: { routedWorkflow: "brand_pipeline", delegatedAgents: ["brandyn", "jordyn"] },
          outputPayload: { summary: "Maestro executed orchestration as orchestrator." },
          failureClass: null,
          failureMessage: null,
          retryCount: 1,
          deadLetteredAt: "2026-03-11T00:05:00.000Z",
          status: "FAILED",
          maxRetries: 3,
          nextRetryAt: null
        },
        steps: [{ stepName: "handoff_planned:brandyn->jordyn" }]
      })),
      listExecutions: vi.fn(async () => [
        {
          executionId: "execution:maestro:campaign-6",
          agentId: "maestro",
          status: "FAILED",
          retryCount: 1,
          maxRetries: 3,
          nextRetryAt: null,
          deadLetteredAt: "2026-03-11T00:05:00.000Z",
          failureClass: "TRANSIENT_RUNTIME_ERROR"
        }
      ]),
      listApprovalRequests: vi.fn(async () => [{ agentId: "maestro", escalatedAt: null }]),
      listStaleApprovalRequests: vi.fn(async () => [{ agentId: "maestro" }]),
      listWorkerHeartbeats: vi.fn(async () => [
        {
          workerId: "worker-daemon:1",
          workerKind: "agent-os",
          agentId: "maestro",
          status: "idle",
          details: { mode: "daemon" },
          observedAt: "2026-03-11T00:00:00.000Z"
        }
      ]),
      acknowledgeOrchestrationAlert: vi.fn(async () => ({
        alertAckId: "alert-ack:1",
        alertCode: "dead_letter_backlog",
        acknowledgedBy: "ops-1",
        reason: "triaged",
        details: {},
        createdAt: "2026-03-11T00:30:00.000Z",
        reopenedAt: null,
        reopenedBy: null,
        reopenReason: null
      })),
      listOrchestrationAlertAcks: vi.fn(async () => [
        {
          alertAckId: "alert-ack:1",
          alertCode: "dead_letter_backlog",
          acknowledgedBy: "ops-1",
          reason: "triaged",
          details: {},
          createdAt: "2026-03-11T00:30:00.000Z",
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: null
        }
      ]),
      reopenOrchestrationAlertAck: vi.fn(async () => ({
        alertAckId: "alert-ack:1",
        alertCode: "dead_letter_backlog",
        acknowledgedBy: "ops-1",
        reason: "triaged",
        details: {},
        createdAt: "2026-03-11T00:30:00.000Z",
        reopenedAt: "2026-03-11T00:45:00.000Z",
        reopenedBy: "ops-2",
        reopenReason: "backlog persists"
      }))
    } as any;
    const opsService = new MaestroOrchestrationService(
      repositoryWithOps,
      executionService,
      approvalEscalation
    );

    const exported = await opsService.exportSignedReplayBundle({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-6",
      actorId: "ops-1",
      signBundle: () => ({
        sealedAt: "2026-03-11T00:10:00.000Z",
        payloadHash: "hash-1",
        signature: "sig-1"
      })
    });
    const exports = await opsService.listReplayBundleExports({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-6"
    });
    const workers = await opsService.getWorkerHealth({
      tenantId: "tenant-1"
    });
    const freshness = await opsService.getWorkerFreshnessReport({
      tenantId: "tenant-1",
      staleAfterMinutes: 15,
      nowIso: "2026-03-11T00:30:00.000Z"
    });
    const alerts = await opsService.getAlerts({
      tenantId: "tenant-1",
      olderThanMinutes: 60,
      heartbeatStaleMinutes: 15
    });
    const ack = await opsService.acknowledgeAlert({
      tenantId: "tenant-1",
      alertCode: "dead_letter_backlog",
      actorId: "ops-1",
      reason: "triaged"
    });
    const acks = await opsService.listAlertAcknowledgements({
      tenantId: "tenant-1",
      alertCode: "dead_letter_backlog"
    });
    const historyVerify = await opsService.verifyReplayBundleHistory({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-6",
      sealedAt: "2026-03-11T00:10:00.000Z",
      payloadHash: "hash-1",
      signature: "sig-1",
      verifyBundle: () => ({
        verified: true,
        payloadHashMatches: true,
        signatureMatches: true,
        expectedPayloadHash: "hash-1",
        expectedSignature: "sig-1",
        trustChain: {
          algorithm: "hmac-sha256",
          artifactId: "execution:maestro:campaign-6",
          sealedAt: "2026-03-11T00:10:00.000Z",
          payloadHash: "hash-1"
        }
      })
    });
    const ackStatus = await opsService.getAlertAcknowledgementStatus({
      tenantId: "tenant-1",
      alertCode: "dead_letter_backlog",
      expiresAfterMinutes: 60,
      nowIso: "2026-03-11T00:40:00.000Z"
    });
    const expiredAckStatus = await opsService.getAlertAcknowledgementStatus({
      tenantId: "tenant-1",
      alertCode: "dead_letter_backlog",
      expiresAfterMinutes: 5,
      nowIso: "2026-03-11T00:40:00.000Z"
    });
    const reopened = await opsService.reopenAlert({
      tenantId: "tenant-1",
      alertCode: "dead_letter_backlog",
      actorId: "ops-2",
      reason: "backlog persists",
      createdAt: "2026-03-11T00:45:00.000Z"
    });
    const workerExport = await opsService.exportWorkerFreshnessSnapshot({
      tenantId: "tenant-1",
      actorId: "ops-1",
      staleAfterMinutes: 15,
      signSnapshot: () => ({
        sealedAt: "2026-03-11T00:10:00.000Z",
        payloadHash: "hash-1",
        signature: "sig-1"
      })
    });
    const alertsExport = await opsService.exportAlertsSnapshot({
      tenantId: "tenant-1",
      actorId: "ops-1",
      olderThanMinutes: 60,
      heartbeatStaleMinutes: 15,
      signSnapshot: () => ({
        sealedAt: "2026-03-11T00:10:00.000Z",
        payloadHash: "hash-1",
        signature: "sig-1"
      })
    });
    const workerOpsExports = await opsService.listOpsSnapshotExports({
      tenantId: "tenant-1",
      snapshotType: "worker_freshness"
    });
    const workerOpsVerify = await opsService.verifyOpsSnapshotHistory({
      tenantId: "tenant-1",
      snapshotType: "worker_freshness",
      sealedAt: "2026-03-11T00:10:00.000Z",
      payloadHash: "hash-1",
      signature: "sig-1",
      verifySnapshot: () => ({
        verified: true,
        payloadHashMatches: true,
        signatureMatches: true,
        expectedPayloadHash: "hash-1",
        expectedSignature: "sig-1",
        trustChain: {
          algorithm: "hmac-sha256",
          artifactId: "ops:worker_freshness",
          sealedAt: "2026-03-11T00:10:00.000Z",
          payloadHash: "hash-1"
        }
      })
    });
    const diagnosticsExport = await opsService.exportDiagnosticsSnapshot({
      tenantId: "tenant-1",
      actorId: "ops-1",
      olderThanMinutes: 60,
      signSnapshot: () => ({
        sealedAt: "2026-03-11T00:10:00.000Z",
        payloadHash: "hash-1",
        signature: "sig-1"
      })
    });
    const inventoryExport = await opsService.exportInventorySnapshot({
      tenantId: "tenant-1",
      actorId: "ops-1",
      signSnapshot: () => ({
        sealedAt: "2026-03-11T00:10:00.000Z",
        payloadHash: "hash-1",
        signature: "sig-1"
      })
    });
    const diagnosticsVerify = await opsService.verifyOpsSnapshotHistory({
      tenantId: "tenant-1",
      snapshotType: "diagnostics",
      sealedAt: "2026-03-11T00:10:00.000Z",
      payloadHash: "hash-1",
      signature: "sig-1",
      verifySnapshot: () => ({
        verified: true,
        payloadHashMatches: true,
        signatureMatches: true,
        expectedPayloadHash: "hash-1",
        expectedSignature: "sig-1",
        trustChain: {
          algorithm: "hmac-sha256",
          artifactId: "ops:diagnostics",
          sealedAt: "2026-03-11T00:10:00.000Z",
          payloadHash: "hash-1"
        }
      })
    });
    const workerSlo = await opsService.getWorkerSloSummary({
      tenantId: "tenant-1",
      staleAfterMinutes: 15,
      nowIso: "2026-03-11T00:30:00.000Z"
    });

    expect(exported?.exportRecord.exportId).toBe("bundle-export:1");
    expect(exports).toHaveLength(1);
    expect(workers.totalWorkers).toBe(1);
    expect(freshness.staleWorkers).toBe(1);
    expect(alerts.alerts.map((item) => item.code)).toContain("dead_letter_backlog");
    expect(alerts.alerts.map((item) => item.code)).toContain("stale_replay_approvals");
    expect(alerts.alerts.map((item) => item.code)).toContain("worker_heartbeat_stale");
    expect(ack.alertAckId).toBe("alert-ack:1");
    expect(acks).toHaveLength(1);
    expect(historyVerify.verified).toBe(true);
    expect(historyVerify.verification?.verified).toBe(true);
    expect(ackStatus.acknowledged).toBe(true);
    expect(expiredAckStatus.expired).toBe(true);
    expect(reopened.reopenedBy).toBe("ops-2");
    expect(workerExport.exportRecord.snapshotType).toBe("worker_freshness");
    expect(alertsExport.exportRecord.snapshotType).toBe("alerts");
    expect(diagnosticsExport.exportRecord.snapshotType).toBe("diagnostics");
    expect(inventoryExport.exportRecord.snapshotType).toBe("inventory");
    expect(workerOpsExports).toHaveLength(1);
    expect(workerOpsVerify.verified).toBe(true);
    expect(diagnosticsVerify.verified).toBe(true);
    expect(workerSlo.status).toBe("warning");
    expect(workerSlo.freshnessCoverage).toBe(0);
  });

  it("creates replay approvals for dead-lettered executions", async () => {
    const repositoryWithReplayApproval = {
      ...repository,
      getExecution: vi.fn(async () => ({
        execution: {
          executionId: "execution:maestro:campaign-4",
          agentId: "maestro",
          deadLetteredAt: "2026-03-11T00:00:00.000Z",
          retryCount: 2,
          failureClass: "TRANSIENT_RUNTIME_ERROR",
          failureMessage: "forced_runtime_failure"
        },
        steps: []
      })),
      createApprovalRequest: vi.fn(async () => ({
        approvalRequestId: "approval:replay:1",
        status: "PENDING"
      }))
    } as any;
    const serviceWithReplayApproval = new MaestroOrchestrationService(
      repositoryWithReplayApproval,
      executionService,
      approvalEscalation
    );

    const approval = await serviceWithReplayApproval.requestDeadLetterReplayApproval({
      tenantId: "tenant-1",
      executionId: "execution:maestro:campaign-4",
      actorId: "ops-1"
    });

    expect(approval).toEqual({
      approvalRequestId: "approval:replay:1",
      status: "PENDING"
    });
    expect(repositoryWithReplayApproval.createApprovalRequest).toHaveBeenCalledOnce();
  });
});
