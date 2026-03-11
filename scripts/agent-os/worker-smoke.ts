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
  const workerId = process.env.AGENT_OS_WORKER_ID?.trim() || `worker-smoke:${process.pid}`;
  const limit = Number(process.env.AGENT_OS_WORKER_LIMIT ?? "1");
  const retryDelayMs = process.env.AGENT_OS_RETRY_DELAY_MS ? Number(process.env.AGENT_OS_RETRY_DELAY_MS) : undefined;
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

    await repository.recordWorkerHeartbeat({
      tenantId,
      workerId,
      workerKind: "agent-os",
      agentId,
      status: "starting",
      details: { mode: "smoke" }
    });

    const result = await runner.runOnce({
      tenantId,
      agentId,
      limit,
      retryDelayMs
    });

    await repository.recordWorkerHeartbeat({
      tenantId,
      workerId,
      workerKind: "agent-os",
      agentId,
      status: "idle",
      details: {
        mode: "smoke",
        executionsCompleted: result.executions.completed.length,
        evalsCompleted: result.evals.completed.length
      }
    });

    console.log(JSON.stringify({ ok: true, workerId, result }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent-os:worker:smoke] ${message}`);
  process.exit(1);
});
