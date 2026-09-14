import { describe, expect, it } from "vitest";
import {
  Approval,
  BoundApproval,
  BudgetReservationDecision,
  DutySeparatedDecision,
  EditorialMutation,
  EvidenceEntry,
  ExternalEffectOutcome,
  ExternalEffectIntent,
  MetricObservation,
  Money,
  RightsGrant,
  authorizeScope,
  authorizeExternalEffect,
  authorizesPublication,
  decideEffectReplay,
  isApprovalUsable,
  transitionCampaign,
  transitionEditorial,
  transitionReward
} from "../src/index.js";

const hash = "a".repeat(64);

describe("fail-closed state transitions", () => {
  it("allows the first campaign gate and rejects skipping to active", () => {
    expect(transitionCampaign("DRAFT", "CONTROL_REVIEW").ok).toBe(true);
    expect(transitionCampaign("DRAFT", "SIMULATION_ACTIVE")).toEqual({
      ok: false,
      from: "DRAFT",
      to: "SIMULATION_ACTIVE",
      reason: "INVALID_TRANSITION"
    });
  });

  it("does not allow a draft edit to become published", () => {
    expect(transitionEditorial("DRAFT", "PUBLISHED").ok).toBe(false);
  });

  it("does not allow a preliminary reward to become final payable", () => {
    expect(transitionReward("EARNED_PRELIMINARY", "FINAL_PAYABLE").ok).toBe(false);
  });

  it("requires a suspended campaign to return through control review", () => {
    expect(transitionCampaign("SUSPENDED", "SIMULATION_ACTIVE").ok).toBe(false);
    expect(transitionCampaign("SUSPENDED", "CONTROL_REVIEW").ok).toBe(true);
  });
});

describe("money and metric invariants", () => {
  const intent = (effect: "PUBLISH" | "TAKEDOWN" | "PAYOUT", adapterMode: "FAKE" | "SANDBOX" | "LIVE") => ({
      intentId: "intent-1",
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      effect,
      adapterMode,
      idempotencyKey: "key-1",
      environment: "SIMULATION",
      subjectId: "reward-1",
      subjectVersion: "1",
      subjectSha256: hash,
      approvalIds: ["approval-1"]
    });

  it.each(["PUBLISH", "TAKEDOWN", "PAYOUT"] as const)("rejects every LIVE %s adapter", (effect) => {
    expect(() => ExternalEffectIntent.parse(intent(effect, "LIVE"))).toThrow(/simulation-only/);
  });

  it("rejects a sandbox payout adapter in simulation", () => {
    expect(() => ExternalEffectIntent.parse(intent("PAYOUT", "SANDBOX"))).toThrow(/require FAKE/);
  });

  it("requires raw views to reconcile to eligible and excluded views", () => {
    expect(() => MetricObservation.parse({
      observationId: "obs-1",
      platform: "tiktok",
      authorizedAccountId: "account-1",
      collectionMethod: "AUTHORIZED_API",
      observedAt: "2026-09-07T00:00:00.000Z",
      windowStartedAt: "2026-08-24T00:00:00.000Z",
      windowEndedAt: "2026-09-07T00:00:00.000Z",
      schemaVersion: "1.0.0",
      calculationVersion: "1.0.0",
      rawEvidenceSha256: hash,
      rawViews: 1000,
      eligibleViews: 900,
      excludedViews: 50,
      exclusionReasonCodes: ["SUSPECT_TRAFFIC"]
    })).toThrow();
  });

  it("rejects unsupported metric timing and missing exclusion provenance", () => {
    const observation = {
      observationId: "obs-2", platform: "tiktok", authorizedAccountId: "account-1",
      collectionMethod: "SIGNED_PLATFORM_EXPORT", observedAt: "2026-09-06T00:00:00.000Z",
      windowStartedAt: "2026-09-07T00:00:00.000Z", windowEndedAt: "2026-09-07T00:00:00.000Z",
      schemaVersion: "1", calculationVersion: "1", rawEvidenceSha256: hash,
      rawViews: 10, eligibleViews: 5, excludedViews: 5, exclusionReasonCodes: []
    };
    expect(() => MetricObservation.parse(observation)).toThrow();
  });

  it("requires optimistic-versioned budget reservations and refuses overspend", () => {
    expect(BudgetReservationDecision.parse({ campaignId: "campaign-1", expectedBalanceVersion: 7,
      availableMinorUnits: 100, requestedMinorUnits: 101 })).toEqual({
      ok: false, reason: "INSUFFICIENT_RESERVED_BUDGET", expectedBalanceVersion: 7
    });
  });
});

