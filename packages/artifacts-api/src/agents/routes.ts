import type { FastifyPluginAsync } from "fastify";

import {
  AgentLifecycleStateError,
  AgentOsRepository,
  AgentExecutionService,
  AgentMemoryAccessError,
  AgentRuntimeService,
  ApprovalEscalationService,
  AgentVersionService,
  AgentOrgService,
  AgentWorkerService,
  BrandPipelineWorkflowError,
  BrandPipelineOrchestrator,
  EvalRunnerService,
  MaestroOrchestrationError,
  MaestroOrchestrationService,
  MemoryPartitionService
} from "@zbest/agent-os";

import {
  AgentIdParamSchema,
  ApprovalDecisionBodySchema,
  ApprovalListQuerySchema,
  OrchestrationApprovalSlaQuerySchema,
  OrchestrationAlertsQuerySchema,
  OrchestrationAlertAckBodySchema,
  OrchestrationAlertAckStatusQuerySchema,
  OrchestrationAlertAckListQuerySchema,
  OrchestrationAlertReopenBodySchema,
  OrchestrationBundleVerifyBodySchema,
  OrchestrationDiagnosticsQuerySchema,
  OrchestrationOpsExportQuerySchema,
  OrchestrationOpsHistoryVerifyBodySchema,
  ApprovalRequestIdParamSchema,
  DepartmentIdParamSchema,
  OrchestrationEscalateBodySchema,
  OrchestrationExecutionListQuerySchema,
  OrchestrationPlanBodySchema,
  OrchestrationReplayRequestBodySchema,
  OrchestrationRequeueBodySchema,
  OrchestrationWorkerProcessBodySchema,
  BrandPipelineAdvanceBodySchema,
  ExecutionIdParamSchema,
  ExecutiveIdParamSchema,
  ExecutionListQuerySchema,
  EvalRunBodySchema,
  ExecuteAgentBodySchema,
  OrgAgentIdParamSchema,
  OperationalSignalParamSchema,
  AgentVersionCreateBodySchema,
  AgentVersionPromoteBodySchema,
  ResponsibilityKeyParamSchema,
  LifecycleTransitionBodySchema,
  ListAgentsQuerySchema,
  MemoryQuerySchema,
  MemoryWriteBodySchema,
  ProvisionFoundationBodySchema,
  WorkerClaimEvalsBodySchema,
  WorkerClaimExecutionsBodySchema,
  WorkerFreshnessQuerySchema,
  WorkerQueueEvalBodySchema
} from "./schemas";

