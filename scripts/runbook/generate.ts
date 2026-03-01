import fs from "node:fs";
import path from "node:path";

import { generateFortressRunbook } from "../../packages/policy-sdk/src/ops/runbook";

function parseOut(argv: string[]): string {
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --out");
      return value;
    }
  }
  return "ops/runbooks/fortress.md";
}

function main(): void {
  const outRel = parseOut(process.argv);
  const out = path.resolve(process.cwd(), outRel);
  const md = generateFortressRunbook({ rootDir: process.cwd() });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${md}\n`, "utf8");
  console.log(JSON.stringify({ out }, null, 2));
}

main();
