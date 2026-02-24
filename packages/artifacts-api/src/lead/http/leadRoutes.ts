import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import { withTenant } from "../../db/withTenant";
import {
  incLeadEventsTotal,
  incLeadIntakeTotal,
  observeLeadIntakeDurationMs,
  observeLeadScoreRecomputeDurationMs
} from "../../metrics/counters";
import { LeadScoreService } from "../scoring/scoreService";
import { eventSchema, intakeSchema } from "./validators";
import { LeadEventRepo } from "../repo/eventRepo";
import { LeadRepo } from "../repo/leadRepo";
import { enforceJsonPayloadLimit } from "../guards/payloadLimit";
import { warnIfSlow } from "../guards/timeBudget";

type LeadRoutesOptions = {
  pool: Pool;
  maxEventPayloadBytes: number;
  maxIntakeAttributesBytes: number;
  routeSlowBudgetMs: number;
};

function deterministicLeadId(input: {
  tenantId: string;
  email?: string;
  phone?: string;
  companyDomain?: string;
  source: string;
  sourceRef?: string;
}): string {
  const normalized = JSON.stringify({
    tenantId: input.tenantId,
    email: input.email ?? null,
    phone: input.phone ?? null,
    companyDomain: input.companyDomain ?? null,
    source: input.source,
    sourceRef: input.sourceRef ?? null
  });
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `lead_${digest.slice(0, 24)}`;
}

