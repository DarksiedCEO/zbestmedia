import { loadEnv } from "./config/env";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer(env);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
