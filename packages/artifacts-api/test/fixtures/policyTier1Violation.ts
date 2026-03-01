import { performanceLimitsPolicy } from "./policyMinimal";

/**
 * This fixture is valid on its own; the Tier-1 violation is produced by test setup
 * when campaign override activation count exceeds the hard per-client cap.
 */
export function policyTier1Violation(): ReturnType<typeof performanceLimitsPolicy> {
  return performanceLimitsPolicy({ maxCPA: 260 });
}
