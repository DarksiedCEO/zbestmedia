import Fastify from "fastify";
import { brandRoutes } from "./http/routes.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.register(brandRoutes, { prefix: "/brandgraph" });

  return app;
}
