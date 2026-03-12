import fs from 'node:fs';
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

type EnvValue = string | undefined;

export type ResolvedAgentOsEnv = {
  baseUrl?: string;
  tenantId: string;
  authTenantId: string;
  authToken?: string;
  authJwtSecret?: string;
  databaseUrl?: string;
  verifyDb: boolean;
};

export type AgentOsEnvMode = "local" | "deployed";

export function loadAgentOsEnv(cwd: string = process.cwd()): void {
  for (const rel of ['.env.local', '.env']) {
    const abs = path.resolve(cwd, rel);
    if (fs.existsSync(abs)) {
      loadDotenv({ path: abs, override: false, quiet: true });
    }
  }
}

export function firstDefined(...values: EnvValue[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
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
    throw new Error(`[agent-os:env] missing required env ${label}. Tried aliases: ${aliases.join(', ')}`);
  }
  return resolved;
}

export function redact(value: string | undefined): string {
  if (!value) return '<missing>';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function resolveAgentOsEnv(mode: AgentOsEnvMode = "local"): ResolvedAgentOsEnv {
  loadAgentOsEnv();

  const tenantId = requireEnvValue('AGENT_OS_TENANT_ID', [
    'AGENT_OS_TENANT_ID',
    'ARTIFACTS_TENANT_ID',
    'TENANT_ID',
    'DEFAULT_TENANT_ID'
  ]);

  const authTenantId =
    isUuid(tenantId)
      ? tenantId
      : firstDefined(process.env.AGENT_OS_AUTH_TENANT_ID, mode === "deployed" ? '11111111-1111-4111-8111-111111111111' : undefined) ?? tenantId;

  const baseUrl =
    mode === "deployed"
      ? optionalEnvValue(["AGENT_OS_BASE_URL"])
      : optionalEnvValue([
          "AGENT_OS_BASE_URL",
          "ARTIFACTS_BASE_URL",
          "ARTIFACTS_API_BASE_URL",
          "ZBESTMEDIA_API_BASE_URL",
          "API_BASE_URL",
          "BACKEND_BASE_URL"
        ]);

  const authToken = optionalEnvValue([
    'AGENT_OS_AUTH_TOKEN',
    'ARTIFACTS_AUTH_TOKEN',
    'AUTH_TOKEN',
    'SERVICE_TOKEN',
    'API_BEARER_TOKEN'
  ]);

  const authJwtSecret = optionalEnvValue([
    'AGENT_OS_AUTH_JWT_SECRET',
    'ARTIFACTS_AUTH_JWT_SECRET',
    'AUTH_JWT_SECRET',
    'JWT_SECRET'
  ]);

  const databaseUrl = optionalEnvValue([
    'AGENT_OS_DATABASE_URL',
    'ARTIFACTS_DATABASE_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
    'PGDATABASE_URL'
  ]);

  const verifyDb = firstDefined(process.env.AGENT_OS_VERIFY_DB, process.env.ARTIFACTS_VERIFY_DB)?.toLowerCase() === 'true';

  return {
    baseUrl,
    tenantId,
    authTenantId,
    authToken,
    authJwtSecret,
    databaseUrl,
    verifyDb
  };
}

export function printResolvedAgentOsEnvSummary(mode: AgentOsEnvMode = "local"): void {
  const env = resolveAgentOsEnv(mode);
  console.log(`[agent-os:env] resolved env summary mode=${mode}`);
  console.log(`  baseUrl: ${env.baseUrl ?? '<missing>'}`);
  console.log(`  tenantId: ${env.tenantId}`);
  console.log(`  authTenantId: ${env.authTenantId}`);
  console.log(`  authToken: ${redact(env.authToken)}`);
  console.log(`  authJwtSecret: ${redact(env.authJwtSecret)}`);
  console.log(`  databaseUrl: ${redact(env.databaseUrl)}`);
  console.log(`  verifyDb: ${String(env.verifyDb)}`);
}
