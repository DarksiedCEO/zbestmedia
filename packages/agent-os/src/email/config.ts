import { z } from "zod";

import type { EmailConnectionMode, EmailProvider } from "./types.js";

export const DEFAULT_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;
export const DEFAULT_GMAIL_ALLOWED_LABEL_IDS = ["INBOX", "UNREAD"] as const;

export const GmailProcessingModeSchema = z.enum(["poll", "watch"]);
export type GmailProcessingMode = z.infer<typeof GmailProcessingModeSchema>;

export const GmailOAuthConfigSchema = z.object({
  provider: z.literal("gmail"),
  clientId: z.string().min(1),
  clientSecretReference: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string().min(1)).min(1)
});
export type GmailOAuthConfig = z.infer<typeof GmailOAuthConfigSchema>;

export const EmailProcessingSafetyConfigSchema = z.object({
  draftOnlyMode: z.literal(true),
  processingEnabledDefault: z.boolean(),
  defaultBatchLimit: z.number().int().positive(),
  hardBatchLimit: z.number().int().positive(),
  allowedLabelIds: z.array(z.string().min(1)).min(1),
  processingMode: GmailProcessingModeSchema
});
export type EmailProcessingSafetyConfig = z.infer<typeof EmailProcessingSafetyConfigSchema>;

export const EmailIntegrationConfigSchema = z.object({
  provider: z.literal("gmail"),
  connectionMode: z.literal("draft_only"),
  enabled: z.boolean(),
  oauth: GmailOAuthConfigSchema.nullable(),
  processing: EmailProcessingSafetyConfigSchema
});
export type EmailIntegrationConfig = z.infer<typeof EmailIntegrationConfigSchema>;

function parseList(value: string | undefined, fallback: readonly string[]): string[] {
  if (!value || value.trim().length === 0) {
    return [...fallback];
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [...fallback];
}

export function loadEmailIntegrationConfig(
  raw: NodeJS.ProcessEnv = process.env,
  args?: { provider?: EmailProvider; connectionMode?: EmailConnectionMode }
): EmailIntegrationConfig {
  const provider = args?.provider ?? "gmail";
  const connectionMode = args?.connectionMode ?? "draft_only";

  const clientId = raw.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecretReference = raw.GMAIL_OAUTH_CLIENT_SECRET_REF?.trim();
  const redirectUri = raw.GMAIL_OAUTH_REDIRECT_URI?.trim();
  const scopes = parseList(raw.GMAIL_OAUTH_SCOPES, DEFAULT_GMAIL_SCOPES);

  const anyOauthConfigured = Boolean(clientId || clientSecretReference || redirectUri || raw.GMAIL_OAUTH_SCOPES);
  const allOauthConfigured = Boolean(clientId && clientSecretReference && redirectUri);

  if (anyOauthConfigured && !allOauthConfigured) {
    throw new Error(
      "incomplete_gmail_oauth_config:expected GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET_REF, GMAIL_OAUTH_REDIRECT_URI"
    );
  }

  return EmailIntegrationConfigSchema.parse({
    provider,
    connectionMode,
    enabled: raw.GMAIL_INTEGRATION_ENABLED === "true",
    oauth: allOauthConfigured
      ? {
          provider,
          clientId,
          clientSecretReference,
          redirectUri,
          scopes
        }
      : null,
    processing: {
      draftOnlyMode: true,
      processingEnabledDefault: raw.GMAIL_EMAIL_PROCESSING_ENABLED === "true",
      defaultBatchLimit: Number(raw.GMAIL_EMAIL_DEFAULT_BATCH_LIMIT ?? 10),
      hardBatchLimit: Number(raw.GMAIL_EMAIL_HARD_BATCH_LIMIT ?? 25),
      allowedLabelIds: parseList(raw.GMAIL_EMAIL_ALLOWED_LABEL_IDS, DEFAULT_GMAIL_ALLOWED_LABEL_IDS),
      processingMode: raw.GMAIL_EMAIL_PROCESSING_MODE === "watch" ? "watch" : "poll"
    }
  });
}

export function assertGmailOAuthConfigured(config: EmailIntegrationConfig): GmailOAuthConfig {
  if (!config.enabled) {
    throw new Error("gmail_integration_disabled");
  }
  if (!config.oauth) {
    throw new Error("gmail_oauth_not_configured");
  }
  return config.oauth;
}
