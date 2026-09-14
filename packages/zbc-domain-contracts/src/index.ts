import { z } from "zod";

const Identifier = z.string().min(1).max(160);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const IsoTimestamp = z.string().datetime({ offset: true });
const SafeInteger = z.number().refine(Number.isSafeInteger, "must be a safe integer");

export const Environment = z.enum([
  "LOCAL",
  "TEST",
  "SIMULATION",
  "STAGING",
  "PRODUCTION"
]);

export const AuthorityContext = z.object({
  tenantId: Identifier,
  campaignId: Identifier,
  actorId: Identifier,
  actorRole: Identifier,
  correlationId: Identifier,
  causationId: Identifier,
  idempotencyKey: Identifier,
  environment: Environment,
  occurredAt: IsoTimestamp
}).strict();

export const CampaignState = z.enum([
  "DRAFT",
  "CONTROL_REVIEW",
  "SIMULATION_READY",
  "SIMULATION_ACTIVE",
  "MEASUREMENT_HOLD",
  "RECONCILED",
  "SUSPENDED",
  "CANCELLED",
  "ARCHIVED"
]);
export type CampaignState = z.infer<typeof CampaignState>;

export const EditorialState = z.enum([
  "DRAFT",
  "EDITORIAL_REVIEW",
  "RIGHTS_REVIEW",
  "TECHNICAL_QC",
  "PICTURE_LOCKED",
  "VARIANT_APPROVED",
  "PUBLISHED",
  "REVOKED"
]);
export type EditorialState = z.infer<typeof EditorialState>;

export const RewardState = z.enum([
  "PROPOSED",
  "RESERVED",
  "EARNED_PRELIMINARY",
  "FRAUD_HOLD",
  "QUARANTINED",
  "DISPUTED",
  "FINAL_PAYABLE",
  "TRANSFER_SIMULATED",
  "FAILED_TRANSFER",
  "RECONCILED",
  "VOIDED"
]);
export type RewardState = z.infer<typeof RewardState>;

const campaignTransitions: Readonly<Record<CampaignState, readonly CampaignState[]>> = {
  DRAFT: ["CONTROL_REVIEW", "CANCELLED"],
  CONTROL_REVIEW: ["SIMULATION_READY", "SUSPENDED", "CANCELLED"],
  SIMULATION_READY: ["SIMULATION_ACTIVE", "SUSPENDED", "CANCELLED"],
  SIMULATION_ACTIVE: ["MEASUREMENT_HOLD", "SUSPENDED", "CANCELLED"],
  MEASUREMENT_HOLD: ["RECONCILED", "SUSPENDED"],
  RECONCILED: ["ARCHIVED"],
  SUSPENDED: ["CONTROL_REVIEW", "CANCELLED"],
  CANCELLED: [],
  ARCHIVED: []
};

const editorialTransitions: Readonly<Record<EditorialState, readonly EditorialState[]>> = {
  DRAFT: ["EDITORIAL_REVIEW", "REVOKED"],
  EDITORIAL_REVIEW: ["DRAFT", "RIGHTS_REVIEW", "REVOKED"],
  RIGHTS_REVIEW: ["DRAFT", "TECHNICAL_QC", "REVOKED"],
  TECHNICAL_QC: ["DRAFT", "PICTURE_LOCKED", "REVOKED"],
  PICTURE_LOCKED: ["VARIANT_APPROVED", "REVOKED"],
  VARIANT_APPROVED: ["PUBLISHED", "REVOKED"],
  PUBLISHED: ["REVOKED"],
  REVOKED: []
};

