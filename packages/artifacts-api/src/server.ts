import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

import { artifactRoutes } from "./artifacts/routes";
import { ArtifactService } from "./artifacts/service";
import { TenantWriteBudget } from "./budgets/tenantBudget";
import { loadEnv, type AppEnv } from "./config/env";
import { createPool } from "./db/pool";
import { authPlugin } from "./http/auth";
import { requestIdPlugin } from "./http/requestId";
import { leadModule } from "./lead/leadModule";
import { snapshotMetrics } from "./metrics/counters";
import { PolicyFirewall } from "./policy/firewall";

export async function buildServer(envInput?: AppEnv): Promise<FastifyInstance> {
  const env = envInput ?? loadEnv();
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      base: null
    }
  });

  await app.register(requestIdPlugin);
  await app.register(authPlugin, { jwtSecret: env.AUTH_JWT_SECRET });
  await app.register(rateLimit, {
    hook: "preHandler",
    max: 120,
    timeWindow: 60_000,
    keyGenerator: (req) => {
      const tenantId = req.auth?.tenantId;
      return tenantId ? `t:${tenantId}` : `ip:${req.ip}`;
    }
  });
  const pool = createPool(env.DATABASE_URL);
  const artifactService = new ArtifactService(pool, env.ARTIFACT_SIGNING_KEY);
  const writeBudget = new TenantWriteBudget(env.MAX_ARTIFACT_WRITES_PER_MINUTE);
  const policyFirewall = new PolicyFirewall(env);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/metrics", async () => snapshotMetrics());
  await app.register(
    artifactRoutes({
      service: artifactService,
      writeBudget,
      policyFirewall,
      maxProvenanceDepth: env.MAX_PROVENANCE_DEPTH
    })
  );
  await app.register(leadModule, {
    pool,
    maxEventPayloadBytes: env.LEAD_MAX_EVENT_PAYLOAD_BYTES,
    maxConversionMetaBytes: env.LEAD_MAX_CONVERSION_META_BYTES,
    maxIntakeAttributesBytes: env.LEAD_MAX_INTAKE_ATTR_BYTES,
    routeSlowBudgetMs: env.LEAD_ROUTE_SLOW_BUDGET_MS
  });

  return app;
}
