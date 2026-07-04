import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { registerRoutes } from "./http/routes";
import { connect } from "nats";
import { loadEnv } from "./env";
import { resolveServiceAuthConfig, type ServiceAuthConfig } from "@zbest/service-auth";

export async function buildServer(deps?: { authConfig?: ServiceAuthConfig; prisma?: PrismaClient }) {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  const nc = await connect({ servers: env.NATS_URL });
  const authConfig = deps?.authConfig ?? resolveServiceAuthConfig(env.SERVICE_AUTH_TOKENS);

  await registerRoutes(app, nc, authConfig, { prisma: deps?.prisma });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
