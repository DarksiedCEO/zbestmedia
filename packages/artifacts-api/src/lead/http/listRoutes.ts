import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import { withTenant } from "../../db/withTenant";
import { LeadQueryRepo } from "../repo/leadQueryRepo";
import { listQuerySchema } from "./validators";

type LeadListRoutesOptions = {
  pool: Pool;
};

export const leadListRoutes: FastifyPluginAsync<LeadListRoutesOptions> = async (app, opts) => {
  const repo = new LeadQueryRepo();

  app.get("/v1/leads", async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "INVALID_QUERY",
        issues: parsed.error.issues
      });
    }

    const tenantId = req.auth.tenantId;
    const { rows, nextCursor } = await withTenant(opts.pool, tenantId, async (client) =>
      repo.list(
        client,
        tenantId,
        {
          lifecycleStage: parsed.data.lifecycleStage,
          source: parsed.data.source,
          minScore: parsed.data.minScore,
          maxScore: parsed.data.maxScore,
          createdFrom: parsed.data.createdFrom ? new Date(parsed.data.createdFrom) : undefined,
          createdTo: parsed.data.createdTo ? new Date(parsed.data.createdTo) : undefined
        },
        {
          limit: parsed.data.limit,
          cursor: parsed.data.cursor
        }
      )
    );

    return reply.send({
      data: rows,
      nextCursor,
      limit: parsed.data.limit
    });
  });
};
