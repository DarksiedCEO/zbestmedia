import fs from "node:fs";
import path from "node:path";

import { defaultsToEnvBlock, writeRuntimeDefaults } from "./defaults";
import { assertGovernanceMutableOperationAllowed } from "./governanceControls";
import type { RuntimeDefaults } from "./defaults";
import type { DefaultsProposal } from "./propose";

export type ApplyDefaultsResult = {
  changed: boolean;
  defaultsPath: string;
  rollbackPath: string;
  envBlock: string;
};

function timestampSlug(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export function applyDefaultsFromProposal(args: {
  proposal: DefaultsProposal;
  defaultsPath: string;
  rollbackDir: string;
  approved: boolean;
  reason: string | undefined;
}): ApplyDefaultsResult {
  assertGovernanceMutableOperationAllowed({ operation: "apply-defaults" });
  if (!args.approved) {
    throw new Error("Approval required: pass --approve");
  }
  if (!args.reason || args.reason.trim().length < 3) {
    throw new Error("Approval reason required: pass --reason \"...\"");
  }
  if (!args.proposal.guardrails.passed) {
    const reasons = args.proposal.guardrails.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.details}`);
    throw new Error(`Guardrails failed: ${reasons.join("; ")}`);
  }

  const rollbackStamp = timestampSlug(new Date());
  const rollbackPath = path.join(args.rollbackDir, `${rollbackStamp}__rollback.env`);
  fs.mkdirSync(args.rollbackDir, { recursive: true });

  const rollbackBlock = [
    `# rollback generated_from=${args.proposal.report_file}`,
    `# reason=${args.reason}`,
    defaultsToEnvBlock(args.proposal.current as RuntimeDefaults)
  ].join("\n");
  fs.writeFileSync(rollbackPath, `${rollbackBlock}\n`, "utf8");

  if (args.proposal.no_change) {
    return {
      changed: false,
      defaultsPath: args.defaultsPath,
      rollbackPath,
      envBlock: defaultsToEnvBlock(args.proposal.current as RuntimeDefaults)
    };
  }

  writeRuntimeDefaults(args.defaultsPath, args.proposal.proposed as RuntimeDefaults);
  return {
    changed: true,
    defaultsPath: args.defaultsPath,
    rollbackPath,
    envBlock: defaultsToEnvBlock(args.proposal.proposed as RuntimeDefaults)
  };
}
