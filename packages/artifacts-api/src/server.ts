import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  AgentAdminService,
  AaliyahCommandSurfaceService,
  AaliyahCalendarService,
  AaliyahCrmService,
  AaliyahDiagnosticsService,
  AaliyahFounderCommandService,
  AaliyahFollowThroughEngineService,
  AaliyahRecommendationEngineService,
  AaliyahFounderBriefingService,
  AaliyahFounderInboxTriageService,
  AaliyahTasksService,
  AaliyahMemoryBoundaryService,
  AaliyahPreferenceService,
  AaliyahWorkspaceService,
  AaliyahFounderReviewQueueService,
  AaliyahFollowThroughService,
  AaliyahSessionContextService,
  AaliyahRuntimeService,
  EmailAssistantService,
  AgentExecutionService,
  AgentExecutionLedgerService,
  AgentIncidentService,
  AgentTelemetryService,
  ensureOrgSystemIntegrity,
  AgentOrgRoutingService,
  AgentOrgService,
  AgentOsRepository,
  createAgentPromptExecutorFromEnv,
  AgentRuntimeService,
  ApprovalEscalationService,
  ApprovalWorkflowService,
  AgentVersionService,
  AgentWorkerService,
  BrandPipelineOrchestrator,
  EvalRunnerService,
  MaestroOrchestrationService,
  MemoryPartitionService,
  VoiceRuntimeService
} from "@zbest/agent-os";

import { agentRoutes } from "./agents/routes";
import { artifactRoutes } from "./artifacts/routes";
import { canonicalJson, sha256Hex, signArtifact, verifyArtifactSignature } from "./crypto";
import { ArtifactGenerationOrchestrator } from "./artifacts/generationOrchestrator";
import { createOrcaGenerationClient } from "./artifacts/orcaClient";
import { ArtifactService } from "./artifacts/service";
import { TenantWriteBudget } from "./budgets/tenantBudget";
import { loadEnv, type AppEnv } from "./config/env";
import { createPool } from "./db/pool";
import { authPlugin } from "./http/auth";
import { shouldBypassResolveRateLimit } from "./http/rateLimitBypass";
import { requestIdPlugin } from "./http/requestId";
import { leadModule } from "./lead/leadModule";
import { snapshotMetrics } from "./metrics/counters";
import { PolicyFirewall } from "./policy/firewall";
import { POLICY_CONTRACT_VERSION } from "./agency/policy/contract";
import { policyRoutes } from "./agency/policy/http/routes";

