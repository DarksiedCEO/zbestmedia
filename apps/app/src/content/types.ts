import { z } from "zod";

export const ContentStatusSchema = z.enum(["draft", "testing", "winner", "dead"]);
export type ContentStatus = z.output<typeof ContentStatusSchema>;

export const ContentCategorySchema = z.enum(["traffic", "education", "offer", "authority"]);
export type ContentCategory = z.output<typeof ContentCategorySchema>;

export const ShortformPlatformSchema = z.enum(["tiktok", "reels", "shorts"]);
export type ShortformPlatform = z.output<typeof ShortformPlatformSchema>;

export const PrePostCheckSchema = z.object({
  firstFrameMatchesHook: z.boolean().default(false),
});
export type PrePostCheck = z.output<typeof PrePostCheckSchema>;

export const ContentMetricsSchema = z.object({
  platform: ShortformPlatformSchema,
  score: z.number(),
  ctr: z.number().optional(),
  hold3s: z.number().optional(),
  hold6s: z.number().optional(),
  saves: z.number().optional(),
  capturedAtIso: z.string().datetime(),
});
export type ContentMetrics = z.output<typeof ContentMetricsSchema>;

export const PlatformPerformanceSchema = z.object({
  tiktok: z.array(ContentMetricsSchema).default([]),
  reels: z.array(ContentMetricsSchema).default([]),
  shorts: z.array(ContentMetricsSchema).default([]),
});
export type PlatformPerformance = z.output<typeof PlatformPerformanceSchema>;

export const DraftSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(1),
  baseBody: z.string(),
  variants: z.record(z.string(), z.string()),
  status: ContentStatusSchema.default("draft"),
  category: ContentCategorySchema.default("traffic"),
  scaleCount: z.number().int().nonnegative().default(0),
  scaledFromId: z.string().optional(),
  prePostCheck: PrePostCheckSchema.default({ firstFrameMatchesHook: false }),
  performance: PlatformPerformanceSchema.default({ tiktok: [], reels: [], shorts: [] }),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});

export type Draft = z.output<typeof DraftSchema>;

export const DraftStateSchema = z.object({
  drafts: z.array(DraftSchema),
  activeId: z.string().optional().nullable(),
});

export type DraftState = z.output<typeof DraftStateSchema>;
