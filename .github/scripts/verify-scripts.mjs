import fs from "node:fs";
import path from "node:path";

const REQUIRED = ["lint", "test", "typecheck"];
const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".pnpm-store", ".turbo", ".next"]);

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function* findPackages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(path.join(p, "package.json"))) {
        yield p;
      }
      yield* findPackages(p);
    }
  }
}

const failures = [];
for (const pkgDir of findPackages(ROOT)) {
  const pkg = readJSON(path.join(pkgDir, "package.json"));
  const scripts = pkg.scripts ?? {};
  for (const s of REQUIRED) {
    if (!scripts[s]) failures.push(`${pkg.name ?? pkgDir}: missing "${s}"`);
  }
}

if (failures.length) {
  console.error("Missing required scripts:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
