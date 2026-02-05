import Fastify from "fastify";
import { brandRoutes } from "./http/routes.js";
import type { BrandGraphRepo } from "./domain/repo.js";

export function buildServer(deps: { repo: BrandGraphRepo }) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.register(brandRoutes, { prefix: "/brandgraph", repo: deps.repo });

  return app;
}
