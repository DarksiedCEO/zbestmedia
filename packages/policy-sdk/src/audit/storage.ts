import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

const storageConfigSchema = z.object({
  sink: z.enum(["file", "s3"]).default("file"),
  s3_bucket: z.string().optional(),
  s3_region: z.string().optional(),
  s3_prefix: z.string().optional(),
  s3_object_lock: z.boolean().optional().default(false)
});

export type AuditStorageConfig = z.infer<typeof storageConfigSchema>;

export function readAuditStorageConfig(env: NodeJS.ProcessEnv = process.env): AuditStorageConfig {
  const parsed = storageConfigSchema.parse({
    sink: env.AUDIT_SINK ?? "file",
    s3_bucket: env.AUDIT_S3_BUCKET,
    s3_region: env.AUDIT_S3_REGION,
    s3_prefix: env.AUDIT_S3_PREFIX,
    s3_object_lock: String(env.AUDIT_S3_OBJECT_LOCK ?? "false").toLowerCase() === "true"
  });
  if (parsed.sink === "s3") {
    if (!parsed.s3_bucket || !parsed.s3_region || !parsed.s3_prefix) {
      throw new Error("AUDIT_SINK=s3 requires AUDIT_S3_BUCKET, AUDIT_S3_REGION, and AUDIT_S3_PREFIX");
    }
    if (!parsed.s3_object_lock) {
      throw new Error("AUDIT_SINK=s3 requires AUDIT_S3_OBJECT_LOCK=true");
    }
  }
  return parsed;
}

export function collectAuditImmutableFiles(rootDir: string): string[] {
  const rels = [
    "ops/contracts/slo_contracts.json",
    "ops/contracts/slo_contracts.sig.json",
    "ops/keys/keyring.json"
  ];
  const files = rels
    .map((rel) => path.resolve(rootDir, rel))
    .filter((p) => fs.existsSync(p));
  const archiveDir = path.resolve(rootDir, "ops/audit/archive");
  const checkpointDir = path.resolve(rootDir, "ops/audit/checkpoints");
  for (const dir of [archiveDir, checkpointDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}
