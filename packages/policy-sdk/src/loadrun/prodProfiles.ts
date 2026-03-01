export type ProdCanaryProfile = {
  total: number;
  concurrency: number;
  mutateRatio: number;
  timeoutSec: number;
  maxRps: number;
  maxDurationSec: number;
};

export const defaultProdCanaryProfile: ProdCanaryProfile = {
  total: 1000,
  concurrency: 25,
  mutateRatio: 0.2,
  timeoutSec: 2,
  maxRps: 100,
  maxDurationSec: 180
};

export function resolveProdCanaryProfile(overrides?: Partial<ProdCanaryProfile>): ProdCanaryProfile {
  return {
    ...defaultProdCanaryProfile,
    ...(overrides ?? {})
  };
}
