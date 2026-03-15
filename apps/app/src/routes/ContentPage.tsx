import React from "react";
import { createFetchClient, readApiEnv, resolveAppApiBaseUrl, scoreContentDraft } from "@zbest/api-sdk";
import { tokens } from "@zbest/ui";
import type { ScheduleItem } from "../scheduler/types";
import { loadSchedule, saveSchedule, upsertItem } from "../scheduler/store";
import { AppShell } from "../ui/AppShell";
import { ConfirmActionModal } from "../ui/ConfirmActionModal";
import { useRuntime } from "../state/runtime";
import type { Draft } from "../content/types";
import { loadDrafts, saveDrafts, setActive, upsertDraft } from "../content/store";

const PLATFORMS: ScheduleItem["platform"][] = ["x", "linkedin", "instagram", "facebook", "tiktok", "youtube"];

function nowIso() {
  return new Date().toISOString();
}
function newId() {
  return crypto.randomUUID();
}
function correlationId() {
  return crypto.randomUUID();
}

export default function ContentPage() {
  const { target: targetId } = useRuntime();
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

  const [state, setState] = React.useState(() => loadDrafts(targetId));
  React.useEffect(() => setState(loadDrafts(targetId)), [targetId]);

  const [activePlatform, setActivePlatform] = React.useState<ScheduleItem["platform"]>("x");
  const [confirm, setConfirm] = React.useState<null | {
    title: string;
    desc: string;
    confirmText: string;
    danger?: boolean;
    action: (reason: string) => void;
  }>(null);
  const [score, setScore] = React.useState<unknown>(null);
  const [scoreErr, setScoreErr] = React.useState<string | null>(null);
  const [scoring, setScoring] = React.useState(false);

  function persist(next: typeof state, meta: Record<string, unknown>) {
    setState(next);
    saveDrafts(targetId, next);
    console.info("[content]", { targetId, ...meta });
  }

  function ensureActiveDraft(): Draft {
    const current = state.activeId ? state.drafts.find((draft) => draft.id === state.activeId) : state.drafts[0];
    if (current) {
      return current;
    }
    const ts = nowIso();
    const draft: Draft = {
      id: newId(),
      title: "New Draft",
      baseBody: "",
      variants: {},
      createdAtIso: ts,
      updatedAtIso: ts,
    };
    const next = upsertDraft(state, draft);
    persist({ ...next, activeId: draft.id }, { event: "create_draft_auto", id: draft.id });
    return draft;
  }

  const activeDraft = ensureActiveDraft();
  const variantBody = activeDraft.variants?.[activePlatform] ?? "";

  function updateDraft(patch: Partial<Draft>) {
    const nextDraft: Draft = { ...activeDraft, ...patch, updatedAtIso: nowIso() };
    const next = upsertDraft(state, nextDraft);
    persist({ ...next, activeId: nextDraft.id }, { event: "update_draft", id: nextDraft.id });
  }

  async function scoreVariant() {
    setScore(null);
    setScoreErr(null);
    setScoring(true);
    try {
      if (!envData.env || !envData.appApiBaseUrl) {
        throw new Error(envData.error ?? "App API environment is not configured.");
      }

      const body = (variantBody || activeDraft.baseBody || "").trim();
      if (!body) {
        throw new Error("Draft body is empty.");
      }

      const res = await scoreContentDraft({
        baseUrl: envData.appApiBaseUrl,
        bearer: envData.env.VITE_POLICY_BEARER,
        fetchClient,
        targetId,
        platform: activePlatform,
        body,
      });
      setScore(res);
    } catch (err) {
      setScoreErr((err as Error).message);
    } finally {
      setScoring(false);
    }
  }

  function queueToScheduler(reason: string) {
    const schedule = loadSchedule(targetId);
    const ts = nowIso();
    const body = (variantBody || activeDraft.baseBody || "").trim();
    const item: ScheduleItem = {
      id: newId(),
      title: `${activeDraft.title}: ${body.slice(0, 40)}`,
      platform: activePlatform,
      scheduledAtIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: "pending_approval",
      approvalRequired: true,
      publishWindow: "09:00-17:00",
      tags: ["content-studio"],
      notes: `fromDraft=${activeDraft.id}; reason=${reason}`,
      createdAtIso: ts,
      updatedAtIso: ts,
    };

    const next = upsertItem(schedule, item);
    saveSchedule(targetId, next);
    console.info("[content->scheduler]", { targetId, reason, draftId: activeDraft.id, itemId: item.id });
  }

  return (
    <AppShell title="Content Studio">
      <div style={{ display: "grid", gap: 12, maxWidth: 1100 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={activeDraft.id}
            onChange={(e) => {
              const id = e.target.value;
              persist(setActive(state, id), { event: "set_active", id });
            }}
            style={selectStyle}
          >
            {state.drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              const ts = nowIso();
              const draft: Draft = { id: newId(), title: "New Draft", baseBody: "", variants: {}, createdAtIso: ts, updatedAtIso: ts };
              const next = upsertDraft(state, draft);
              persist({ ...next, activeId: draft.id }, { event: "create_draft", id: draft.id });
            }}
            style={goldButtonStyle}
          >
            + New Draft
          </button>

          <div style={{ marginLeft: "auto" }}>
            <select value={activePlatform} onChange={(e) => setActivePlatform(e.target.value as ScheduleItem["platform"])} style={selectStyle}>
              {PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={panelStyle}>
          <label style={labelStyle}>Title</label>
          <input value={activeDraft.title} onChange={(e) => updateDraft({ title: e.target.value })} style={fieldStyle} />

          <label style={{ ...labelStyle, marginTop: 12 }}>Base Draft (shared source)</label>
          <textarea
            value={activeDraft.baseBody}
            onChange={(e) => updateDraft({ baseBody: e.target.value })}
            style={{ ...fieldStyle, minHeight: 110 }}
          />
        </div>

        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 650 }}>Variant: {activePlatform.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: tokens.colors.muted }}>
                Platform-specific copy. If empty, base draft is used for scoring and queueing.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={scoreVariant} style={buttonStyle}>
                {scoring ? "Scoring..." : "Score Variant"}
              </button>
              <button
                onClick={() =>
                  setConfirm({
                    title: "Queue to Scheduler",
                    desc: "This creates a scheduler item in pending approval. A reason is required.",
                    confirmText: "Confirm queue",
                    action: (reason) => queueToScheduler(reason),
                  })
                }
                style={goldButtonStyle}
              >
                Add to Scheduler
              </button>
            </div>
          </div>

          <textarea
            value={variantBody}
            onChange={(e) => updateDraft({ variants: { ...activeDraft.variants, [activePlatform]: e.target.value } })}
            style={{ ...fieldStyle, minHeight: 140, marginTop: 12 }}
          />

          <div style={{ marginTop: 12, borderTop: `1px solid ${tokens.colors.border}`, paddingTop: 12 }}>
            <div style={{ fontWeight: 650 }}>Score</div>
            {envData.error ? <div style={{ marginTop: 6, color: "#E03131", fontSize: 13 }}>{envData.error}</div> : null}
            {scoreErr ? <div style={{ marginTop: 6, color: "#E03131", fontSize: 13 }}>{scoreErr}</div> : null}
            {score ? (
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {"score" in (score as Record<string, unknown>) ? (
                    <span
                      style={{
                        border: `1px solid ${tokens.colors.border}`,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        color: getScoreColor(Number((score as { score: number }).score)),
                        fontWeight: 700,
                      }}
                    >
                      Score {(score as { score: number }).score}
                    </span>
                  ) : null}
                  {"tone" in (score as Record<string, unknown>) ? (
                    <span style={chipStyle}>Tone {(score as { tone: string }).tone}</span>
                  ) : null}
                  {"risk" in (score as Record<string, unknown>) ? (
                    <span style={chipStyle}>Risk {(score as { risk: string }).risk}</span>
                  ) : null}
                  {"readiness" in (score as Record<string, unknown>) ? (
                    <span style={chipStyle}>Readiness {(score as { readiness: string }).readiness}</span>
                  ) : null}
                </div>
                <pre style={{ background: tokens.colors.surface, border: `1px solid ${tokens.colors.border}`, borderRadius: 14, padding: 12, overflow: "auto" }}>
                  {JSON.stringify(score, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ marginTop: 6, color: tokens.colors.muted, fontSize: 13 }}>Score results will appear here.</div>
            )}
          </div>
        </div>
      </div>

      <ConfirmActionModal
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.desc ?? ""}
        confirmText={confirm?.confirmText ?? "Confirm"}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={(reason) => {
          const action = confirm?.action;
          setConfirm(null);
          action?.(reason);
        }}
      />
    </AppShell>
  );
}

const panelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  background: tokens.colors.panel,
  padding: 14,
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: tokens.colors.muted };
const fieldStyle: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
};
const selectStyle: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  cursor: "pointer",
  minWidth: 220,
};
const buttonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
};
const goldButtonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.gold,
  color: tokens.colors.bg,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
};
const chipStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  color: tokens.colors.text,
};

function getScoreColor(score: number) {
  if (score >= 90) return tokens.colors.gold;
  if (score >= 75) return tokens.colors.text;
  return tokens.colors.muted;
}
