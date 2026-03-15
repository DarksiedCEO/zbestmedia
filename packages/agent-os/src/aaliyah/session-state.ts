import { randomUUID } from "node:crypto";

import type {
  AaliyahActiveModeState,
  AaliyahBoundaryViolationResult,
  AaliyahFounderInteractionState,
  AaliyahIntentTrailEntry,
  AaliyahModeSwitchReason,
  AaliyahReviewApprovalContext,
  AaliyahSessionContext,
  AaliyahSessionResetReason,
  AaliyahSessionRetentionPolicy,
  AaliyahSessionSnapshotView,
  AaliyahWorkingItemClosureReason,
  AaliyahWorkingItemClosureState,
  AaliyahWorkingItemContext
} from "./session-types.js";
import type { AaliyahRuntimeIntent, AaliyahRuntimeMode } from "./runtime-types.js";

export const DEFAULT_AALIYAH_SESSION_RETENTION_POLICY: AaliyahSessionRetentionPolicy = {
  intentTrailMaxEntries: 12,
  idleTtlSeconds: 4 * 60 * 60,
  hardTtlSeconds: 24 * 60 * 60,
  snapshotIntentTrailEntries: 6
};

export function createInitialAaliyahSession(args: {
  tenantId: string;
  actorId: string;
  principalContext: "founder" | "operator";
  activeMode?: AaliyahRuntimeMode;
  generatedAt: string;
  retentionPolicy?: Partial<AaliyahSessionRetentionPolicy>;
}): AaliyahSessionContext {
  const retentionPolicy = resolveRetentionPolicy(args.retentionPolicy);
  const activeMode = args.activeMode ?? "founder";
  return {
    sessionId: `aaliyah-session:${randomUUID()}`,
    tenantId: args.tenantId,
    actorId: args.actorId,
    principalContext: args.principalContext,
    companyScope: "zbestmedia",
    activeModeState: createModeState({
      activeMode,
      previousMode: null,
      switchedAt: args.generatedAt,
      switchReason: "fallback_to_default",
      boundaryDecisionId: null
    }),
    interactionState: createEmptyInteractionState(),
    retentionPolicy,
    createdAt: args.generatedAt,
    updatedAt: args.generatedAt,
    expiresAt: addSeconds(args.generatedAt, retentionPolicy.idleTtlSeconds),
    hardExpiresAt: addSeconds(args.generatedAt, retentionPolicy.hardTtlSeconds),
    lastResetAt: null,
    lastResetReason: null,
    version: 1
  };
}

export function createModeState(args: {
  activeMode: AaliyahRuntimeMode;
  previousMode: AaliyahRuntimeMode | null;
  switchedAt: string;
  switchReason: AaliyahModeSwitchReason;
  boundaryDecisionId: string | null;
}): AaliyahActiveModeState {
  return {
    activeMode: args.activeMode,
    previousMode: args.previousMode,
    switchedAt: args.switchedAt,
    switchReason: args.switchReason,
    boundaryDecisionId: args.boundaryDecisionId
  };
}

export function createEmptyInteractionState(): AaliyahFounderInteractionState {
  return {
    lastInteractionAt: null,
    lastIntent: null,
    lastResolvedIntent: null,
    intentTrail: [],
    workingItem: null,
    reviewApprovalContext: null,
    pendingDisambiguation: null
  };
}

export function resolveRetentionPolicy(
  overrides?: Partial<AaliyahSessionRetentionPolicy>
): AaliyahSessionRetentionPolicy {
  return {
    ...DEFAULT_AALIYAH_SESSION_RETENTION_POLICY,
    ...(overrides ?? {})
  };
}

export function isIdleExpired(session: AaliyahSessionContext, now: string): boolean {
  return Date.parse(session.expiresAt) <= Date.parse(now);
}

export function isHardExpired(session: AaliyahSessionContext, now: string): boolean {
  return Date.parse(session.hardExpiresAt) <= Date.parse(now);
}

