import { z } from "zod";

const Id = z.string().min(1);
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ArtifactMetaSchema = z.object({
  artifactId: Id,
  requestId: Id,
  artifactType: z.string().min(1),
  schemaVersion: SemVer,
  lineage: z.object({
    parentArtifactIds: z.array(Id),
    sourceEventId: Id,
    attempt: z.number().int().nonnegative()
  })
});

export type ArtifactMeta = z.infer<typeof ArtifactMetaSchema>;

export const BrandSchema = z.object({
  brandId: Id,
  name: z.string().min(1),
  mission: z.string().min(1),
  values: z.array(z.string().min(1)),
  primaryAudience: z.string().min(1),
  channels: z.array(z.string().min(1))
});

export const PersonaSchema = z.object({
  personaId: Id,
  brandId: Id,
  name: z.string().min(1),
  demographics: z.record(z.string(), z.string()),
  goals: z.array(z.string().min(1)),
  painPoints: z.array(z.string().min(1)),
  tonePreferences: z.array(z.string().min(1))
});

export const CampaignSchema = z.object({
  campaignId: Id,
  brandId: Id,
  name: z.string().min(1),
  objective: z.string().min(1),
  startDate: IsoDate,
  endDate: IsoDate,
  status: z.enum(["planning", "active", "paused", "completed"])
});

export const ChannelProfileSchema = z.object({
  channelProfileId: Id,
  brandId: Id,
  channel: z.enum(["youtube", "tiktok", "instagram", "twitter", "linkedin", "podcast", "blog"]),
  handle: z.string().min(1),
  audienceNotes: z.string().min(1),
  postingCadence: z.string().min(1)
});

const ArtifactBaseSchema = z.object({
  meta: ArtifactMetaSchema,
  brandId: Id,
  title: z.string().min(1),
  summary: z.string().min(1)
});

export const BrandBibleSchema = ArtifactBaseSchema.extend({
  voice: z.string().min(1),
  tone: z.string().min(1),
  pillars: z.array(z.string().min(1)),
  dos: z.array(z.string().min(1)),
  donts: z.array(z.string().min(1))
});

export const PersonaVoicebookSchema = ArtifactBaseSchema.extend({
  personaId: Id,
  speakingStyle: z.string().min(1),
  lexicon: z.array(z.string().min(1)),
  bannedPhrases: z.array(z.string().min(1))
});

export const NarrativeBriefSchema = ArtifactBaseSchema.extend({
  campaignId: Id.optional(),
  narrativeArc: z.string().min(1),
  keyMessages: z.array(z.string().min(1)),
  proofPoints: z.array(z.string().min(1))
});

export const VisualBibleSchema = ArtifactBaseSchema.extend({
  palette: z.array(z.string().min(1)),
  typography: z.array(z.string().min(1)),
  imageryNotes: z.string().min(1)
});

export const VideoStyleSheetSchema = ArtifactBaseSchema.extend({
  pacing: z.string().min(1),
  framing: z.string().min(1),
  transitions: z.array(z.string().min(1)),
  bRollGuidance: z.string().min(1)
});

export const ThumbnailBlueprintSchema = ArtifactBaseSchema.extend({
  templateNotes: z.string().min(1),
  textGuidelines: z.array(z.string().min(1)),
  contrastGuidance: z.string().min(1)
});

export const GrowthStrategyBriefSchema = ArtifactBaseSchema.extend({
  objectives: z.array(z.string().min(1)),
  channels: z.array(z.string().min(1)),
  kpis: z.array(z.string().min(1)),
  positioningNotes: z.string().min(1)
});

export const ContentCalendarSchema = ArtifactBaseSchema.extend({
  timeRange: z.object({
    startDate: IsoDate,
    endDate: IsoDate
  }),
  items: z.array(
    z.object({
      date: IsoDate,
      channel: z.string().min(1),
      topic: z.string().min(1),
      assetType: z.string().min(1)
    })
  )
});

export const PerformanceReviewSchema = ArtifactBaseSchema.extend({
  period: z.object({
    startDate: IsoDate,
    endDate: IsoDate
  }),
  highlights: z.array(z.string().min(1)),
  lowlights: z.array(z.string().min(1)),
  recommendations: z.array(z.string().min(1))
});

export type Brand = z.infer<typeof BrandSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type ChannelProfile = z.infer<typeof ChannelProfileSchema>;

export type BrandBible = z.infer<typeof BrandBibleSchema>;
export type PersonaVoicebook = z.infer<typeof PersonaVoicebookSchema>;
export type NarrativeBrief = z.infer<typeof NarrativeBriefSchema>;
export type VisualBible = z.infer<typeof VisualBibleSchema>;
export type VideoStyleSheet = z.infer<typeof VideoStyleSheetSchema>;
export type ThumbnailBlueprint = z.infer<typeof ThumbnailBlueprintSchema>;
export type GrowthStrategyBrief = z.infer<typeof GrowthStrategyBriefSchema>;
export type ContentCalendar = z.infer<typeof ContentCalendarSchema>;
export type PerformanceReview = z.infer<typeof PerformanceReviewSchema>;

export const BrandTrinitySchemas = {
  Brand: BrandSchema,
  Persona: PersonaSchema,
  Campaign: CampaignSchema,
  ChannelProfile: ChannelProfileSchema,
  BrandBible: BrandBibleSchema,
  PersonaVoicebook: PersonaVoicebookSchema,
  NarrativeBrief: NarrativeBriefSchema,
  VisualBible: VisualBibleSchema,
  VideoStyleSheet: VideoStyleSheetSchema,
  ThumbnailBlueprint: ThumbnailBlueprintSchema,
  GrowthStrategyBrief: GrowthStrategyBriefSchema,
  ContentCalendar: ContentCalendarSchema,
  PerformanceReview: PerformanceReviewSchema,
  ArtifactMeta: ArtifactMetaSchema
} as const;
