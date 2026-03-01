import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { withTenant } from "../../../db/withTenant";
import { PolicyError } from "../types";
import { PolicyService } from "../policyService";
import { requireRole } from "./authz";
import { approveSchema, createDraftSchema, resolveQuerySchema, rollbackSchema } from "./validators";

type PolicyRoutesOptions = {
  pool: Pool;
};

function toHttp(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof PolicyError) {
    const statusByCode: Record<PolicyError["code"], number> = {
      NOT_FOUND: 404,
      INVALID_POLICY: 400,
      INVALID_STATE: 409,
      APPROVALS_REQUIRED: 409,
      INVARIANT_VIOLATION: 400,
      CAP_EXCEEDED: 409,
      EXPIRES_REQUIRED: 400
    };

    return {
      status: statusByCode[err.code] ?? 400,
      body: {
        error: err.code,
        message: err.message,
        details: err.details ?? null
      }
    };
  }

  const e = err as { statusCode?: number; code?: string; message?: string };
  if (typeof e?.statusCode === "number") {
    return {
      status: e.statusCode,
      body: {
        error: e.code ?? "ERROR",
        message: e.message ?? "Request failed"
      }
    };
  }

  return {
    status: 500,
    body: {
      error: "INTERNAL",
      message: "Internal error"
    }
  };
}

export const policyRoutes: FastifyPluginAsync<PolicyRoutesOptions> = async (app, opts) => {
  app.get("/v1/policies/resolve", async (req, reply) => {
    const parsed = resolveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_QUERY", issues: parsed.error.issues });
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;

    try {
      const out = await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        return svc.resolve(tenantId, parsed.data.policyKey, new Date(), parsed.data.clientId, parsed.data.campaignId);
      });

      return reply.send({
        policyKey: parsed.data.policyKey,
        resolved: out.resolved,
        meta: out.meta,
        source: out.provenance
          ? {
              scopeType: out.provenance.scopeType,
              policyVersionId: out.provenance.policyVersionId,
              version: out.provenance.version
            }
          : null,
        actorId
      });
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });

  app.post("/v1/policies/drafts", async (req, reply) => {
    try {
      requireRole(req, "sebastian");
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }

    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD", issues: parsed.error.issues });
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;

    try {
      const created = await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        return svc.createDraft({
          tenantId,
          scopeType: parsed.data.scopeType,
          scopeId: parsed.data.scopeType === "global" ? null : (parsed.data.scopeId ?? null),
          clientId: parsed.data.clientId ?? null,
          policyKey: parsed.data.policyKey,
          valueJson: parsed.data.valueJson,
          effectiveAt: new Date(parsed.data.effectiveAt),
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
          changeReason: parsed.data.changeReason,
          createdBy: actorId,
          requiredRoles: parsed.data.requiredRoles
        });
      });

      return reply.code(201).send({ policyVersionId: created.policyVersionId });
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });

  app.post("/v1/policies/:id/submit", async (req, reply) => {
    try {
      requireRole(req, "sebastian");
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const id = (req.params as { id: string }).id;

    try {
      await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        await svc.submitForApproval(tenantId, id, actorId);
      });
      return reply.code(204).send();
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });

  app.post("/v1/policies/:id/approve", async (req, reply) => {
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD", issues: parsed.error.issues });
    }

    try {
      requireRole(req, parsed.data.role);
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const id = (req.params as { id: string }).id;

    try {
      await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        await svc.recordApproval(tenantId, id, parsed.data.role, parsed.data.decision, actorId, parsed.data.notes);
      });
      return reply.code(204).send();
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });

  app.post("/v1/policies/:id/activate", async (req, reply) => {
    try {
      requireRole(req, "sebastian");
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const id = (req.params as { id: string }).id;

    try {
      await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        await svc.activate(tenantId, id, actorId);
      });
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof PolicyError && (err.code === "CAP_EXCEEDED" || err.code === "INVARIANT_VIOLATION")) {
        try {
          await withTenant(opts.pool, tenantId, async (client) => {
            await client.query(
              `
              INSERT INTO agency.policy_audit_log (id, tenant_id, policy_version_id, event_type, actor_id, details_json)
              VALUES ($1,$2,$3,'rejected',$4,$5)
              `,
              [
                randomUUID(),
                tenantId,
                id,
                actorId,
                {
                  reason: "tier1_blocked",
                  errorCode: err.code,
                  details: err.details ?? null
                }
              ]
            );
          });
        } catch {
          // Best-effort write; preserve primary error response path.
        }
      }
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });

  app.post("/v1/policies/:id/rollback", async (req, reply) => {
    try {
      requireRole(req, "sebastian");
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }

    const parsed = rollbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD", issues: parsed.error.issues });
    }

    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const id = (req.params as { id: string }).id;

    try {
      const result = await withTenant(opts.pool, tenantId, async (client) => {
        const svc = new PolicyService(client);
        return svc.rollback(tenantId, id, actorId, parsed.data.reason);
      });
      return reply.code(201).send(result);
    } catch (err) {
      const h = toHttp(err);
      return reply.code(h.status).send(h.body);
    }
  });
};
