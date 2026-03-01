import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { DEFAULT_TARGET_ID, parseTargetId, splitTargetId, type TargetId } from "./target";

export const baselineRegistryEntrySchema = z.object({
  baseline_report_path: z.string(),
  baseline_hash: z.string(),
  baseline_run_path: z.string(),
  accepted_at: z.string(),
  accepted_by: z.string(),
  notes: z.string(),
  chaos_report_path: z.string().optional().default("")
});

export type BaselineRegistryEntry = z.infer<typeof baselineRegistryEntrySchema>;

const baselineRegistryV2Schema = z.object({
  version: z.literal(2).default(2),
  targets: z.record(z.string(), baselineRegistryEntrySchema)
});

const baselineRegistryV1Schema = baselineRegistryEntrySchema;

export type BaselineRegistry = z.infer<typeof baselineRegistryV2Schema>;

export function migrateBaselineRegistryV1ToV2(input: z.infer<typeof baselineRegistryV1Schema>): BaselineRegistry {
  return {
    version: 2,
    targets: {
      [DEFAULT_TARGET_ID]: input
    }
  };
}

export function parseBaselineRegistry(input: unknown): BaselineRegistry {
  const parsedV2 = baselineRegistryV2Schema.safeParse(input);
  if (parsedV2.success) {
    return parsedV2.data;
  }

  const parsedV1 = baselineRegistryV1Schema.safeParse(input);
  if (parsedV1.success) {
    return migrateBaselineRegistryV1ToV2(parsedV1.data);
  }

  throw parsedV2.error;
}

export function loadBaselineRegistry(filePath: string): BaselineRegistry {
  const raw = fs.readFileSync(filePath, "utf8");
  return parseBaselineRegistry(JSON.parse(raw));
}

export function writeBaselineRegistry(filePath: string, registry: BaselineRegistry): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export function resolveTargetBaselineEntry(args: {
  registry: BaselineRegistry;
  targetId: string;
  allowUnbaselinedStaging?: boolean;
}): BaselineRegistryEntry {
  const targetId = parseTargetId(args.targetId) as TargetId;
  const exact = args.registry.targets[targetId];
  if (exact) {
    return exact;
  }

  const { env, service } = splitTargetId(targetId);
  const envFallback = args.registry.targets[`${env}/${service}`];
  if (envFallback) {
    return envFallback;
  }

  if (env === "staging" && args.allowUnbaselinedStaging) {
    return {
      baseline_report_path: "",
      baseline_hash: "",
      baseline_run_path: "",
      accepted_at: "",
      accepted_by: "",
      notes: "unbaselined staging target",
      chaos_report_path: ""
    };
  }

  throw new Error(`Missing baseline for target_id=${targetId}`);
}
