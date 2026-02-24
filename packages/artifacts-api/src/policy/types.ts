export type PolicyViolation = {
  code:
    | "artifact_type_invalid"
    | "artifact_type_forbidden"
    | "payload_too_large"
    | "payload_too_many_keys"
    | "payload_forbidden_phrase";
  message: string;
  meta?: Record<string, unknown>;
};

export type PolicyDecision = {
  allowed: boolean;
  policyVersion: string;
  violations: PolicyViolation[];
};

export type PolicyAction = "artifact_create" | "artifact_supersede";
