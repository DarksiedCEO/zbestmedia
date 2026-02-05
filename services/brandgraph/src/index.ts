import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { ensureTestDbReady } from "./db/testBootstrap.js";

async function main() {
  const env = loadEnv();
  ensureTestDbReady();
  const app = buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
