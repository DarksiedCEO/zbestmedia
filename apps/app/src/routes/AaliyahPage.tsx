import React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFetchClient,
  getAaliyahCommandSurface,
  getAaliyahReviewQueue,
  getAaliyahSessionSnapshot,
  resetAaliyahSession,
  resolveAppApiBaseUrl,
  readApiEnv,
  runAaliyahRuntime,
  type AaliyahCommandSurface,
  type AaliyahMode,
  type AaliyahQuickAction,
  type AaliyahReviewQueue,
  type AaliyahReviewQueueItem,
  type AaliyahRuntimeResponse,
  type AaliyahSessionSnapshot,
} from "@zbest/api-sdk";
import { MetricTile, tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";

function correlationId() {
  return crypto.randomUUID();
}

function shortId(value: string | null | undefined) {
  if (!value) return "None";
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function urgencyTone(urgency: string) {
  switch (urgency) {
    case "urgent":
      return "#FF6B6B";
    case "high":
      return "#FFC857";
    case "normal":
      return "#74C0FC";
    default:
      return tokens.colors.muted;
  }
}

function interruptionLabel(interruptionClass: string) {
  switch (interruptionClass) {
    case "interrupt_now":
      return "Interrupt now";
    case "same_day_briefing":
      return "Same-day briefing";
    case "passive_queue":
      return "Passive queue";
    default:
      return "Silent log";
  }
}

function extractReviewItemId(sourceItemId: string) {
  return sourceItemId.startsWith("review:") ? sourceItemId.slice("review:".length) : null;
}

function extractVoiceCallId(sourceItemId: string) {
  return sourceItemId.startsWith("voice:") ? sourceItemId.slice("voice:".length) : null;
}

export default function AaliyahPage() {
  const queryClient = useQueryClient();
  const fetchClient = React.useMemo(() => createFetchClient({ correlationId }), []);
  const envData = React.useMemo(() => {
    try {
      return {
        env: readApiEnv(import.meta.env as Record<string, unknown>),
        appApiBaseUrl: resolveAppApiBaseUrl(import.meta.env as Record<string, unknown>),
        error: null as string | null,
      };
    } catch (err) {
      return {
        env: null,
        appApiBaseUrl: null,
        error: (err as Error).message,
      };
    }
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["aaliyah", "session"],
    enabled: Boolean(envData.env && envData.appApiBaseUrl),
    queryFn: async () =>
      getAaliyahSessionSnapshot({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
      }),
    refetchInterval: 20_000,
  });

  const activeMode = sessionQuery.data?.session.activeModeState.activeMode ?? "founder";

  const [shellQuery, reviewQueueQuery] = useQueries({
    queries: [
      {
        queryKey: ["aaliyah", "command-surface", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahCommandSurface({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "review-queue", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahReviewQueue({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
          }),
        refetchInterval: 20_000,
      },
    ],
  });

  const [runtimeNotice, setRuntimeNotice] = React.useState<string | null>(null);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [lastRuntimeResult, setLastRuntimeResult] = React.useState<AaliyahRuntimeResponse["result"] | null>(null);

  const runtimeMutation = useMutation({
    mutationFn: async (input: { intent: string; parameters?: Record<string, unknown>; mode?: AaliyahMode }) =>
      runAaliyahRuntime({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        intent: input.intent,
        mode: input.mode,
        parameters: input.parameters,
      }),
    onSuccess: async (response) => {
      setLastRuntimeResult(response.result);
      if (response.result.outcomeType === "fallback") {
        setRuntimeError(response.result.fallback.reason);
        setRuntimeNotice(null);
      } else {
        setRuntimeError(null);
        setRuntimeNotice(`Completed ${response.result.resolvedIntent} in ${response.result.activeMode} mode.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["aaliyah"] }),
      ]);
    },
    onError: (error) => {
      setRuntimeNotice(null);
      setRuntimeError((error as Error).message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (scope: "soft" | "hard") =>
      resetAaliyahSession({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        scope,
      }),
    onSuccess: async (response) => {
      setLastRuntimeResult(null);
      setRuntimeError(null);
      setRuntimeNotice(`Session reset: ${response.reset.resetReason}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["aaliyah"] }),
      ]);
    },
    onError: (error) => {
      setRuntimeNotice(null);
      setRuntimeError((error as Error).message);
    },
  });

  const isLoading = sessionQuery.isLoading || shellQuery.isLoading || reviewQueueQuery.isLoading;
  const isError = Boolean(envData.error) || sessionQuery.isError || shellQuery.isError || reviewQueueQuery.isError;
  const errorMessage =
    envData.error ??
    (sessionQuery.error as Error | undefined)?.message ??
    (shellQuery.error as Error | undefined)?.message ??
    (reviewQueueQuery.error as Error | undefined)?.message ??
    null;

  const shell = shellQuery.data?.shell;
  const reviewQueue = reviewQueueQuery.data?.queue;
  const session = sessionQuery.data?.session;

  async function executeIntent(intent: string, parameters?: Record<string, unknown>, mode?: AaliyahMode) {
    await runtimeMutation.mutateAsync({ intent, parameters, mode });
  }

  async function executeQuickAction(action: AaliyahQuickAction) {
    if (action.availabilityStatus !== "available") {
      setRuntimeNotice(null);
      setRuntimeError(action.availabilityReason ?? "Quick action is not available.");
      return;
    }
    await executeIntent("execute_quick_action", { actionId: action.actionId });
  }

  async function handleQueueAction(item: AaliyahReviewQueueItem, action: string) {
    switch (action) {
      case "open_review_item":
        await executeIntent("get_founder_queue_item", { queueItemId: item.queueItemId });
        return;
      case "approve_review_item": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Review item context is missing.");
          return;
        }
        await executeIntent("approve_email_review_item", { reviewItemId });
        return;
      }
      case "reject_review_item": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Review item context is missing.");
          return;
        }
        const note = window.prompt("Optional rejection note", "Not moving forward with this draft right now.");
        if (note === null) {
          return;
        }
        await executeIntent("reject_email_review_item", { reviewItemId, note });
        return;
      }
      case "request_review_revision": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Review item context is missing.");
          return;
        }
        const note = window.prompt("Revision note", "Tighten the language and remove any unconfirmed commitments.");
        if (!note) {
          return;
        }
        await executeIntent("request_email_revision", { reviewItemId, note });
        return;
      }
      case "dispatch_approved_email": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Dispatch target is missing.");
          return;
        }
        await executeIntent("dispatch_approved_email", { reviewItemId });
        return;
      }
      case "open_voice_escalation": {
        const callId = extractVoiceCallId(item.sourceItemId);
        if (!callId) {
          setRuntimeError("Voice escalation target is missing.");
          return;
        }
        await executeIntent("get_voice_call_summary", { callId });
        return;
      }
      case "open_incident":
        await executeIntent("get_incident_summary");
        return;
      case "refresh_founder_briefing":
        await executeIntent("get_founder_briefing");
        return;
      default:
        setRuntimeError(`Unsupported founder action: ${action}`);
    }
  }

  return (
    <AppShell
      title="Aaliyah"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ModeButton active={activeMode === "founder"} onClick={() => executeIntent("switch_mode", { targetMode: "founder" })}>
            Founder
          </ModeButton>
          <ModeButton active={activeMode === "zbestmedia"} onClick={() => executeIntent("switch_mode", { targetMode: "zbestmedia" })}>
            Z Best Media
          </ModeButton>
          <button style={ghostButtonStyle} onClick={() => resetMutation.mutate("soft")} disabled={resetMutation.isPending}>
            Soft reset
          </button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingState />
      ) : isError || !shell || !reviewQueue || !session ? (
        <ErrorState message={errorMessage ?? "Failed to load Aaliyah founder console."} />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={heroStyle}>
            <div>
              <div style={{ fontSize: 12, color: tokens.colors.muted, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Founder operating console
              </div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 750, lineHeight: 1.1 }}>
                {shell.whatMattersNow[0]?.title ?? "Aaliyah is standing by."}
              </div>
              <div style={{ marginTop: 8, maxWidth: 720, color: tokens.colors.muted, fontSize: 14 }}>
                {shell.whatMattersNow[0]?.summary ?? "No interrupt-worthy founder item is active right now. Use the queue to review governed actions."}
              </div>
            </div>
            <div style={heroMetaStyle}>
              <StatusChip label={`Mode: ${shell.activeMode}`} tone="info" />
              <StatusChip
                label={`Ops: ${shell.opsStatusSummary.statusLevel}`}
                tone={shell.opsStatusSummary.statusLevel === "critical" ? "danger" : shell.opsStatusSummary.statusLevel === "warning" ? "warn" : "ok"}
              />
              <StatusChip label={`Session: ${shortId(session.sessionId)}`} tone="neutral" />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <MetricTile label="What Matters" value={`${shell.whatMattersNow.length}`} accent />
            <MetricTile label="Open Approvals" value={`${shell.openApprovals.totalPending}`} />
            <MetricTile label="Interrupt Now" value={`${shell.interruptQueueSummary.interruptNowCount}`} />
            <MetricTile label="Founder Queue" value={`${reviewQueue.totalFounderActionableItems}`} />
          </div>

          {runtimeNotice || runtimeError ? (
            <div
              style={{
                ...panelStyle,
                borderColor: runtimeError ? "#C92A2A" : tokens.colors.border,
                background: runtimeError ? "rgba(201,42,42,0.08)" : tokens.colors.surface,
              }}
            >
              <div style={{ fontWeight: 650 }}>{runtimeError ? "Action blocked" : "Runtime update"}</div>
              <div style={{ marginTop: 6, color: runtimeError ? "#FF8787" : tokens.colors.muted, fontSize: 13 }}>
                {runtimeError ?? runtimeNotice}
              </div>
              {lastRuntimeResult ? (
                <div style={{ marginTop: 8, fontSize: 12, color: tokens.colors.muted }}>
                  {lastRuntimeResult.outcomeType === "completed"
                    ? `Payload: ${lastRuntimeResult.payloadType}`
                    : `Fallback: ${lastRuntimeResult.fallback.outcome}`}
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <Section
                title="What Matters Now"
                subtitle="High-signal founder items ranked by interruption, urgency, and operational pressure."
              >
                <ItemList items={shell.whatMattersNow} emptyText="No founder-priority items are active." />
              </Section>

              <Section
                title="Unified Founder Queue"
                subtitle="One governed queue for approvals, dispatch-ready actions, escalations, and founder-relevant incidents."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {reviewQueue.items.length === 0 ? (
                    <EmptyState text="The founder queue is clear." />
                  ) : (
                    reviewQueue.items.map((item) => (
                      <QueueItemCard
                        key={item.queueItemId}
                        item={item}
                        busy={runtimeMutation.isPending}
                        onAction={(action) => void handleQueueAction(item, action)}
                      />
                    ))
                  )}
                </div>
              </Section>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Section title="Waiting on Me" subtitle="Items currently surfaced for direct founder attention.">
                <ItemList items={shell.waitingOnMe} emptyText="Nothing is waiting on you right now." compact />
              </Section>

              <Section title="Quick Actions" subtitle="Only governed actions with known runtime targets.">
                <div style={{ display: "grid", gap: 10 }}>
                  {shell.quickActions.map((action) => (
                    <button
                      key={action.actionId}
                      style={{
                        ...actionButtonStyle,
                        opacity: action.availabilityStatus === "available" ? 1 : 0.6,
                      }}
                      onClick={() => void executeQuickAction(action)}
                      disabled={runtimeMutation.isPending || action.availabilityStatus !== "available"}
                    >
                      <span>{action.label}</span>
                      <span style={{ fontSize: 12, color: tokens.colors.muted }}>
                        {action.availabilityStatus === "available" ? "Run" : action.availabilityReason ?? "Unavailable"}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Session Context" subtitle="Inspectable founder-safe continuity, bounded by reset and retention policy.">
                <SessionPanel session={session} onHardReset={() => resetMutation.mutate("hard")} pending={resetMutation.isPending} />
              </Section>

              <Section title="Interruption Control" subtitle="What should interrupt now, what can wait, and why.">
                <InterruptionPanel shell={shell} />
              </Section>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function QueueItemCard({
  item,
  busy,
  onAction,
}: {
  item: AaliyahReviewQueueItem;
  busy: boolean;
  onAction: (action: string) => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 650 }}>{item.title}</div>
            <Tag label={item.itemType.replaceAll("_", " ")} />
            <Tag label={interruptionLabel(item.interruptionClass)} tone="outline" />
          </div>
          <div style={{ marginTop: 6, color: tokens.colors.muted, fontSize: 13 }}>{item.summary}</div>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <span style={{ color: urgencyTone(item.urgency), fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{item.urgency}</span>
          <span style={{ color: tokens.colors.muted, fontSize: 12 }}>confidence {item.confidenceLevel}</span>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {item.allowedNextActions.map((action) => (
          <button key={action} style={chipButtonStyle} onClick={() => onAction(action)} disabled={busy}>
            {actionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}

function InterruptionPanel({ shell }: { shell: AaliyahCommandSurface }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <MetricMini label="Interrupt now" value={shell.interruptQueueSummary.interruptNowCount} />
        <MetricMini label="Same day" value={shell.interruptQueueSummary.sameDayBriefingCount} />
        <MetricMini label="Passive" value={shell.interruptQueueSummary.passiveQueueCount} />
        <MetricMini label="Suppressed" value={shell.interruptQueueSummary.silentLogCount} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {shell.interruptionQueue.items.slice(0, 4).map((item) => (
          <div key={`${item.sourceItemId}:${item.visibilityAction}`} style={compactPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: tokens.colors.muted }}>{interruptionLabel(item.visibilityAction)}</div>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{item.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionPanel({
  session,
  onHardReset,
  pending,
}: {
  session: AaliyahSessionSnapshot;
  onHardReset: () => void;
  pending: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <DataRow label="Active mode" value={session.activeModeState.activeMode} />
        <DataRow label="Previous mode" value={session.activeModeState.previousMode ?? "None"} />
        <DataRow label="Last intent" value={session.interactionState.lastResolvedIntent ?? session.interactionState.lastIntent ?? "None"} />
        <DataRow label="Working item" value={session.interactionState.currentWorkingItem?.title ?? "None"} />
        <DataRow label="Review context" value={session.interactionState.activeReviewContext?.reviewItemId ?? "None"} />
      </div>

      {session.interactionState.pendingDisambiguation ? (
        <div style={{ ...compactPanelStyle, borderColor: "#FAB005" }}>
          <div style={{ fontWeight: 650 }}>Pending disambiguation</div>
          <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
            {session.interactionState.pendingDisambiguation.reason}
          </div>
        </div>
      ) : null}

      {session.interactionState.currentWorkingItem ? (
        <div style={compactPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 650 }}>{session.interactionState.currentWorkingItem.title}</div>
            <div style={{ fontSize: 12, color: tokens.colors.muted }}>
              {session.interactionState.currentWorkingItem.closureState}
            </div>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
            {session.interactionState.currentWorkingItem.summary}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={ghostButtonStyle} onClick={onHardReset} disabled={pending}>
          Hard reset
        </button>
        <div style={{ alignSelf: "center", fontSize: 12, color: tokens.colors.muted }}>
          Expires {new Date(session.expiresAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function ItemList({
  items,
  emptyText,
  compact,
}: {
  items: AaliyahCommandSurface["whatMattersNow"];
  emptyText: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.slice(0, compact ? 4 : 6).map((item) => (
        <div key={item.itemId} style={compact ? compactPanelStyle : panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 650 }}>{item.title}</div>
              <div style={{ marginTop: 5, fontSize: 13, color: tokens.colors.muted }}>{item.summary}</div>
            </div>
            <span style={{ color: urgencyTone(item.urgency), fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{item.urgency}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: tokens.colors.muted }}>{item.recommendedAction}</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 4, color: tokens.colors.muted, fontSize: 13 }}>{subtitle}</div>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
      <span style={{ color: tokens.colors.muted }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }) {
  const background =
    tone === "ok" ? "rgba(64,192,87,0.14)" :
      tone === "warn" ? "rgba(255,200,87,0.16)" :
        tone === "danger" ? "rgba(255,107,107,0.16)" :
          tone === "info" ? "rgba(116,192,252,0.18)" :
            "rgba(255,255,255,0.05)";
  const color =
    tone === "ok" ? "#8CE99A" :
      tone === "warn" ? "#FFD43B" :
        tone === "danger" ? "#FFA8A8" :
          tone === "info" ? "#A5D8FF" :
            tokens.colors.text;
  return (
    <div style={{ padding: "8px 10px", borderRadius: 999, background, color, fontSize: 12, fontWeight: 700 }}>
      {label}
    </div>
  );
}

function Tag({ label, tone = "filled" }: { label: string; tone?: "filled" | "outline" }) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        border: `1px solid ${tokens.colors.border}`,
        background: tone === "filled" ? tokens.colors.panel : "transparent",
        color: tokens.colors.muted,
      }}
    >
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ color: tokens.colors.muted, fontSize: 13 }}>{text}</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ ...panelStyle, borderColor: "#C92A2A" }}>
      <div style={{ fontWeight: 650 }}>Failed to load Aaliyah</div>
      <div style={{ marginTop: 6, color: "#FF8787", fontSize: 13 }}>{message}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={heroStyle}>
        <div>
          <div style={{ fontSize: 12, color: tokens.colors.muted, textTransform: "uppercase" }}>Founder operating console</div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 750 }}>Loading Aaliyah...</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <MetricTile label="What Matters" value="..." accent />
        <MetricTile label="Open Approvals" value="..." />
        <MetricTile label="Interrupt Now" value="..." />
        <MetricTile label="Founder Queue" value="..." />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      style={{
        borderRadius: 999,
        border: `1px solid ${active ? tokens.colors.gold : tokens.colors.border}`,
        background: active ? "rgba(230,193,90,0.18)" : tokens.colors.surface,
        color: tokens.colors.text,
        padding: "10px 12px",
        cursor: "pointer",
        fontWeight: 650,
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MetricMini({ label, value }: { label: string; value: number }) {
  return (
    <div style={compactPanelStyle}>
      <div style={{ fontSize: 12, color: tokens.colors.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 750, fontSize: 22 }}>{value}</div>
    </div>
  );
}

function actionLabel(action: string) {
  switch (action) {
    case "open_review_item":
      return "Focus item";
    case "approve_review_item":
      return "Approve";
    case "reject_review_item":
      return "Reject";
    case "request_review_revision":
      return "Request revision";
    case "dispatch_approved_email":
      return "Dispatch";
    case "open_voice_escalation":
      return "Open voice";
    case "open_incident":
      return "Open incident";
    case "refresh_founder_briefing":
      return "Refresh briefing";
    default:
      return action;
  }
}

const heroStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 22,
  background: "linear-gradient(135deg, rgba(230,193,90,0.14), rgba(18,18,24,0.94))",
  padding: 20,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const heroMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const panelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 18,
  background: tokens.colors.surface,
  padding: 16,
};

const compactPanelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  background: tokens.colors.panel,
  padding: 12,
};

const ghostButtonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
};

const chipButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.panel,
  color: tokens.colors.text,
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 650,
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.panel,
  color: tokens.colors.text,
  padding: "12px 14px",
  cursor: "pointer",
  fontWeight: 650,
};
