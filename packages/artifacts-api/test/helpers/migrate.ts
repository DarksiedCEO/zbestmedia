import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function applyArtifactsMigration(args: { databaseUrl: string }): Promise<void> {
  const migrations = [
    path.resolve(
      process.cwd(),
      "packages",
      "artifacts-api",
      "db",
      "migrations",
      "001_artifacts_rls.sql"
    ),
    path.resolve(
      process.cwd(),
      "packages",
      "artifacts-api",
      "db",
      "migrations",
      "002_artifacts_determinism_input.sql"
    )
  ];

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
