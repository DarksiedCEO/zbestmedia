export const integrityFlagWeights = {
  CONTRACT_SIG_INVALID: -100,
  LEDGER_CHAIN_BROKEN: -100,
  KEYRING_KID_UNKNOWN: -100,
  TARGET_REGISTRY_MISMATCH: -30,
  PROD_BASELINE_MISSING: -40,
  GUARDRAIL_FALLBACK_GLOBAL_PROD: -30,
  RETENTION_STALE: -20,
  IMMUTABLE_SINK_STALE: -20,
  VERIFY_SKIPPED: -10
} as const;

export type IntegrityFlag = keyof typeof integrityFlagWeights;

export const criticalIntegrityFlags: ReadonlySet<IntegrityFlag> = new Set([
  "CONTRACT_SIG_INVALID",
  "LEDGER_CHAIN_BROKEN",
  "KEYRING_KID_UNKNOWN"
]);
