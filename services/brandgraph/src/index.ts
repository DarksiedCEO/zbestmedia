import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { createInMemoryRepo } from "./domain/repo.js";

async function main() {
  const env = loadEnv();
  const repo = createInMemoryRepo();
  const app = buildServer({ repo });
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
