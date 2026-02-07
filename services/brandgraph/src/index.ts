import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { createBrandGraphRepo } from "./domain/repo.js";

async function main() {
  const env = loadEnv();
  const app = buildServer({ repo: createBrandGraphRepo() });
  await app.ready();
  if (process.env.NODE_ENV !== "production") {
    app.log.info("\n" + app.printRoutes());
  }
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
