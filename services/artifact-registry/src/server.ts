import Fastify from "fastify";
import { registerRoutes } from "./http/routes";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await registerRoutes(app);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
