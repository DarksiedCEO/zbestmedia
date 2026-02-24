export type MetricsSnapshot = {
  artifactsCreated: number;
  artifactsSuperseded: number;
  sealVerificationFailures: number;
  tenantBudgetViolations: number;
  policyDenials: number;
  policyDenialsByCode: Record<string, number>;
  leadIntakeTotalBySource: Record<string, number>;
  leadEventsTotalByType: Record<string, number>;
  leadConversionsTotalByType: Record<string, number>;
  leadStageTransitionsTotalByTo: Record<string, number>;
  leadIntakeDurationMs: { count: number; sum: number };
  leadConversionDurationMs: { count: number; sum: number };
  leadScoreRecomputeDurationMs: { count: number; sum: number };
};

const state: MetricsSnapshot = {
  artifactsCreated: 0,
  artifactsSuperseded: 0,
  sealVerificationFailures: 0,
  tenantBudgetViolations: 0,
  policyDenials: 0,
  policyDenialsByCode: {},
  leadIntakeTotalBySource: {},
  leadEventsTotalByType: {},
  leadConversionsTotalByType: {},
  leadStageTransitionsTotalByTo: {},
  leadIntakeDurationMs: { count: 0, sum: 0 },
  leadConversionDurationMs: { count: 0, sum: 0 },
  leadScoreRecomputeDurationMs: { count: 0, sum: 0 }
};

export function incArtifactsCreated(): void {
  state.artifactsCreated += 1;
}

export function incArtifactsSuperseded(): void {
  state.artifactsSuperseded += 1;
}

export function incSealVerificationFailures(): void {
  state.sealVerificationFailures += 1;
}

export function incTenantBudgetViolations(): void {
  state.tenantBudgetViolations += 1;
}

export function incPolicyDenials(): void {
  state.policyDenials += 1;
}

export function incPolicyDenialsByCodes(codes: string[]): void {
  for (const code of codes) {
    const key = code.trim();
    if (!key) {
      continue;
    }
    state.policyDenialsByCode[key] = (state.policyDenialsByCode[key] ?? 0) + 1;
  }
}

export function incLeadIntakeTotal(source: string): void {
  const key = source.trim().toLowerCase();
  if (!key) return;
  state.leadIntakeTotalBySource[key] = (state.leadIntakeTotalBySource[key] ?? 0) + 1;
}

export function incLeadEventsTotal(type: string): void {
  const key = type.trim().toLowerCase();
  if (!key) return;
  state.leadEventsTotalByType[key] = (state.leadEventsTotalByType[key] ?? 0) + 1;
}

export function incLeadConversionsTotal(type: string): void {
  const key = type.trim().toLowerCase();
  if (!key) return;
  state.leadConversionsTotalByType[key] = (state.leadConversionsTotalByType[key] ?? 0) + 1;
}

export function incLeadStageTransitionsTotal(to: string): void {
  const key = to.trim().toLowerCase();
  if (!key) return;
  state.leadStageTransitionsTotalByTo[key] = (state.leadStageTransitionsTotalByTo[key] ?? 0) + 1;
}

export function observeLeadIntakeDurationMs(durationMs: number): void {
  state.leadIntakeDurationMs.count += 1;
  state.leadIntakeDurationMs.sum += Math.max(0, durationMs);
}

export function observeLeadConversionDurationMs(durationMs: number): void {
  state.leadConversionDurationMs.count += 1;
  state.leadConversionDurationMs.sum += Math.max(0, durationMs);
}

export function observeLeadScoreRecomputeDurationMs(durationMs: number): void {
  state.leadScoreRecomputeDurationMs.count += 1;
  state.leadScoreRecomputeDurationMs.sum += Math.max(0, durationMs);
}

export function snapshotMetrics(): MetricsSnapshot {
  return {
    ...state,
    policyDenialsByCode: { ...state.policyDenialsByCode },
    leadIntakeTotalBySource: { ...state.leadIntakeTotalBySource },
    leadEventsTotalByType: { ...state.leadEventsTotalByType },
    leadConversionsTotalByType: { ...state.leadConversionsTotalByType },
    leadStageTransitionsTotalByTo: { ...state.leadStageTransitionsTotalByTo },
    leadIntakeDurationMs: { ...state.leadIntakeDurationMs },
    leadConversionDurationMs: { ...state.leadConversionDurationMs },
    leadScoreRecomputeDurationMs: { ...state.leadScoreRecomputeDurationMs }
  };
}

export function resetMetricsForTests(): void {
  state.artifactsCreated = 0;
  state.artifactsSuperseded = 0;
  state.sealVerificationFailures = 0;
  state.tenantBudgetViolations = 0;
  state.policyDenials = 0;
  state.policyDenialsByCode = {};
  state.leadIntakeTotalBySource = {};
  state.leadEventsTotalByType = {};
  state.leadConversionsTotalByType = {};
  state.leadStageTransitionsTotalByTo = {};
  state.leadIntakeDurationMs = { count: 0, sum: 0 };
  state.leadConversionDurationMs = { count: 0, sum: 0 };
  state.leadScoreRecomputeDurationMs = { count: 0, sum: 0 };
}
