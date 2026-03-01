import fs from "node:fs";
import path from "node:path";

import type { LoadRunTriage } from "../../packages/policy-sdk/src/loadrun/triage";
import { sendEmailAlert } from "../../packages/policy-sdk/src/loadrun/alerting/email";
import { sendSlackAlert } from "../../packages/policy-sdk/src/loadrun/alerting/slack";

type CliArgs = {
  triage: string;
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

  const triage = args.get("triage");
  if (!triage) {
    throw new Error("Usage: pnpm ops:loadrun:alert --triage <triage.json>");
  }
  return { triage };
}

function renderSummary(triage: LoadRunTriage, triagePath: string): string {
  let incidentSeverity = "UNKNOWN";
  let freezeRecommended = false;
  let incidentPath = "";
  const incidentsDir = path.resolve(process.cwd(), "ops/incidents");
  if (fs.existsSync(incidentsDir)) {
    const latest = fs
      .readdirSync(incidentsDir)
      .filter((name) => name.endsWith("__incident.json"))
      .sort()
      .slice(-1)[0];
    if (latest) {
      incidentPath = path.join(incidentsDir, latest);
      const incident = JSON.parse(fs.readFileSync(incidentPath, "utf8")) as { severity?: string };
      incidentSeverity = incident.severity ?? "UNKNOWN";
      freezeRecommended = incidentSeverity === "CRITICAL";
    }
  }

  return [
    `policy drift verdict=FAIL`,
    `severity=${incidentSeverity}`,
    `FREEZE_RECOMMENDED=${freezeRecommended}`,
    `top_offender=${triage.top_offender}`,
    `tags=${triage.tags.join(",") || "none"}`,
    `p95_ratio=${triage.deltas.p95_ratio}`,
    `p99_ratio=${triage.deltas.p99_ratio}`,
    `fail_rate_increase_pp=${triage.deltas.fail_rate_increase_pct_points}`,
    `breaker_open_increase_pp=${triage.deltas.breaker_open_increase_pct_points}`,
    `retry_amp_increase=${triage.deltas.retry_amplification_increase}`,
    `recommended_actions=${triage.recommended_actions.join(" | ")}`,
    `triage_path=${triagePath}`,
    `incident_path=${incidentPath || "none"}`
  ].join("\n");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  const triagePath = path.resolve(process.cwd(), cli.triage);
  const triage = JSON.parse(fs.readFileSync(triagePath, "utf8")) as LoadRunTriage;

  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  const emailWebhook = process.env.LOADRUN_EMAIL_WEBHOOK_URL;
  const emailTo = process.env.LOADRUN_ALERT_EMAIL_TO;

  if (!slackWebhook && !emailWebhook) {
    throw new Error("Alert misconfiguration: set SLACK_WEBHOOK_URL or LOADRUN_EMAIL_WEBHOOK_URL");
  }

  const summary = renderSummary(triage, triagePath);
  const outcomes: string[] = [];

  if (slackWebhook) {
    await sendSlackAlert({ webhookUrl: slackWebhook, text: summary });
    outcomes.push("slack:sent");
  }

  if (emailWebhook) {
    if (!emailTo) {
      throw new Error("Alert misconfiguration: LOADRUN_ALERT_EMAIL_TO required when LOADRUN_EMAIL_WEBHOOK_URL is set");
    }
    await sendEmailAlert({
      webhookUrl: emailWebhook,
      to: emailTo,
      subject: "Policy prod drift detected",
      body: summary
    });
    outcomes.push("email:sent");
  }

  console.log(JSON.stringify({ ok: true, triage: triagePath, outcomes }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