const rewardTransitions: Readonly<Record<RewardState, readonly RewardState[]>> = {
  PROPOSED: ["RESERVED", "VOIDED"],
  RESERVED: ["EARNED_PRELIMINARY", "VOIDED"],
  EARNED_PRELIMINARY: ["FRAUD_HOLD", "QUARANTINED", "VOIDED"],
  FRAUD_HOLD: ["FINAL_PAYABLE", "QUARANTINED", "DISPUTED"],
  QUARANTINED: ["FRAUD_HOLD", "DISPUTED", "VOIDED"],
  DISPUTED: ["FRAUD_HOLD", "FINAL_PAYABLE", "VOIDED"],
  FINAL_PAYABLE: ["TRANSFER_SIMULATED", "FAILED_TRANSFER"],
  TRANSFER_SIMULATED: ["RECONCILED"],
  FAILED_TRANSFER: ["FINAL_PAYABLE", "VOIDED"],
  RECONCILED: [],
  VOIDED: []
};

export type TransitionResult<S extends string> =
  | { ok: true; from: S; to: S }
  | { ok: false; from: S; to: S; reason: "INVALID_TRANSITION" };

function decideTransition<S extends string>(
  graph: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S
): TransitionResult<S> {
  return graph[from].includes(to)
    ? { ok: true, from, to }
    : { ok: false, from, to, reason: "INVALID_TRANSITION" };
}

export const transitionCampaign = (from: CampaignState, to: CampaignState) =>
  decideTransition(campaignTransitions, from, to);

export const transitionEditorial = (from: EditorialState, to: EditorialState) =>
  decideTransition(editorialTransitions, from, to);

export const transitionReward = (from: RewardState, to: RewardState) =>
  decideTransition(rewardTransitions, from, to);

export const LineageReference = z.object({
  entityId: Identifier,
  entityType: z.enum([
    "SOURCE",
    "RIGHTS_GRANT",
    "SOURCE_PACKAGE",
    "DETECTED_MOMENT",
    "EDIT_PROJECT",
    "CUT_VERSION",
    "MASTER",
    "PLATFORM_VARIANT",
    "PUBLISHED_POST"
  ]),
  version: z.string().min(1),
  sha256: Sha256,
  predecessorId: Identifier.optional()
}).strict();

export const Approval = z.object({
  approvalId: Identifier,
  tenantId: Identifier,
  campaignId: Identifier,
  authority: z.enum([
    "FOUNDER_CREATIVE",
    "RIGHTS",
    "EDITORIAL",
    "TECHNICAL_QC",
    "PUBLICATION",
    "FINANCE",
    "INDEPENDENT_APPEAL"
  ]),
  subjectId: Identifier,
  subjectVersion: z.string().min(1),
  subjectSha256: Sha256,
  approvedBy: Identifier,
  approvedAt: IsoTimestamp,
  expiresAt: IsoTimestamp.optional(),
  evidenceIds: z.array(Identifier).min(1)
}).strict();

export const MetricObservation = z.object({
  observationId: Identifier,
  platform: Identifier,
  authorizedAccountId: Identifier,
  collectionMethod: z.enum(["AUTHORIZED_API", "SIGNED_PLATFORM_EXPORT"]),
  observedAt: IsoTimestamp,
  windowStartedAt: IsoTimestamp,
  windowEndedAt: IsoTimestamp,
  schemaVersion: z.string().min(1),
  calculationVersion: z.string().min(1),
  rawEvidenceSha256: Sha256,
  rawViews: z.number().int().nonnegative(),
  eligibleViews: z.number().int().nonnegative(),
  excludedViews: z.number().int().nonnegative(),
  exclusionReasonCodes: z.array(Identifier)
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.windowStartedAt) >= Date.parse(value.windowEndedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "metric window must have positive duration" });
  }
  if (Date.parse(value.observedAt) < Date.parse(value.windowEndedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "observation cannot predate window closure" });
  }
  if (value.eligibleViews + value.excludedViews !== value.rawViews) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "eligibleViews plus excludedViews must equal rawViews"
    });
  }
  if (value.excludedViews > 0 && value.exclusionReasonCodes.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "excluded views require reason codes" });
  }
});

export const Money = z.object({
  currency: z.literal("USD"),
  minorUnits: SafeInteger
}).strict();

