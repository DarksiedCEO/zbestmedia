import type { PolicyKey } from "./policyKeys";

export type PolicyScopeType = "global" | "client" | "campaign";

export type PolicyStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "superseded"
  | "expired"
  | "rejected";

export type RequiredApprovalRole = "sebastian" | "finance" | "legal" | "ceo";

export type PolicyVersionRow = {
  id: string;
  tenant_id: string;
  scope_type: PolicyScopeType;
  scope_id: string | null;
  client_id: string | null;
  policy_key: PolicyKey;
  value_json: unknown;
  version: number;
  status: PolicyStatus;
  effective_at: Date;
  expires_at: Date | null;
  change_reason: string;
  created_by: string;
  sealed_hash: string;
  supersedes_id: string | null;
  superseded_by_id: string | null;
};

export type PolicyProvenance = {
  scopeType: PolicyScopeType;
  policyVersionId: string;
  version: number;
};

export class PolicyError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_POLICY"
      | "INVALID_STATE"
      | "APPROVALS_REQUIRED"
      | "INVARIANT_VIOLATION"
      | "CAP_EXCEEDED"
      | "EXPIRES_REQUIRED",
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
