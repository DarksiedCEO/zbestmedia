import type { FastifyPluginAsync } from "fastify";

import { TenantWriteBudget } from "../budgets/tenantBudget";
import {
  incArtifactsCreated,
  incArtifactsSuperseded,
  incSealVerificationFailures,
  incTenantBudgetViolations
} from "../metrics/counters";
import { ArtifactService } from "./service";
import { ArtifactIdParamSchema, CreateArtifactBodySchema, SupersedeArtifactBodySchema } from "./schemas";

export function artifactRoutes(opts: {
  service: ArtifactService;
  writeBudget: TenantWriteBudget;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/artifacts", async (req, reply) => {
      const parsed = CreateArtifactBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_body",
          details: parsed.error.flatten()
        });
      }
      const budget = opts.writeBudget.checkAndIncrement(req.auth.tenantId);
      if (!budget.allowed) {
        incTenantBudgetViolations();
        req.log.warn({
          event: "tenant_budget_exceeded",
          requestId: req.requestId,
          tenantId: req.auth.tenantId
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

      return reply.code(201).send(out);
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
        req.log.error({
          event: "artifact_seal_verification_failed",
          requestId: req.requestId,
          tenantId: req.auth.tenantId,
          artifactId: artifact.artifactId,
          mismatch: true
        });
        return reply.code(500).send({ error: "artifact_integrity_failure" });
      }

      return reply.send(artifact);
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
      const budget = opts.writeBudget.checkAndIncrement(req.auth.tenantId);
      if (!budget.allowed) {
        incTenantBudgetViolations();
        req.log.warn({
          event: "tenant_budget_exceeded",
          requestId: req.requestId,
          tenantId: req.auth.tenantId
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