export const RewardReservation = z.object({
  reservationId: Identifier,
  creatorId: Identifier,
  campaignId: Identifier,
  amount: Money.refine((money) => money.minorUnits > 0, "amount must be positive"),
  state: RewardState,
  ledgerTransactionId: Identifier,
  createdAt: IsoTimestamp
}).strict();

const ExternalEffectIntentStructure = z.object({
  intentId: Identifier,
  tenantId: Identifier,
  campaignId: Identifier,
  effect: z.enum(["PUBLISH", "TAKEDOWN", "PAYOUT"]),
  adapterMode: z.enum(["FAKE", "SANDBOX", "LIVE"]),
  idempotencyKey: Identifier,
  environment: Environment,
  subjectId: Identifier,
  subjectVersion: z.string().min(1),
  subjectSha256: Sha256,
  approvalIds: z.array(Identifier).min(1)
}).strict();

function requireDistinctApprovalIds(value: { approvalIds: string[] }, ctx: z.RefinementCtx): void {
  if (new Set(value.approvalIds).size !== value.approvalIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "approval IDs must be distinct" });
  }
}

const EffectReplayIdentity = ExternalEffectIntentStructure.omit({ intentId: true })
  .superRefine(requireDistinctApprovalIds);

export const ExternalEffectIntent = ExternalEffectIntentStructure.superRefine((value, ctx) => {
  requireDistinctApprovalIds(value, ctx);
  if (value.adapterMode === "LIVE") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "contract v0.1.0 is simulation-only and prohibits LIVE adapters"
    });
  }
  if (value.environment === "SIMULATION" && value.effect === "PAYOUT" && value.adapterMode !== "FAKE") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "simulation payouts require FAKE adapter" });
  }
});

export const ScopedResource = z.object({
  tenantId: Identifier,
  campaignId: Identifier,
  resourceId: Identifier
}).strict();

export type ScopedResource = z.infer<typeof ScopedResource>;

export type AuthorizationDecision =
  | { ok: true }
  | { ok: false; reason: "SCOPE_MISMATCH" };

export function authorizeScope(
  context: Pick<z.infer<typeof AuthorityContext>, "tenantId" | "campaignId">,
  resource: Pick<ScopedResource, "tenantId" | "campaignId">
): AuthorizationDecision {
  return context.tenantId === resource.tenantId && context.campaignId === resource.campaignId
    ? { ok: true }
    : { ok: false, reason: "SCOPE_MISMATCH" };
}

export const ApprovalStatus = z.enum(["ACTIVE", "REVOKED", "SUPERSEDED"]);
export const BoundApproval = Approval.extend({ status: ApprovalStatus }).strict();
export type BoundApproval = z.infer<typeof BoundApproval>;

export function isApprovalUsable(
  approval: BoundApproval,
  subject: {
    tenantId: string;
    campaignId: string;
    subjectId: string;
    subjectVersion: string;
    subjectSha256: string;
  },
  at: string
): boolean {
  const parsedAt = IsoTimestamp.safeParse(at);
  if (!parsedAt.success || approval.status !== "ACTIVE") return false;
  if (approval.tenantId !== subject.tenantId || approval.campaignId !== subject.campaignId ||
      approval.subjectId !== subject.subjectId ||
      approval.subjectVersion !== subject.subjectVersion ||
      approval.subjectSha256 !== subject.subjectSha256) return false;
  if (Date.parse(approval.approvedAt) > Date.parse(at)) return false;
  return approval.expiresAt === undefined || Date.parse(approval.expiresAt) > Date.parse(at);
}

const requiredEffectAuthorities = {
  PUBLISH: ["FOUNDER_CREATIVE", "RIGHTS"],
  TAKEDOWN: ["RIGHTS"],
  PAYOUT: ["FINANCE"]
} as const satisfies Readonly<Record<z.infer<typeof ExternalEffectIntent>["effect"], readonly z.infer<typeof Approval>["authority"][]>>;

export type EffectAuthorizationDecision =
  | { ok: true }
  | { ok: false; reason: "INVALID_OR_INCOMPLETE_APPROVAL_SET" };