describe("authority, immutability, and effect invariants", () => {
  const approval = BoundApproval.parse({ approvalId: "approval-1", tenantId: "tenant-1", campaignId: "campaign-1",
    authority: "RIGHTS", subjectId: "cut-1",
    subjectVersion: "1", subjectSha256: hash, approvedBy: "legal-1",
    approvedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-08T00:00:00.000Z",
    evidenceIds: ["evidence-1"], status: "ACTIVE" });

  it("rejects stale, changed, expired, and revoked approvals", () => {
    expect(Approval.safeParse(approval).success).toBe(false);
    expect(isApprovalUsable(approval, { tenantId: "tenant-1", campaignId: "campaign-1",
      subjectId: "cut-1", subjectVersion: "2", subjectSha256: hash },
      "2026-09-07T00:00:00.000Z")).toBe(false);
    expect(isApprovalUsable(approval, { tenantId: "tenant-1", campaignId: "campaign-1",
      subjectId: "cut-1", subjectVersion: "1", subjectSha256: hash },
      "2026-09-08T00:00:00.000Z")).toBe(false);
    expect(isApprovalUsable({ ...approval, status: "REVOKED" },
      { tenantId: "tenant-1", campaignId: "campaign-1", subjectId: "cut-1", subjectVersion: "1",
        subjectSha256: hash }, "2026-09-07T00:00:00.000Z")).toBe(false);
  });

  it("rejects post-lock in-place content mutation", () => {
    expect(() => EditorialMutation.parse({ currentState: "PICTURE_LOCKED", currentVersionId: "v1",
      resultingVersionId: "v1", contentChanged: true })).toThrow(/successor/);
  });

  it("denies cross-tenant and cross-campaign resource access", () => {
    expect(authorizeScope({ tenantId: "tenant-a", campaignId: "campaign-a" },
      { tenantId: "tenant-b", campaignId: "campaign-a" })).toEqual({ ok: false, reason: "SCOPE_MISMATCH" });
    expect(authorizeScope({ tenantId: "tenant-a", campaignId: "campaign-a" },
      { tenantId: "tenant-a", campaignId: "campaign-b" })).toEqual({ ok: false, reason: "SCOPE_MISMATCH" });
  });

  it("blocks publication at rights expiry", () => {
    const grant = RightsGrant.parse({ rightsGrantId: "rights-1", subjectSha256: hash, platforms: ["tiktok"],
      territories: ["US"], validFrom: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-07T00:00:00.000Z",
      status: "ACTIVE" });
    expect(authorizesPublication(grant, { subjectSha256: hash, platform: "tiktok", territory: "US",
      publishAt: "2026-09-07T00:00:00.000Z" })).toBe(false);
  });

  it("enforces fraud, appeal, and executor separation", () => {
    expect(() => DutySeparatedDecision.parse({ operatorId: "operator", investigatorId: "investigator",
      decisionMakerId: "decider", appealReviewerId: "investigator", moneyExecutorId: "executor" }))
      .toThrow(/appeal reviewer/);
  });

  it("permits evidence correction only as an explicit successor", () => {
    expect(() => EvidenceEntry.parse({ evidenceId: "e1", sha256: hash, operation: "SUPERSEDE" })).toThrow();
    expect(EvidenceEntry.parse({ evidenceId: "e2", sha256: hash, operation: "SUPERSEDE",
      supersedesEvidenceId: "e1" }).operation).toBe("SUPERSEDE");
  });

  it("returns a prior effect only for an identical idempotent replay", () => {
    const prior = { tenantId: "tenant-1", campaignId: "campaign-1", idempotencyKey: "key",
      effect: "PUBLISH" as const, adapterMode: "FAKE" as const, environment: "SIMULATION" as const,
      subjectId: "post", subjectVersion: "1", subjectSha256: hash, approvalIds: ["creative", "rights"] };
    expect(decideEffectReplay(prior, prior)).toEqual({ ok: true, replay: true });
    expect(decideEffectReplay(prior, { ...prior, subjectSha256: "b".repeat(64) })).toEqual({
      ok: false, reason: "IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_EFFECT"
    });
  });

  it("never represents timeout or failure as success without a receipt", () => {
    expect(ExternalEffectOutcome.parse({ status: "UNKNOWN_PENDING_RECONCILIATION", attemptId: "attempt-1" }))
      .toEqual({ status: "UNKNOWN_PENDING_RECONCILIATION", attemptId: "attempt-1" });
    expect(() => ExternalEffectOutcome.parse({ status: "SUCCEEDED", attemptId: "attempt-1" })).toThrow();
  });
});

