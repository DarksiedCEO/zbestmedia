import fs from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";

type EnvValue = string | undefined;

export type ResolvedArtifactEnv = {
  baseUrl: string;
  tenantId: string;
  authToken?: string;
  authJwtSecret?: string;
  otherAuthToken?: string;
  databaseUrl?: string;
  verifyDb: boolean;
};

export function loadArtifactEnv(cwd: string = process.cwd()): void {
  // Prefer local override, then base env.
  for (const rel of [".env.local", ".env"]) {
    const abs = path.resolve(cwd, rel);
    if (fs.existsSync(abs)) {
      loadDotenv({ path: abs, override: false, quiet: true });
    }
  }
}

export function firstDefined(...values: EnvValue[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

export function optionalEnvValue(aliases: string[]): string | undefined {
  return firstDefined(...aliases.map((key) => process.env[key]));
}

export function requireEnvValue(label: string, aliases: string[]): string {
  const resolved = optionalEnvValue(aliases);
  if (!resolved) {
    throw new Error(`[artifacts:env] missing required env ${label}. Tried aliases: ${aliases.join(", ")}`);
  }
  return resolved;
}

export function redact(value: string | undefined): string {
  if (!value) return "<missing>";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function resolveArtifactEnv(): ResolvedArtifactEnv {
  loadArtifactEnv();

  const baseUrl = requireEnvValue("ARTIFACTS_BASE_URL", [
    "ARTIFACTS_BASE_URL",
    "ARTIFACTS_API_BASE_URL",
    "ZBESTMEDIA_API_BASE_URL",
    "API_BASE_URL",
    "APP_API_BASE_URL",
    "BACKEND_BASE_URL"
  ]);

  const tenantId = requireEnvValue("ARTIFACTS_TENANT_ID", [
    "ARTIFACTS_TENANT_ID",
    "TENANT_ID",
    "DEFAULT_TENANT_ID"
  ]);

  const authToken = optionalEnvValue([
    "ARTIFACTS_AUTH_TOKEN",
    "AUTH_TOKEN",
    "SERVICE_TOKEN",
    "API_BEARER_TOKEN"
  ]);

  const authJwtSecret = optionalEnvValue([
    "ARTIFACTS_AUTH_JWT_SECRET",
    "AUTH_JWT_SECRET",
    "JWT_SECRET"
  ]);

  const otherAuthToken = optionalEnvValue([
    "ARTIFACTS_OTHER_AUTH_TOKEN",
    "OTHER_AUTH_TOKEN",
    "SECONDARY_AUTH_TOKEN"
  ]);

  const databaseUrl = optionalEnvValue([
    "ARTIFACTS_DATABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "PGDATABASE_URL"
  ]);

  const verifyDb = firstDefined(process.env.ARTIFACTS_VERIFY_DB)?.toLowerCase() === "true";

  return {
    baseUrl,
    tenantId,
    authToken,
    authJwtSecret,
    otherAuthToken,
    databaseUrl,
    verifyDb
  };
}

export function printResolvedArtifactEnvSummary(): void {
  const env = resolveArtifactEnv();
  console.log("[artifacts:env] resolved env summary");
  console.log(`  baseUrl: ${env.baseUrl}`);
  console.log(`  tenantId: ${env.tenantId}`);
  console.log(`  authToken: ${redact(env.authToken)}`);
  console.log(`  authJwtSecret: ${redact(env.authJwtSecret)}`);
  console.log(`  otherAuthToken: ${redact(env.otherAuthToken)}`);
  console.log(`  databaseUrl: ${redact(env.databaseUrl)}`);
  console.log(`  verifyDb: ${String(env.verifyDb)}`);
}

// Backward-compatible alias used by existing imports.
export const loadLocalEnvFiles = loadArtifactEnv;
