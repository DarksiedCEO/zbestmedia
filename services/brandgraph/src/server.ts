import Fastify from "fastify";
import { brandRoutes } from "./http/routes.js";
import { createBrandGraphRepo } from "./domain/repo.js";
import type { BrandGraphRepo } from "./domain/repo.js";
import { WorkflowRunner } from "./workflows/runner.js";

export function buildServer(deps?: { repo?: BrandGraphRepo; workflowRunner?: WorkflowRunner }) {
  const app = Fastify({ logger: true });
  const repo = deps?.repo ?? createBrandGraphRepo();
  const workflowRunner = deps?.workflowRunner ?? new WorkflowRunner(repo);

  app.get("/health", async () => ({ ok: true }));

  app.register(brandRoutes, { prefix: "/brandgraph", repo, workflowRunner });

  return app;
}
