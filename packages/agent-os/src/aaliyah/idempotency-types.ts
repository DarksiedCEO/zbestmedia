export type AaliyahMutationOperation =
  | "session_reset"
  | "follow_through_action"
  | "email_review_transition"
  | "email_dispatch";

export type AaliyahMutationIdempotencyState = "in_progress" | "completed" | "failed";

export type AaliyahMutationIdempotencyRecord = {
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  operationName: AaliyahMutationOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  state: AaliyahMutationIdempotencyState;
  responsePayload: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