export function authorizeExternalEffect(
  untrustedIntent: unknown,
  untrustedResolvedApprovals: unknown,
  decisionAt: string
): EffectAuthorizationDecision {
  const parsedIntent = ExternalEffectIntent.safeParse(untrustedIntent);
  const parsedApprovals = z.array(BoundApproval).safeParse(untrustedResolvedApprovals);
  if (!parsedIntent.success || !parsedApprovals.success || !IsoTimestamp.safeParse(decisionAt).success) {
    return { ok: false, reason: "INVALID_OR_INCOMPLETE_APPROVAL_SET" };
  }
  const intent = parsedIntent.data;
  const resolvedApprovals = parsedApprovals.data;
  const requestedIds = new Set(intent.approvalIds);
  if (requestedIds.size !== intent.approvalIds.length || resolvedApprovals.length !== requestedIds.size ||
      resolvedApprovals.some((approval) => !requestedIds.has(approval.approvalId)) ||
      new Set(resolvedApprovals.map((approval) => approval.approvalId)).size !== resolvedApprovals.length ||
      resolvedApprovals.some((approval) => !isApprovalUsable(approval, intent, decisionAt))) {
    return { ok: false, reason: "INVALID_OR_INCOMPLETE_APPROVAL_SET" };
  }

  const required = requiredEffectAuthorities[intent.effect];
  if (resolvedApprovals.length !== required.length ||
      required.some((authority) => !resolvedApprovals.some((approval) => approval.authority === authority)) ||
      new Set(resolvedApprovals.map((approval) => approval.authority)).size !== resolvedApprovals.length ||
      (required.length > 1 && new Set(resolvedApprovals.map((approval) => approval.approvedBy)).size !== resolvedApprovals.length)) {
    return { ok: false, reason: "INVALID_OR_INCOMPLETE_APPROVAL_SET" };
  }
  return { ok: true };
}

export const EditorialMutation = z.object({
  currentState: EditorialState,
  currentVersionId: Identifier,
  resultingVersionId: Identifier,
  predecessorVersionId: Identifier.optional(),
  contentChanged: z.boolean()
}).strict().superRefine((value, ctx) => {
  const locked = ["PICTURE_LOCKED", "VARIANT_APPROVED", "PUBLISHED"].includes(value.currentState);
  if (locked && value.contentChanged &&
      (value.resultingVersionId === value.currentVersionId || value.predecessorVersionId !== value.currentVersionId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "post-lock changes require a new successor version" });
  }
});

export const RightsGrant = z.object({
  rightsGrantId: Identifier,
  subjectSha256: Sha256,
  platforms: z.array(Identifier).min(1),
  territories: z.array(Identifier).min(1),
  validFrom: IsoTimestamp,
  expiresAt: IsoTimestamp,
  status: z.enum(["ACTIVE", "REVOKED"])
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.validFrom) >= Date.parse(value.expiresAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rights grant must have positive duration" });
  }
});
export type RightsGrant = z.infer<typeof RightsGrant>;

export function authorizesPublication(
  grant: RightsGrant,
  publication: { subjectSha256: string; platform: string; territory: string; publishAt: string }
): boolean {
  const publishAt = IsoTimestamp.safeParse(publication.publishAt);
  return publishAt.success && grant.status === "ACTIVE" &&
    grant.subjectSha256 === publication.subjectSha256 &&
    grant.platforms.includes(publication.platform) && grant.territories.includes(publication.territory) &&
    Date.parse(publication.publishAt) >= Date.parse(grant.validFrom) &&
    Date.parse(publication.publishAt) < Date.parse(grant.expiresAt);
}

export const DutySeparatedDecision = z.object({
  operatorId: Identifier,
  investigatorId: Identifier,
  decisionMakerId: Identifier,
  appealReviewerId: Identifier.optional(),
  moneyExecutorId: Identifier
}).strict().superRefine((value, ctx) => {
  const decisionActors = [value.operatorId, value.investigatorId, value.decisionMakerId, value.moneyExecutorId];
  if (new Set(decisionActors).size !== decisionActors.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "operator, investigator, decision maker, and executor must be distinct" });
  }
  if (value.appealReviewerId !== undefined && decisionActors.includes(value.appealReviewerId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "appeal reviewer must be independent" });
  }
});

