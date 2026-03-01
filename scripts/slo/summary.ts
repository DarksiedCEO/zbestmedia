import fs from "node:fs";
import path from "node:path";

import { buildSloSummary, readEventsFromJsonl, renderSloSummaryMarkdown } from "../../packages/policy-sdk/src/slo/summary";

type CliArgs = {
  events: string;
  last: number;
  out: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    i += 1;
  }

  return {
    events: args.get("events") ?? "ops/slo/loadrun_events.jsonl",
    last: Number(args.get("last") ?? "30"),
    out: args.get("out") ?? "ops/slo/summary.md"
  };
}

function main(): void {
  const cli = parseArgs(process.argv);
  const eventsPath = path.resolve(process.cwd(), cli.events);
  const outPath = path.resolve(process.cwd(), cli.out);

  const events = readEventsFromJsonl(eventsPath);
  const summary = buildSloSummary(events, cli.last);
  const markdown = `${renderSloSummaryMarkdown(summary)}\n`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, "utf8");

  console.log(JSON.stringify({ events: eventsPath, out: outPath, total_runs: summary.total_runs }, null, 2));
}

main();
