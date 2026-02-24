import Fastify, { type FastifyInstance } from "fastify";

import { artifactRoutes } from "./artifacts/routes";
import { ArtifactService } from "./artifacts/service";
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
  const pool = createPool(env.DATABASE_URL);
  const artifactService = new ArtifactService(pool, env.ARTIFACT_SIGNING_KEY);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  app.get("/healthz", async () => ({ ok: true }));
  await app.register(artifactRoutes({ service: artifactService }));

  return app;
}
