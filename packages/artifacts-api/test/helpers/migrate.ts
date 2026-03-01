import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RETRYABLE_PATTERNS = ["tuple concurrently updated", "deadlock detected", "could not serialize access"];

function isRetryableMigrationError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function applyArtifactsMigration(args: { databaseUrl: string }): Promise<void> {
  if (process.env.ARTIFACTS_SKIP_TEST_MIGRATE === "1") {
    return;
  }

  const migrationDir = path.resolve(__dirname, "..", "..", "db", "migrations");
  const migrations = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(migrationDir, name));

  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      for (const migrationPath of migrations) {
        await execFileAsync("psql", [args.databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", migrationPath]);
      }
      return;
    } catch (err) {
      const failure = err as { stdout?: string; stderr?: string };
      const stderr = failure.stderr ?? "";

      if (attempt < maxAttempts && isRetryableMigrationError(stderr)) {
        await sleep(attempt * 200);
        continue;
      }

      const message = [
        "psql migration failed.",
        `stdout:\n${failure.stdout ?? ""}`,
        `stderr:\n${stderr}`,
        "Ensure psql is installed and ARTIFACTS_INT_DATABASE_URL points to a reachable Postgres instance.",
        `Migrations: ${migrations.join(", ")}`
      ].join("\n");
      throw new Error(message);
    }
  }
}