export const BudgetReservationDecision = z.object({
  campaignId: Identifier,
  expectedBalanceVersion: SafeInteger.refine((value) => value >= 0, "must be nonnegative"),
  availableMinorUnits: SafeInteger.refine((value) => value >= 0, "must be nonnegative"),
  requestedMinorUnits: SafeInteger.refine((value) => value > 0, "must be positive")
}).strict().transform((value, ctx) => {
  if (value.requestedMinorUnits > value.availableMinorUnits) {
    return { ok: false as const, reason: "INSUFFICIENT_RESERVED_BUDGET" as const,
      expectedBalanceVersion: value.expectedBalanceVersion };
  }
  const nextAvailableMinorUnits = value.availableMinorUnits - value.requestedMinorUnits;
  if (!Number.isSafeInteger(nextAvailableMinorUnits) || nextAvailableMinorUnits < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "budget arithmetic result must be a nonnegative safe integer" });
    return z.NEVER;
  }
  return { ok: true as const, nextAvailableMinorUnits, expectedBalanceVersion: value.expectedBalanceVersion };
});

export const EvidenceEntry = z.object({
  evidenceId: Identifier,
  sha256: Sha256,
  operation: z.enum(["APPEND", "SUPERSEDE"]),
  supersedesEvidenceId: Identifier.optional()
}).strict().superRefine((value, ctx) => {
  if (value.operation === "SUPERSEDE" &&
      (value.supersedesEvidenceId === undefined || value.supersedesEvidenceId === value.evidenceId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "corrections must identify a distinct prior evidence entry" });
  }
  if (value.operation === "APPEND" && value.supersedesEvidenceId !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "append cannot silently rewrite prior evidence" });
  }
});

export const ExternalEffectOutcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("SUCCEEDED"), receiptId: Identifier, receiptSha256: Sha256 }).strict(),
  z.object({ status: z.literal("FAILED"), reasonCode: Identifier }).strict(),
  z.object({ status: z.literal("UNKNOWN_PENDING_RECONCILIATION"), attemptId: Identifier }).strict()
]);

export type EffectReplayDecision =
  | { ok: true; replay: true }
  | { ok: false; reason: "INVALID_EFFECT_REPLAY_INPUT" | "IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_EFFECT" };

export function decideEffectReplay(
  untrustedPrior: unknown,
  untrustedNext: unknown
): EffectReplayDecision {
  const parsedPrior = EffectReplayIdentity.safeParse(untrustedPrior);
  const parsedNext = EffectReplayIdentity.safeParse(untrustedNext);
  if (!parsedPrior.success || !parsedNext.success) {
    return { ok: false, reason: "INVALID_EFFECT_REPLAY_INPUT" };
  }
  const prior = parsedPrior.data;
  const next = parsedNext.data;
  const priorApprovalIds = [...prior.approvalIds].sort();
  const nextApprovalIds = [...next.approvalIds].sort();
  return prior.idempotencyKey === next.idempotencyKey && prior.effect === next.effect &&
    prior.tenantId === next.tenantId && prior.campaignId === next.campaignId &&
    prior.environment === next.environment && prior.adapterMode === next.adapterMode &&
    prior.subjectId === next.subjectId && prior.subjectVersion === next.subjectVersion &&
    prior.subjectSha256 === next.subjectSha256 &&
    priorApprovalIds.length === nextApprovalIds.length &&
    priorApprovalIds.every((approvalId, index) => approvalId === nextApprovalIds[index])
    ? { ok: true, replay: true }
    : { ok: false, reason: "IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_EFFECT" };
}

export type AuthorityContext = z.infer<typeof AuthorityContext>;
export type MetricObservation = z.infer<typeof MetricObservation>;
export type ExternalEffectIntent = z.infer<typeof ExternalEffectIntent>;
