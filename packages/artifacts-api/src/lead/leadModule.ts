import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import { leadConversionRoutes } from "./http/conversionRoutes";
import { leadRoutes } from "./http/leadRoutes";
import { incLeadErrorsTotal, incLeadRequestsTotal, observeLeadRequestDurationMs } from "../metrics/counters";

type LeadModuleOptions = {
  pool: Pool;
  maxEventPayloadBytes: number;
  maxConversionMetaBytes: number;
  maxIntakeAttributesBytes: number;
  routeSlowBudgetMs: number;
};

export const leadModule: FastifyPluginAsync<LeadModuleOptions> = async (app, opts) => {
  const resolveRouteLabel = (req: { routeOptions: { url?: string }; url: string }): string =>
    req.routeOptions.url ?? req.url.split("?")[0] ?? "/v1/leads";

  app.addHook("onRequest", async (req) => {
    if (!req.url.startsWith("/v1/leads")) return;
    (req as { _leadStartedAtMs?: number })._leadStartedAtMs = Date.now();
  });

  app.addHook("onSend", async (req, reply, payload) => {
    if (!req.url.startsWith("/v1/leads")) return payload;
    if (reply.statusCode < 400) return payload;

    const route = resolveRouteLabel(req);
    const fallbackCode = `http_${reply.statusCode}`;
    let errorCode = fallbackCode;

    try {
      if (typeof payload === "string") {
        const parsed = JSON.parse(payload) as { error?: unknown };
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          errorCode = parsed.error;
        }
      } else if (payload && typeof payload === "object") {
        const maybeError = (payload as { error?: unknown }).error;
        if (typeof maybeError === "string" && maybeError.trim()) {
          errorCode = maybeError;
        }
      }
    } catch {
      errorCode = fallbackCode;
    }

    incLeadErrorsTotal(route, errorCode);
    return payload;
  });

  app.addHook("onResponse", async (req, reply) => {
    if (!req.url.startsWith("/v1/leads")) return;
    const route = resolveRouteLabel(req);
    const method = req.method;
    const startedAt = (req as { _leadStartedAtMs?: number })._leadStartedAtMs ?? Date.now();
    const elapsedMs = Date.now() - startedAt;
    incLeadRequestsTotal(route, method, reply.statusCode);
    observeLeadRequestDurationMs(route, method, elapsedMs);
  });

  await app.register(leadRoutes, {
    pool: opts.pool,
    maxEventPayloadBytes: opts.maxEventPayloadBytes,
    maxIntakeAttributesBytes: opts.maxIntakeAttributesBytes,
    routeSlowBudgetMs: opts.routeSlowBudgetMs
  });
  await app.register(leadConversionRoutes, {
    pool: opts.pool,
    maxConversionMetaBytes: opts.maxConversionMetaBytes,
    routeSlowBudgetMs: opts.routeSlowBudgetMs
  });
};
