import { AgentOsRepository, AgentWorkerRunner } from "../../packages/agent-os/src/index.js";
import { createPool } from "../../packages/artifacts-api/src/db/pool.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`missing required env ${name}`);
  }
  return value.trim();
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const tenantId = requireEnv("AGENT_OS_TENANT_ID");
  const limit = Number(process.env.AGENT_OS_WORKER_LIMIT ?? "10");
  const retryDelayMs = process.env.AGENT_OS_RETRY_DELAY_MS ? Number(process.env.AGENT_OS_RETRY_DELAY_MS) : undefined;
  const intervalMs = Number(process.env.AGENT_OS_LOOP_INTERVAL_MS ?? "5000");
  const agentId = (process.env.AGENT_OS_AGENT_ID?.trim() || undefined) as
    | "brandyn"
    | "jordyn"
    | "kobe"
    | "oracle"
    | "titan"
    | "maestro"
    | undefined;

  const pool = createPool(databaseUrl);
  try {
    const repository = new AgentOsRepository(pool);
    const runner = new AgentWorkerRunner(repository);
    const result = await runner.runLoop({
      tenantId,
      agentId,
      limit,
      retryDelayMs,
      intervalMs
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent-os:worker:daemon] ${message}`);
  process.exit(1);
});
