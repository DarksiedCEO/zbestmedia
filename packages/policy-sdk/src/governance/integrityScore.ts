import { criticalIntegrityFlags, integrityFlagWeights, type IntegrityFlag } from "./integrityFlags";

export type IntegrityScoreResult = {
  integrity_score: number;
  critical: boolean;
};

export function computeIntegrityScore(flags: IntegrityFlag[]): IntegrityScoreResult {
  const uniq = [...new Set(flags)];
  const critical = uniq.some((flag) => criticalIntegrityFlags.has(flag));
  if (critical) {
    return { integrity_score: 0, critical: true };
  }

  let score = 100;
  for (const flag of uniq) {
    score += integrityFlagWeights[flag];
  }
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { integrity_score: score, critical: false };
}
