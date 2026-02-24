import Fastify, { type FastifyInstance } from "fastify";

import { loadEnv, type AppEnv } from "./config/env";
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

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
