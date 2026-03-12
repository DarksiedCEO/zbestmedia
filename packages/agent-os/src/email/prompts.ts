import { readFileSync } from "node:fs";
import path from "node:path";

export type AaliyahPromptMode = "receptionist" | "executive_assistant" | "email_drafting";

export type AaliyahPromptAssembly = {
  mode: AaliyahPromptMode;
  systemPrompt: string;
  sourceFiles: string[];
};

const MODULE_FILES = {
  base_identity: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/base_identity.md"),
  receptionist_mode: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/receptionist_mode.md"),
  executive_assistant_mode: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/executive_assistant_mode.md"),
  escalation_rules: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/escalation_rules.md"),
  email_style_mimic: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/email_style_mimic.md"),
  company_workflows: path.resolve(process.cwd(), "intelligence/prompts/aaliyah/company_workflows.md")
};

const MODE_MODULES: Record<AaliyahPromptMode, Array<keyof typeof MODULE_FILES>> = {
  receptionist: ["base_identity", "receptionist_mode", "escalation_rules", "company_workflows"],
  executive_assistant: ["base_identity", "executive_assistant_mode", "escalation_rules", "company_workflows"],
  email_drafting: [
    "base_identity",
    "executive_assistant_mode",
    "escalation_rules",
    "email_style_mimic",
    "company_workflows"
  ]
};

export function assembleAaliyahPrompt(mode: AaliyahPromptMode): AaliyahPromptAssembly {
  const sourceFiles = MODE_MODULES[mode].map((key) => MODULE_FILES[key]);
  const systemPrompt = sourceFiles.map((filePath) => readFileSync(filePath, "utf8").trim()).join("\n\n---\n\n");

  return {
    mode,
    systemPrompt,
    sourceFiles
  };
}