export function advanceSessionTtl(session: AaliyahSessionContext, now: string): AaliyahSessionContext {
  return {
    ...session,
    updatedAt: now,
    expiresAt: addSeconds(now, session.retentionPolicy.idleTtlSeconds)
  };
}

export function trimIntentTrail(entries: AaliyahIntentTrailEntry[], maxEntries: number): AaliyahIntentTrailEntry[] {
  if (entries.length <= maxEntries) {
    return entries;
  }
  return entries.slice(entries.length - maxEntries);
}

export function softResetSession(
  session: AaliyahSessionContext,
  reason: AaliyahSessionResetReason,
  now: string,
  closureReason: AaliyahWorkingItemClosureReason
): AaliyahSessionContext {
  return {
    ...session,
    interactionState: {
      ...createEmptyInteractionState(),
      workingItem: closeWorkingItemContext(session.interactionState.workingItem, "reset", closureReason, now, null),
      reviewApprovalContext: invalidateReviewContext(
        session.interactionState.reviewApprovalContext,
        closureReason === "expired"
          ? "expired"
          : closureReason === "mode_switched"
            ? "mode_switched"
            : "manual_reset",
        now
      )
    },
    updatedAt: now,
    expiresAt: addSeconds(now, session.retentionPolicy.idleTtlSeconds),
    hardExpiresAt: addSeconds(now, session.retentionPolicy.hardTtlSeconds),
    lastResetAt: now,
    lastResetReason: reason,
    version: session.version + 1
  };
}

export function hardResetSession(
  session: AaliyahSessionContext,
  reason: AaliyahSessionResetReason,
  now: string
): AaliyahSessionContext {
  const reset = createInitialAaliyahSession({
    tenantId: session.tenantId,
    actorId: session.actorId,
    principalContext: session.principalContext,
    activeMode: "founder",
    generatedAt: now,
    retentionPolicy: session.retentionPolicy
  });
  return {
    ...reset,
    lastResetAt: now,
    lastResetReason: reason,
    version: session.version + 1
  };
}

export function switchSessionMode(
  session: AaliyahSessionContext,
  args: {
    targetMode: AaliyahRuntimeMode;
    switchedAt: string;
    switchReason: AaliyahModeSwitchReason;
    boundaryDecisionId?: string | null;
  }
): AaliyahSessionContext {
  if (session.activeModeState.activeMode === args.targetMode) {
    return {
      ...advanceSessionTtl(session, args.switchedAt),
      activeModeState: createModeState({
        activeMode: args.targetMode,
        previousMode: session.activeModeState.previousMode,
        switchedAt: args.switchedAt,
        switchReason: args.switchReason,
        boundaryDecisionId: args.boundaryDecisionId ?? null
      })
    };
  }

  return {
    ...advanceSessionTtl(session, args.switchedAt),
    activeModeState: createModeState({
      activeMode: args.targetMode,
      previousMode: session.activeModeState.activeMode,
      switchedAt: args.switchedAt,
      switchReason: args.switchReason,
      boundaryDecisionId: args.boundaryDecisionId ?? null
    }),
    interactionState: {
      ...session.interactionState,
      workingItem: closeWorkingItemContext(session.interactionState.workingItem, "reset", "mode_switched", args.switchedAt, null),
      reviewApprovalContext: invalidateReviewContext(session.interactionState.reviewApprovalContext, "mode_switched", args.switchedAt),
      pendingDisambiguation: null
    },
    lastResetAt: args.switchedAt,
    lastResetReason: "mode_switch",
    version: session.version + 1
  };
}

export function appendIntentTrail(
  session: AaliyahSessionContext,
  entry: AaliyahIntentTrailEntry,
  now: string
): AaliyahSessionContext {
  return {
    ...advanceSessionTtl(session, now),
    interactionState: {
      ...session.interactionState,
      lastInteractionAt: now,
      lastIntent: entry.requestedIntent,
      lastResolvedIntent: entry.resolvedIntent,
      intentTrail: trimIntentTrail(
        [...session.interactionState.intentTrail, entry],
        session.retentionPolicy.intentTrailMaxEntries
      )
    },
    version: session.version + 1
  };
}

