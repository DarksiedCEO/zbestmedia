import { AaliyahMemoryBoundaryService, type AaliyahMemoryDetailLevel, type AaliyahMemoryBoundaryDecision } from "./memory-boundary.js";
import type { FounderBriefingMode } from "./briefing-types.js";

const DEFAULT_COMPANY = "zbestmedia";

export class AaliyahAccessControlService {
  constructor(private readonly boundary: AaliyahMemoryBoundaryService = new AaliyahMemoryBoundaryService()) {}

  assertFounderPrincipal(principalContext: "founder" | "operator"): void {
    if (principalContext !== "founder") {
      throw new Error("aaliyah_principal_context_denied");
    }
  }

  assertModeAccess(args: {
    activeMode: FounderBriefingMode;
    requestedMode: FounderBriefingMode;
    detailLevel: AaliyahMemoryDetailLevel;
  }): AaliyahMemoryBoundaryDecision {
    const decision = this.boundary.validate({
      activeMode: args.activeMode,
      requestedMode: args.requestedMode,
      requestedCompanies: [args.requestedMode === "founder" ? DEFAULT_COMPANY : args.requestedMode],
      detailLevel: args.detailLevel
    });
    if (decision.access === "denied") {
      throw new Error(`aaliyah_memory_boundary_denied:${decision.reasonCodes.join(",")}`);
    }
    return decision;
  }

  assertFounderModeAccess(args: {
    principalContext: "founder" | "operator";
    activeMode: FounderBriefingMode;
    requestedMode: FounderBriefingMode;
    detailLevel: AaliyahMemoryDetailLevel;
  }): AaliyahMemoryBoundaryDecision {
    this.assertFounderPrincipal(args.principalContext);
    return this.assertModeAccess({
      activeMode: args.activeMode,
      requestedMode: args.requestedMode,
      detailLevel: args.detailLevel
    });
  }
}
