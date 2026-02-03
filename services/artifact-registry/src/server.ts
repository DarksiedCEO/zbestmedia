import Fastify from "fastify";
import { logger } from "./log";
import { registerRoutes } from "./http/routes";

export async function buildServer() {
  const app = Fastify({ logger });

  await registerRoutes(app);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
