import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { collectAuditImmutableFiles, readAuditStorageConfig } from "../../packages/policy-sdk/src/audit/storage";

function main(): void {
  const cfg = readAuditStorageConfig(process.env);
  const files = collectAuditImmutableFiles(process.cwd());
  if (cfg.sink === "file") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          sink: "file",
          files: files.map((f) => path.relative(process.cwd(), f))
        },
        null,
        2
      )
    );
    return;
  }

  const prefix = cfg.s3_prefix!.replace(/\/+$/, "");
  const dryRun = String(process.env.AUDIT_S3_DRY_RUN ?? "true").toLowerCase() === "true";
  const uploads: string[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    const s3Path = `s3://${cfg.s3_bucket}/${prefix}/${rel}`;
    uploads.push(s3Path);
    if (!dryRun) {
      const proc = spawnSync("aws", ["s3", "cp", file, s3Path, "--region", cfg.s3_region!], {
        stdio: "inherit"
      });
      if (proc.status !== 0) {
        throw new Error(`aws upload failed for ${rel}`);
      }
    }
  }
  const outPath = path.resolve(process.cwd(), "ops/audit/immutable_upload_manifest.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        sink: "s3",
        dry_run: dryRun,
        files: uploads
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(JSON.stringify({ ok: true, sink: "s3", dry_run: dryRun, manifest: path.relative(process.cwd(), outPath) }, null, 2));
}

main();
