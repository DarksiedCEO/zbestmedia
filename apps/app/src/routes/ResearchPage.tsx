import React from "react";
import { createFetchClient, getDossierExportStatus, readApiEnv, resolveAppApiBaseUrl, startDossierExport } from "@zbest/api-sdk";
import { z } from "zod";
import { tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";
import { ConfirmActionModal } from "../ui/ConfirmActionModal";
import { useRuntime } from "../state/runtime";
import { loadJson, makeKey, saveJson } from "../state/storage";
import { loadResearch, saveResearch, upsertEvidence, upsertFinding, upsertTimeline } from "../research/store";
import type { EvidenceItem, Finding, TimelineEvent } from "../research/types";

const ExportHistorySchema = z.array(
  z.object({
    job_id: z.string(),
    target_id: z.string(),
    status: z.enum(["queued", "running", "complete", "failed"]),
    artifact_url: z.string().url().optional(),
    requested_at: z.string(),
  }),
);
type ExportHistoryItem = z.infer<typeof ExportHistorySchema>[number];

function nowIso() {
  return new Date().toISOString();
}
function newId() {
  return crypto.randomUUID();
}
function correlationId() {
  return crypto.randomUUID();
}

export default function ResearchPage() {
  const { target: targetId } = useRuntime();
  const [workspace, setWorkspace] = React.useState(() => loadResearch(targetId));
  const [history, setHistory] = React.useState<ExportHistoryItem[]>([]);
  const [confirm, setConfirm] = React.useState<null | { title: string; desc: string; confirmText: string; action: (reason: string) => void }>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [jobStatus, setJobStatus] = React.useState<string>("idle");
  const [artifactUrl, setArtifactUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    setWorkspace(loadResearch(targetId));
    setHistory(loadJson(makeKey(targetId, "research-exports"), ExportHistorySchema, []));
    setJobId(null);
    setArtifactUrl(null);
    setJobStatus("idle");
  }, [targetId]);

  React.useEffect(() => {
    if (!jobId || !envData.env || !envData.appApiBaseUrl) {
      return;
    }
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const status = await getDossierExportStatus({
          baseUrl: envData.appApiBaseUrl!,
          bearer: envData.env!.VITE_POLICY_BEARER,
          fetchClient,
          jobId,
        });
        if (!alive) {
          return;
        }
        setJobStatus(status.status);
        setHistory((prev) => {
          const next = prev.map((item) =>
            item.job_id === status.job_id
              ? { ...item, status: status.status, artifact_url: status.artifact_url ?? item.artifact_url }
              : item,
          );
          saveJson(makeKey(targetId, "research-exports"), next);
          return next;
        });
        if (status.status === "complete" && status.artifact_url) {
          setArtifactUrl(status.artifact_url);
          clearInterval(timer);
        }
        if (status.status === "failed") {
          setError(status.error ?? "Export failed.");
          clearInterval(timer);
        }
      } catch (err) {
        if (!alive) {
          return;
        }
        setError((err as Error).message);
        clearInterval(timer);
      }
    }, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, envData, fetchClient, targetId]);

  function persistWorkspace(next: typeof workspace, meta: Record<string, unknown>) {
    setWorkspace(next);
    saveResearch(targetId, next);
    console.info("[research]", { targetId, ...meta });
  }

  function addEvidence() {
    const ts = nowIso();
    const evidence: EvidenceItem = {
      id: newId(),
      title: "New Evidence",
      url: null,
      quote: null,
      notes: null,
      tags: [],
      createdAtIso: ts,
      updatedAtIso: ts,
    };
    persistWorkspace(upsertEvidence(workspace, evidence), { event: "add_evidence", id: evidence.id });
  }

  function addTimelineEvent() {
    const ts = nowIso();
    const event: TimelineEvent = {
      id: newId(),
      dateIso: ts,
      title: "New Event",
      summary: "",
      linkedEvidenceIds: [],
      createdAtIso: ts,
      updatedAtIso: ts,
    };
    persistWorkspace(upsertTimeline(workspace, event), { event: "add_timeline", id: event.id });
  }

  function addFinding() {
    const ts = nowIso();
    const finding: Finding = {
      id: newId(),
      severity: "medium",
      text: "New finding",
      linkedEvidenceIds: [],
      createdAtIso: ts,
      updatedAtIso: ts,
    };
    persistWorkspace(upsertFinding(workspace, finding), { event: "add_finding", id: finding.id });
  }

  function startExport(reason: string) {
    setError(null);
    setArtifactUrl(null);
    setJobStatus("queued");
    (async () => {
      try {
        if (!envData.env || !envData.appApiBaseUrl) {
          throw new Error(envData.error ?? "App API environment is not configured.");
        }
        const start = await startDossierExport({
          baseUrl: envData.appApiBaseUrl,
          bearer: envData.env.VITE_POLICY_BEARER,
          fetchClient,
          targetId,
          reason,
        });
        setJobId(start.job_id);
        setJobStatus(start.status);
        setHistory((prev) => {
          const next = [{ job_id: start.job_id, target_id: targetId, status: start.status, requested_at: nowIso() }, ...prev];
          saveJson(makeKey(targetId, "research-exports"), next);
          return next;
        });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }

  return (
    <AppShell title="Research">
      <div style={{ display: "grid", gap: 12, maxWidth: 1200 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <Section title="Evidence" subtitle="Sources, quotes, and tags.">
              <button onClick={addEvidence} style={primaryBtn}>
                + Evidence
              </button>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {workspace.evidence.length === 0 ? (
                  <Empty text="No evidence yet. Add your first source." />
                ) : (
                  workspace.evidence.slice(0, 8).map((item) => (
                    <div key={item.id} style={rowStyle}>
                      <div style={{ fontWeight: 650 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: tokens.colors.muted }}>
                        {item.url ? item.url : "No URL"} | tags: {item.tags.length}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Section>

            <Section title="Timeline" subtitle="Key events and sequencing.">
              <button onClick={addTimelineEvent} style={primaryBtn}>
                + Event
              </button>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {workspace.timeline.length === 0 ? (
                  <Empty text="No timeline events yet." />
                ) : (
                  workspace.timeline.slice(0, 6).map((item) => (
                    <div key={item.id} style={rowStyle}>
                      <div style={{ fontWeight: 650 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: tokens.colors.muted }}>{new Date(item.dateIso).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </Section>

            <Section title="Findings" subtitle="Executive-ready conclusions.">
              <button onClick={addFinding} style={primaryBtn}>
                + Finding
              </button>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {workspace.findings.length === 0 ? (
                  <Empty text="No findings yet." />
                ) : (
                  workspace.findings.slice(0, 8).map((item) => (
                    <div key={item.id} style={rowStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 650 }}>{item.text}</div>
                        <div style={{ fontSize: 12, color: tokens.colors.gold, fontWeight: 650 }}>{item.severity.toUpperCase()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <Section title="Dossier Preview" subtitle="What the PDF will contain.">
              <div style={{ fontSize: 13, color: tokens.colors.muted }}>
                <div>Cover | Executive Summary | Findings | Timeline | Evidence | Risk | Appendix</div>
                <div style={{ marginTop: 8 }}>Includes integrity metadata: fingerprint, contract version, ledger reference.</div>
              </div>
              <div style={{ marginTop: 12, borderTop: `1px solid ${tokens.colors.border}`, paddingTop: 12 }}>
                <button
                  onClick={() =>
                    setConfirm({
                      title: "Export dossier PDF",
                      desc: "This triggers a dossier export request. A reason is required.",
                      confirmText: "Confirm export",
                      action: (reason) => startExport(reason),
                    })
                  }
                  style={goldBtn}
                >
                  Export PDF
                </button>

                <div style={{ marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>
                  Target: <span style={{ color: tokens.colors.text }}>{targetId}</span>
                </div>
                {jobId ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>
                    Job: <span style={{ color: tokens.colors.text }}>{jobId}</span> | Status:{" "}
                    <span style={{ color: tokens.colors.gold, fontWeight: 650 }}>{jobStatus}</span>
                  </div>
                ) : null}
                {artifactUrl ? (
                  <a href={artifactUrl} target="_blank" rel="noreferrer" style={artifactLinkStyle}>
                    Download PDF
                  </a>
                ) : null}
                {error ? <div style={{ marginTop: 10, color: "#E03131", fontSize: 13 }}>{error}</div> : null}
                {envData.error ? <div style={{ marginTop: 10, color: "#E03131", fontSize: 13 }}>{envData.error}</div> : null}
              </div>
            </Section>

            <Section title="Export History" subtitle="Status cards by target and time.">
              {history.length === 0 ? (
                <Empty text="No exports yet." />
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {history.map((item) => (
                    <div key={item.job_id} style={rowStyle}>
                      <div style={{ fontWeight: 650 }}>{item.job_id}</div>
                      <div style={{ fontSize: 12, color: tokens.colors.muted }}>
                        {item.target_id} | {new Date(item.requested_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: tokens.colors.muted }}>Status: {item.status}</div>
                      {item.artifact_url ? (
                        <a href={item.artifact_url} target="_blank" rel="noreferrer" style={{ color: tokens.colors.gold, fontSize: 12 }}>
                          Open artifact
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>

      <ConfirmActionModal
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.desc ?? ""}
        confirmText={confirm?.confirmText ?? "Confirm"}
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${tokens.colors.border}`, borderRadius: 14, background: tokens.colors.panel, padding: 14 }}>
      <div style={{ fontWeight: 650 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: tokens.colors.muted }}>{subtitle}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.surface,
        padding: 12,
        color: tokens.colors.muted,
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  background: tokens.colors.surface,
  padding: 12,
};
const primaryBtn: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
  fontSize: 12,
};
const goldBtn: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.gold,
  color: tokens.colors.bg,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
};
const artifactLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 10,
  fontSize: 13,
  color: tokens.colors.text,
  textDecoration: "none",
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  padding: "10px 12px",
  background: tokens.colors.surface,
};
