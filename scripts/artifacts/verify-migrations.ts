import fs from "node:fs";
import path from "node:path";

import { Client } from "pg";

import { firstDefined, loadArtifactEnv, optionalEnvValue } from "./load-env";

const REQUIRED_MIGRATIONS = [
  "003_artifacts_generation_lifecycle.sql",
  "004_artifacts_output_hash.sql"
] as const;

const REQUIRED_COLUMNS_GENERATION = [
  "generation_status",
  "request_hash",
  "input_hash",
  "output_hash",
  "input_snapshot",
  "lineage_seed",
  "failure_class",
  "failure_message",
  "failure_details",
  "output_snapshot",
  "generation_metadata",
  "started_at",
  "completed_at",
  "failed_at",
  "updated_at"
] as const;

const REQUIRED_COLUMNS_REGISTRY = ["artifact_id", "kind", "name", "owner", "created_at", "tenant_id"] as const;
const REQUIRED_TABLES_REGISTRY = ["artifact_versions", "artifact_aliases"] as const;

type SchemaProfile = "auto" | "generation" | "registry";

function fail(message: string): never {
  console.error(`[artifacts:migrations] ${message}`);
  process.exit(1);
}

function readSchemaProfile(): SchemaProfile {
  const raw = String(process.env.ARTIFACTS_SCHEMA_PROFILE ?? "auto").toLowerCase();
  if (raw === "auto" || raw === "generation" || raw === "registry") {
    return raw;
  }
  fail(`ARTIFACTS_SCHEMA_PROFILE must be auto|generation|registry (got ${raw})`);
}

async function verifyDatabase(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const schemaProfile = readSchemaProfile();
    const { rows } = await client.query<{ column_name: string }>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'artifacts'
      `
    );
    const found = new Set(rows.map((r) => r.column_name));
    const generationMissing = REQUIRED_COLUMNS_GENERATION.filter((c) => !found.has(c));
    const registryMissing = REQUIRED_COLUMNS_REGISTRY.filter((c) => !found.has(c));

    const tableRows = await client.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      `
    );
    const tables = new Set(tableRows.rows.map((r) => r.table_name));
    const registryTablesMissing = REQUIRED_TABLES_REGISTRY.filter((t) => !tables.has(t));

    if (schemaProfile === "generation") {
      if (generationMissing.length > 0) {
        fail(`missing required generation columns in public.artifacts: ${generationMissing.join(", ")}`);
      }
      return;
    }

    if (schemaProfile === "registry") {
      if (registryMissing.length > 0 || registryTablesMissing.length > 0) {
        fail(
          `missing required registry schema: columns=[${registryMissing.join(", ")}] tables=[${registryTablesMissing.join(", ")}]`
        );
      }
      return;
    }

    // auto profile: prefer generation when present, otherwise accept registry baseline.
    const generationReady = generationMissing.length === 0;
    const registryReady = registryMissing.length === 0 && registryTablesMissing.length === 0;
    if (!generationReady && !registryReady) {
      fail(
        `schema does not match generation or registry profiles: generationMissing=[${generationMissing.join(", ")}] registryColumnsMissing=[${registryMissing.join(", ")}] registryTablesMissing=[${registryTablesMissing.join(", ")}]`
      );
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadArtifactEnv();

  const root = path.resolve(__dirname, "..", "..");
  const migrationDir = path.join(root, "packages", "artifacts-api", "db", "migrations");

  for (const file of REQUIRED_MIGRATIONS) {
    const abs = path.join(migrationDir, file);
    if (!fs.existsSync(abs)) {
      fail(`missing migration file: ${path.relative(root, abs)}`);
    }
  }

  const verifyDb = firstDefined(process.env.ARTIFACTS_VERIFY_DB)?.toLowerCase() === "true";
  const dbUrl = optionalEnvValue([
    "ARTIFACTS_DATABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "PGDATABASE_URL"
  ]);

  if (verifyDb) {
    if (!dbUrl) {
      fail("ARTIFACTS_VERIFY_DB=true requires one of: ARTIFACTS_DATABASE_URL, DATABASE_URL, POSTGRES_URL, PGDATABASE_URL");
    }
    await verifyDatabase(dbUrl);
    console.log("[artifacts:migrations] OK (files + database schema)");
    return;
  }

  console.log("[artifacts:migrations] OK (files only; database verification skipped)");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
