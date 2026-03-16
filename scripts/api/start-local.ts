import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadDotEnv } from "dotenv";

import { loadEnv } from "../../packages/artifacts-api/src/config/env.js";
import { buildServer } from "../../packages/artifacts-api/src/server.js";

const root = process.cwd();

for (const file of [".env", ".env.local"]) {
  const fullPath = path.resolve(root, file);
  if (existsSync(fullPath)) {
    loadDotEnv({ path: fullPath, override: false });
  }
}

if (!process.env.ARTIFACT_SIGNING_KEY && process.env.AUTH_JWT_SECRET) {
  process.env.ARTIFACT_SIGNING_KEY = process.env.AUTH_JWT_SECRET;
}

if (!process.env.PORT) {
  process.env.PORT = "8080";
}

if (!process.env.AILIYAH_GMAIL_DRAFTS_ENABLED) {
  process.env.AILIYAH_GMAIL_DRAFTS_ENABLED = "true";
}

if (!process.env.AILIYAH_GMAIL_DRY_RUN_DEFAULT) {
  process.env.AILIYAH_GMAIL_DRY_RUN_DEFAULT = "true";
}

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const app = await buildServer(env);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
