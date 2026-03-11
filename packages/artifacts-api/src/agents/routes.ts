import type { FastifyPluginAsync } from "fastify";

import {
  AgentLifecycleStateError,
  AgentOsRepository,
  AgentExecutionService,
  AgentMemoryAccessError,
  AgentVersionService,
  AgentWorkerService,
  BrandPipelineWorkflowError,
  BrandPipelineOrchestrator,
  EvalRunnerService,
  MemoryPartitionService
} from "@zbest/agent-os";

import {
  AgentIdParamSchema,
  ApprovalDecisionBodySchema,
  ApprovalListQuerySchema,
  ApprovalRequestIdParamSchema,
  BrandPipelineAdvanceBodySchema,
  ExecutionIdParamSchema,
  ExecutionListQuerySchema,
  EvalRunBodySchema,
  ExecuteAgentBodySchema,
  AgentVersionCreateBodySchema,
  AgentVersionPromoteBodySchema,
  LifecycleTransitionBodySchema,
  ListAgentsQuerySchema,
  MemoryQuerySchema,
  MemoryWriteBodySchema,
  ProvisionFoundationBodySchema,
  WorkerClaimEvalsBodySchema,
  WorkerClaimExecutionsBodySchema,
  WorkerQueueEvalBodySchema
} from "./schemas";

export function agentRoutes(opts: {
  repository: AgentOsRepository;
  executionService: AgentExecutionService;
  memoryService: MemoryPartitionService;
  evalRunner: EvalRunnerService;
  workflow: BrandPipelineOrchestrator;
  versionService: AgentVersionService;
  workerService: AgentWorkerService;
}): FastifyPluginAsync {
  return async (app) => {
    function handleAgentError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
      if (error instanceof AgentLifecycleStateError) {
        return reply.code(409).send({ error: error.message });
      }
      if (error instanceof AgentMemoryAccessError || error instanceof BrandPipelineWorkflowError) {
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
