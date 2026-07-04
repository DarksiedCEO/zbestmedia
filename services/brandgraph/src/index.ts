import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";
import { createBrandGraphRepo } from "./domain/repo.js";
import { prisma } from "./db/prisma.js";
import { createPrismaRotationStore } from "./agents/rotationStore.prisma.js";
import { ensureBrandTrinityAgentsActive } from "./agents/boot.js";
import { resolveServiceAuthConfig } from "@zbest/service-auth";

// Brand-trinity lifecycle manifests are platform-level, not customer data —
// they live under a dedicated system tenant.
export const AGENT_LIFECYCLE_TENANT_ID = "system-agent-lifecycle";

const bootLog = {
  info: (obj: Record<string, unknown>, msg?: string) => console.log(msg ?? "", obj),
  warn: (obj: Record<string, unknown>, msg?: string) => console.warn(msg ?? "", obj),
  error: (obj: Record<string, unknown>, msg?: string) => console.error(msg ?? "", obj)
};

async function main() {
  const env = loadEnv();

  // Durable agent lifecycle BEFORE serving traffic: seed missing manifests,
  // rotate expired/expiring ones (audited), then fail-closed assert. Renewal
  // is an operation the boot performs — never a source-code edit.
  await prisma.tenant.upsert({
    where: { id: AGENT_LIFECYCLE_TENANT_ID },
    update: {},
    create: { id: AGENT_LIFECYCLE_TENANT_ID, name: "System Agent Lifecycle" }
  });
  const rotationStore = createPrismaRotationStore(prisma, AGENT_LIFECYCLE_TENANT_ID);
  const agentManifests = await ensureBrandTrinityAgentsActive({
    store: rotationStore,
    log: bootLog
  });

  const authConfig = resolveServiceAuthConfig(env.SERVICE_AUTH_TOKENS);
  const app = buildServer({ repo: createBrandGraphRepo(), agentManifests, authConfig });
  await app.ready();
  if (process.env.NODE_ENV !== "production") {
    app.log.info("\n" + app.printRoutes());
  }
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
