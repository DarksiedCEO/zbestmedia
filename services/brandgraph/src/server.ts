import Fastify from "fastify";
import type { AgentManifest } from "@zbest/agent-lifecycle";
import { resolveServiceAuthConfig, type ServiceAuthConfig } from "@zbest/service-auth";
import { brandRoutes } from "./http/routes.js";
import { createBrandGraphRepo } from "./domain/repo.js";
import type { BrandGraphRepo } from "./domain/repo.js";
import { assertBrandTrinityAgentsActive } from "./agents/gate.js";
import { WorkflowRunner } from "./workflows/runner.js";

export function buildServer(deps?: {
  repo?: BrandGraphRepo;
  workflowRunner?: WorkflowRunner;
  // Durable manifests from ensureBrandTrinityAgentsActive (production path).
  // Omitted (dev/test): date-relative seed manifests — no calendar bomb.
  agentManifests?: AgentManifest[];
  // Omitted (production path): resolved from SERVICE_AUTH_TOKENS — fail-closed,
  // the server will not boot without a configured auth store.
  authConfig?: ServiceAuthConfig;
}) {
  const app = Fastify({ logger: true });
  const repo = deps?.repo ?? createBrandGraphRepo();
  const workflowRunner = deps?.workflowRunner ?? new WorkflowRunner(repo);
  const authConfig = deps?.authConfig ?? resolveServiceAuthConfig(process.env.SERVICE_AUTH_TOKENS);

  assertBrandTrinityAgentsActive(app.log, deps?.agentManifests);

  app.get("/health", async () => ({ ok: true }));

  app.register(brandRoutes, { prefix: "/brandgraph", repo, workflowRunner, authConfig });

  return app;
}