export function agentRoutes(opts: {
  repository: AgentOsRepository;
  orgService: AgentOrgService;
  executionService: AgentExecutionService;
  memoryService: MemoryPartitionService;
  evalRunner: EvalRunnerService;
  workflow: BrandPipelineOrchestrator;
  versionService: AgentVersionService;
  workerService: AgentWorkerService;
  orchestrationService: MaestroOrchestrationService;
  approvalEscalationService: ApprovalEscalationService;
  runtimeService: AgentRuntimeService;
  signOrchestrationBundle: (bundle: unknown, executionId: string) => {
    sealedAt: string;
    payloadHash: string;
    signature: string;
  };
  verifyOrchestrationBundle: (args: {
    bundle: unknown;
    executionId: string;
    sealedAt: string;
    payloadHash: string;
    signature: string;
  }) => {
    verified: boolean;
    payloadHashMatches: boolean;
    signatureMatches: boolean;
    expectedPayloadHash: string;
    expectedSignature: string;
    trustChain: {
      algorithm: string;
      artifactId: string;
      sealedAt: string;
      payloadHash: string;
    };
  };
}): FastifyPluginAsync {
  return async (app) => {
    function handleAgentError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
      if (error instanceof AgentLifecycleStateError) {
        return reply.code(409).send({ error: error.message });
      }
      if (
        error instanceof AgentMemoryAccessError ||
        error instanceof BrandPipelineWorkflowError ||
        error instanceof MaestroOrchestrationError
      ) {
        return reply.code(400).send({ error: error.message });
      }
      if (error instanceof Error && error.message === "agent_not_found") {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      throw error;
    }

    app.post("/v1/agents/provision-foundation", async (req, reply) => {
      const parsed = ProvisionFoundationBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }

      const result = await opts.repository.provisionFoundation({
        tenantId: req.auth.tenantId,
        createdBy: req.auth.actorId,
        versionLabel: parsed.data.versionLabel
      });

      return reply.code(201).send({ agents: result.agents });
    });

    app.get("/v1/agent-os/org", async (_req, reply) => {
      return reply.send(opts.orgService.getManifest());
    });

    app.get("/v1/agent-os/org/executives/:executiveId", async (req, reply) => {
      const path = ExecutiveIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        executive: opts.orgService.getExecutive(path.data.executiveId),
        agents: opts.orgService.getExecutiveAgents(path.data.executiveId)
      });
    });

    app.get("/v1/agent-os/org/departments/:departmentId", async (req, reply) => {
      const path = DepartmentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        department: opts.orgService.getDepartment(path.data.departmentId),
        executiveOwner: opts.orgService.getExecutiveOwnerForDepartment(path.data.departmentId),
        agents: opts.orgService.getDepartmentAgents(path.data.departmentId)
      });
    });

    app.get("/v1/agent-os/org/agents/:agentId", async (req, reply) => {
      const path = OrgAgentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const { agentId } = path.data;
      if (opts.orgService.isSubAgentId(agentId)) {
        return reply.send({ subAgent: opts.orgService.getSubAgent(agentId) });
      }

      return reply.send({
        leadAgent: opts.orgService.getLeadAgent(agentId),
        scope: opts.orgService.getLeadAgentScope(agentId),
        subAgents: agentId === "code-sentinel" ? opts.orgService.getSubAgentsForLead(agentId) : []
      });
    });

    app.get("/v1/agent-os/org/reporting-chain/:agentId", async (req, reply) => {
      const path = OrgAgentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({ chain: opts.orgService.getReportingChain(path.data.agentId as never) });
    });

    app.get("/v1/agent-os/org/ownership/responsibilities/:responsibilityKey", async (req, reply) => {
      const path = ResponsibilityKeyParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        responsibilityKey: path.data.responsibilityKey,
        owner: opts.orgService.resolveResponsibilityOwner(path.data.responsibilityKey)
      });
    });

    app.get("/v1/agent-os/org/ownership/operational-signals/:signalType", async (req, reply) => {
      const path = OperationalSignalParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        signalType: path.data.signalType,
        ownership: opts.orgService.resolveOperationalSignalOwner(path.data.signalType)
      });
    });

    app.get("/v1/agents/:agentId", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const agent = await opts.repository.getAgent({
        tenantId: req.auth.tenantId,
        agentId: path.data.agentId
      });
      if (!agent) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      return reply.send(agent);
    });

    app.get("/v1/agents", async (req, reply) => {
      const parsed = ListAgentsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_query", details: parsed.error.flatten() });
      }

      const agents = await opts.repository.listAgents(req.auth.tenantId);
      const filtered = agents.filter((agent) => {
        if (parsed.data.taskDomain && agent.taskDomain !== parsed.data.taskDomain) return false;
        if (parsed.data.status && agent.currentStatus !== parsed.data.status) return false;
        return true;
      });
      return reply.send({ items: filtered });
    });

    app.post("/v1/agents/:agentId/execute", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = ExecuteAgentBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const result = await opts.executionService.execute({
          tenantId: req.auth.tenantId,
          agentId: path.data.agentId,
          actorId: req.auth.actorId,
          correlationId: req.requestId,
          requestSource: "artifacts-api",
          subjectType: body.data.subjectType,
          subjectId: body.data.subjectId,
          payload: body.data.payload,
          queueForWorker: body.data.queueForWorker
        });

        return reply.code(result.approvalRequired ? 202 : 200).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/agents/:agentId/versions", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const versions = await opts.repository.listAgentVersions({
        tenantId: req.auth.tenantId,
        agentId: path.data.agentId
      });
      return reply.send({ items: versions });
    });

    app.post("/v1/agents/:agentId/versions", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = AgentVersionCreateBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const version = await opts.versionService.createVersion({
        tenantId: req.auth.tenantId,
        agentId: path.data.agentId,
        versionLabel: body.data.versionLabel,
        definitionSnapshot: body.data.definitionSnapshot,
        createdBy: req.auth.actorId
      });
      return reply.code(201).send(version);
    });

    app.post("/v1/agents/:agentId/versions/promote", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = AgentVersionPromoteBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const promoted = await opts.versionService.promoteVersion({
        tenantId: req.auth.tenantId,
        agentId: path.data.agentId,
        agentVersionId: body.data.agentVersionId,
        promotedBy: req.auth.actorId,
        reason: body.data.reason
      });
      return reply.code(200).send(promoted);
    });

    app.post("/v1/agents/:agentId/lifecycle/transition", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = LifecycleTransitionBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const event = await opts.repository.appendLifecycleEvent({
          tenantId: req.auth.tenantId,
          agentId: path.data.agentId,
          toStatus: body.data.toStatus,
          actorId: req.auth.actorId,
          reason: body.data.reason,
          metricsSnapshot: body.data.metricsSnapshot,
          metadata: body.data.metadata
        });

        return reply.code(200).send(event);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/agents/:agentId/evals/run", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = EvalRunBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const result = await opts.evalRunner.runSuite({
          tenantId: req.auth.tenantId,
          agentId: path.data.agentId,
          suiteName: body.data.suiteName,
          createdBy: req.auth.actorId,
          observations: body.data.observations
        });
        return reply.code(200).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/agents/:agentId/memory", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const query = MemoryQuerySchema.safeParse(req.query ?? {});
      if (!path.success || !query.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            query: query.success ? null : query.error.flatten()
          }
        });
      }

      try {
        const items = await opts.memoryService.readPartition({
          tenantId: req.auth.tenantId,
          agentId: path.data.agentId,
          collection: query.data.collection
        });

        return reply.send({ items });
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/agents/:agentId/memory", async (req, reply) => {
      const path = AgentIdParamSchema.safeParse(req.params);
      const body = MemoryWriteBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const entry = body.data.sharedPolicy
          ? await opts.memoryService.writeSharedPolicyEntry({
              tenantId: req.auth.tenantId,
              agentId: path.data.agentId,
              entryKey: body.data.entryKey,
              entryValue: body.data.entryValue,
              createdBy: req.auth.actorId
            })
          : await opts.memoryService.writeOwnedEntry({
              tenantId: req.auth.tenantId,
              agentId: path.data.agentId,
              collection: body.data.collection,
              entryKey: body.data.entryKey,
              entryValue: body.data.entryValue,
              createdBy: req.auth.actorId
            });

        return reply.code(201).send(entry);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/approvals/:approvalRequestId/decision", async (req, reply) => {
      const path = ApprovalRequestIdParamSchema.safeParse(req.params);
      const body = ApprovalDecisionBodySchema.safeParse(req.body);
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const decision = await opts.repository.recordApprovalDecision({
        tenantId: req.auth.tenantId,
        approvalRequestId: path.data.approvalRequestId,
        approverId: req.auth.actorId,
        decision: body.data.decision,
        rationale: body.data.rationale,
        payload: body.data.payload
      });

      return reply.code(201).send(decision);
    });

    app.get("/v1/approvals", async (req, reply) => {
      const query = ApprovalListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.repository.listApprovalRequests({
        tenantId: req.auth.tenantId,
        agentId: query.data.agentId,
        status: query.data.status
      });
      return reply.send({ items });
    });

    app.get("/v1/approvals/:approvalRequestId", async (req, reply) => {
      const path = ApprovalRequestIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const approval = await opts.repository.getApprovalRequest({
        tenantId: req.auth.tenantId,
        approvalRequestId: path.data.approvalRequestId
      });
      if (!approval) {
        return reply.code(404).send({ error: "approval_request_not_found" });
      }
      return reply.send(approval);
    });

    app.get("/v1/executions", async (req, reply) => {
      const query = ExecutionListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.repository.listExecutions({
        tenantId: req.auth.tenantId,
        agentId: query.data.agentId,
        status: query.data.status
      });
      return reply.send({ items });
    });

    app.get("/v1/executions/:executionId", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const execution = await opts.repository.getExecution({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      if (!execution) {
        return reply.code(404).send({ error: "execution_not_found" });
      }
      return reply.send(execution);
    });

    app.post("/v1/workflows/brand-pipeline/advance", async (req, reply) => {
      const body = BrandPipelineAdvanceBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const result = await opts.workflow.advance({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          correlationId: req.requestId,
          requestSource: "artifacts-api",
          subjectId: body.data.subjectId,
          completedSteps: body.data.completedSteps,
          nextStep: body.data.nextStep,
          payload: body.data.payload,
          evalObservations: body.data.evalObservations
        });

        return reply.code(result.execution.approvalRequired ? 202 : 200).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/orchestration/plans", async (req, reply) => {
      const body = OrchestrationPlanBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const result = await opts.orchestrationService.createDelegatedPlan({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          correlationId: req.requestId,
          requestSource: "artifacts-api",
          workflow: body.data.workflow,
          subjectId: body.data.subjectId,
          payload: body.data.payload,
          delegatedAgents: body.data.delegatedAgents,
          queueForWorker: body.data.queueForWorker
        });

        return reply.code(result.execution.approvalRequired ? 202 : 201).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/orchestration/executions", async (req, reply) => {
      const query = OrchestrationExecutionListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.orchestrationService.listWorkflowExecutions({
        tenantId: req.auth.tenantId,
        status: query.data.status,
        deadLetteredOnly: query.data.deadLetteredOnly
      });
      return reply.send({ items });
    });

    app.get("/v1/orchestration/executions/:executionId", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const result = await opts.orchestrationService.getWorkflowExecution({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      if (!result) {
        return reply.code(404).send({ error: "execution_not_found" });
      }
      return reply.send(result);
    });

    app.get("/v1/orchestration/executions/:executionId/replay-bundle", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const result = await opts.orchestrationService.buildReplayBundle({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      if (!result) {
        return reply.code(404).send({ error: "execution_not_found" });
      }
      return reply.send({
        bundle: result,
        signature: opts.signOrchestrationBundle(result, path.data.executionId)
      });
    });

    app.post("/v1/orchestration/executions/:executionId/export-bundle", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const result = await opts.orchestrationService.exportSignedReplayBundle({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId,
        actorId: req.auth.actorId,
        signBundle: opts.signOrchestrationBundle
      });
      if (!result) {
        return reply.code(404).send({ error: "execution_not_found" });
      }
      return reply.code(201).send(result);
    });

    app.get("/v1/orchestration/executions/:executionId/exports", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const items = await opts.orchestrationService.listReplayBundleExports({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/executions/:executionId/replay-bundle/verify", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      const body = OrchestrationBundleVerifyBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const bundle = await opts.orchestrationService.buildReplayBundle({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      if (!bundle) {
        return reply.code(404).send({ error: "execution_not_found" });
      }

      return reply.send(
        opts.verifyOrchestrationBundle({
          bundle,
          executionId: path.data.executionId,
          sealedAt: body.data.sealedAt,
          payloadHash: body.data.payloadHash,
          signature: body.data.signature
        })
      );
    });

    app.post("/v1/orchestration/executions/:executionId/exports/verify-history", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      const body = OrchestrationBundleVerifyBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const result = await opts.orchestrationService.verifyReplayBundleHistory({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId,
        sealedAt: body.data.sealedAt,
        payloadHash: body.data.payloadHash,
        signature: body.data.signature,
        verifyBundle: opts.verifyOrchestrationBundle
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/executions/:executionId/handoffs", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const result = await opts.orchestrationService.getHandoffAudit({
        tenantId: req.auth.tenantId,
        executionId: path.data.executionId
      });
      if (!result) {
        return reply.code(404).send({ error: "execution_not_found" });
      }
      return reply.send(result);
    });

    app.post("/v1/orchestration/approvals/escalate", async (req, reply) => {
      const body = OrchestrationEscalateBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const items = await opts.orchestrationService.escalateApprovals({
        tenantId: req.auth.tenantId,
        olderThanMinutes: body.data.olderThanMinutes,
        agentId: body.data.agentId
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/executions/:executionId/requeue", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      const body = OrchestrationRequeueBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const result = await opts.orchestrationService.requeueDeadLetteredExecution({
          tenantId: req.auth.tenantId,
          executionId: path.data.executionId,
          actorId: req.auth.actorId,
          approvalRequestId: body.data.approvalRequestId
        });
        if (!result) {
          return reply.code(404).send({ error: "execution_not_found" });
        }
        return reply.send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/orchestration/executions/:executionId/replay-request", async (req, reply) => {
      const path = ExecutionIdParamSchema.safeParse(req.params);
      const body = OrchestrationReplayRequestBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.success ? null : path.error.flatten(),
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const result = await opts.orchestrationService.requestDeadLetterReplayApproval({
          tenantId: req.auth.tenantId,
          executionId: path.data.executionId,
          actorId: req.auth.actorId
        });
        if (!result) {
          return reply.code(404).send({ error: "execution_not_found" });
        }
        return reply.code(202).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/orchestration/approvals/sla", async (req, reply) => {
      const query = OrchestrationApprovalSlaQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const report = await opts.orchestrationService.buildApprovalSlaReport({
        tenantId: req.auth.tenantId,
        olderThanMinutes: query.data.olderThanMinutes,
        agentId: query.data.agentId
      });
      return reply.send(report);
    });

    app.get("/v1/orchestration/ops/diagnostics", async (req, reply) => {
      const query = OrchestrationDiagnosticsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.getDiagnostics({
        tenantId: req.auth.tenantId,
        olderThanMinutes: query.data.olderThanMinutes
      });
      return reply.send(result);
    });

    app.post("/v1/orchestration/ops/diagnostics/export", async (req, reply) => {
      const query = OrchestrationDiagnosticsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.exportDiagnosticsSnapshot({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        olderThanMinutes: query.data.olderThanMinutes,
        signSnapshot: opts.signOrchestrationBundle
      });
      return reply.code(201).send(result);
    });

    app.get("/v1/orchestration/ops/diagnostics/exports", async (req, reply) => {
      const items = await opts.orchestrationService.listOpsSnapshotExports({
        tenantId: req.auth.tenantId,
        snapshotType: "diagnostics"
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/ops/diagnostics/exports/verify-history", async (req, reply) => {
      const body = OrchestrationOpsHistoryVerifyBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const result = await opts.orchestrationService.verifyOpsSnapshotHistory({
        tenantId: req.auth.tenantId,
        snapshotType: "diagnostics",
        sealedAt: body.data.sealedAt,
        payloadHash: body.data.payloadHash,
        signature: body.data.signature,
        verifySnapshot: opts.verifyOrchestrationBundle
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/inventory", async (req, reply) => {
      const result = await opts.orchestrationService.getOperationsInventory({
        tenantId: req.auth.tenantId
      });
      return reply.send(result);
    });

    app.post("/v1/orchestration/ops/inventory/export", async (req, reply) => {
      const result = await opts.orchestrationService.exportInventorySnapshot({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        signSnapshot: opts.signOrchestrationBundle
      });
      return reply.code(201).send(result);
    });

    app.get("/v1/orchestration/ops/inventory/exports", async (req, reply) => {
      const items = await opts.orchestrationService.listOpsSnapshotExports({
        tenantId: req.auth.tenantId,
        snapshotType: "inventory"
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/ops/inventory/exports/verify-history", async (req, reply) => {
      const body = OrchestrationOpsHistoryVerifyBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const result = await opts.orchestrationService.verifyOpsSnapshotHistory({
        tenantId: req.auth.tenantId,
        snapshotType: "inventory",
        sealedAt: body.data.sealedAt,
        payloadHash: body.data.payloadHash,
        signature: body.data.signature,
        verifySnapshot: opts.verifyOrchestrationBundle
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/workers", async (req, reply) => {
      const result = await opts.orchestrationService.getWorkerHealth({
        tenantId: req.auth.tenantId
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/workers/slo", async (req, reply) => {
      const query = WorkerFreshnessQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.getWorkerSloSummary({
        tenantId: req.auth.tenantId,
        staleAfterMinutes: query.data.staleAfterMinutes
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/workers/freshness", async (req, reply) => {
      const query = WorkerFreshnessQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.getWorkerFreshnessReport({
        tenantId: req.auth.tenantId,
        staleAfterMinutes: query.data.staleAfterMinutes
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/workers/freshness/export", async (req, reply) => {
      const query = WorkerFreshnessQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const snapshot = await opts.orchestrationService.getWorkerFreshnessReport({
        tenantId: req.auth.tenantId,
        staleAfterMinutes: query.data.staleAfterMinutes
      });
      return reply.send({
        snapshot,
        signature: opts.signOrchestrationBundle(snapshot, "ops:worker_freshness")
      });
    });

    app.post("/v1/orchestration/ops/workers/freshness/export", async (req, reply) => {
      const query = WorkerFreshnessQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.exportWorkerFreshnessSnapshot({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        staleAfterMinutes: query.data.staleAfterMinutes,
        signSnapshot: opts.signOrchestrationBundle
      });
      return reply.code(201).send(result);
    });

    app.get("/v1/orchestration/ops/workers/freshness/exports", async (req, reply) => {
      const items = await opts.orchestrationService.listOpsSnapshotExports({
        tenantId: req.auth.tenantId,
        snapshotType: "worker_freshness"
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/ops/workers/freshness/exports/verify-history", async (req, reply) => {
      const body = OrchestrationOpsHistoryVerifyBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const result = await opts.orchestrationService.verifyOpsSnapshotHistory({
        tenantId: req.auth.tenantId,
        snapshotType: "worker_freshness",
        sealedAt: body.data.sealedAt,
        payloadHash: body.data.payloadHash,
        signature: body.data.signature,
        verifySnapshot: opts.verifyOrchestrationBundle
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/alerts", async (req, reply) => {
      const query = OrchestrationAlertsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.getAlerts({
        tenantId: req.auth.tenantId,
        olderThanMinutes: query.data.olderThanMinutes,
        heartbeatStaleMinutes: query.data.heartbeatStaleMinutes
      });
      return reply.send(result);
    });

    app.post("/v1/orchestration/ops/alerts/export", async (req, reply) => {
      const query = OrchestrationOpsExportQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.orchestrationService.exportAlertsSnapshot({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        olderThanMinutes: query.data.olderThanMinutes,
        heartbeatStaleMinutes: query.data.heartbeatStaleMinutes,
        signSnapshot: opts.signOrchestrationBundle
      });
      return reply.code(201).send(result);
    });

    app.get("/v1/orchestration/ops/alerts/exports", async (req, reply) => {
      const items = await opts.orchestrationService.listOpsSnapshotExports({
        tenantId: req.auth.tenantId,
        snapshotType: "alerts"
      });
      return reply.send({ items });
    });

    app.post("/v1/orchestration/ops/alerts/exports/verify-history", async (req, reply) => {
      const body = OrchestrationOpsHistoryVerifyBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const result = await opts.orchestrationService.verifyOpsSnapshotHistory({
        tenantId: req.auth.tenantId,
        snapshotType: "alerts",
        sealedAt: body.data.sealedAt,
        payloadHash: body.data.payloadHash,
        signature: body.data.signature,
        verifySnapshot: opts.verifyOrchestrationBundle
      });
      return reply.send(result);
    });

    app.get("/v1/orchestration/ops/alerts/acks", async (req, reply) => {
      const query = OrchestrationAlertAckListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.orchestrationService.listAlertAcknowledgements({
        tenantId: req.auth.tenantId,
        alertCode: query.data.alertCode
      });
      return reply.send({ items });
    });

    app.get("/v1/orchestration/ops/alerts/:alertCode/ack-status", async (req, reply) => {
      const path = req.params as { alertCode?: string };
      const query = OrchestrationAlertAckStatusQuerySchema.safeParse(req.query ?? {});
      if (!path.alertCode || !query.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.alertCode ? null : { fieldErrors: { alertCode: ["Required"] } },
            query: query.success ? null : query.error.flatten()
          }
        });
      }

      const result = await opts.orchestrationService.getAlertAcknowledgementStatus({
        tenantId: req.auth.tenantId,
        alertCode: path.alertCode,
        expiresAfterMinutes: query.data.expiresAfterMinutes
      });
      return reply.send(result);
    });

    app.post("/v1/orchestration/ops/alerts/:alertCode/ack", async (req, reply) => {
      const path = req.params as { alertCode?: string };
      const body = OrchestrationAlertAckBodySchema.safeParse(req.body ?? {});
      if (!path.alertCode || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.alertCode ? null : { fieldErrors: { alertCode: ["Required"] } },
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      const ack = await opts.orchestrationService.acknowledgeAlert({
        tenantId: req.auth.tenantId,
        alertCode: path.alertCode,
        actorId: req.auth.actorId,
        reason: body.data.reason,
        details: body.data.details
      });
      return reply.code(201).send(ack);
    });

    app.post("/v1/orchestration/ops/alerts/:alertCode/reopen", async (req, reply) => {
      const path = req.params as { alertCode?: string };
      const body = OrchestrationAlertReopenBodySchema.safeParse(req.body ?? {});
      if (!path.alertCode || !body.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: {
            params: path.alertCode ? null : { fieldErrors: { alertCode: ["Required"] } },
            body: body.success ? null : body.error.flatten()
          }
        });
      }

      try {
        const reopened = await opts.orchestrationService.reopenAlert({
          tenantId: req.auth.tenantId,
          alertCode: path.alertCode,
          actorId: req.auth.actorId,
          reason: body.data.reason
        });
        return reply.send(reopened);
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/orchestration/ops/runbook", async (_req, reply) => {
      return reply.send({
        commands: {
          envPreflight: "pnpm agent-os:env:preflight",
          runOnce: "pnpm agent-os:worker:run-once",
          runLoop: "pnpm agent-os:worker:loop",
          daemon: "pnpm agent-os:worker:daemon",
          smoke: "pnpm agent-os:worker:smoke",
          opsSmoke: "pnpm agent-os:ops:smoke",
          opsSmokeDeployed: "pnpm agent-os:ops:smoke:deployed",
          releaseCheck: "pnpm agent-os:worker:release:check",
          fullReleaseCheck: "pnpm agent-os:release:check",
          deployedReleaseCheck: "pnpm agent-os:release:check:deployed"
        },
        validation: {
          deploymentProfileCheck: "pnpm agent-os:deployment:check",
          migrationCheck: "pnpm agent-os:verify:migrations"
        },
        requiredEnv: ["DATABASE_URL", "AGENT_OS_TENANT_ID"],
        optionalEnv: [
          "AGENT_OS_BASE_URL",
          "AGENT_OS_AUTH_TOKEN",
          "AGENT_OS_AUTH_JWT_SECRET",
          "AGENT_OS_AGENT_ID",
          "AGENT_OS_WORKER_LIMIT",
          "AGENT_OS_RETRY_DELAY_MS",
          "AGENT_OS_LOOP_INTERVAL_MS",
          "AGENT_OS_MAX_ITERATIONS",
          "AGENT_OS_WORKER_ID",
          "AGENT_OS_DEPLOYMENT_PROFILE"
        ]
      });
    });

    app.post("/v1/internal/workers/executions/claim", async (req, reply) => {
      const body = WorkerClaimExecutionsBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const items = await opts.workerService.claimExecutionJobs({
        tenantId: req.auth.tenantId,
        agentId: body.data.agentId,
        limit: body.data.limit
      });
      return reply.send({ items });
    });

    app.post("/v1/internal/workers/orchestration/process", async (req, reply) => {
      const body = OrchestrationWorkerProcessBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const result = await opts.runtimeService.processExecutionJobs({
        tenantId: req.auth.tenantId,
        agentId: "maestro",
        limit: body.data.limit,
        retryDelayMs: body.data.retryDelayMs
      });
      return reply.send(result);
    });

    app.post("/v1/internal/workers/evals/queue", async (req, reply) => {
      const body = WorkerQueueEvalBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const item = await opts.workerService.queueEvalJob({
        tenantId: req.auth.tenantId,
        agentId: body.data.agentId,
        suiteName: body.data.suiteName,
        createdBy: req.auth.actorId
      });
      return reply.code(201).send(item);
    });

    app.post("/v1/internal/workers/evals/claim", async (req, reply) => {
      const body = WorkerClaimEvalsBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const items = await opts.workerService.claimEvalJobs({
        tenantId: req.auth.tenantId,
        agentId: body.data.agentId,
        limit: body.data.limit
      });
      return reply.send({ items });
    });
  };
}
