import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { registerRoutes } from "./http/routes";
import { connect } from "nats";
import { loadEnv } from "./env";
import { resolveAuthorizedPrincipalIds, resolveServiceAuthConfig, type ServiceAuthConfig } from "@zbest/service-auth";

export async function buildServer(deps?: { authConfig?: ServiceAuthConfig; prisma?: PrismaClient; authorizedPrincipalIds?: ReadonlySet<string> }) {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  const nc = await connect({ servers: env.NATS_URL });
  const authConfig = deps?.authConfig ?? resolveServiceAuthConfig(env.SERVICE_AUTH_TOKENS);
  const authorizedPrincipalIds = deps?.authorizedPrincipalIds ?? resolveAuthorizedPrincipalIds(env.SERVICE_AUTH_ALLOWED_PRINCIPALS);

  await registerRoutes(app, nc, authConfig, { prisma: deps?.prisma, authorizedPrincipalIds });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
