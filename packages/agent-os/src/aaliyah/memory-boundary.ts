import { randomUUID } from "node:crypto";

import type { FounderBriefingMode } from "./briefing-types.js";

export type AaliyahMemoryDetailLevel = "summary" | "detail";
export type AaliyahMemoryBoundaryAccess = "allowed" | "allowed_founder_summary_only" | "denied";
export type AaliyahMemoryBoundaryReasonCode =
  | "valid_scope"
  | "founder_summary_only"
  | "unsupported_mode"
  | "unscoped_request"
  | "unknown_company_scope"
  | "cross_company_detail_denied"
  | "company_detail_scope_denied";

export type AaliyahMemoryBoundaryRequest = {
  activeMode: FounderBriefingMode;
  requestedMode: FounderBriefingMode;
  requestedCompanies: string[];
  detailLevel: AaliyahMemoryDetailLevel;
};

export type AaliyahMemoryBoundaryDecision = {
  decisionId: string;
  activeMode: FounderBriefingMode;
  requestedMode: FounderBriefingMode;
  requestedCompanies: string[];
  detailLevel: AaliyahMemoryDetailLevel;
  access: AaliyahMemoryBoundaryAccess;
  founderSummaryOnly: boolean;
  reasonCodes: AaliyahMemoryBoundaryReasonCode[];
};

export type AaliyahMemoryBoundarySummary = {
  generatedAt: string;
  activeMode: FounderBriefingMode;
  supportedModes: FounderBriefingMode[];
  supportedCompanies: string[];
  founderAggregationRule: "single_company_detail_allowed_multi_company_summary_only";
  decisions: AaliyahMemoryBoundaryDecision[];
};

export class AaliyahMemoryBoundaryService {
  constructor(
    private readonly supportedCompanies: string[] = ["zbestmedia"],
    private readonly supportedModes: FounderBriefingMode[] = ["founder", "zbestmedia"]
  ) {}

  validate(request: AaliyahMemoryBoundaryRequest): AaliyahMemoryBoundaryDecision {
    if (!this.supportedModes.includes(request.activeMode) || !this.supportedModes.includes(request.requestedMode)) {
      return this.deny(request, ["unsupported_mode"]);
    }

    if (request.requestedCompanies.length === 0) {
      return this.deny(request, ["unscoped_request"]);
    }

    if (request.requestedCompanies.some((company) => !this.supportedCompanies.includes(company))) {
      return this.deny(request, ["unknown_company_scope"]);
    }

    if (request.requestedMode === "founder") {
      if (request.requestedCompanies.length > 1) {
        if (request.detailLevel === "detail") {
          return this.deny(request, ["cross_company_detail_denied"]);
        }
        return this.allow(request, "allowed_founder_summary_only", ["founder_summary_only"]);
      }
      return this.allow(request, "allowed", ["valid_scope"]);
    }

    if (request.requestedCompanies.length !== 1 || request.requestedCompanies[0] !== request.requestedMode) {
      return this.deny(request, ["company_detail_scope_denied"]);
    }

    return this.allow(request, "allowed", ["valid_scope"]);
  }

  getSummary(args: { activeMode: FounderBriefingMode; generatedAt?: string }): AaliyahMemoryBoundarySummary {
    const generatedAt = args.generatedAt ?? new Date().toISOString();
    const sampleCompanies = this.supportedCompanies.slice(0, Math.min(2, this.supportedCompanies.length));
    const decisions = [
      this.validate({
        activeMode: args.activeMode,
        requestedMode: args.activeMode,
        requestedCompanies: [args.activeMode === "founder" ? this.supportedCompanies[0]! : args.activeMode],
        detailLevel: args.activeMode === "founder" ? "summary" : "detail"
      }),
      this.validate({
        activeMode: args.activeMode,
        requestedMode: "founder",
        requestedCompanies: sampleCompanies,
        detailLevel: sampleCompanies.length > 1 ? "summary" : "detail"
      })
    ];

    return {
      generatedAt,
      activeMode: args.activeMode,
      supportedModes: [...this.supportedModes],
      supportedCompanies: [...this.supportedCompanies],
      founderAggregationRule: "single_company_detail_allowed_multi_company_summary_only",
      decisions
    };
  }

  private allow(
    request: AaliyahMemoryBoundaryRequest,
    access: Exclude<AaliyahMemoryBoundaryAccess, "denied">,
    reasonCodes: AaliyahMemoryBoundaryReasonCode[]
  ): AaliyahMemoryBoundaryDecision {
    return {
      decisionId: `memory-boundary:${randomUUID()}`,
      activeMode: request.activeMode,
      requestedMode: request.requestedMode,
      requestedCompanies: [...request.requestedCompanies],
      detailLevel: request.detailLevel,
      access,
      founderSummaryOnly: access === "allowed_founder_summary_only",
      reasonCodes
    };
  }

  private deny(
    request: AaliyahMemoryBoundaryRequest,
    reasonCodes: AaliyahMemoryBoundaryReasonCode[]
  ): AaliyahMemoryBoundaryDecision {
    return {
      decisionId: `memory-boundary:${randomUUID()}`,
      activeMode: request.activeMode,
      requestedMode: request.requestedMode,
      requestedCompanies: [...request.requestedCompanies],
      detailLevel: request.detailLevel,
      access: "denied",
      founderSummaryOnly: false,
      reasonCodes
    };
  }
}
