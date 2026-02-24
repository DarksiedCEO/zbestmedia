export type MetricsSnapshot = {
  artifactsCreated: number;
  artifactsSuperseded: number;
  sealVerificationFailures: number;
  tenantBudgetViolations: number;
};

const state: MetricsSnapshot = {
  artifactsCreated: 0,
  artifactsSuperseded: 0,
  sealVerificationFailures: 0,
  tenantBudgetViolations: 0
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

export function snapshotMetrics(): MetricsSnapshot {
  return { ...state };
}

export function resetMetricsForTests(): void {
  state.artifactsCreated = 0;
  state.artifactsSuperseded = 0;
  state.sealVerificationFailures = 0;
  state.tenantBudgetViolations = 0;
}
