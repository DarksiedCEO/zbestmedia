export const POLICY_KEYS = ["performance_limits", "creative_limits", "sales_limits", "finance_limits"] as const;

export type PolicyKey = (typeof POLICY_KEYS)[number];
