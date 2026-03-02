export function getProvider() {
  const v = (process.env.ORCA_PROVIDER ?? "orca").toLowerCase();
  if (v !== "orca" && v !== "mock") {
    console.error(`[provider] ORCA_PROVIDER must be 'orca' or 'mock' (got '${v}')`);
    process.exit(1);
  }
  return v;
}