export function setWorkingItemContext(
  session: AaliyahSessionContext,
  workingItem: AaliyahWorkingItemContext,
  now: string
): AaliyahSessionContext {
  return {
    ...advanceSessionTtl(session, now),
    interactionState: {
      ...session.interactionState,
      workingItem: {
        ...workingItem,
        updatedAt: now,
        closureState: "open",
        closureReason: null,
        closedAt: null,
        closedByIntent: null
      }
    },
    version: session.version + 1
  };
}

export function closeWorkingItemContext(
  workingItem: AaliyahWorkingItemContext | null,
  closureState: AaliyahWorkingItemClosureState,
  closureReason: AaliyahWorkingItemClosureReason,
  now: string,
  closedByIntent: AaliyahRuntimeIntent | null
): AaliyahWorkingItemContext | null {
  if (!workingItem) {
    return null;
  }
  return {
    ...workingItem,
    updatedAt: now,
    closureState,
    closureReason,
    closedAt: now,
    closedByIntent
  };
}

export function setReviewApprovalContext(
  session: AaliyahSessionContext,
  reviewContext: AaliyahReviewApprovalContext,
  now: string
): AaliyahSessionContext {
  return {
    ...advanceSessionTtl(session, now),
    interactionState: {
      ...session.interactionState,
      reviewApprovalContext: {
        ...reviewContext,
        updatedAt: now,
        invalidatedAt: null,
        invalidationReason: null
      }
    },
    version: session.version + 1
  };
}

export function invalidateReviewContext(
  context: AaliyahReviewApprovalContext | null,
  reason: AaliyahReviewApprovalContext["invalidationReason"],
  now: string
): AaliyahReviewApprovalContext | null {
  if (!context) {
    return null;
  }
  return {
    ...context,
    updatedAt: now,
    invalidatedAt: now,
    invalidationReason: reason
  };
}

export function setPendingDisambiguation(
  session: AaliyahSessionContext,
  reason: string,
  requestedIntent: string | null,
  now: string
): AaliyahSessionContext {
  return {
    ...advanceSessionTtl(session, now),
    interactionState: {
      ...session.interactionState,
      pendingDisambiguation: {
        reason,
        requestedIntent,
        createdAt: now
      }
    },
    version: session.version + 1
  };
}

export function clearPendingDisambiguation(session: AaliyahSessionContext, now: string): AaliyahSessionContext {
  if (!session.interactionState.pendingDisambiguation) {
    return advanceSessionTtl(session, now);
  }
  return {
    ...advanceSessionTtl(session, now),
    interactionState: {
      ...session.interactionState,
      pendingDisambiguation: null
    },
    version: session.version + 1
  };
}

export function buildSessionSnapshotView(session: AaliyahSessionContext): AaliyahSessionSnapshotView {
  return {
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    actorId: session.actorId,
    principalContext: session.principalContext,
    activeModeState: session.activeModeState,
    interactionState: {
      lastInteractionAt: session.interactionState.lastInteractionAt,
      lastIntent: session.interactionState.lastIntent,
      lastResolvedIntent: session.interactionState.lastResolvedIntent,
      intentTrail: session.interactionState.intentTrail.slice(-session.retentionPolicy.snapshotIntentTrailEntries),
      workingItem: session.interactionState.workingItem,
      reviewApprovalContext: session.interactionState.reviewApprovalContext,
      pendingDisambiguation: session.interactionState.pendingDisambiguation
    },
    retentionPolicy: session.retentionPolicy,
    expiresAt: session.expiresAt,
    hardExpiresAt: session.hardExpiresAt,
    lastResetAt: session.lastResetAt,
    lastResetReason: session.lastResetReason,
    updatedAt: session.updatedAt,
    version: session.version
  };
}

export function createBoundaryViolation(
  args: Omit<AaliyahBoundaryViolationResult, "violationId">
): AaliyahBoundaryViolationResult {
  return {
    violationId: `aaliyah-boundary:${randomUUID()}`,
    ...args
  };
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
