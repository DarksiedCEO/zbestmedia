import { createHash } from "node:crypto";

import type { AaliyahDiagnosticsService } from "./diagnostics.js";
import type { AaliyahWorkspaceAuditEvent } from "./workspace-types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class AaliyahWorkspaceAuditService {
  constructor(private readonly diagnostics?: AaliyahDiagnosticsService) {}

  async record(event: AaliyahWorkspaceAuditEvent): Promise<void> {
    if (!this.diagnostics) {
      return;
    }

    await this.diagnostics.recordEvent({
      tenantId: event.tenantId,
      actorId: event.principalId,
      principalContext: "founder",
      activeMode: event.mode,
      eventType: this.mapEventType(event.eventType),
      eventSource: "aaliyah_workspace",
      signalKey: event.eventType,
      payload: event.metadata ?? {},
      createdAt: event.timestamp
    });
  }

  buildMetadata(args: {
    input: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      bodyText: string;
      threadId?: string;
      dryRun?: boolean;
    };
    resultCode?: string | null;
    accountId?: string | null;
  }): Record<string, unknown> {
    return {
      toCount: args.input.to.length,
      ccCount: args.input.cc?.length ?? 0,
      bccCount: args.input.bcc?.length ?? 0,
      threadPresent: Boolean(args.input.threadId),
      dryRun: Boolean(args.input.dryRun),
      subjectHash: sha256(args.input.subject),
      bodyTextLength: args.input.bodyText.length,
      accountId: args.accountId ?? null,
      resultCode: args.resultCode ?? null
    };
  }

  private mapEventType(eventType: AaliyahWorkspaceAuditEvent["eventType"]) {
    switch (eventType) {
      case "aaliyah.workspace.draft.requested":
        return "workspace_draft_requested" as const;
      case "aaliyah.workspace.draft.denied":
        return "workspace_draft_denied" as const;
      case "aaliyah.workspace.draft.created":
        return "workspace_draft_created" as const;
      case "aaliyah.workspace.draft.failed":
        return "workspace_draft_failed" as const;
    }
  }
}
