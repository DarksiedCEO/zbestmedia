import { z } from "zod";

export const PlatformSchema = z.enum(["x", "linkedin", "instagram", "facebook", "tiktok", "youtube"]);
export type Platform = z.infer<typeof PlatformSchema>;

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
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const ScheduleStateSchema = z.object({
  items: z.array(ScheduleItemSchema),
});

export type ScheduleState = z.infer<typeof ScheduleStateSchema>;
