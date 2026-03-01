export const HARD_INVARIANTS = Object.freeze({
  crossTenantAccessAllowed: false as const,
  complianceViolationsAllowed: 0 as const,
  hallucinationTolerance: 0 as const,
  unverifiedClientClaimsAllowed: 0 as const,
  maxRevisionCycles: 3 as const,
  maxArbitrationCycles: 3 as const,
  maxPodReconstitutionRetries: 2 as const,
  maxPayloadBytes: 16_384 as const,
  maxCampaignPolicyOverridesPerClient: 10 as const,
  campaignOverrideMustExpire: true as const,
  enterpriseDealsRequireHuman: true as const,
  customPricingRequiresHuman: true as const,
  maxNegotiationCycles: 3 as const,
  absoluteMarginFloor: 0.25 as const
});

export type HardInvariantViolation = {
  code:
    | "CAMPAIGN_EXPIRES_AT_REQUIRED"
    | "CAMPAIGN_OVERRIDE_CAP_EXCEEDED"
    | "ABSOLUTE_MARGIN_FLOOR_BREACH"
    | "REVISION_CYCLE_LIMIT_BREACH"
    | "ARBITRATION_CYCLE_LIMIT_BREACH"
    | "COMPLIANCE_TOLERANCE_BREACH"
    | "HALLUCINATION_TOLERANCE_BREACH"
    | "UNVERIFIED_CLAIMS_BREACH"
    | "NEGOTIATION_CYCLE_LIMIT_BREACH"
    | "PAYLOAD_LIMIT_BREACH";
  message: string;
  path?: string;
};

export type InvariantCheckResult =
  | { ok: true }
  | { ok: false; violations: HardInvariantViolation[] };

export function validateResolvedPolicy(resolved: unknown): InvariantCheckResult {
  const violations: HardInvariantViolation[] = [];
  const marginCandidates: Array<{ value: unknown; path: string }> = [];

  if (resolved && typeof resolved === "object") {
    const r = resolved as {
      finance?: { minMargin?: unknown; absoluteMarginFloor?: unknown };
      performance?: { minMargin?: unknown };
      sales?: { maxNegotiationCycles?: unknown };
      creative?: { maxRevisionCycles?: unknown };
      arbitration?: { maxArbitrationCycles?: unknown };
    };

    if (r.finance?.minMargin !== undefined) {
      marginCandidates.push({ value: r.finance.minMargin, path: "finance.minMargin" });
    }
    if (r.finance?.absoluteMarginFloor !== undefined) {
      marginCandidates.push({ value: r.finance.absoluteMarginFloor, path: "finance.absoluteMarginFloor" });
    }
    if (r.performance?.minMargin !== undefined) {
      marginCandidates.push({ value: r.performance.minMargin, path: "performance.minMargin" });
    }

    if (r.sales?.maxNegotiationCycles !== undefined) {
      const v = Number(r.sales.maxNegotiationCycles);
      if (Number.isFinite(v) && v > HARD_INVARIANTS.maxNegotiationCycles) {
        violations.push({
          code: "NEGOTIATION_CYCLE_LIMIT_BREACH",
          message: `sales.maxNegotiationCycles cannot exceed ${HARD_INVARIANTS.maxNegotiationCycles}`,
          path: "sales.maxNegotiationCycles"
        });
      }
    }

    if (r.creative?.maxRevisionCycles !== undefined) {
      const v = Number(r.creative.maxRevisionCycles);
      if (Number.isFinite(v) && v > HARD_INVARIANTS.maxRevisionCycles) {
        violations.push({
          code: "REVISION_CYCLE_LIMIT_BREACH",
          message: `creative.maxRevisionCycles cannot exceed ${HARD_INVARIANTS.maxRevisionCycles}`,
          path: "creative.maxRevisionCycles"
        });
      }
    }

    if (r.arbitration?.maxArbitrationCycles !== undefined) {
      const v = Number(r.arbitration.maxArbitrationCycles);
      if (Number.isFinite(v) && v > HARD_INVARIANTS.maxArbitrationCycles) {
        violations.push({
          code: "ARBITRATION_CYCLE_LIMIT_BREACH",
          message: `arbitration.maxArbitrationCycles cannot exceed ${HARD_INVARIANTS.maxArbitrationCycles}`,
          path: "arbitration.maxArbitrationCycles"
        });
      }
    }
  }

  for (const candidate of marginCandidates) {
    const v = Number(candidate.value);
    if (Number.isFinite(v) && v < HARD_INVARIANTS.absoluteMarginFloor) {
      violations.push({
        code: "ABSOLUTE_MARGIN_FLOOR_BREACH",
        message: `Margin floor cannot be below ${HARD_INVARIANTS.absoluteMarginFloor}`,
        path: candidate.path
      });
    }
  }

  return violations.length ? { ok: false, violations } : { ok: true };
}
