import { printResolvedAgentOsEnvSummary, resolveAgentOsEnv } from './load-env';

try {
  const mode = process.env.AGENT_OS_ENV_MODE === 'deployed' ? 'deployed' : 'local';
  const env = resolveAgentOsEnv(mode);
  if (mode === 'deployed' && !env.baseUrl) {
    throw new Error('[agent-os:env] missing required env AGENT_OS_BASE_URL for deployed checks. Do not reuse ARTIFACTS_BASE_URL for Agent OS release verification.');
  }
  printResolvedAgentOsEnvSummary(mode);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
