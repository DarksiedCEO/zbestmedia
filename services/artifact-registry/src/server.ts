import Fastify from "fastify";
import { registerRoutes } from "./http/routes";
import { connect } from "nats";
import { loadEnv } from "./env";

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  const nc = await connect({ servers: env.NATS_URL });

  await registerRoutes(app, nc);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
