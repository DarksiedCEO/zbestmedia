import { getOrcaEnv } from "./orcaEnv.mjs";

function fail(msg) {
  console.error(`[orca:check] ${msg}`);
  process.exit(1);
}

const env = getOrcaEnv();

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.timeoutMs, 10000));
  const res = await fetch(env.baseUrl, { method: "GET", signal: controller.signal });
  clearTimeout(timeout);
  console.log(`[orca:check] Reachable: ${env.baseUrl} (status ${res.status})`);
} catch (e) {
  fail(`Cannot reach ORCA_ROUTER_URL (${env.baseUrl}): ${e?.message ?? e}`);
}
