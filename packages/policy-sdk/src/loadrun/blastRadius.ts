export type BlastRadiusCaps = {
  maxConcurrencyPerTarget: number;
  maxCanaryExposurePct: number;
  maxRetryAmplificationRuntime: number;
};

export function readBlastRadiusCaps(env: Record<string, string | undefined> = process.env): BlastRadiusCaps {
  const num = (key: string, fallback: number): number => {
    const raw = env[key];
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  };
  return {
    maxConcurrencyPerTarget: Math.max(1, Math.floor(num("POLICY_BLAST_MAX_CONCURRENCY_PER_TARGET", 200))),
    maxCanaryExposurePct: Math.max(1, Math.min(100, Math.floor(num("POLICY_CANARY_MAX_EXPOSURE_PCT", 50)))),
    maxRetryAmplificationRuntime: Math.max(0, num("POLICY_RETRY_AMP_GUARD_MAX", 1.4))
  };
}

export function assertConcurrencyWithinCap(concurrency: number, caps: BlastRadiusCaps): void {
  if (concurrency > caps.maxConcurrencyPerTarget) {
    throw new Error(`BLAST_RADIUS_CONCURRENCY_EXCEEDED: ${concurrency} > ${caps.maxConcurrencyPerTarget}`);
  }
}

export function isCanaryExposureAllowed(step: number, caps: BlastRadiusCaps): boolean {
  return step <= caps.maxCanaryExposurePct;
}

export function isRetryAmpViolation(rollingRetryAmplification: number, caps: BlastRadiusCaps): boolean {
  return rollingRetryAmplification > caps.maxRetryAmplificationRuntime;
}
