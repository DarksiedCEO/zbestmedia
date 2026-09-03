import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { registerRoutes } from "./http/routes";
import { connect } from "nats";
import { loadEnv } from "./env";
import { resolveAuthorizedPrincipalIds, resolveServiceAuthConfig, type ServiceAuthConfig } from "@zbest/service-auth";
import { relayOutboxBatch } from "./events/outbox";

export async function buildServer(deps?: { authConfig?: ServiceAuthConfig; prisma?: PrismaClient; authorizedPrincipalIds?: ReadonlySet<string> }) {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  const nc = await connect({ servers: env.NATS_URL });
  const prisma = deps?.prisma ?? new PrismaClient();
  const authConfig = deps?.authConfig ?? resolveServiceAuthConfig(env.SERVICE_AUTH_TOKENS);
  const authorizedPrincipalIds = deps?.authorizedPrincipalIds ?? resolveAuthorizedPrincipalIds(env.SERVICE_AUTH_ALLOWED_PRINCIPALS);

  await registerRoutes(app, nc, authConfig, { prisma, authorizedPrincipalIds });

  const workerId = `${env.SERVICE_NAME}:${process.pid}`;
  let relayRunning = false;
  const relayTimer = setInterval(async () => {
    if (relayRunning) return;
    relayRunning = true;
    try {
      const result = await relayOutboxBatch(prisma as any, nc, {
        workerId, now: new Date(), batchSize: env.OUTBOX_RELAY_BATCH_SIZE,
        maxAttempts: env.OUTBOX_RELAY_MAX_ATTEMPTS, classify: () => "UNKNOWN",
      });
      if (result.published.length || result.deferred.length || result.terminal.length) {
        app.log.info({ outbox: result }, "outbox relay batch completed");
      }
    } catch (error) {
      app.log.error({ error }, "outbox relay batch failed");
    } finally {
      relayRunning = false;
    }
  }, env.OUTBOX_RELAY_INTERVAL_MS);
  relayTimer.unref();
  app.addHook("onClose", async () => clearInterval(relayTimer));

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
