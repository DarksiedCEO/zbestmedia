import type { FastifyPluginAsync } from "fastify";

import {
  AgentAdminService,
  EmailAssistantService,
  EmailAccountConfigurationError,
  AgentLifecycleStateError,
  AgentOsRepository,
  AgentExecutionService,
  AgentExecutionLedgerService,
  AgentIncidentService,
  AgentTelemetryService,
  AgentMemoryAccessError,
  AgentRuntimeService,
  ApprovalEscalationService,
  AgentVersionService,
  AgentOrgRoutingService,
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
  AssignmentRecordIdParamSchema,
  AssignmentRecordListQuerySchema,
  AgentIncidentAcknowledgeBodySchema,
  AgentIncidentListQuerySchema,
  AgentIncidentResolveBodySchema,
  AgentIncidentSignalBodySchema,
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
  EmailAccountDetailResponseSchema,
  EmailAccountIdParamSchema,
  EmailAccountListQuerySchema,
  EmailAccountListResponseSchema,
  EmailAccountProcessBatchResponseSchema,
  EmailAccountProcessBodySchema,
  EmailReviewActionBodySchema,
  EmailDispatchRequestBodySchema,
  EmailDispatchIdParamSchema,
  EmailReviewItemIdParamSchema,
  EmailReviewListQuerySchema,
  EmailAccountProcessSingleResponseSchema,
  EmailAccountThreadIdParamSchema,
  OrchestrationEscalateBodySchema,
  OrchestrationExecutionListQuerySchema,
  OrchestrationPlanBodySchema,
  OrchestrationReplayRequestBodySchema,
  OrchestrationRequeueBodySchema,
  OrchestrationWorkerProcessBodySchema,
  BrandPipelineAdvanceBodySchema,
  ExecutionIdParamSchema,
  ExecutionRunIdParamSchema,
  ExecutionRunListQuerySchema,
  IncidentIdParamSchema,
  GmailOauthCallbackBodySchema,
  GmailOauthCallbackResponseSchema,
  GmailOauthStartBodySchema,
  GmailOauthStartResponseSchema,
  ExecutiveIdParamSchema,
  ExecutionListQuerySchema,
  EvalRunBodySchema,
  ExecuteAgentBodySchema,
  OrgAgentIdParamSchema,
  OperationalSignalParamSchema,
  RoutingResolveBodySchema,
  AgentVersionCreateBodySchema,
  AgentVersionPromoteBodySchema,
  AdminIntegrityResponseSchema,
  AdminRoutingCategoriesResponseSchema,
  AdminRoutingPreviewResponseSchema,
  AdminSummaryResponseSchema,
  AdminExecutionRecordListResponseSchema,
  AdminExecutionRecordDetailResponseSchema,
  AdminExecutionRunListResponseSchema,
  AdminExecutionRunDetailResponseSchema,
  AdminIncidentListResponseSchema,
  AdminIncidentDetailResponseSchema,
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
  orgRoutingService: AgentOrgRoutingService;
  executionService: AgentExecutionService;
  incidentService: AgentIncidentService;
  telemetryService: AgentTelemetryService;
  adminService: AgentAdminService;
  emailService: EmailAssistantService;
  ledgerService: AgentExecutionLedgerService;
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
    const orgManifestVersion = opts.orgService.getManifestVersion();

    function orgOwnershipForLeadAgent(leadAgent: ReturnType<typeof opts.orgService.getLeadAgent>) {
      return {
        executive: opts.orgService.getExecutive(leadAgent.reportsToExecutiveId),
        department: opts.orgService.getDepartment(leadAgent.departmentId),
        leadAgent
      };
    }

    function orgOwnershipForSignal(signalType: Parameters<typeof opts.orgService.resolveOperationalSignalOwner>[0]) {
      const ownership = opts.orgService.resolveOperationalSignalOwner(signalType);
      return {
        executive: opts.orgService.getExecutive(ownership.leadAgent.reportsToExecutiveId),
        department: opts.orgService.getDepartment(ownership.leadAgent.departmentId),
        leadAgent: ownership.leadAgent,
        subAgent: ownership.subAgent
      };
    }

    function handleAgentError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
      if (error instanceof AgentLifecycleStateError) {
        return reply.code(409).send({ error: error.message });
      }
      if (
        error instanceof AgentMemoryAccessError ||
        error instanceof EmailAccountConfigurationError ||
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

    function handleIncidentError(reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, error: unknown) {
      if (error instanceof Error && (error.message === "incident_not_found" || error.message === "incident_not_found_or_resolved")) {
        return reply.code(404).send({ error: error.message });
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
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "org_manifest",
        manifest: opts.orgService.getManifest()
      });
    });

    app.get("/v1/agent-os/org/executives/:executiveId", async (req, reply) => {
      const path = ExecutiveIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "executive_detail",
        executiveId: path.data.executiveId,
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
        manifestVersion: orgManifestVersion,
        resourceType: "department_detail",
        departmentId: path.data.departmentId,
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
        return reply.send({
          manifestVersion: orgManifestVersion,
          resourceType: "agent_detail",
          agentId,
          agentType: "sub-agent",
          subAgent: opts.orgService.getSubAgent(agentId)
        });
      }

      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "agent_detail",
        agentId,
        agentType: "lead-agent",
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
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "reporting_chain",
        agentId: path.data.agentId,
        chain: opts.orgService.getReportingChain(path.data.agentId as never)
      });
    });

    app.get("/v1/agent-os/org/ownership/responsibilities/:responsibilityKey", async (req, reply) => {
      const path = ResponsibilityKeyParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const owner = opts.orgService.resolveResponsibilityOwner(path.data.responsibilityKey);
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "responsibility_ownership",
        responsibilityKey: path.data.responsibilityKey,
        supported: owner !== null,
        ownership: owner ? orgOwnershipForLeadAgent(owner) : null
      });
    });

    app.get("/v1/agent-os/org/ownership/operational-signals/:signalType", async (req, reply) => {
      const path = OperationalSignalParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "operational_signal_ownership",
        signalType: path.data.signalType,
        supported: true,
        ownership: orgOwnershipForSignal(path.data.signalType)
      });
    });

    app.get("/v1/agent-os/org/code-sentinel/signals", async (_req, reply) => {
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "code_sentinel_signal_list",
        items: opts.orgService.listCodeSentinelSignals()
      });
    });

    app.get("/v1/agent-os/org/code-sentinel/signals/:signalType", async (req, reply) => {
      const path = OperationalSignalParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const ownership = opts.orgService.getCodeSentinelSignal(path.data.signalType);
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "code_sentinel_signal_detail",
        signalType: path.data.signalType,
        supported: true,
        signal: ownership.definition,
        ownership: {
          executive: opts.orgService.getExecutive(ownership.leadAgent.reportsToExecutiveId),
          department: opts.orgService.getDepartment(ownership.leadAgent.departmentId),
          leadAgent: ownership.leadAgent,
          subAgent: ownership.subAgent
        }
      });
    });

    app.post("/v1/agent-os/org/routing/resolve", async (req, reply) => {
      const body = RoutingResolveBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const decision = opts.orgRoutingService.resolve(body.data);
        return reply.send({
          manifestVersion: orgManifestVersion,
          resourceType: "routing_decision",
          decision
        });
      } catch (error) {
        if (error instanceof Error) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    });

    app.get("/v1/agent-os/email/accounts", async (req, reply) => {
      const query = EmailAccountListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }
      const items = await opts.emailService.listAccounts({
        tenantId: req.auth.tenantId,
        limit: query.data.limit
      });
      return reply.send({
        resourceType: "email_account_list",
        items
      });
    });

    app.get("/v1/agent-os/email/accounts/:accountId", async (req, reply) => {
      const path = EmailAccountIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const account = await opts.emailService.getAccount({
        tenantId: req.auth.tenantId,
        accountId: path.data.accountId
      });
      if (!account) {
        return reply.code(404).send({ error: "email_account_not_found" });
      }
      return reply.send({
        resourceType: "email_account_detail",
        account
      });
    });

    app.post("/v1/agent-os/email/accounts/gmail/oauth/start", async (req, reply) => {
      const body = GmailOauthStartBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }
      try {
        const result = await opts.emailService.beginGmailOAuthConnection({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          principalId: body.data.principalId,
          accountEmailAddress: body.data.accountEmailAddress ?? null,
          processingEnabled: body.data.processingEnabled,
          maxBatchThreads: body.data.maxBatchThreads,
          allowedLabelIds: body.data.allowedLabelIds
        });
        return reply.code(201).send({
          resourceType: "gmail_oauth_start",
          ...result
        });
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/agent-os/email/accounts/gmail/oauth/callback", async (req, reply) => {
      const body = GmailOauthCallbackBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }
      try {
        const account = await opts.emailService.completeGmailOAuthConnection({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          state: body.data.state,
          code: body.data.code
        });
        return reply.send({
          resourceType: "gmail_oauth_callback",
          account
        });
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/agent-os/email/accounts/:accountId/process", async (req, reply) => {
      const path = EmailAccountIdParamSchema.safeParse(req.params);
      const body = EmailAccountProcessBodySchema.safeParse(req.body ?? {});
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
        const result = await opts.emailService.processEligibleInboxThreads({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          correlationId: req.id,
          requestSource: "artifacts-api",
          accountId: path.data.accountId,
          maxThreads: body.data.maxThreads
        });
        return reply.send({
          resourceType: "email_account_process_batch",
          ...result
        });
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.post("/v1/agent-os/email/accounts/:accountId/threads/:threadId/process", async (req, reply) => {
      const path = EmailAccountThreadIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      try {
        const result = await opts.emailService.processAccountThreadById({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          correlationId: req.id,
          requestSource: "artifacts-api",
          accountId: path.data.accountId,
          threadId: path.data.threadId
        });
        return reply.send({
          resourceType: "email_account_process_single",
          ...result
        });
      } catch (error) {
        return handleAgentError(reply, error);
      }
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

    app.get("/v1/agent-os/execution/records", async (req, reply) => {
      const query = AssignmentRecordListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.ledgerService.listAssignmentRecords({
        tenantId: req.auth.tenantId,
        limit: query.data.limit
      });
      return reply.send({ items });
    });

    app.get("/v1/agent-os/execution/records/:recordId", async (req, reply) => {
      const path = AssignmentRecordIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const item = await opts.ledgerService.getAssignmentRecord({
        tenantId: req.auth.tenantId,
        assignmentRecordId: path.data.recordId
      });
      if (!item) {
        return reply.code(404).send({ error: "assignment_record_not_found" });
      }
      return reply.send(item);
    });

    app.get("/v1/agent-os/execution/runs", async (req, reply) => {
      const query = ExecutionRunListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const items = await opts.ledgerService.listExecutionRunRecords({
        tenantId: req.auth.tenantId,
        currentState: query.data.currentState,
        limit: query.data.limit
      });
      return reply.send({ items });
    });

    app.get("/v1/agent-os/execution/runs/:runId", async (req, reply) => {
      const path = ExecutionRunIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const item = await opts.ledgerService.getExecutionRunRecord({
        tenantId: req.auth.tenantId,
        runRecordId: path.data.runId
      });
      if (!item) {
        return reply.code(404).send({ error: "execution_run_not_found" });
      }
      return reply.send(item);
    });

    app.get("/v1/agent-os/incidents", async (req, reply) => {
      const query = AgentIncidentListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      return reply.send({
        resourceType: "incident_list",
        items: await opts.incidentService.listIncidents({
          tenantId: req.auth.tenantId,
          ...query.data
        })
      });
    });

    app.get("/v1/agent-os/incidents/:incidentId", async (req, reply) => {
      const path = IncidentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const incident = await opts.incidentService.getIncident({
        tenantId: req.auth.tenantId,
        incidentId: path.data.incidentId
      });
      if (!incident) {
        return reply.code(404).send({ error: "incident_not_found" });
      }
      return reply.send({
        resourceType: "incident_detail",
        incident
      });
    });

    app.post("/v1/agent-os/incidents/signals", async (req, reply) => {
      const body = AgentIncidentSignalBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      const incident = await opts.incidentService.createFromOperationalSignal({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        signal: body.data
      });

      return reply.code(201).send({
        resourceType: "incident_detail",
        incident
      });
    });

    app.post("/v1/agent-os/incidents/:incidentId/acknowledge", async (req, reply) => {
      const path = IncidentIdParamSchema.safeParse(req.params);
      const body = AgentIncidentAcknowledgeBodySchema.safeParse(req.body ?? {});
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const incident = await opts.incidentService.acknowledgeIncident({
          tenantId: req.auth.tenantId,
          incidentId: path.data.incidentId,
          actorId: req.auth.actorId,
          acknowledgedAt: body.data.acknowledgedAt
        });
        return reply.send({
          resourceType: "incident_detail",
          incident
        });
      } catch (error) {
        return handleIncidentError(reply, error);
      }
    });

    app.post("/v1/agent-os/incidents/:incidentId/resolve", async (req, reply) => {
      const path = IncidentIdParamSchema.safeParse(req.params);
      const body = AgentIncidentResolveBodySchema.safeParse(req.body);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const incident = await opts.incidentService.resolveIncident({
          tenantId: req.auth.tenantId,
          incidentId: path.data.incidentId,
          actorId: req.auth.actorId,
          resolutionNote: body.data.resolutionNote,
          resolvedAt: body.data.resolvedAt
        });
        return reply.send({
          resourceType: "incident_detail",
          incident
        });
      } catch (error) {
        return handleIncidentError(reply, error);
      }
    });

    app.get("/v1/agent-os/ops/status", async (req, reply) => {
      const summary = await opts.telemetryService.getOpsStatusSummary({
        tenantId: req.auth.tenantId
      });

      return reply.send({
        manifestVersion: summary.manifestVersion,
        resourceType: "ops_status_summary",
        summary
      });
    });

    app.get("/v1/agent-os/ops/incidents/summary", async (req, reply) => {
      const summary = await opts.telemetryService.getIncidentSummary({
        tenantId: req.auth.tenantId
      });

      return reply.send({
        manifestVersion: summary.manifestVersion,
        resourceType: "ops_incident_summary",
        summary
      });
    });

    app.get("/v1/agent-os/ops/execution/summary", async (req, reply) => {
      const summary = await opts.telemetryService.getExecutionSummary({
        tenantId: req.auth.tenantId
      });

      return reply.send({
        manifestVersion: summary.manifestVersion,
        resourceType: "ops_execution_summary",
        summary
      });
    });

    app.get("/v1/agent-os/ops/code-sentinel/summary", async (req, reply) => {
      const summary = await opts.telemetryService.getCodeSentinelSummary({
        tenantId: req.auth.tenantId
      });

      return reply.send({
        manifestVersion: summary.manifestVersion,
        resourceType: "ops_code_sentinel_summary",
        summary
      });
    });


    app.get("/v1/agent-os/email/review", async (req, reply) => {
      const query = EmailReviewListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      return reply.send({
        resourceType: "email_review_list",
        items: await opts.emailService.listReviewItems({
          tenantId: req.auth.tenantId,
          ...query.data
        })
      });
    });

    app.get("/v1/agent-os/email/review/:reviewItemId", async (req, reply) => {
      const path = EmailReviewItemIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const item = await opts.emailService.getReviewItem({
        tenantId: req.auth.tenantId,
        reviewItemId: path.data.reviewItemId
      });
      if (!item) {
        return reply.code(404).send({ error: "email_review_item_not_found" });
      }
      return reply.send({ resourceType: "email_review_detail", item });
    });

    app.post("/v1/agent-os/email/review/:reviewItemId/approve", async (req, reply) => {
      const path = EmailReviewItemIdParamSchema.safeParse(req.params);
      const body = EmailReviewActionBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({ error: "invalid_request", details: { params: path.success ? null : path.error.flatten(), body: body.success ? null : body.error.flatten() } });
      }
      try {
        const item = await opts.emailService.approveReviewItem({
          tenantId: req.auth.tenantId,
          reviewItemId: path.data.reviewItemId,
          actorId: req.auth.actorId,
          note: body.data.note
        });
        return reply.send({ resourceType: "email_review_action", action: "approve", item });
      } catch (error) {
        if (error instanceof Error && ["email_review_item_not_found", "email_review_state_conflict"].includes(error.message)) {
          return reply.code(error.message === "email_review_item_not_found" ? 404 : 409).send({ error: error.message });
        }
        if (error instanceof Error && error.message.startsWith("invalid_email_review_transition")) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    });

    app.post("/v1/agent-os/email/review/:reviewItemId/reject", async (req, reply) => {
      const path = EmailReviewItemIdParamSchema.safeParse(req.params);
      const body = EmailReviewActionBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success) {
        return reply.code(400).send({ error: "invalid_request", details: { params: path.success ? null : path.error.flatten(), body: body.success ? null : body.error.flatten() } });
      }
      try {
        const item = await opts.emailService.rejectReviewItem({
          tenantId: req.auth.tenantId,
          reviewItemId: path.data.reviewItemId,
          actorId: req.auth.actorId,
          note: body.data.note
        });
        return reply.send({ resourceType: "email_review_action", action: "reject", item });
      } catch (error) {
        if (error instanceof Error && ["email_review_item_not_found", "email_review_state_conflict"].includes(error.message)) {
          return reply.code(error.message === "email_review_item_not_found" ? 404 : 409).send({ error: error.message });
        }
        if (error instanceof Error && error.message.startsWith("invalid_email_review_transition")) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    });

    app.post("/v1/agent-os/email/review/:reviewItemId/request-revision", async (req, reply) => {
      const path = EmailReviewItemIdParamSchema.safeParse(req.params);
      const body = EmailReviewActionBodySchema.safeParse(req.body ?? {});
      if (!path.success || !body.success || !body.data.note) {
        return reply.code(400).send({ error: "invalid_request", details: { params: path.success ? null : path.error.flatten(), body: body.success ? null : body.error.flatten() } });
      }
      try {
        const item = await opts.emailService.requestReviewRevision({
          tenantId: req.auth.tenantId,
          reviewItemId: path.data.reviewItemId,
          actorId: req.auth.actorId,
          note: body.data.note
        });
        return reply.send({ resourceType: "email_review_action", action: "request_revision", item });
      } catch (error) {
        if (error instanceof Error && ["email_review_item_not_found", "email_review_state_conflict"].includes(error.message)) {
          return reply.code(error.message === "email_review_item_not_found" ? 404 : 409).send({ error: error.message });
        }
        if (error instanceof Error && error.message.startsWith("invalid_email_review_transition")) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    });

    app.post("/v1/agent-os/email/review/:reviewItemId/dispatch", async (req, reply) => {
      const path = EmailReviewItemIdParamSchema.safeParse(req.params);
      const body = EmailDispatchRequestBodySchema.safeParse(req.body ?? {});
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
        const result = await opts.emailService.dispatchApprovedReviewItem({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          reviewItemId: path.data.reviewItemId
        });
        return reply.send({ resourceType: "email_dispatch_result", ...result });
      } catch (error) {
        if (error instanceof Error && ["email_dispatch_review_item_not_found", "email_dispatch_account_not_found"].includes(error.message)) {
          return reply.code(404).send({ error: error.message });
        }
        throw error;
      }
    });

    app.get("/v1/agent-os/email/dispatch/:dispatchId", async (req, reply) => {
      const path = EmailDispatchIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }
      const dispatch = await opts.emailService.getDispatchRecord({
        tenantId: req.auth.tenantId,
        dispatchId: path.data.dispatchId
      });
      if (!dispatch) {
        return reply.code(404).send({ error: "email_dispatch_not_found" });
      }
      return reply.send({ resourceType: "email_dispatch_detail", dispatch });
    });

    app.get("/v1/agent-os/admin/summary", async (req, reply) => {
      const summary = await opts.adminService.getControlPlaneSummary({
        tenantId: req.auth.tenantId
      });
      return reply.send({
        manifestVersion: summary.manifestVersion,
        resourceType: "admin_summary",
        summary
      });
    });

    app.get("/v1/agent-os/admin/integrity", async (_req, reply) => {
      const integrity = opts.adminService.getIntegrityStatus();
      return reply.send({
        manifestVersion: integrity.manifestVersion,
        resourceType: "admin_integrity",
        integrity
      });
    });

    app.get("/v1/agent-os/admin/routing/categories", async (_req, reply) => {
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_routing_categories",
        items: opts.adminService.getSupportedRoutingCategories()
      });
    });

    app.post("/v1/agent-os/admin/routing/preview", async (req, reply) => {
      const body = RoutingResolveBodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
      }

      try {
        const decision = opts.adminService.previewRoutingDecision(body.data);
        return reply.send({
          manifestVersion: orgManifestVersion,
          resourceType: "admin_routing_preview",
          decision
        });
      } catch (error) {
        return handleAgentError(reply, error);
      }
    });

    app.get("/v1/agent-os/admin/execution/records", async (req, reply) => {
      const query = AssignmentRecordListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.adminService.listExecutionRecords({
        tenantId: req.auth.tenantId,
        limit: query.data.limit
      });
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_execution_record_list",
        ...result
      });
    });

    app.get("/v1/agent-os/admin/execution/records/:recordId", async (req, reply) => {
      const path = AssignmentRecordIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const item = await opts.adminService.getExecutionRecord({
        tenantId: req.auth.tenantId,
        assignmentRecordId: path.data.recordId
      });
      if (!item) {
        return reply.code(404).send({ error: "assignment_record_not_found" });
      }
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_execution_record_detail",
        item
      });
    });

    app.get("/v1/agent-os/admin/execution/runs", async (req, reply) => {
      const query = ExecutionRunListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.adminService.listExecutionRuns({
        tenantId: req.auth.tenantId,
        currentState: query.data.currentState,
        limit: query.data.limit
      });
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_execution_run_list",
        ...result
      });
    });

    app.get("/v1/agent-os/admin/execution/runs/:runId", async (req, reply) => {
      const path = ExecutionRunIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const item = await opts.adminService.getExecutionRun({
        tenantId: req.auth.tenantId,
        runRecordId: path.data.runId
      });
      if (!item) {
        return reply.code(404).send({ error: "execution_run_not_found" });
      }
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_execution_run_detail",
        item
      });
    });

    app.get("/v1/agent-os/admin/incidents", async (req, reply) => {
      const query = AgentIncidentListQuerySchema.safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "invalid_query", details: query.error.flatten() });
      }

      const result = await opts.adminService.listIncidents({
        tenantId: req.auth.tenantId,
        ...query.data
      });
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_incident_list",
        ...result
      });
    });

    app.get("/v1/agent-os/admin/incidents/:incidentId", async (req, reply) => {
      const path = IncidentIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({ error: "invalid_path", details: path.error.flatten() });
      }

      const item = await opts.adminService.getIncident({
        tenantId: req.auth.tenantId,
        incidentId: path.data.incidentId
      });
      if (!item) {
        return reply.code(404).send({ error: "incident_not_found" });
      }
      return reply.send({
        manifestVersion: orgManifestVersion,
        resourceType: "admin_incident_detail",
        item
      });
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
