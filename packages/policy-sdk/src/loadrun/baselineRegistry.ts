import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

export const baselineRegistrySchema = z.object({
  baseline_report_path: z.string(),
  baseline_hash: z.string(),
  baseline_run_path: z.string(),
  accepted_at: z.string(),
  accepted_by: z.string(),
  notes: z.string(),
  chaos_report_path: z.string().optional().default("")
});

export type BaselineRegistry = z.infer<typeof baselineRegistrySchema>;

export function parseBaselineRegistry(input: unknown): BaselineRegistry {
  return baselineRegistrySchema.parse(input);
}

export function loadBaselineRegistry(filePath: string): BaselineRegistry {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseBaselineRegistry(JSON.parse(raw));
}

export function writeBaselineRegistry(filePath: string, registry: BaselineRegistry): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}