describe("resolved external-effect authority", () => {
  const intent = {
    intentId: "intent-1", tenantId: "tenant-1", campaignId: "campaign-1", effect: "PUBLISH" as const,
    adapterMode: "FAKE" as const, idempotencyKey: "key-1", environment: "SIMULATION" as const,
    subjectId: "variant-1", subjectVersion: "7", subjectSha256: hash,
    approvalIds: ["creative-approval", "rights-approval"]
  };
  const approval = (approvalId: string, authority: "FOUNDER_CREATIVE" | "RIGHTS" | "FINANCE",
    approvedBy: string) => BoundApproval.parse({
      approvalId, tenantId: "tenant-1", campaignId: "campaign-1", authority,
      subjectId: "variant-1", subjectVersion: "7", subjectSha256: hash, approvedBy,
      approvedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-10T00:00:00.000Z",
      evidenceIds: ["evidence-1"], status: "ACTIVE"
    });
  const creative = approval("creative-approval", "FOUNDER_CREATIVE", "founder-1");
  const rights = approval("rights-approval", "RIGHTS", "rights-1");
  const decide = (candidate: ExternalEffectIntent = intent, approvals: readonly BoundApproval[] = [creative, rights]) =>
    authorizeExternalEffect(ExternalEffectIntent.parse(candidate), approvals, "2026-09-07T00:00:00.000Z");

  it("requires tenant and campaign scope on every intent", () => {
    expect(ExternalEffectIntent.safeParse({ ...intent, tenantId: undefined }).success).toBe(false);
    expect(ExternalEffectIntent.safeParse({ ...intent, campaignId: undefined }).success).toBe(false);
  });

  it("rejects unresolved, incomplete, duplicate-ID, and extra approval sets", () => {
    expect(decide(intent, [creative]).ok).toBe(false);
    expect(decide(intent, [creative, rights, approval("unrequested", "RIGHTS", "rights-2")]).ok).toBe(false);
    expect(() => ExternalEffectIntent.parse({ ...intent, approvalIds: ["creative-approval", "creative-approval"] }))
      .toThrow(/distinct/);
    expect(decide({ ...intent, approvalIds: ["creative-approval", "missing"] }, [creative]).ok).toBe(false);
  });

  it("rejects cross-scope and wrong-subject approvals", () => {
    for (const changed of [
      { tenantId: "tenant-2" }, { campaignId: "campaign-2" }, { subjectId: "variant-2" },
      { subjectVersion: "8" }, { subjectSha256: "b".repeat(64) }
    ]) expect(decide(intent, [creative, { ...rights, ...changed }]).ok).toBe(false);
  });

  it("rejects wrong authority and duplicate approving people", () => {
    expect(decide(intent, [creative, { ...rights, authority: "FINANCE" }]).ok).toBe(false);
    expect(decide(intent, [creative, { ...rights, approvedBy: creative.approvedBy }]).ok).toBe(false);
  });

  it("rejects future, expired, revoked, and superseded approvals", () => {
    expect(decide(intent, [creative, { ...rights, approvedAt: "2026-09-08T00:00:00.000Z" }]).ok).toBe(false);
    expect(decide(intent, [creative, { ...rights, expiresAt: "2026-09-07T00:00:00.000Z" }]).ok).toBe(false);
    expect(decide(intent, [creative, { ...rights, status: "REVOKED" }]).ok).toBe(false);
    expect(decide(intent, [creative, { ...rights, status: "SUPERSEDED" }]).ok).toBe(false);
  });

  it("applies effect-specific authority without inheriting publication rules", () => {
    const payout = { ...intent, effect: "PAYOUT" as const, subjectId: "reward-1", approvalIds: ["finance"] };
    const finance = { ...approval("finance", "FINANCE", "finance-1"), subjectId: "reward-1" };
    expect(decide(payout, [finance])).toEqual({ ok: true });
    const takedown = { ...intent, effect: "TAKEDOWN" as const, approvalIds: ["rights-approval"] };
    expect(decide(takedown, [rights])).toEqual({ ok: true });
    expect(decide(intent, [creative, rights])).toEqual({ ok: true });
  });

  it("binds replay identity to scope, environment, adapter, version, and approval set", () => {
    const replay = (({ intentId: _, ...value }) => value)(intent);
    expect(decideEffectReplay(replay, { ...replay, approvalIds: [...replay.approvalIds].reverse() })).toEqual({ ok: true, replay: true });
    for (const changed of [
      { tenantId: "tenant-2" }, { campaignId: "campaign-2" }, { environment: "TEST" as const },
      { adapterMode: "SANDBOX" as const }, { subjectVersion: "8" }, { approvalIds: ["creative-approval", "other"] }
    ]) expect(decideEffectReplay(replay, { ...replay, ...changed }).ok).toBe(false);
  });
});

