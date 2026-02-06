import { execSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

const commands = [
  "pnpm -C services/brandgraph prisma generate --schema prisma/schema.prisma",
  "pnpm -C services/artifact-registry prisma generate --schema prisma/schema.prisma"
];

for (const command of commands) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit", cwd: root });
}
