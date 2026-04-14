import { z } from "zod";
import { ContentCategorySchema, ContentStatusSchema, PrePostCheckSchema } from "../content/types";

export const PlatformSchema = z.enum(["x", "linkedin", "instagram", "facebook", "tiktok", "youtube"]);
export type Platform = z.output<typeof PlatformSchema>;

export const CategoryPerformanceSchema = z.object({
  category: ContentCategorySchema,
  avgScore: z.number().default(0),
  sampleCount: z.number().int().nonnegative().default(0),
  lowScoreStreak: z.number().int().nonnegative().default(0),
  outputMultiplier: z.number().default(1),
  updatedAtIso: z.string().datetime().optional(),
});
export type CategoryPerformance = z.output<typeof CategoryPerformanceSchema>;

export const ScheduleItemSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(1),
  platform: PlatformSchema,
  scheduledAtIso: z.string().datetime(),
  scheduledEndIso: z.string().datetime().optional(),
  status: z.enum(["draft", "pending_approval", "scheduled", "posted", "failed"]),
  approvalRequired: z.boolean(),
  publishWindow: z.string().min(3),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  contentStatus: ContentStatusSchema.default("draft"),
  contentCategory: ContentCategorySchema.default("traffic"),
  scaleCount: z.number().int().nonnegative().default(0),
  prePostCheck: PrePostCheckSchema.default({ firstFrameMatchesHook: false }),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});

export type ScheduleItem = z.output<typeof ScheduleItemSchema>;

export const ScheduleStateSchema = z.object({
  items: z.array(ScheduleItemSchema),
  categoryPerformance: z.array(CategoryPerformanceSchema).default([]),
});

export type ScheduleState = z.output<typeof ScheduleStateSchema>;
