import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

const projects = [
  "services/brandgraph",
  "services/artifact-registry"
];

for (const project of projects) {
  const args = ["-C", project, "exec", "prisma", "generate", "--schema", "prisma/schema.prisma"];
  console.log(`> pnpm ${args.join(" ")}`);
  execFileSync("pnpm", args, { stdio: "inherit", cwd: root });
}
