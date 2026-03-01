import fs from "node:fs";
import path from "node:path";

export type FortressReportResult = {
  out_dir: string;
  generated_at: string;
  files: string[];
};

function latestFileOrNull(dir: string, suffix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort();
  return files.length > 0 ? path.join(dir, files[files.length - 1]!) : null;
}

function copyIfExists(rootDir: string, outDir: string, relPath: string, copied: string[]): void {
  const src = path.resolve(rootDir, relPath);
  if (!fs.existsSync(src)) return;
  const dst = path.resolve(outDir, relPath);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied.push(relPath);
}

export function buildFortressReport(args: {
  rootDir: string;
  outDir: string;
  targetId: string;
}): FortressReportResult {
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const copied: string[] = [];
  copyIfExists(args.rootDir, outDir, "ops/contracts/slo_contracts.json", copied);
  copyIfExists(args.rootDir, outDir, "ops/contracts/slo_contracts.sig.json", copied);
  copyIfExists(args.rootDir, outDir, "ops/keys/keyring.json", copied);
  copyIfExists(args.rootDir, outDir, "ops/slo/summary.md", copied);

  const readinessDir = path.resolve(args.rootDir, "ops/readiness");
  const drillDir = path.resolve(args.rootDir, "ops/drills");
  const latestReadiness = latestFileOrNull(readinessDir, "__readiness.json");
  const latestDrill = latestFileOrNull(drillDir, "drill.json");
  if (latestReadiness) {
    const rel = path.relative(args.rootDir, latestReadiness);
    copyIfExists(args.rootDir, outDir, rel, copied);
  }
  if (latestDrill) {
    const rel = path.relative(args.rootDir, latestDrill);
    copyIfExists(args.rootDir, outDir, rel, copied);
  }

  const checkpointsDir = path.resolve(args.rootDir, "ops/audit/checkpoints");
  const latestCheckpoint = latestFileOrNull(checkpointsDir, ".head.json");
  if (latestCheckpoint) {
    const rel = path.relative(args.rootDir, latestCheckpoint);
    copyIfExists(args.rootDir, outDir, rel, copied);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    target_id: args.targetId,
    files: copied.sort()
  };
  fs.writeFileSync(path.join(outDir, "fortress_report.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    out_dir: outDir,
    generated_at: manifest.generated_at,
    files: manifest.files
  };
}
