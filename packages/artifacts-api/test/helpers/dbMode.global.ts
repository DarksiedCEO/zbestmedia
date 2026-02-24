export default function dbModeGlobalSetup(): void {
  if (process.env.ARTIFACTS_INT_DATABASE_URL) {
    console.info("DB tests ENABLED (ARTIFACTS_INT_DATABASE_URL set)");
    return;
  }
  console.info("DB tests SKIPPED (ARTIFACTS_INT_DATABASE_URL not set)");
}
