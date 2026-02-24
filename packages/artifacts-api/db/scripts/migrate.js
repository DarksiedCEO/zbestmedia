/* eslint-disable no-console */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { resolveDbUrl } = require("./resolve-db-url");
const { waitForDb } = require("./wait-for-db");

function getMigrationFiles() {
  const migrationDir = path.resolve(process.cwd(), "db", "migrations");
  return fs
    .readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(migrationDir, name));
}

async function main() {
  const dbUrl = resolveDbUrl();
  process.env.DATABASE_URL = dbUrl;

  await waitForDb(dbUrl);

  const migrations = getMigrationFiles();
  for (const migrationPath of migrations) {
    console.log(`[db] applying ${path.basename(migrationPath)}`);
    execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", migrationPath], {
      stdio: "inherit"
    });
  }

  console.log("[db] migrate: done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
