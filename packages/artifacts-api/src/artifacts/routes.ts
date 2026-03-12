import type { FastifyPluginAsync } from "fastify";

import { TenantWriteBudget } from "../budgets/tenantBudget";
import { canonicalJson, sha256Hex } from "../crypto";
import {
  incArtifactsCreated,
  incPolicyDenials,
  incPolicyDenialsByCodes,
  incArtifactsSuperseded,
  incSealVerificationFailures,
  incTenantBudgetViolations
} from "../metrics/counters";
import { PolicyFirewall } from "../policy/firewall";
import type { ArtifactGenerationOrchestrator } from "./generationOrchestrator";
import { mapArtifactRecordToDetail, mapArtifactRecordToSummary } from "./retrieval";
import { buildArtifactReplayEvalSnapshot } from "./replay";
import { ArtifactService } from "./service";
import {
  ArtifactIdParamSchema,
  CreateArtifactBodySchema,
  GenerateArtifactBodySchema,
  ListArtifactsQuerySchema,
  SupersedeArtifactBodySchema
} from "./schemas";

export function artifactRoutes(opts: {
  service: ArtifactService;
  generation: ArtifactGenerationOrchestrator;
  writeBudget: TenantWriteBudget;
  policyFirewall: PolicyFirewall;
  maxProvenanceDepth: number;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/artifacts/generate", async (req, reply) => {
      const parsed = GenerateArtifactBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }

      const response = await opts.generation.generateArtifact({
        request: {
          artifactType: parsed.data.artifactType,
          templateKey: parsed.data.templateKey,
          workflowKey: parsed.data.workflowKey,
          input: parsed.data.input,
          tenantId: req.auth.tenantId,
          requestedBy: req.auth.actorId,
          correlationId: req.requestId,
          idempotencyKey: parsed.data.idempotencyKey,
          generationMode: parsed.data.generationMode,
          providerOverrides: parsed.data.providerOverrides,
          requestSource: "artifacts-api"
        },
        logger: req.log
      });

      const code = response.status === "FAILED" ? 502 : 201;
      return reply.code(code).send(response);
    });

    app.post("/v1/artifacts", async (req, reply) => {
      const parsed = CreateArtifactBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_body",
          details: parsed.error.flatten()
        });
      }
      const decision = opts.policyFirewall.validateArtifactWrite({
        action: "artifact_create",
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        artifactType: parsed.data.artifactType,
        payload: parsed.data.payload
      });
      if (!decision.allowed) {
        const violationCodes = decision.violations.map((violation) => violation.code);
        incPolicyDenials();
        incPolicyDenialsByCodes(violationCodes);
        req.log.warn({
          event: "policy_denied",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          action: "artifact_create",
          artifactType: parsed.data.artifactType,
          policyVersion: decision.policyVersion,
          violationsCount: violationCodes.length,
          violationCodes,
          violations: decision.violations
        });
        return reply.code(400).send({
          error: "policy_denied",
          policyVersion: decision.policyVersion,
          violations: decision.violations
        });
      }
      const budget = opts.writeBudget.checkAndIncrement(req.auth.tenantId);
      if (!budget.allowed) {
        incTenantBudgetViolations();
        req.log.warn({
          event: "tenant_budget_exceeded",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          limitPerMinute: budget.limitPerMinute,
          currentCount: budget.currentCount
        });
        return reply.code(429).send({ error: "tenant_budget_exceeded" });
      }

      const out = await opts.service.createAndSeal({
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        artifactType: parsed.data.artifactType,
        schemaVersion: parsed.data.schemaVersion,
        sourceArtifactIds: parsed.data.sourceArtifactIds,
        evalReport: parsed.data.evalReport,
        payload: parsed.data.payload
      });
      incArtifactsCreated();
      req.log.info({
        event: "artifact_sealed",
        requestId: req.requestId,
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        artifactId: out.artifactId,
        artifactType: parsed.data.artifactType,
        schemaVersion: parsed.data.schemaVersion,
        sealedAt: out.sealedAt
      });

      return reply.code(201).send(out);
    });

    app.get("/v1/artifacts", async (req, reply) => {
      const query = ListArtifactsQuerySchema.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send({
          error: "invalid_query",
          details: query.error.flatten()
        });
      }

      const rows = await opts.service.listArtifacts({
        tenantId: req.auth.tenantId,
        status: query.data.status,
        artifactType: query.data.artifactType,
        createdAfter: query.data.createdAfter,
        createdBefore: query.data.createdBefore,
        limit: query.data.limit,
        offset: query.data.offset
      });
      const items = rows.map(mapArtifactRecordToSummary);

      req.log.info({
        event: "artifact_retrieval_list",
        requestId: req.requestId,
        tenantId: req.auth.tenantId,
        status: query.data.status ?? null,
        artifactType: query.data.artifactType ?? null,
        resultCount: items.length
      });

      return reply.send({
        items,
        pagination: {
          limit: query.data.limit,
          offset: query.data.offset,
          count: items.length
        }
      });
    });

    app.get("/v1/artifacts/:id", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const artifact = await opts.service.getById({
        tenantId: req.auth.tenantId,
        artifactId: path.data.id
      });
      if (!artifact) {
        return reply.code(404).send({ error: "not_found" });
      }
      const sealValid = opts.service.verifyArtifactSeal(artifact);
      if (!sealValid) {
        incSealVerificationFailures();
        req.log.warn({
          event: "artifact_seal_verification_failed",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          artifactId: artifact.artifactId,
          mismatch: true
        });
        return reply.code(500).send({ error: "artifact_integrity_failure" });
      }
      const detail = mapArtifactRecordToDetail(artifact);
      req.log.info({
        event: "artifact_retrieval_by_id",
        requestId: req.requestId,
        tenantId: req.auth.tenantId,
        artifactId: artifact.artifactId,
        status: detail.status,
        artifactType: detail.artifactType
      });
      return reply.send(detail);
    });

    app.get("/v1/artifacts/:id/replay", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const artifact = await opts.service.getById({
        tenantId: req.auth.tenantId,
        artifactId: path.data.id
      });
      if (!artifact) {
        return reply.code(404).send({ error: "not_found" });
      }

      const canonical = canonicalJson(artifact.determinismInput);
      const recomputedArtifactId = sha256Hex(canonical);
      const matches = recomputedArtifactId === artifact.artifactId;

      if (!matches) {
        req.log.warn({
          event: "artifact_replay_mismatch",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          artifactId: artifact.artifactId,
          recomputedArtifactId
        });
      }

      return reply.send({
        artifactId: artifact.artifactId,
        determinismInput: artifact.determinismInput,
        canonicalJson: canonical,
        recomputedArtifactId,
        matches
      });
    });

    app.get("/v1/artifacts/:id/replay-freeze", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const freeze = await opts.service.getReplayFreeze({
        tenantId: req.auth.tenantId,
        artifactId: path.data.id
      });
      if (!freeze) {
        return reply.code(404).send({ error: "not_found" });
      }

      const driftDetected = !(freeze.requestHash.matches && freeze.inputHash.matches && freeze.outputHash.matches);
      if (driftDetected) {
        req.log.warn({
          event: "artifact_replay_drift_detected",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          artifactId: freeze.artifactId,
          requestHashMatches: freeze.requestHash.matches,
          inputHashMatches: freeze.inputHash.matches,
          outputHashMatches: freeze.outputHash.matches
        });
      }

      return reply.send({
        artifactId: freeze.artifactId,
        status: freeze.status,
        driftDetected,
        requestHash: freeze.requestHash,
        inputHash: freeze.inputHash,
        outputHash: freeze.outputHash,
        freezeHash: freeze.freezeHash,
        freezeBundle: freeze.freezeBundle
      });
    });

    app.get("/v1/artifacts/:id/replay-eval", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const artifact = await opts.service.getById({
        tenantId: req.auth.tenantId,
        artifactId: path.data.id
      });
      if (!artifact) {
        return reply.code(404).send({ error: "not_found" });
      }

      return reply.send(buildArtifactReplayEvalSnapshot(artifact));
    });

    app.get("/v1/artifacts/:id/provenance", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const artifact = await opts.service.getById({
        tenantId: req.auth.tenantId,
        artifactId: path.data.id
      });
      if (!artifact) {
        return reply.code(404).send({ error: "not_found" });
      }

      const expectedSignature = opts.service.getExpectedSignature(artifact);
      const matches = opts.service.verifyArtifactSeal(artifact);
      const supersedesChain = await opts.service.getSupersedesChain({
        tenantId: req.auth.tenantId,
        startArtifactId: artifact.artifactId,
        maxDepth: opts.maxProvenanceDepth
      });

      return reply.send({
        artifact: {
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          schemaVersion: artifact.schemaVersion,
          sealedAt: artifact.sealedAt,
          createdAt: artifact.createdAt
        },
        sealVerification: {
          matches,
          expectedSignature,
          storedSignature: artifact.signature
        },
        evalReport: artifact.evalReport,
        sourceArtifactIds: artifact.sourceArtifactIds,
        supersedesChain
      });
    });

    app.post("/v1/artifacts/:id/supersede", async (req, reply) => {
      const path = ArtifactIdParamSchema.safeParse(req.params);
      if (!path.success) {
        return reply.code(400).send({
          error: "invalid_path",
          details: path.error.flatten()
        });
      }

      const parsed = SupersedeArtifactBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_body",
          details: parsed.error.flatten()
        });
      }
      const decision = opts.policyFirewall.validateArtifactWrite({
        action: "artifact_supersede",
        tenantId: req.auth.tenantId,
        actorId: req.auth.actorId,
        artifactType: parsed.data.newArtifactType,
        payload: parsed.data.newPayload
      });
      if (!decision.allowed) {
        const violationCodes = decision.violations.map((violation) => violation.code);
        incPolicyDenials();
        incPolicyDenialsByCodes(violationCodes);
        req.log.warn({
          event: "policy_denied",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          action: "artifact_supersede",
          artifactType: parsed.data.newArtifactType,
          supersedesArtifactId: path.data.id,
          policyVersion: decision.policyVersion,
          violationsCount: violationCodes.length,
          violationCodes,
          violations: decision.violations
        });
        return reply.code(400).send({
          error: "policy_denied",
          policyVersion: decision.policyVersion,
          violations: decision.violations
        });
      }
      const budget = opts.writeBudget.checkAndIncrement(req.auth.tenantId);
      if (!budget.allowed) {
        incTenantBudgetViolations();
        req.log.warn({
          event: "tenant_budget_exceeded",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          limitPerMinute: budget.limitPerMinute,
          currentCount: budget.currentCount
        });
        return reply.code(429).send({ error: "tenant_budget_exceeded" });
      }

      try {
        const out = await opts.service.supersede({
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          supersedesArtifactId: path.data.id,
          newArtifactType: parsed.data.newArtifactType,
          newSchemaVersion: parsed.data.newSchemaVersion,
          newEvalReport: parsed.data.newEvalReport,
          newPayload: parsed.data.newPayload
        });
        incArtifactsSuperseded();
        req.log.info({
          event: "artifact_sealed",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          actorId: req.auth.actorId,
          artifactId: out.artifactId,
          artifactType: parsed.data.newArtifactType,
          schemaVersion: parsed.data.newSchemaVersion,
          sealedAt: out.sealedAt,
          supersedesArtifactId: path.data.id
        });
        return reply.code(201).send({
          ...out,
          supersedesArtifactId: path.data.id
        });
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode === 404) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw err;
      }
    });
  };
}
