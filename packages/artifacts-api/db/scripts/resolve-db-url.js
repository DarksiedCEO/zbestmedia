/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
}

function resolveDbUrl() {
  loadLocalEnv();
  const url =
    process.env.DATABASE_URL ||
    process.env.ARTIFACTS_INT_DATABASE_URL ||
    process.env.ARTIFACTS_DB_URL;

  if (!url) {
    const hints = [
      "Missing DB URL.",
      "Set one of: DATABASE_URL, ARTIFACTS_INT_DATABASE_URL, ARTIFACTS_DB_URL",
      "Example:",
      "  export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/zbestmedia_artifacts?sslmode=disable'",
      "Or create packages/artifacts-api/.env with DATABASE_URL=..."
    ].join("\n");
    throw new Error(hints);
  }

  return url;
}

if (require.main === module) {
  const url = resolveDbUrl();
  const safe = url.replace(/:\/\/.*@/, "://***@");
  console.log(`[db] resolved DATABASE_URL = ${safe}`);
}

module.exports = { resolveDbUrl };
