function req(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`[orca] Missing required env ${key}`);
    process.exit(1);
  }
  return v;
}

export function getOrcaEnv() {
  const baseUrl = req("ORCA_ROUTER_URL").replace(/\/+$/, "");
  const token = req("ORCA_ROUTER_TOKEN");
  const model = process.env.ORCA_MODEL ?? "orca-default";

  const timeoutMs = Number(process.env.ORCA_TIMEOUT_MS ?? 20000);
  const retryMax = Number(process.env.ORCA_RETRY_MAX ?? 2);
  const retryBaseMs = Number(process.env.ORCA_RETRY_BASE_MS ?? 250);

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    console.error("[orca] ORCA_TIMEOUT_MS must be >= 1000");
    process.exit(1);
  }

  if (!Number.isFinite(retryMax) || retryMax < 0 || retryMax > 10) {
    console.error("[orca] ORCA_RETRY_MAX must be 0..10");
    process.exit(1);
  }

  if (!Number.isFinite(retryBaseMs) || retryBaseMs < 50) {
    console.error("[orca] ORCA_RETRY_BASE_MS must be >= 50");
    process.exit(1);
  }

  return { baseUrl, token, model, timeoutMs, retryMax, retryBaseMs };
}