describe("safe money arithmetic", () => {
  const reserve = (availableMinorUnits: number, requestedMinorUnits: number) =>
    BudgetReservationDecision.parse({ campaignId: "campaign-1", expectedBalanceVersion: 1,
      availableMinorUnits, requestedMinorUnits });

  it("subtracts one minor unit exactly at the safe-integer boundary", () => {
    expect(reserve(Number.MAX_SAFE_INTEGER, 1)).toMatchObject({ ok: true,
      nextAvailableMinorUnits: Number.MAX_SAFE_INTEGER - 1 });
  });

  it("rejects unsafe balances, requests, versions, and money", () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, 9007199254740996, NaN, Infinity, 1.5]) {
      expect(() => reserve(value, 1)).toThrow();
      expect(() => reserve(100, value)).toThrow();
    }
    expect(() => BudgetReservationDecision.parse({ campaignId: "campaign-1",
      expectedBalanceVersion: Number.MAX_SAFE_INTEGER + 1, availableMinorUnits: 100, requestedMinorUnits: 1 })).toThrow();
    for (const value of [Number.MAX_SAFE_INTEGER + 1, 9007199254740996, NaN, Infinity, 1.5]) {
      expect(() => Money.parse({ currency: "USD", minorUnits: value })).toThrow();
    }
  });

  it("rejects prohibited negatives and zero requests without coercion", () => {
    expect(() => reserve(-1, 1)).toThrow();
    expect(() => reserve(1, -1)).toThrow();
    expect(() => reserve(1, 0)).toThrow();
  });
});

describe("fail-closed replay input validation", () => {
  const identity = {
    tenantId: "tenant-1", campaignId: "campaign-1", idempotencyKey: "key-1",
    effect: "PUBLISH", adapterMode: "FAKE", environment: "SIMULATION",
    subjectId: "variant-1", subjectVersion: "7", subjectSha256: hash,
    approvalIds: ["creative-approval", "rights-approval"]
  };
  const without = (key: keyof typeof identity) => Object.fromEntries(
    Object.entries(identity).filter(([candidate]) => candidate !== key)
  );
  const invalid = { ok: false as const, reason: "INVALID_EFFECT_REPLAY_INPUT" as const };

  it("rejects the exact legacy-shaped reviewer reproducer", () => {
    const legacy = { idempotencyKey: "key", effect: "PUBLISH", subjectId: "post", subjectSha256: hash };
    expect(decideEffectReplay(legacy, legacy)).toEqual(invalid);
  });

  it("rejects every missing replay-identity field", () => {
    for (const key of Object.keys(identity) as (keyof typeof identity)[]) {
      expect(decideEffectReplay(without(key), identity), key).toEqual(invalid);
    }
  });

  it("rejects malformed, legacy, and unexpected replay inputs without throwing", () => {
    const malformed: unknown[] = [
      null, undefined, true, 1, "identity", [], [identity],
      { ...identity, approvalIds: "creative-approval" },
      { ...identity, approvalIds: [] },
      { ...identity, approvalIds: ["creative-approval", "creative-approval"] },
      { ...identity, effect: "DELETE" },
      { ...identity, environment: "LIVE" },
      { ...identity, adapterMode: "REAL" },
      { ...identity, subjectSha256: "not-a-sha256" },
      { ...identity, unexpected: true }
    ];
    for (const candidate of malformed) {
      expect(decideEffectReplay(candidate, identity)).toEqual(invalid);
      expect(decideEffectReplay(identity, candidate)).toEqual(invalid);
    }
  });

  it("replays complete identities independent of approval order without mutating either input", () => {
    const prior = structuredClone(identity);
    const next = { ...structuredClone(identity), approvalIds: [...identity.approvalIds].reverse() };
    const priorBefore = structuredClone(prior);
    const nextBefore = structuredClone(next);
    expect(decideEffectReplay(prior, next)).toEqual({ ok: true, replay: true });
    expect(prior).toEqual(priorBefore);
    expect(next).toEqual(nextBefore);
  });

  it("rejects every governed identity-field mismatch after successful parsing", () => {
    const mismatches = [
      { tenantId: "tenant-2" },
      { campaignId: "campaign-2" },
      { idempotencyKey: "key-2" },
      { effect: "TAKEDOWN" },
      { adapterMode: "SANDBOX" },
      { environment: "TEST" },
      { subjectId: "variant-2" },
      { subjectVersion: "8" },
      { subjectSha256: "b".repeat(64) },
      { approvalIds: ["creative-approval", "other-approval"] }
    ];
    for (const mismatch of mismatches) {
      expect(decideEffectReplay(identity, { ...identity, ...mismatch })).toEqual({
        ok: false, reason: "IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_EFFECT"
      });
    }
  });
});
