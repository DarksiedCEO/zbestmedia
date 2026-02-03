import { buildServer } from "./server";
import { loadEnv } from "./env";
import { logger } from "./log";

async function start() {
  const env = loadEnv();
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info({ service: env.SERVICE_NAME, port: env.PORT }, "artifact registry listening");
  } catch (err) {
    logger.error({ err }, "failed to start server");
    process.exit(1);
  }
}

start();
