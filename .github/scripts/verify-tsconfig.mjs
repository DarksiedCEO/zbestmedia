import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SERVICES_DIR = path.join(ROOT, "services");

if (!fs.existsSync(SERVICES_DIR)) {
  process.exit(0);
}

const failures = [];
for (const entry of fs.readdirSync(SERVICES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const tsconfigPath = path.join(SERVICES_DIR, entry.name, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) continue;
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const compilerOptions = tsconfig.compilerOptions ?? {};
  const rootDirs = compilerOptions.rootDirs;
  if (!Array.isArray(rootDirs) || rootDirs.length === 0) {
    failures.push(`${entry.name}: missing compilerOptions.rootDirs`);
  }
  if (compilerOptions.rootDir && compilerOptions.rootDir === "src") {
    failures.push(`${entry.name}: compilerOptions.rootDir must not be 'src'`);
  }
}

if (failures.length) {
  console.error("TS workspace boundary check failed:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
