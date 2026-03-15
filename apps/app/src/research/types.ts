import { z } from "zod";

export const EvidenceSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(1),
  url: z.string().url().optional().nullable(),
  quote: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});
export type EvidenceItem = z.infer<typeof EvidenceSchema>;

export const TimelineEventSchema = z.object({
  id: z.string().min(6),
  dateIso: z.string().datetime(),
  title: z.string().min(1),
  summary: z.string().default(""),
  linkedEvidenceIds: z.array(z.string()).default([]),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const FindingSchema = z.object({
  id: z.string().min(6),
  severity: z.enum(["low", "medium", "high"]),
  text: z.string().min(1),
  linkedEvidenceIds: z.array(z.string()).default([]),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ResearchStateSchema = z.object({
  evidence: z.array(EvidenceSchema).default([]),
  timeline: z.array(TimelineEventSchema).default([]),
  findings: z.array(FindingSchema).default([]),
});
export type ResearchState = z.infer<typeof ResearchStateSchema>;
