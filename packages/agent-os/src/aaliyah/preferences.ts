import type { AgentOsRepository } from "../persistence/repository.js";
import type { FounderBriefingMode } from "./briefing-types.js";
import type {
  AaliyahFounderPreferenceRecord,
  AaliyahPreferenceCategory,
  AaliyahPreferenceList,
  AaliyahPreferenceScope,
  AaliyahPreferenceValue,
  AaliyahResolvedPreferences,
  CreateAaliyahPreferenceInput
} from "./preference-types.js";

const DEFAULT_SCOPE: AaliyahPreferenceScope = {
  mode: "all",
  company: "all",
  founderOnly: true
};

const DEFAULT_RESOLVED = {
  briefingLength: "standard",
  interruptionTolerance: "standard",
  approvalVisibility: "all_pending",
  tonePreference: "balanced",
  modeVisibility: "strict"
} as const;

export class AaliyahPreferenceService {
  constructor(private readonly repository: AgentOsRepository) {}

  async listPreferences(args: { tenantId: string; mode: FounderBriefingMode; generatedAt?: string }): Promise<AaliyahPreferenceList> {
    const items = await this.repository.listAaliyahFounderPreferences({
      tenantId: args.tenantId,
      activeOnly: true,
      limit: 100
    });
    const defaults = this.resolvePreferencesForMode({
      tenantId: args.tenantId,
      mode: args.mode,
      items
    });
    return {
      generatedAt: args.generatedAt ?? new Date().toISOString(),
      activeMode: args.mode,
      defaults,
      items
    };
  }

  async createExplicitPreference(args: {
    tenantId: string;
    actorId: string;
    input: CreateAaliyahPreferenceInput;
  }): Promise<AaliyahFounderPreferenceRecord> {
    this.assertPreferenceValue(args.input.category, args.input.value);
    const scope: AaliyahPreferenceScope = {
      ...DEFAULT_SCOPE,
      ...(args.input.scope ?? {})
    };

    await this.repository.deactivateAaliyahFounderPreferencesByCategory({
      tenantId: args.tenantId,
      category: args.input.category,
      scope,
      deactivatedBy: args.actorId,
      deactivatedAt: args.input.createdAt
    });

    return this.repository.createAaliyahFounderPreference({
      tenantId: args.tenantId,
      category: args.input.category,
      value: args.input.value,
      scope,
      sourceType: "explicit",
      confidenceLevel: args.input.confidenceLevel ?? "high",
      active: true,
      createdAt: args.input.createdAt,
      createdBy: args.actorId
    });
  }

  async deactivatePreference(args: {
    tenantId: string;
    preferenceId: string;
    actorId: string;
    deactivatedAt?: string;
  }): Promise<AaliyahFounderPreferenceRecord> {
    return this.repository.deactivateAaliyahFounderPreference({
      tenantId: args.tenantId,
      preferenceId: args.preferenceId,
      deactivatedBy: args.actorId,
      deactivatedAt: args.deactivatedAt
    });
  }

  async resolvePreferences(args: { tenantId: string; mode: FounderBriefingMode }): Promise<AaliyahResolvedPreferences> {
    const items = await this.repository.listAaliyahFounderPreferences({
      tenantId: args.tenantId,
      activeOnly: true,
      limit: 100
    });
    return this.resolvePreferencesForMode({
      tenantId: args.tenantId,
      mode: args.mode,
      items
    });
  }

  resolvePreferencesForMode(args: {
    tenantId: string;
    mode: FounderBriefingMode;
    items: AaliyahFounderPreferenceRecord[];
  }): AaliyahResolvedPreferences {
    const applicable = args.items.filter((item) => this.preferenceAppliesToMode(item, args.mode));
    const appliedPreferences: AaliyahFounderPreferenceRecord[] = [];

    const briefingLength = this.resolveCategory(applicable, "briefing_length", appliedPreferences, DEFAULT_RESOLVED.briefingLength) as AaliyahResolvedPreferences["briefingLength"];
    const interruptionTolerance = this.resolveCategory(applicable, "interruption_tolerance", appliedPreferences, DEFAULT_RESOLVED.interruptionTolerance) as AaliyahResolvedPreferences["interruptionTolerance"];
    const approvalVisibility = this.resolveCategory(applicable, "approval_visibility", appliedPreferences, DEFAULT_RESOLVED.approvalVisibility) as AaliyahResolvedPreferences["approvalVisibility"];
    const tonePreference = this.resolveCategory(applicable, "tone_preference", appliedPreferences, DEFAULT_RESOLVED.tonePreference) as AaliyahResolvedPreferences["tonePreference"];
    const modeVisibility = this.resolveCategory(applicable, "mode_visibility", appliedPreferences, DEFAULT_RESOLVED.modeVisibility) as AaliyahResolvedPreferences["modeVisibility"];

    return {
      activeMode: args.mode,
      briefingLength,
      interruptionTolerance,
      approvalVisibility,
      tonePreference,
      modeVisibility,
      appliedPreferences
    };
  }

  private resolveCategory(
    items: AaliyahFounderPreferenceRecord[],
    category: AaliyahPreferenceCategory,
    applied: AaliyahFounderPreferenceRecord[],
    fallback: AaliyahPreferenceValue
  ): AaliyahPreferenceValue {
    const candidates = items
      .filter((item) => item.category === category)
      .sort((left, right) => this.preferenceRank(right) - this.preferenceRank(left));

    const winner = candidates.find((item) => item.sourceType === "explicit")
      ?? candidates.find((item) => item.sourceType === "validated_inference" && item.confidenceLevel !== "low")
      ?? null;

    if (!winner) {
      return fallback;
    }

    applied.push(winner);
    return winner.value;
  }

  private preferenceAppliesToMode(item: AaliyahFounderPreferenceRecord, mode: FounderBriefingMode): boolean {
    return item.scope.mode === "all" || item.scope.mode === mode;
  }

  private preferenceRank(item: AaliyahFounderPreferenceRecord): number {
    const explicitWeight = item.sourceType === "explicit" ? 100 : 10;
    const modeWeight = item.scope.mode === "all" ? 0 : 20;
    const confidenceWeight = item.confidenceLevel === "high" ? 10 : item.confidenceLevel === "medium" ? 5 : 0;
    return explicitWeight + modeWeight + confidenceWeight;
  }

  private assertPreferenceValue(category: AaliyahPreferenceCategory, value: AaliyahPreferenceValue): void {
    const validValues: Record<AaliyahPreferenceCategory, AaliyahPreferenceValue[]> = {
      briefing_length: ["compact", "standard", "expanded"],
      interruption_tolerance: ["minimal", "standard", "high"],
      approval_visibility: ["all_pending", "urgent_only"],
      tone_preference: ["concise", "balanced", "detailed"],
      mode_visibility: ["strict", "founder_summary"]
    };

    if (!validValues[category].includes(value)) {
      throw new Error(`aaliyah_invalid_preference_value:${category}`);
    }
  }
}
