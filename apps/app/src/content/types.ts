import { z } from "zod";

export const DraftSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(1),
  baseBody: z.string(),
  variants: z.record(z.string(), z.string()),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});

export type Draft = z.infer<typeof DraftSchema>;

export const DraftStateSchema = z.object({
  drafts: z.array(DraftSchema),
  activeId: z.string().optional().nullable(),
});

export type DraftState = z.infer<typeof DraftStateSchema>;
