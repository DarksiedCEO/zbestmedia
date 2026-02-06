import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

type Check = {
  name: string;
  ok: boolean;
  details?: string;
  fix?: string;
};

const checks: Check[] = [];

function add(check: Check) {
  checks.push(check);
}

function run(command: string): string {
  return execSync(command, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

// Node version
const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split(".")[0]);
add({
  name: "node",
  ok: nodeMajor >= 20,
  details: nodeVersion,
  fix: nodeMajor >= 20 ? undefined : "Install Node >= 20"
});

// pnpm version
try {
  const pnpmVersion = run("pnpm -v");
  add({ name: "pnpm", ok: true, details: pnpmVersion });
} catch (err) {
  add({ name: "pnpm", ok: false, details: "not found", fix: "Install pnpm" });
}

// eslint version (pinned to v8)
try {
  // eslint is installed at repo root
  const eslintPkg = require(resolve(root, "node_modules", "eslint", "package.json"));
  const eslintVersion = String(eslintPkg.version);
  add({
    name: "eslint",
    ok: eslintVersion.startsWith("8."),
    details: eslintVersion,
    fix: eslintVersion.startsWith("8.") ? undefined : "pnpm add -D eslint@8.57.1"
  });
} catch (err) {
  add({ name: "eslint", ok: false, details: "missing", fix: "pnpm install" });
}

// Prisma client existence
const prismaBrandgraph = resolve(root, "services", "brandgraph", "src", "generated", "prisma", "index.js");
add({
  name: "prisma:brandgraph",
  ok: existsSync(prismaBrandgraph),
  details: existsSync(prismaBrandgraph) ? "generated" : "missing",
  fix: existsSync(prismaBrandgraph)
    ? undefined
    : "pnpm -C services/brandgraph prisma generate --schema prisma/schema.prisma"
});

const prismaArtifact = resolve(root, "services", "artifact-registry", "src", "generated", "prisma", "index.js");
add({
  name: "prisma:artifact-registry",
  ok: existsSync(prismaArtifact),
  details: existsSync(prismaArtifact) ? "generated" : "missing",
  fix: existsSync(prismaArtifact)
    ? undefined
    : "pnpm -C services/artifact-registry prisma generate --schema prisma/schema.prisma"
});

// Report
const failed = checks.filter((c) => !c.ok);
for (const check of checks) {
  const status = check.ok ? "OK" : "FAIL";
  const details = check.details ? ` (${check.details})` : "";
  console.log(`${status}  ${check.name}${details}`);
  if (!check.ok && check.fix) {
    console.log(`  fix: ${check.fix}`);
  }
}

if (failed.length > 0) {
  process.exit(1);
}
