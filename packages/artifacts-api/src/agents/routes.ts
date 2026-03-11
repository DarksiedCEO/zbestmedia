import type { FastifyPluginAsync } from "fastify";

import {
  AgentLifecycleStateError,
  AgentOsRepository,
  AgentExecutionService,
  AgentMemoryAccessError,
  BrandPipelineWorkflowError,
  BrandPipelineOrchestrator,
  EvalRunnerService,
  MemoryPartitionService
} from "@zbest/agent-os";

import {
  AgentIdParamSchema,
  ApprovalDecisionBodySchema,
  ApprovalRequestIdParamSchema,
  BrandPipelineAdvanceBodySchema,
  EvalRunBodySchema,
  ExecuteAgentBodySchema,
  LifecycleTransitionBodySchema,
  ListAgentsQuerySchema,
  MemoryQuerySchema,
  MemoryWriteBodySchema,
  ProvisionFoundationBodySchema
} from "./schemas";

export function agentRoutes(opts: {
  repository: AgentOsRepository;
  executionService: AgentExecutionService;
  memoryService: MemoryPartitionService;
  evalRunner: EvalRunnerService;
  workflow: BrandPipelineOrchestrator;
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
          payload: body.data.payload
        });

        return reply.code(result.approvalRequired ? 202 : 200).send(result);
      } catch (error) {
        return handleAgentError(reply, error);
      }
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
  };
}
