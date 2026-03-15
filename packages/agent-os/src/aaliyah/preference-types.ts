import type { FounderBriefingMode } from "./briefing-types.js";

export type AaliyahPreferenceCategory =
  | "briefing_length"
  | "interruption_tolerance"
  | "approval_visibility"
  | "tone_preference"
  | "mode_visibility";

export type AaliyahPreferenceSourceType = "explicit" | "validated_inference";
export type AaliyahPreferenceConfidenceLevel = "high" | "medium" | "low";
export type AaliyahPreferenceValue =
  | "compact"
  | "standard"
  | "expanded"
  | "minimal"
  | "high"
  | "all_pending"
  | "urgent_only"
  | "concise"
  | "balanced"
  | "detailed"
  | "strict"
  | "founder_summary";

export type AaliyahPreferenceScope = {
  mode: FounderBriefingMode | "all";
  company: "zbestmedia" | "all";
  founderOnly: boolean;
};

export type AaliyahFounderPreferenceRecord = {
  preferenceId: string;
  category: AaliyahPreferenceCategory;
  value: AaliyahPreferenceValue;
  scope: AaliyahPreferenceScope;
  sourceType: AaliyahPreferenceSourceType;
  confidenceLevel: AaliyahPreferenceConfidenceLevel;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
  createdBy: string;
  deactivatedBy: string | null;
};

export type AaliyahResolvedPreferences = {
  activeMode: FounderBriefingMode;
  briefingLength: "compact" | "standard" | "expanded";
  interruptionTolerance: "minimal" | "standard" | "high";
  approvalVisibility: "all_pending" | "urgent_only";
  tonePreference: "concise" | "balanced" | "detailed";
  modeVisibility: "strict" | "founder_summary";
  appliedPreferences: AaliyahFounderPreferenceRecord[];
};

export type AaliyahPreferenceList = {
  generatedAt: string;
  activeMode: FounderBriefingMode;
  defaults: AaliyahResolvedPreferences;
  items: AaliyahFounderPreferenceRecord[];
};

export type CreateAaliyahPreferenceInput = {
  category: AaliyahPreferenceCategory;
  value: AaliyahPreferenceValue;
  scope?: Partial<AaliyahPreferenceScope>;
  sourceType?: Extract<AaliyahPreferenceSourceType, "explicit">;
  confidenceLevel?: AaliyahPreferenceConfidenceLevel;
  createdAt?: string;
};