export const leadRoutes: FastifyPluginAsync<LeadRoutesOptions> = async (app, opts) => {
  const leadRepo = new LeadRepo();
  const eventRepo = new LeadEventRepo();
  const scoreService = new LeadScoreService(app.log);

  app.post("/v1/leads/intake", async (req, reply) => {
    const intakeStart = Date.now();
    const parsed = intakeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_payload",
        issues: parsed.error.issues
      });
    }

    const body = parsed.data;
    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const attributesLimit = enforceJsonPayloadLimit(body.attributes ?? {}, opts.maxIntakeAttributesBytes);
    if (!attributesLimit.ok) {
      return reply.code(413).send({
        error: attributesLimit.reason,
        field: "attributes",
        bytes: attributesLimit.bytes,
        limit: attributesLimit.limit
      });
    }

    const output = await withTenant(opts.pool, tenantId, async (client) => {
      const existing = body.email ? await leadRepo.findByEmail(client, tenantId, body.email) : null;
      const leadId = existing
        ? String(existing.id)
        : deterministicLeadId({
            tenantId,
            email: body.email,
            phone: body.phone,
            companyDomain: body.companyDomain,
            source: body.source,
            sourceRef: body.sourceRef
          });

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (body.email !== undefined) updates.email = body.email;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.firstName !== undefined) updates.first_name = body.firstName;
        if (body.lastName !== undefined) updates.last_name = body.lastName;
        if (body.companyName !== undefined) updates.company_name = body.companyName;
        if (body.companyDomain !== undefined) updates.company_domain = body.companyDomain;
        updates.source = body.source;
        if (body.sourceRef !== undefined) updates.source_ref = body.sourceRef;
        if (body.channel !== undefined) updates.channel = body.channel;

        await leadRepo.updateSnapshot(client, leadId, tenantId, updates, actorId);
      } else {
        await leadRepo.insert(client, {
          id: leadId,
          tenantId,
          email: body.email,
          phone: body.phone,
          firstName: body.firstName,
          lastName: body.lastName,
          companyName: body.companyName,
          companyDomain: body.companyDomain,
          source: body.source,
          sourceRef: body.sourceRef,
          channel: body.channel,
          createdBy: actorId,
          updatedBy: actorId
        });
      }

      await eventRepo.append(
        client,
        tenantId,
        leadId,
        "intake",
        {
          attributes: body.attributes ?? {},
          source: body.source,
          channel: body.channel ?? null,
          sourceRef: body.sourceRef ?? null
        },
        actorId
      );

      const scoreStart = Date.now();
      const [events, conversions] = await Promise.all([
        leadRepo.recentEventsForScoring(client, tenantId, leadId, 100),
        leadRepo.recentConversionsForScoring(client, tenantId, leadId, 100)
      ]);

      const score = scoreService.compute({
        snapshot: {
          id: leadId,
          tenantId,
          email: body.email ?? null,
          companyDomain: body.companyDomain ?? null,
          source: body.source,
          channel: body.channel ?? null,
          sourceRef: body.sourceRef ?? null
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
          valueUsd: c.value_usd,
          meta: c.meta
        })),
        now: new Date()
      });
      observeLeadScoreRecomputeDurationMs(Date.now() - scoreStart);

      await leadRepo.updateScore(client, {
        leadId,
        tenantId,
        scoreTotal: score.scoreTotal,
        scoreVersion: score.version,
        lifecycleStage: score.lifecycleStage,
        updatedBy: actorId
      });

      req.log.info(
        {
          requestId: req.requestId,
          tenantId,
          leadId,
          source: body.source,
          scoreTotal: score.scoreTotal
        },
        "lead intake processed"
      );

      return {
        leadId,
        score: score.scoreTotal,
        breakdown: score.breakdown
      };
    });

    incLeadIntakeTotal(body.source);
    observeLeadIntakeDurationMs(Date.now() - intakeStart);
    warnIfSlow(
      req.log,
      intakeStart,
      opts.routeSlowBudgetMs,
      { route: "/v1/leads/intake", tenantId, actorId },
      "slow lead intake route"
    );

    return reply.send(output);
  });

  app.post("/v1/leads/:leadId/events", async (req, reply) => {
    const eventStart = Date.now();
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_payload",
        issues: parsed.error.issues
      });
    }

    const { leadId } = req.params as { leadId: string };
    const tenantId = req.auth.tenantId;
    const actorId = req.auth.actorId;
    const payloadLimit = enforceJsonPayloadLimit(parsed.data.payload ?? {}, opts.maxEventPayloadBytes);
    if (!payloadLimit.ok) {
      return reply.code(413).send({
        error: payloadLimit.reason,
        field: "payload",
        bytes: payloadLimit.bytes,
        limit: payloadLimit.limit
      });
    }

    const response = await withTenant(opts.pool, tenantId, async (client) => {
      const lead = await leadRepo.findById(client, tenantId, leadId);
      if (!lead) {
        return { notFound: true as const };
      }

      await eventRepo.append(
        client,
        tenantId,
        leadId,
        parsed.data.type,
        parsed.data.payload ?? {},
        parsed.data.actor ?? actorId
      );

      if (parsed.data.recomputeScore ?? true) {
        const scoreStart = Date.now();
        const [events, conversions] = await Promise.all([
          leadRepo.recentEventsForScoring(client, tenantId, leadId, 100),
          leadRepo.recentConversionsForScoring(client, tenantId, leadId, 100)
        ]);

        const score = scoreService.compute({
          snapshot: {
            id: leadId,
            tenantId,
            email: lead.email ?? null,
            companyDomain: lead.company_domain ?? null,
            source: lead.source ?? "other",
            channel: lead.channel ?? null,
            sourceRef: lead.source_ref ?? null
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
            valueUsd: c.value_usd,
            meta: c.meta
          })),
          now: new Date()
        });
        observeLeadScoreRecomputeDurationMs(Date.now() - scoreStart);

        await leadRepo.updateScore(client, {
          leadId,
          tenantId,
          scoreTotal: score.scoreTotal,
          scoreVersion: score.version,
          lifecycleStage: score.lifecycleStage,
          updatedBy: actorId
        });
      }

      req.log.info(
        {
          requestId: req.requestId,
          tenantId,
          leadId,
          type: parsed.data.type
        },
        "lead event appended"
      );

      return { notFound: false as const };
    });

    if (response.notFound) {
      return reply.code(404).send({ error: "not_found" });
    }

    incLeadEventsTotal(parsed.data.type);
    warnIfSlow(
      req.log,
      eventStart,
      opts.routeSlowBudgetMs,
      { route: "/v1/leads/:leadId/events", tenantId, actorId },
      "slow lead events route"
    );
    return reply.code(204).send();
  });
};