export async function buildServer(envInput?: AppEnv): Promise<FastifyInstance> {
  const env = envInput ?? loadEnv();
  ensureOrgSystemIntegrity();
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      base: null
    }
  });

  await app.register(requestIdPlugin);
  await app.register(authPlugin, { jwtSecret: env.AUTH_JWT_SECRET });
  const loadtestBypassEnabled = process.env.POLICY_LOADTEST_RATE_LIMIT_BYPASS === "true";
  await app.register(rateLimit, {
    hook: "preHandler",
    max: 120,
    timeWindow: 60_000,
    allowList: (req) =>
      shouldBypassResolveRateLimit({
        enabled: loadtestBypassEnabled,
        method: req.raw.method,
        url: req.raw.url
      }),
    keyGenerator: (req) => {
      const tenantId = req.auth?.tenantId;
      return tenantId ? `t:${tenantId}` : `ip:${req.ip}`;
    }
  });
  const pool = createPool(env.DATABASE_URL);
  const artifactService = new ArtifactService(pool, env.ARTIFACT_SIGNING_KEY);
  const generation = new ArtifactGenerationOrchestrator(artifactService, createOrcaGenerationClient(env));
  const agentRepository = new AgentOsRepository(pool);
  const agentOrgService = new AgentOrgService();
  const agentOrgRoutingService = new AgentOrgRoutingService(agentOrgService);
  const approvalWorkflow = new ApprovalWorkflowService(agentRepository);
  const ledgerService = new AgentExecutionLedgerService(agentRepository, agentOrgService);
  const incidentService = new AgentIncidentService(agentRepository, agentOrgService);
  const telemetryService = new AgentTelemetryService(ledgerService, incidentService, agentOrgService);
  const adminService = new AgentAdminService(
    agentOrgService,
    agentOrgRoutingService,
    ledgerService,
    incidentService,
    telemetryService
  );
  const emailService = new EmailAssistantService(agentRepository, ledgerService, incidentService);
  const voiceService = new VoiceRuntimeService(agentRepository, ledgerService, incidentService);
  const aaliyahDiagnosticsService = new AaliyahDiagnosticsService(agentRepository);
  const aaliyahWorkspaceService = new AaliyahWorkspaceService(agentRepository, aaliyahDiagnosticsService);
  const aaliyahCalendarService = new AaliyahCalendarService(agentRepository, aaliyahDiagnosticsService);
  const aaliyahCrmService = new AaliyahCrmService(agentRepository, aaliyahDiagnosticsService);
  const aaliyahTasksService = new AaliyahTasksService(agentRepository, aaliyahDiagnosticsService);
  const aaliyahFounderCommandService = new AaliyahFounderCommandService(
    agentRepository,
    emailService,
    aaliyahTasksService,
    aaliyahCrmService,
    aaliyahCalendarService,
    aaliyahDiagnosticsService
  );
  const aaliyahFollowThroughEngineService = new AaliyahFollowThroughEngineService(
    agentRepository,
    aaliyahTasksService,
    aaliyahDiagnosticsService
  );
  const aaliyahRecommendationEngineService = new AaliyahRecommendationEngineService(
    agentRepository,
    aaliyahDiagnosticsService
  );
  const aaliyahPreferenceService = new AaliyahPreferenceService(agentRepository);
  const aaliyahMemoryBoundaryService = new AaliyahMemoryBoundaryService();
  const aaliyahSessionService = new AaliyahSessionContextService(agentRepository, aaliyahMemoryBoundaryService, aaliyahDiagnosticsService);
  const aaliyahFollowThroughService = new AaliyahFollowThroughService(
    agentRepository,
    aaliyahSessionService,
    aaliyahMemoryBoundaryService,
    aaliyahDiagnosticsService
  );
  const aaliyahBriefingService = new AaliyahFounderBriefingService(
    agentOrgService,
    telemetryService,
    incidentService,
    ledgerService,
    emailService.getReviewQueueService(),
    aaliyahPreferenceService,
    aaliyahMemoryBoundaryService
  );
  const aaliyahReviewQueueService = new AaliyahFounderReviewQueueService(
    agentOrgService,
    aaliyahBriefingService,
    emailService,
    voiceService,
    incidentService
  );
  const aaliyahTriageService = new AaliyahFounderInboxTriageService(
    agentOrgService,
    aaliyahReviewQueueService,
    agentRepository
  );
  const aaliyahCommandSurfaceService = new AaliyahCommandSurfaceService(
    agentOrgService,
    aaliyahBriefingService,
    emailService,
    voiceService,
    telemetryService,
    aaliyahReviewQueueService,
    aaliyahTriageService,
    aaliyahPreferenceService,
    aaliyahMemoryBoundaryService
  );
  const aaliyahRuntimeService = new AaliyahRuntimeService(
    agentOrgService,
    aaliyahBriefingService,
    aaliyahCommandSurfaceService,
    emailService,
    voiceService,
    telemetryService,
    adminService,
    aaliyahReviewQueueService,
    aaliyahSessionService,
    aaliyahFollowThroughService,
    aaliyahTriageService,
    aaliyahPreferenceService,
    aaliyahMemoryBoundaryService
  );
  const agentExecutionService = new AgentExecutionService(
    agentRepository,
    approvalWorkflow,
    createAgentPromptExecutorFromEnv(process.cwd()),
    undefined,
    undefined,
    ledgerService,
    incidentService
  );
  const memoryService = new MemoryPartitionService(agentRepository);
  const evalRunner = new EvalRunnerService(agentRepository);
  const brandWorkflow = new BrandPipelineOrchestrator(agentExecutionService, evalRunner);
  const versionService = new AgentVersionService(agentRepository);
  const workerService = new AgentWorkerService(agentRepository);
  const runtimeService = new AgentRuntimeService(agentRepository, ledgerService);
  const approvalEscalationService = new ApprovalEscalationService(agentRepository);
  const orchestrationService = new MaestroOrchestrationService(
    agentRepository,
    agentExecutionService,
    approvalEscalationService
  );
  const writeBudget = new TenantWriteBudget(env.MAX_ARTIFACT_WRITES_PER_MINUTE);
  const policyFirewall = new PolicyFirewall(env);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Policy-Contract-Version", POLICY_CONTRACT_VERSION);
    return payload;
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/metrics", async () => snapshotMetrics());
  await app.register(
    artifactRoutes({
      service: artifactService,
      generation,
      writeBudget,
      policyFirewall,
      maxProvenanceDepth: env.MAX_PROVENANCE_DEPTH
    })
  );
  await app.register(
    agentRoutes({
      repository: agentRepository,
      orgService: agentOrgService,
      orgRoutingService: agentOrgRoutingService,
      executionService: agentExecutionService,
      incidentService,
      telemetryService,
      adminService,
      aaliyahBriefingService,
      aaliyahCommandSurfaceService,
      aaliyahPreferenceService,
      aaliyahMemoryBoundaryService,
      aaliyahDiagnosticsService,
      aaliyahWorkspaceService,
        aaliyahCalendarService,
        aaliyahCrmService,
      aaliyahTasksService,
      aaliyahFounderCommandService,
      aaliyahFollowThroughEngineService,
      aaliyahRecommendationEngineService,
      aaliyahReviewQueueService,
      aaliyahTriageService,
      aaliyahFollowThroughService,
      aaliyahSessionService,
      aaliyahRuntimeService,
      emailService,
      voiceService,
      ledgerService,
      memoryService,
      evalRunner,
      workflow: brandWorkflow,
      versionService,
      workerService,
      orchestrationService,
      approvalEscalationService,
      runtimeService,
      signOrchestrationBundle: (bundle, executionId) => {
        const sealedAt = new Date().toISOString();
        const payloadHash = sha256Hex(canonicalJson(bundle));
        const signature = signArtifact({
          signingKey: env.ARTIFACT_SIGNING_KEY,
          artifactId: executionId,
          sealedAtIso: sealedAt
        });
        return { sealedAt, payloadHash, signature };
      },
      verifyOrchestrationBundle: ({ bundle, executionId, sealedAt, payloadHash, signature }) => {
        const expectedPayloadHash = sha256Hex(canonicalJson(bundle));
        const expectedSignature = signArtifact({
          signingKey: env.ARTIFACT_SIGNING_KEY,
          artifactId: executionId,
          sealedAtIso: sealedAt
        });
        const payloadHashMatches = payloadHash === expectedPayloadHash;
        const signatureMatches = verifyArtifactSignature({
          signingKey: env.ARTIFACT_SIGNING_KEY,
          artifactId: executionId,
          sealedAtIso: sealedAt,
          signature
        });

        return {
          verified: payloadHashMatches && signatureMatches,
          payloadHashMatches,
          signatureMatches,
          expectedPayloadHash,
          expectedSignature,
          trustChain: {
            algorithm: "hmac-sha256",
            artifactId: executionId,
            sealedAt,
            payloadHash: expectedPayloadHash
          }
        };
      }
    })
  );
  await app.register(leadModule, {
    pool,
    maxEventPayloadBytes: env.LEAD_MAX_EVENT_PAYLOAD_BYTES,
    maxConversionMetaBytes: env.LEAD_MAX_CONVERSION_META_BYTES,
    maxIntakeAttributesBytes: env.LEAD_MAX_INTAKE_ATTR_BYTES,
    routeSlowBudgetMs: env.LEAD_ROUTE_SLOW_BUDGET_MS
  });
  await app.register(policyRoutes, { pool });

  return app;
}
