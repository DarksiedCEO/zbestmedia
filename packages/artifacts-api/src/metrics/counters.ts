export type MetricsSnapshot = {
  artifactsCreated: number;
  artifactsSuperseded: number;
  sealVerificationFailures: number;
  tenantBudgetViolations: number;
  policyDenials: number;
  policyDenialsByCode: Record<string, number>;
};

const state: MetricsSnapshot = {
  artifactsCreated: 0,
  artifactsSuperseded: 0,
  sealVerificationFailures: 0,
  tenantBudgetViolations: 0,
  policyDenials: 0,
  policyDenialsByCode: {}
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

export function snapshotMetrics(): MetricsSnapshot {
  return {
    ...state,
    policyDenialsByCode: { ...state.policyDenialsByCode }
  };
}

export function resetMetricsForTests(): void {
  state.artifactsCreated = 0;
  state.artifactsSuperseded = 0;
  state.sealVerificationFailures = 0;
  state.tenantBudgetViolations = 0;
  state.policyDenials = 0;
  state.policyDenialsByCode = {};
}
