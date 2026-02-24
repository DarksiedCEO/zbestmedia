import { describe, expect, it } from "vitest";
import {
  ArtifactMetaSchema,
  BrandSchema,
  PersonaSchema,
  CampaignSchema,
  ChannelProfileSchema,
  BrandBibleSchema,
  PersonaVoicebookSchema,
  NarrativeBriefSchema,
  VisualBibleSchema,
  VideoStyleSheetSchema,
  ThumbnailBlueprintSchema,
  GrowthStrategyBriefSchema,
  ContentCalendarSchema,
  PerformanceReviewSchema
} from "../src/index";

const meta = {
  artifactId: "art-1",
  requestId: "req-1",
  artifactType: "BrandBible",
  schemaVersion: "1.0.0",
  lineage: {
    parentArtifactIds: [],
    sourceEventId: "evt-1",
    attempt: 1
  }
};

describe("brand trinity schemas", () => {
  it("validates entities", () => {
    expect(BrandSchema.parse({
      brandId: "brand-1",
      name: "Z Best",
      mission: "Win",
      values: ["clarity", "precision"],
      primaryAudience: "creators",
      channels: ["youtube"]
    })).toBeTruthy();

    expect(PersonaSchema.parse({
      personaId: "persona-1",
      brandId: "brand-1",
      name: "Maker",
      demographics: { region: "US" },
      goals: ["grow"],
      painPoints: ["time"],
      tonePreferences: ["direct"]
    })).toBeTruthy();

    expect(CampaignSchema.parse({
      campaignId: "camp-1",
      brandId: "brand-1",
      name: "Launch",
      objective: "awareness",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      status: "planning"
    })).toBeTruthy();

    expect(ChannelProfileSchema.parse({
      channelProfileId: "cp-1",
      brandId: "brand-1",
      channel: "youtube",
      handle: "@zbest",
      audienceNotes: "builders",
      postingCadence: "3x/week"
    })).toBeTruthy();
  });

  it("validates artifacts", () => {
    expect(ArtifactMetaSchema.parse(meta)).toBeTruthy();

    expect(BrandBibleSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Brand Bible",
      summary: "Core identity",
      voice: "confident",
      tone: "direct",
      pillars: ["clarity"],
      dos: ["be precise"],
      donts: ["ramble"]
    })).toBeTruthy();

    expect(PersonaVoicebookSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Voicebook",
      summary: "Persona voice",
      personaId: "persona-1",
      speakingStyle: "concise",
      lexicon: ["ship"],
      bannedPhrases: ["maybe"]
    })).toBeTruthy();

    expect(NarrativeBriefSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Narrative Brief",
      summary: "Storyline",
      campaignId: "camp-1",
      narrativeArc: "challenge to win",
      keyMessages: ["speed"],
      proofPoints: ["metrics"]
    })).toBeTruthy();

    expect(VisualBibleSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Visual Bible",
      summary: "Look & feel",
      palette: ["#000000"],
      typography: ["Helvetica"],
      imageryNotes: "high contrast"
    })).toBeTruthy();

    expect(VideoStyleSheetSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Video Style",
      summary: "Video rules",
      pacing: "fast",
      framing: "medium",
      transitions: ["hard cut"],
      bRollGuidance: "product shots"
    })).toBeTruthy();

    expect(ThumbnailBlueprintSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Thumbnail",
      summary: "Thumb rules",
      templateNotes: "bold text",
      textGuidelines: ["3 words max"],
      contrastGuidance: "high"
    })).toBeTruthy();

    expect(GrowthStrategyBriefSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Growth Strategy",
      summary: "Plan",
      objectives: ["reach"],
      channels: ["youtube"],
      kpis: ["watch time"],
      positioningNotes: "premium"
    })).toBeTruthy();

    expect(ContentCalendarSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Content Calendar",
      summary: "Schedule",
      timeRange: { startDate: "2026-01-01", endDate: "2026-02-01" },
      items: [
        { date: "2026-01-05", channel: "youtube", topic: "launch", assetType: "video" }
      ]
    })).toBeTruthy();

    expect(PerformanceReviewSchema.parse({
      meta,
      brandId: "brand-1",
      title: "Performance Review",
      summary: "Results",
      period: { startDate: "2026-01-01", endDate: "2026-01-31" },
      highlights: ["growth"],
      lowlights: ["dropoff"],
      recommendations: ["improve hooks"]
    })).toBeTruthy();
  });
});
