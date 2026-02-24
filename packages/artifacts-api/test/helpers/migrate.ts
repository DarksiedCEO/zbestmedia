import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function applyArtifactsMigration(args: { databaseUrl: string }): Promise<void> {
  const migrationDir = path.resolve(process.cwd(), "packages", "artifacts-api", "db", "migrations");
  const migrations = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(migrationDir, name));

  try {
    for (const migrationPath of migrations) {
      await execFileAsync("psql", [args.databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", migrationPath]);
    }
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string };
    const message = [
      "psql migration failed.",
      `stdout:\n${failure.stdout ?? ""}`,
      `stderr:\n${failure.stderr ?? ""}`,
      "Ensure psql is installed and ARTIFACTS_INT_DATABASE_URL points to a reachable Postgres instance.",
      `Migrations: ${migrations.join(", ")}`
    ].join("\n");
    throw new Error(message);
  }
}
