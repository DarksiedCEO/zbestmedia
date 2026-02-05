import { execSync } from "node:child_process";

export function ensureTestDbReady() {
  const isTest = process.env.NODE_ENV === "test" || process.env.BRANDGRAPH_DB === "test";
  if (!isTest) return;

  execSync("pnpm -C services/brandgraph db:push:test", { stdio: "inherit" });
}
