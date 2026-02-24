import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import { withTenant } from "../../db/withTenant";
import {
  incLeadConversionsTotal,
  incLeadStageTransitionsTotal,
  observeLeadConversionDurationMs,
  observeLeadScoreRecomputeDurationMs
} from "../../metrics/counters";
import { LeadConversionRepo } from "../repo/conversionRepo";
import { LeadEventRepo } from "../repo/eventRepo";
import { LeadRepo } from "../repo/leadRepo";
import { LeadScoreService } from "../scoring/scoreService";
import { conversionSchema, parseBoundedLimit } from "./validators";

type ConversionRoutesOptions = {
  pool: Pool;
};

function normalizeStage(s?: string | null): string {
  return (s ?? "new").toLowerCase();
}

export const leadConversionRoutes: FastifyPluginAsync<ConversionRoutesOptions> = async (app, opts) => {
  const leadRepo = new LeadRepo();
  const eventRepo = new LeadEventRepo();
  const conversionRepo = new LeadConversionRepo();
  const scoreService = new LeadScoreService(app.log);

  app.post("/v1/leads/:leadId/conversions", async (req, reply) => {
    const startedAt = Date.now();
    const parsed = conversionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", issues: parsed.error.issues });
    }

    const { leadId } = req.params as { leadId: string };
    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;

    const out = await withTenant(opts.pool, tenantId, async (client) => {
      const lead = await leadRepo.getById(client, tenantId, leadId);
      if (!lead) return { notFound: true as const };

      await conversionRepo.append(
        client,
        tenantId,
        leadId,
        parsed.data.type,
        parsed.data.valueUsd ?? null,
        parsed.data.meta ?? {},
        actorId
      );
      incLeadConversionsTotal(parsed.data.type);

      const recompute = parsed.data.recomputeScore ?? true;
      if (!recompute) {
        return {
          notFound: false as const,
          payload: {
            leadId,
            conversion: { type: parsed.data.type, valueUsd: parsed.data.valueUsd ?? null }
          }
        };
      }

      const scoreStart = Date.now();
      const [events, conversions] = await Promise.all([
        eventRepo.recentForScoring(client, tenantId, leadId),
        conversionRepo.recentForScoring(client, tenantId, leadId)
      ]);

      const score = scoreService.compute({
        snapshot: {
          id: lead.id,
          tenantId,
          email: lead.email,
          companyDomain: lead.company_domain,
          source: lead.source,
          channel: lead.channel,
          sourceRef: lead.source_ref,
          lifecycleStage: lead.lifecycle_stage
        },
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          createdAt: new Date(e.created_at),
          payload: e.payload
        })),
        conversions: conversions.map((c) => ({
          id: c.id,
          type: c.type,
          createdAt: new Date(c.created_at),
          valueUsd: c.value_usd ? Number(c.value_usd) : null,
          meta: c.meta
        })),
        now: new Date()
      });
      observeLeadScoreRecomputeDurationMs(Date.now() - scoreStart);

      const prevStage = normalizeStage(lead.lifecycle_stage);
      const nextStage = score.lifecycleStage ?? undefined;

      await leadRepo.updateScore(client, {
        leadId,
        tenantId,
        scoreTotal: score.scoreTotal,
        scoreVersion: score.version,
        lifecycleStage: nextStage,
        updatedBy: actorId
      });

      if (nextStage && nextStage !== prevStage) {
        incLeadStageTransitionsTotal(nextStage);
      }

      return {
        notFound: false as const,
        payload: {
          leadId,
          conversion: { type: parsed.data.type, valueUsd: parsed.data.valueUsd ?? null },
          score: score.scoreTotal,
          breakdown: score.breakdown,
          lifecycleStage: nextStage
        }
      };
    });

    observeLeadConversionDurationMs(Date.now() - startedAt);
    if (out.notFound) return reply.code(404).send({ error: "lead_not_found" });
    return reply.send(out.payload);
  });

  app.get("/v1/leads/:leadId", async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const tenantId = req.auth.tenantId;
    const query = (req.query ?? {}) as { eventsLimit?: string | number; conversionsLimit?: string | number };
    const limitEvents = parseBoundedLimit(query.eventsLimit, 20, 50);
    const limitConversions = parseBoundedLimit(query.conversionsLimit, 20, 50);

    const out = await withTenant(opts.pool, tenantId, async (client) => {
      const lead = await leadRepo.getById(client, tenantId, leadId);
      if (!lead) return { notFound: true as const };

      const [events, conversions] = await Promise.all([
        eventRepo.recent(client, tenantId, leadId, limitEvents),
        conversionRepo.recent(client, tenantId, leadId, limitConversions)
      ]);

      return {
        notFound: false as const,
        payload: {
          lead: {
            id: lead.id,
            createdAt: lead.created_at,
            updatedAt: lead.updated_at,
            email: lead.email,
            phone: lead.phone,
            firstName: lead.first_name,
            lastName: lead.last_name,
            companyName: lead.company_name,
            companyDomain: lead.company_domain,
            source: lead.source,
            sourceRef: lead.source_ref,
            channel: lead.channel,
            lifecycleStage: lead.lifecycle_stage,
            scoreTotal: lead.score_total,
            scoreVersion: lead.score_version,
            scoreUpdatedAt: lead.score_updated_at
          },
          events: events.map((e) => ({
            id: e.id,
            type: e.type,
            createdAt: e.created_at,
            payload: e.payload
          })),
          conversions: conversions.map((c) => ({
            id: c.id,
            type: c.type,
            createdAt: c.created_at,
            valueUsd: c.value_usd ? Number(c.value_usd) : null,
            meta: c.meta
          })),
          limits: { events: limitEvents, conversions: limitConversions }
        }
      };
    });

    if (out.notFound) return reply.code(404).send({ error: "lead_not_found" });
    return reply.send(out.payload);
  });

  app.get("/v1/leads/:leadId/score", async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const tenantId = req.auth.tenantId;
    const recompute = String(((req.query ?? {}) as { recompute?: string }).recompute ?? "false").toLowerCase() === "true";

    const out = await withTenant(opts.pool, tenantId, async (client) => {
      const lead = await leadRepo.getById(client, tenantId, leadId);
      if (!lead) return { notFound: true as const };

      if (!recompute) {
        return {
          notFound: false as const,
          payload: {
            leadId,
            scoreTotal: lead.score_total,
            scoreVersion: lead.score_version,
            scoreUpdatedAt: lead.score_updated_at,
            lifecycleStage: lead.lifecycle_stage
          }
        };
      }

      const scoreStart = Date.now();
      const [events, conversions] = await Promise.all([
        eventRepo.recentForScoring(client, tenantId, leadId),
        conversionRepo.recentForScoring(client, tenantId, leadId)
      ]);

      const score = scoreService.compute({
        snapshot: {
          id: lead.id,
          tenantId,
          email: lead.email,
          companyDomain: lead.company_domain,
          source: lead.source,
          channel: lead.channel,
          sourceRef: lead.source_ref,
          lifecycleStage: lead.lifecycle_stage
        },
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          createdAt: new Date(e.created_at),
          payload: e.payload
        })),
        conversions: conversions.map((c) => ({
          id: c.id,
          type: c.type,
          createdAt: new Date(c.created_at),
          valueUsd: c.value_usd ? Number(c.value_usd) : null,
          meta: c.meta
        })),
        now: new Date()
      });
      observeLeadScoreRecomputeDurationMs(Date.now() - scoreStart);

      const prevStage = normalizeStage(lead.lifecycle_stage);
      const nextStage = score.lifecycleStage ?? undefined;

      await leadRepo.updateScore(client, {
        leadId,
        tenantId,
        scoreTotal: score.scoreTotal,
        scoreVersion: score.version,
        lifecycleStage: nextStage,
        updatedBy: req.auth.actorId
      });

      if (nextStage && nextStage !== prevStage) {
        incLeadStageTransitionsTotal(nextStage);
      }

      return {
        notFound: false as const,
        payload: {
          leadId,
          scoreTotal: score.scoreTotal,
          scoreVersion: score.version,
          scoreUpdatedAt: new Date(),
          lifecycleStage: nextStage ?? lead.lifecycle_stage,
          breakdown: score.breakdown
        }
      };
    });

    if (out.notFound) return reply.code(404).send({ error: "lead_not_found" });
    return reply.send(out.payload);
  });
};
