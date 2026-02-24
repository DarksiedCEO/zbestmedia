import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import { leadConversionRoutes } from "./http/conversionRoutes";
import { leadRoutes } from "./http/leadRoutes";

type LeadModuleOptions = {
  pool: Pool;
  maxEventPayloadBytes: number;
};

export const leadModule: FastifyPluginAsync<LeadModuleOptions> = async (app, opts) => {
  await app.register(leadRoutes, {
    pool: opts.pool,
    maxEventPayloadBytes: opts.maxEventPayloadBytes
  });
  await app.register(leadConversionRoutes, {
    pool: opts.pool
  });
};
