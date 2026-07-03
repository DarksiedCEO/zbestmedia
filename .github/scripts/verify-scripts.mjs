import fs from "node:fs";
import path from "node:path";

const REQUIRED = ["lint", "test", "typecheck"];
const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".pnpm-store", ".turbo", ".next"]);

// apps/marketing is a STALE reference copy of the public site (source of truth:
// github.com/DarksiedCEO/zbestmedia-ui). It is exempt from quality-script
// requirements because it must never be built or maintained from this repo.
const EXEMPT_PACKAGES = new Set(["marketing"]);

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
  if (EXEMPT_PACKAGES.has(pkg.name)) continue;
  const scripts = pkg.scripts ?? {};
  for (const s of REQUIRED) {
    if (!scripts[s]) failures.push(`${pkg.name ?? pkgDir}: missing "${s}"`);
  }
}

if (failures.length) {
  console.error("Missing required scripts:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
