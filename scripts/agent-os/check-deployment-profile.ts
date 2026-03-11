function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`missing required env ${name}`);
  }
  return value.trim();
}

try {
  const databaseUrl = requireEnv("DATABASE_URL");
  const tenantId = requireEnv("AGENT_OS_TENANT_ID");
  const deploymentProfile = process.env.AGENT_OS_DEPLOYMENT_PROFILE?.trim() || "worker";

  if (deploymentProfile !== "worker") {
    throw new Error(`AGENT_OS_DEPLOYMENT_PROFILE must be worker; received ${deploymentProfile}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        deploymentProfile,
        tenantId,
        databaseConfigured: databaseUrl.length > 0,
        workerId: process.env.AGENT_OS_WORKER_ID?.trim() || null
      },
      null,
      2
    )
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent-os:deployment:check] ${message}`);
  process.exit(1);
}
