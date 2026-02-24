export type LatencyBudget = {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export type RetryRule = {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
};

export type RegenCap = {
  maxAttempts: number;
  cooldownMinutes: number;
};

export type DriftThreshold = {
  maxDelta: number;
  windowSize: number;
};

export const latencyBudgets: Record<string, LatencyBudget> = {
  ArtifactRequested: { p50Ms: 200, p95Ms: 800, p99Ms: 1500 },
  ForgeJobRequested: { p50Ms: 300, p95Ms: 1200, p99Ms: 2000 },
  ArtifactGenerated: { p50Ms: 500, p95Ms: 2000, p99Ms: 4000 },
  ArtifactEvaluated: { p50Ms: 400, p95Ms: 1600, p99Ms: 3000 },
  ArtifactStored: { p50Ms: 200, p95Ms: 900, p99Ms: 1600 }
};

export const retryRules: Record<string, RetryRule> = {
  forgeJob: { maxAttempts: 3, baseDelayMs: 500, backoffMultiplier: 2 },
  artifactStore: { maxAttempts: 4, baseDelayMs: 300, backoffMultiplier: 2 },
  evaluator: { maxAttempts: 2, baseDelayMs: 800, backoffMultiplier: 2 }
};

export const regenCaps: Record<string, RegenCap> = {
  BrandBible: { maxAttempts: 3, cooldownMinutes: 10 },
  PersonaVoicebook: { maxAttempts: 3, cooldownMinutes: 10 },
  NarrativeBrief: { maxAttempts: 2, cooldownMinutes: 15 },
  VisualBible: { maxAttempts: 2, cooldownMinutes: 20 },
  VideoStyleSheet: { maxAttempts: 2, cooldownMinutes: 20 },
  ThumbnailBlueprint: { maxAttempts: 2, cooldownMinutes: 10 },
  GrowthStrategyBrief: { maxAttempts: 2, cooldownMinutes: 30 },
  ContentCalendar: { maxAttempts: 2, cooldownMinutes: 30 },
  PerformanceReview: { maxAttempts: 2, cooldownMinutes: 30 }
};

export const driftThresholds: Record<string, DriftThreshold> = {
  voiceToneSimilarity: { maxDelta: 0.08, windowSize: 20 },
  brandPillarCoverage: { maxDelta: 0.1, windowSize: 10 },
  personaAlignment: { maxDelta: 0.1, windowSize: 15 }
};
