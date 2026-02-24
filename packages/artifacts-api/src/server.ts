import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

import { artifactRoutes } from "./artifacts/routes";
import { ArtifactService } from "./artifacts/service";
import { TenantWriteBudget } from "./budgets/tenantBudget";
import { loadEnv, type AppEnv } from "./config/env";
import { createPool } from "./db/pool";
import { authPlugin } from "./http/auth";
import { requestIdPlugin } from "./http/requestId";

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

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/healthz", async () => ({ ok: true }));
  await app.register(
    artifactRoutes({
      service: artifactService,
      writeBudget
    })
  );

  return app;
}
