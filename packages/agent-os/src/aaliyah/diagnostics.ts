import { randomUUID } from "node:crypto";

import type {
  AaliyahClosureQualitySignal,
  AaliyahDiagnosticsEvent,
  AaliyahDiagnosticsSummary,
  AaliyahDiagnosticsWindow,
  AaliyahDriftSignal,
  AaliyahEnforcementTriggerSignal,
  AaliyahFounderFrictionSignal,
  AaliyahInterruptionLoadSignal,
  AaliyahPerformanceSnapshot,
  AaliyahQueueLatencySignal,
  AaliyahSessionResetSignal
} from "./diagnostics-types.js";
import type { FollowThroughHistoryEntry } from "./follow-through-types.js";
import type { AgentOsRepository } from "../persistence/repository.js";

const WINDOW_MS: Record<AaliyahDiagnosticsWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};

export class AaliyahDiagnosticsService {
  constructor(private readonly repository: AgentOsRepository) {}

  async recordEvent(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    activeMode: "founder" | "zbestmedia";
    eventType: AaliyahDiagnosticsEvent["eventType"];
    eventSource: AaliyahDiagnosticsEvent["eventSource"];
    signalKey: string;
    payload: Record<string, unknown>;
    createdAt?: string;
  }): Promise<AaliyahDiagnosticsEvent> {
    return this.repository.createAaliyahDiagnosticsEvent({
      tenantId: args.tenantId,
      actorId: args.actorId,
      principalContext: args.principalContext,
      activeMode: args.activeMode,
      eventType: args.eventType,
      eventSource: args.eventSource,
      signalKey: args.signalKey,
      payload: args.payload,
      createdAt: args.createdAt ?? new Date().toISOString()
    });
  }

  async getSummary(args: {
    tenantId: string;
    actorId: string;
    principalContext: "founder" | "operator";
    window: AaliyahDiagnosticsWindow;
    generatedAt?: string;
  }): Promise<AaliyahDiagnosticsSummary> {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const windowStartedAt = new Date(new Date(generatedAt).getTime() - WINDOW_MS[args.window]).toISOString();

    const [events, followThroughHistory, voiceCalls, pendingReviews, incidents] = await Promise.all([
      this.repository.listAaliyahDiagnosticsEvents({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        since: windowStartedAt,
        until: generatedAt,
        limit: 2000
      }),
      this.repository.listAaliyahFollowThroughHistoryWindow({
        tenantId: args.tenantId,
        actorId: args.actorId,
        principalContext: args.principalContext,
        since: windowStartedAt,
        until: generatedAt,
        limit: 1000
      }),
      this.repository.listVoiceCallRecordsWindow({
        tenantId: args.tenantId,
        since: windowStartedAt,
        until: generatedAt,
        limit: 1000
      }),
      this.repository.listEmailDraftReviewItems({
        tenantId: args.tenantId,
        status: "pending_review",
        limit: 500
      }),
      this.repository.listIncidentRecords({
        tenantId: args.tenantId,
        status: "open",
        limit: 200
      })
    ]);

    const runtimeEvents = events.filter((event) => event.eventType === "runtime_result");
    const invalidActionEvents = events.filter((event) => event.eventType === "follow_through_invalid_action");
    const sessionResetEvents = events.filter((event) => event.eventType === "session_reset");

    const enforcementTriggers = this.buildEnforcementSignals(runtimeEvents, invalidActionEvents);
    const closureQuality = this.buildClosureQualitySignal(followThroughHistory, invalidActionEvents);
    const interruptionLoad = this.buildInterruptionLoadSignal(voiceCalls);
    const reviewQueueLatency = this.buildReviewQueueLatencySignal(pendingReviews, generatedAt);
    const sessionReset = this.buildSessionResetSignal(sessionResetEvents, invalidActionEvents);
    const founderFriction = this.buildFounderFrictionSignal({
      closureQuality,
      sessionResetEvents,
      reviewQueueLatency,
      incidents
    });
    const nextGovernedActionDistribution = this.countByKey(followThroughHistory, (item) => item.nextGovernedAction);
    const followThroughTerminalCounts = this.countByKey(followThroughHistory, (item) => item.resultingStatus);

    const snapshot: AaliyahPerformanceSnapshot = {
      snapshotId: `aaliyah-diagnostics:${randomUUID()}`,
      generatedAt,
      window: args.window,
      windowStartedAt,
      windowEndedAt: generatedAt,
      nextGovernedActionDistribution,
      followThroughTerminalCounts,
      reviewQueueLatency,
      closureQuality,
      interruptionLoad,
      sessionReset,
      enforcementTriggers,
      founderFriction,
      driftSignals: this.buildDriftSignals(runtimeEvents, followThroughHistory, invalidActionEvents),
      sourceMetadata: {
        runtimeEventCount: runtimeEvents.length,
        followThroughHistoryCount: followThroughHistory.length,
        voiceCallCount: voiceCalls.length,
        pendingReviewCount: pendingReviews.length,
        incidentCount: incidents.length
      }
    };

    return {
      tenantId: args.tenantId,
      principalContext: args.principalContext,
      activeMode: this.resolveActiveMode(events),
      snapshot,
      attentionFlags: this.buildAttentionFlags(snapshot)
    };
  }

  private buildDriftSignals(
    runtimeEvents: AaliyahDiagnosticsEvent[],
    followThroughHistory: FollowThroughHistoryEntry[],
    invalidActionEvents: AaliyahDiagnosticsEvent[]
  ): AaliyahDriftSignal[] {
    const runtimeCount = runtimeEvents.length;
    const closureCount = followThroughHistory.length;
    const escalationCount = followThroughHistory.filter((item) => item.resultingStatus === "escalated").length;

    return [
      this.makeRate("ambiguity_fallback_rate", runtimeEvents.filter(this.isAmbiguityFallback).length, runtimeCount),
      this.makeRate("low_confidence_defer_rate", runtimeEvents.filter((event) => event.payload.fallbackOutcome === "defer_due_to_low_confidence").length, runtimeCount),
      this.makeRate(
        "denied_due_to_scope_rate",
        runtimeEvents.filter((event) => event.payload.fallbackOutcome === "deny_due_to_scope" || event.payload.fallbackOutcome === "deny_due_to_mode_boundary").length,
        runtimeCount
      ),
      this.makeRate("specialist_delegation_rate", runtimeEvents.filter((event) => event.payload.fallbackOutcome === "delegate_to_specialist").length, runtimeCount),
      this.makeRate("invalid_action_attempt_rate", invalidActionEvents.length, Math.max(runtimeCount + invalidActionEvents.length, 1)),
      this.makeRate("escalation_rate", escalationCount, closureCount)
    ];
  }

  private buildEnforcementSignals(
    runtimeEvents: AaliyahDiagnosticsEvent[],
    invalidActionEvents: AaliyahDiagnosticsEvent[]
  ): AaliyahEnforcementTriggerSignal {
    return {
      deniedDueToScopeCount: runtimeEvents.filter((event) => event.payload.fallbackOutcome === "deny_due_to_scope").length,
      deniedDueToModeBoundaryCount: runtimeEvents.filter((event) => event.payload.fallbackOutcome === "deny_due_to_mode_boundary").length,
      lowConfidenceDeferCount: runtimeEvents.filter((event) => event.payload.fallbackOutcome === "defer_due_to_low_confidence").length,
      ambiguityFallbackCount: runtimeEvents.filter(this.isAmbiguityFallback).length,
      specialistDelegationCount: runtimeEvents.filter((event) => event.payload.fallbackOutcome === "delegate_to_specialist").length,
      invalidActionAttemptCount: invalidActionEvents.length
    };
  }

  private buildClosureQualitySignal(
    history: FollowThroughHistoryEntry[],
    invalidActionEvents: AaliyahDiagnosticsEvent[]
  ): AaliyahClosureQualitySignal {
    const terminal = history.filter((item) => item.resultingStatus !== "active");
    const completed = terminal.filter((item) => item.resultingStatus === "completed");
    const founderDeclaredCompletionCount = completed.filter((item) => item.founderDeclaredCompletion).length;
    const downstreamConfirmedCompletionCount = completed.filter((item) => Boolean(item.downstreamActionRef)).length;
    const invalidationCount = terminal.filter((item) => item.resultingStatus === "invalidated").length;
    const abandonmentCount = terminal.filter((item) => item.resultingStatus === "abandoned").length;
    const escalationEvents = terminal.filter((item) => item.resultingStatus === "escalated");
    const escalationWithRationaleCount = escalationEvents.filter((item) => Boolean(item.escalationRationale) && (Boolean(item.escalationTarget) || Boolean(item.escalationClass))).length;

    return {
      totalTerminalEvents: terminal.length,
      founderDeclaredCompletionCount,
      founderDeclaredCompletionRate: this.rate(founderDeclaredCompletionCount, completed.length),
      downstreamConfirmedCompletionCount,
      downstreamConfirmedCompletionRate: this.rate(downstreamConfirmedCompletionCount, completed.length),
      invalidationCount,
      invalidationRate: this.rate(invalidationCount, terminal.length),
      abandonmentCount,
      abandonmentRate: this.rate(abandonmentCount, terminal.length),
      escalationCount: escalationEvents.length,
      escalationWithRationaleCount,
      escalationWithRationaleCompleteness: this.rate(escalationWithRationaleCount, escalationEvents.length),
      terminalActionIdempotencyFailureCount: invalidActionEvents.filter((event) => String(event.signalKey).includes("terminal_immutable")).length
    };
  }

  private buildInterruptionLoadSignal(voiceCalls: Array<{ interruptionClass: string; createdAt: string }>): AaliyahInterruptionLoadSignal {
    const interruptNowCount = voiceCalls.filter((call) => call.interruptionClass === "interrupt_now").length;
    const sameDayBriefingCount = voiceCalls.filter((call) => call.interruptionClass === "review_soon").length;
    const passiveQueueCount = voiceCalls.filter((call) => call.interruptionClass === "can_wait").length;

    const concentration = new Map<string, number>();
    for (const call of voiceCalls) {
      if (call.interruptionClass !== "interrupt_now") continue;
      const hourStartedAt = new Date(call.createdAt);
      hourStartedAt.setUTCMinutes(0, 0, 0);
      const key = hourStartedAt.toISOString();
      concentration.set(key, (concentration.get(key) ?? 0) + 1);
    }

    return {
      interruptNowCount,
      sameDayBriefingCount,
      passiveQueueCount,
      silentLogCount: 0,
      highInterruptionConcentrationWindows: [...concentration.entries()]
        .filter(([, count]) => count >= 3)
        .map(([hourStartedAt, count]) => ({ hourStartedAt, interruptNowCount: count }))
        .sort((a, b) => b.interruptNowCount - a.interruptNowCount)
    };
  }

  private buildReviewQueueLatencySignal(
    pendingReviews: Array<{ createdAt: string }>,
    generatedAt: string
  ): AaliyahQueueLatencySignal {
    const now = new Date(generatedAt).getTime();
    let oldestPendingReviewAgeSeconds: number | null = null;
    const buckets = {
      under1Hour: 0,
      oneToFourHours: 0,
      fourToTwentyFourHours: 0,
      overTwentyFourHours: 0
    };

    for (const item of pendingReviews) {
      const ageSeconds = Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 1000));
      oldestPendingReviewAgeSeconds = oldestPendingReviewAgeSeconds === null ? ageSeconds : Math.max(oldestPendingReviewAgeSeconds, ageSeconds);
      if (ageSeconds < 3600) buckets.under1Hour += 1;
      else if (ageSeconds < 4 * 3600) buckets.oneToFourHours += 1;
      else if (ageSeconds < 24 * 3600) buckets.fourToTwentyFourHours += 1;
      else buckets.overTwentyFourHours += 1;
    }

    return {
      pendingReviewCount: pendingReviews.length,
      pendingReviewAgeBuckets: buckets,
      oldestPendingReviewAgeSeconds
    };
  }

  private buildSessionResetSignal(
    resetEvents: AaliyahDiagnosticsEvent[],
    invalidActionEvents: AaliyahDiagnosticsEvent[]
  ): AaliyahSessionResetSignal {
    return {
      softResetCount: resetEvents.filter((event) => event.payload.resetScope === "soft").length,
      hardExpirationCount: resetEvents.filter((event) => event.payload.resetReason === "hard_expired").length,
      disambiguationExpiryCount: resetEvents.filter((event) => event.payload.expiredPendingDisambiguation === true).length,
      staleContextRejectionCount: invalidActionEvents.filter((event) => ["aaliyah_follow_through_item_not_active", "aaliyah_follow_through_target_mismatch", "aaliyah_follow_through_missing_active_item"].includes(String(event.signalKey))).length
    };
  }

  private buildFounderFrictionSignal(args: {
    closureQuality: AaliyahClosureQualitySignal;
    sessionResetEvents: AaliyahDiagnosticsEvent[];
    reviewQueueLatency: AaliyahQueueLatencySignal;
    incidents: Array<{ severity: string }>;
  }): AaliyahFounderFrictionSignal {
    return {
      founderDeclaredCompletionCount: args.closureQuality.founderDeclaredCompletionCount,
      manualResetCount: args.sessionResetEvents.filter((event) => event.payload.resetReason === "manual_reset").length,
      pendingReviewOverTwentyFourHoursCount: args.reviewQueueLatency.pendingReviewAgeBuckets.overTwentyFourHours,
      staleContextRejectionCount: args.sessionResetEvents.filter((event) => event.payload.resetReason === "boundary_violation").length,
      openCriticalIncidentCount: args.incidents.filter((incident) => incident.severity === "critical").length
    };
  }

  private buildAttentionFlags(snapshot: AaliyahPerformanceSnapshot): AaliyahDiagnosticsSummary["attentionFlags"] {
    const flags: AaliyahDiagnosticsSummary["attentionFlags"] = [];
    if (snapshot.reviewQueueLatency.pendingReviewAgeBuckets.overTwentyFourHours > 0) {
      flags.push({
        code: "review_queue_stale",
        severity: "warning",
        summary: `${snapshot.reviewQueueLatency.pendingReviewAgeBuckets.overTwentyFourHours} review items are older than 24h.`
      });
    }
    if (snapshot.enforcementTriggers.lowConfidenceDeferCount > 5) {
      flags.push({
        code: "low_confidence_pressure",
        severity: "warning",
        summary: `Low-confidence defers rose to ${snapshot.enforcementTriggers.lowConfidenceDeferCount} in the selected window.`
      });
    }
    if (snapshot.founderFriction.founderDeclaredCompletionCount > 3) {
      flags.push({
        code: "founder_declared_completion_pressure",
        severity: "info",
        summary: `Founder-declared completions reached ${snapshot.founderFriction.founderDeclaredCompletionCount} in the selected window.`
      });
    }
    if (snapshot.interruptionLoad.highInterruptionConcentrationWindows.length > 0) {
      flags.push({
        code: "interruption_concentration",
        severity: "critical",
        summary: `Interrupt-now calls clustered into ${snapshot.interruptionLoad.highInterruptionConcentrationWindows.length} high-load windows.`
      });
    }
    return flags;
  }

  private resolveActiveMode(events: AaliyahDiagnosticsEvent[]): "founder" | "zbestmedia" | "mixed" {
    const modes = new Set(events.map((event) => event.activeMode));
    if (modes.size === 0) return "founder";
    if (modes.size === 1) {
      return modes.has("zbestmedia") ? "zbestmedia" : "founder";
    }
    return "mixed";
  }

  private makeRate(metric: AaliyahDriftSignal["metric"], count: number, denominator: number): AaliyahDriftSignal {
    return {
      signalId: `aaliyah-drift:${metric}`,
      metric,
      count,
      denominator,
      rate: this.rate(count, denominator)
    };
  }

  private rate(count: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return Number((count / denominator).toFixed(4));
  }

  private countByKey<T>(items: T[], keyResolver: (item: T) => string): Record<string, number> {
    return items.reduce<Record<string, number>>((acc, item) => {
      const key = keyResolver(item);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  private isAmbiguityFallback(event: AaliyahDiagnosticsEvent): boolean {
    return event.payload.fallbackOutcome === "escalate_for_clarification"
      || String(event.payload.fallbackReason ?? "").toLowerCase().includes("ambigu");
  }
}
