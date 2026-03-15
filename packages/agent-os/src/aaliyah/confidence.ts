import { randomUUID } from "node:crypto";

import type {
  AaliyahConfidenceAssessment,
  AaliyahConfidenceEvaluation,
  AaliyahConfidenceInput,
  AaliyahConfidenceLevel,
  AaliyahConfidenceReasonCode,
  AaliyahConfidenceSummary,
  AaliyahInterruptionSummary,
  AaliyahInterruptQueueItem
} from "./confidence-types.js";
import type { FounderBriefingMode } from "./briefing-types.js";

export class AaliyahConfidenceControlService {
  evaluate(input: AaliyahConfidenceInput): AaliyahConfidenceEvaluation {
    let score = 0.4;
    const reasons: AaliyahConfidenceReasonCode[] = [];

    if (input.dataComplete) {
      score += 0.15;
      reasons.push("data_complete");
    } else {
      score -= 0.15;
      reasons.push("data_incomplete");
    }

    if (input.routingCertain) {
      score += 0.15;
      reasons.push("routing_certain");
    } else {
      score -= 0.2;
      reasons.push("routing_ambiguous");
    }

    if (input.policyCertain) {
      score += 0.1;
      reasons.push("policy_certain");
    } else {
      score -= 0.15;
      reasons.push("policy_uncertain");
    }

    if (input.modeCertain) {
      score += 0.1;
      reasons.push("mode_certain");
    } else {
      score -= 0.2;
      reasons.push("mode_uncertain");
    }

    if (input.sourceReliability === "high") {
      score += 0.15;
      reasons.push("source_reliable");
    } else if (input.sourceReliability === "medium") {
      score += 0.05;
      reasons.push("source_reliable");
    } else {
      score -= 0.15;
      reasons.push("source_unverified");
    }

    if (input.releaseBlocking) {
      score += 0.05;
      reasons.push("release_blocking");
    }

    if (input.founderRelevance) {
      reasons.push("founder_relevant");
    }
    if (input.founderApprovalRequired) {
      reasons.push("founder_approval_required");
    }

    const confidenceBand = Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))));
    const confidenceLevel: AaliyahConfidenceLevel =
      confidenceBand >= 0.75 ? "high" : confidenceBand >= 0.5 ? "medium" : "low";

    const recommendedFallbackAction =
      confidenceLevel === "low"
        ? input.founderRelevance || input.founderApprovalRequired
          ? "escalate"
          : "suppress"
        : !input.routingCertain || !input.modeCertain
          ? "defer"
          : "proceed";

    const visibilityAction =
      input.releaseBlocking && confidenceLevel !== "low"
        ? "interrupt_now"
        : input.founderApprovalRequired || (input.founderRelevance && input.timeSensitivity === "immediate")
          ? confidenceLevel === "low"
            ? "same_day_briefing"
            : "interrupt_now"
          : input.founderRelevance && (input.timeSensitivity === "same_day" || input.urgency === "high" || input.urgency === "urgent")
            ? "same_day_briefing"
            : confidenceLevel === "low" && !input.founderRelevance
              ? "silent_log"
              : input.urgency === "low" && input.risk === "low" && !input.founderRelevance
                ? "silent_log"
                : "passive_queue";

    return {
      assessment: {
        confidenceId: `confidence:${randomUUID()}`,
        sourceSubsystem: input.sourceSubsystem,
        assessedItemType: input.assessedItemType,
        confidenceLevel,
        confidenceBand,
        reasonCodes: reasons,
        recommendedFallbackAction
      },
      interruption: {
        decisionId: `interrupt:${randomUUID()}`,
        sourceItemId: input.sourceItemId,
        urgency: input.urgency,
        risk: input.risk,
        founderRelevance: input.founderRelevance,
        timeSensitivity: input.timeSensitivity,
        confidenceLevel,
        recommendedVisibilityAction: visibilityAction,
        reasonCodes: reasons
      }
    };
  }

  summarizeConfidence(args: {
    generatedAt: string;
    activeMode: FounderBriefingMode;
    evaluations: AaliyahConfidenceEvaluation[];
  }): AaliyahConfidenceSummary {
    const reasonCounts = new Map<string, number>();
    let highConfidenceCount = 0;
    let mediumConfidenceCount = 0;
    let lowConfidenceCount = 0;
    let deferredCount = 0;
    let suppressedCount = 0;

    for (const evaluation of args.evaluations) {
      for (const reason of evaluation.assessment.reasonCodes) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }

      if (evaluation.assessment.confidenceLevel === "high") highConfidenceCount += 1;
      if (evaluation.assessment.confidenceLevel === "medium") mediumConfidenceCount += 1;
      if (evaluation.assessment.confidenceLevel === "low") lowConfidenceCount += 1;
      if (evaluation.assessment.recommendedFallbackAction === "defer") deferredCount += 1;
      if (evaluation.assessment.recommendedFallbackAction === "suppress") suppressedCount += 1;
    }

    const overallConfidenceLevel: AaliyahConfidenceLevel =
      lowConfidenceCount > Math.max(1, highConfidenceCount)
        ? "low"
        : lowConfidenceCount > 0 || mediumConfidenceCount > highConfidenceCount
          ? "medium"
          : "high";

    return {
      generatedAt: args.generatedAt,
      activeMode: args.activeMode,
      overallConfidenceLevel,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      deferredCount,
      suppressedCount,
      topReasonCodes: [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason]) => reason),
      items: args.evaluations.map((evaluation) => evaluation.assessment)
    };
  }

  summarizeInterruptions(args: {
    generatedAt: string;
    activeMode: FounderBriefingMode;
    items: AaliyahInterruptQueueItem[];
  }): AaliyahInterruptionSummary {
    return {
      generatedAt: args.generatedAt,
      activeMode: args.activeMode,
      items: args.items,
      interruptNowCount: args.items.filter((item) => item.visibilityAction === "interrupt_now").length,
      sameDayBriefingCount: args.items.filter((item) => item.visibilityAction === "same_day_briefing").length,
      passiveQueueCount: args.items.filter((item) => item.visibilityAction === "passive_queue").length,
      silentLogCount: args.items.filter((item) => item.visibilityAction === "silent_log").length
    };
  }
}
