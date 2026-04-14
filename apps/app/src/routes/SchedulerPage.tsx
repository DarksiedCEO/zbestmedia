import React from "react";
import { addMinutes } from "date-fns";
import { tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";
import { ConfirmActionModal } from "../ui/ConfirmActionModal";
import { BatchBar } from "../scheduler/BatchBar";
import { CalendarDay } from "../scheduler/CalendarDay";
import { CalendarMonth } from "../scheduler/CalendarMonth";
import { CalendarWeek } from "../scheduler/CalendarWeek";
import { Filters, type SchedulerFilters } from "../scheduler/Filters";
import { Queue } from "../scheduler/Queue";
import {
  MIN_BUFFER_DAYS,
  MIN_POSTS_PER_DAY,
  MAX_POSTS_PER_DAY,
  assertDailyPostingCap,
  getBufferHealth,
  loadSchedule,
  removeItem,
  reorder as reorderStore,
  saveSchedule,
  upsertItem,
} from "../scheduler/store";
import type { ScheduleItem } from "../scheduler/types";
import { useRuntime } from "../state/runtime";
import { makeKey } from "../state/storage";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

export default function SchedulerPage() {
  const { target: targetId } = useRuntime();
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false,
  );
  const [isTablet, setIsTablet] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1024px)").matches : false,
  );

  const [state, setState] = React.useState(() => loadSchedule(targetId));
  React.useEffect(() => setState(loadSchedule(targetId)), [targetId]);

  const [filters, setFilters] = React.useState<SchedulerFilters>(() => {
    const fallbackView: SchedulerFilters["view"] = isMobile ? "day" : isTablet ? "week" : "month";
    if (typeof window === "undefined") {
      return { view: fallbackView, platform: "all", status: "all" };
    }
    const raw = window.localStorage.getItem(makeKey(targetId, "scheduler-filters"));
    if (!raw) {
      return { view: fallbackView, platform: "all", status: "all" };
    }
    try {
      return JSON.parse(raw) as SchedulerFilters;
    } catch {
      return { view: fallbackView, platform: "all", status: "all" };
    }
  });
  const [toast, setToast] = React.useState<string | null>(null);
  const [publishWindow] = React.useState({ startHour: 9, endHour: 17, daysAllowed: [1, 2, 3, 4, 5] });

  React.useEffect(() => {
    const mediaMobile = window.matchMedia("(max-width: 768px)");
    const mediaTablet = window.matchMedia("(max-width: 1024px)");
    const onChange = () => {
      setIsMobile(mediaMobile.matches);
      setIsTablet(mediaTablet.matches);
    };
    onChange();
    mediaMobile.addEventListener("change", onChange);
    mediaTablet.addEventListener("change", onChange);
    return () => {
      mediaMobile.removeEventListener("change", onChange);
      mediaTablet.removeEventListener("change", onChange);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(makeKey(targetId, "scheduler-filters"), JSON.stringify(filters));
    }
  }, [filters, targetId]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(makeKey(targetId, "scheduler-filters"));
    if (raw) {
      return;
    }
    const fallbackView: SchedulerFilters["view"] = isMobile ? "day" : isTablet ? "week" : "month";
    setFilters((prev) => ({ ...prev, view: fallbackView }));
  }, [isMobile, isTablet, targetId]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [anchor, setAnchor] = React.useState(new Date());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState("");
  const [createPlatform, setCreatePlatform] = React.useState<ScheduleItem["platform"]>("x");
  const [createStatus, setCreateStatus] = React.useState<ScheduleItem["status"]>("pending_approval");
  const [createPublishWindow, setCreatePublishWindow] = React.useState("09:00-17:00");
  const [createFirstFrameMatchesHook, setCreateFirstFrameMatchesHook] = React.useState(false);

  const [confirm, setConfirm] = React.useState<null | {
    title: string;
    desc: string;
    confirmText: string;
    danger?: boolean;
    action: (reason: string) => void;
  }>(null);

  const filteredItems = state.items.filter((item) => {
    const platformOk = filters.platform === "all" ? true : item.platform === filters.platform;
    const statusOk = filters.status === "all" ? true : item.status === filters.status;
    return platformOk && statusOk;
  });
  const bufferHealth = getBufferHealth(state);

  function persist(next: typeof state, meta: Record<string, unknown>) {
    setState(next);
    saveSchedule(targetId, next);
    console.info("[scheduler]", { targetId, ...meta });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelected() {
    setSelected(new Set());
  }

  function openReasonedAction(opts: {
    title: string;
    desc: string;
    confirmText: string;
    danger?: boolean;
    action: (reason: string) => void;
  }) {
    setConfirm(opts);
  }

  function applyStatus(ids: string[], status: ScheduleItem["status"], reason: string) {
    try {
      let next = state;
      const ts = nowIso();
      for (const id of ids) {
        const item = next.items.find((x) => x.id === id);
        if (!item) {
          continue;
        }
        if ((status === "scheduled" || status === "posted") && !item.prePostCheck.firstFrameMatchesHook) {
          throw new Error("Posting blocked: first-frame hook check failed");
        }
        if (status === "scheduled" || status === "posted") {
          assertDailyPostingCap(next, item.scheduledAtIso, item.id);
        }
        next = upsertItem(next, { ...item, status, updatedAtIso: ts });
      }
      persist(next, { event: "batch_status", ids, status, reason });
      clearSelected();
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  function shiftSchedule(ids: string[], deltaMinutes: number, reason: string) {
    try {
      let next = state;
      const ts = nowIso();
      for (const id of ids) {
        const item = next.items.find((x) => x.id === id);
        if (!item) {
          continue;
        }
        const shiftedIso = addMinutes(new Date(item.scheduledAtIso), deltaMinutes).toISOString();
        assertDailyPostingCap(next, shiftedIso, item.id);
        next = upsertItem(next, {
          ...item,
          scheduledAtIso: shiftedIso,
          updatedAtIso: ts,
        });
      }
      persist(next, { event: "batch_reschedule", ids, deltaMinutes, reason });
      clearSelected();
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  function deleteItems(ids: string[], reason: string) {
    let next = state;
    for (const id of ids) {
      next = removeItem(next, id);
    }
    persist(next, { event: "batch_delete", ids, reason });
    clearSelected();
  }

  function onReorderQueue(ids: string[]) {
    openReasonedAction({
      title: "Reorder queue",
      desc: "This changes posting priority. A reason is required.",
      confirmText: "Confirm reorder",
      action: (reason) => {
        const next = reorderStore(state, ids);
        persist(next, { event: "reorder", reason, ids });
      },
    });
  }

  function onSelectSlot(iso: string) {
    setAnchor(new Date(iso));
    setCreateOpen(true);
  }

  function createItem(reason: string) {
    try {
      const ts = nowIso();
      assertDailyPostingCap(state, anchor.toISOString());
      const item: ScheduleItem = {
        id: newId(),
        title: createTitle.trim() || "Untitled",
        platform: createPlatform,
        scheduledAtIso: anchor.toISOString(),
        status: createStatus,
        publishWindow: createPublishWindow,
        approvalRequired: true,
        tags: [],
        notes: `reason=${reason}`,
        contentStatus: "draft",
        contentCategory: "traffic",
        scaleCount: 0,
        prePostCheck: { firstFrameMatchesHook: createFirstFrameMatchesHook },
        createdAtIso: ts,
        updatedAtIso: ts,
      };
      const next = upsertItem(state, item);
      persist(next, { event: "create", reason, itemId: item.id });
      setToast(`Scheduled successfully: ${item.id}`);
      setCreateOpen(false);
      setCreateTitle("");
      setCreateFirstFrameMatchesHook(false);
    } catch (err) {
      setToast((err as Error).message);
    }
  }

  function viewCalendar() {
    if (filters.view === "month") {
      return <CalendarMonth month={anchor} items={filteredItems} onDayClick={(day) => setAnchor(day)} />;
    }
    if (filters.view === "week") {
      return (
        <CalendarWeek
          anchor={anchor}
          items={filteredItems}
          onSelectItem={(id) => toggleSelect(id)}
          onSelectSlot={(iso) => onSelectSlot(iso)}
          publishWindow={publishWindow}
        />
      );
    }
    return (
      <CalendarDay
        day={anchor}
        items={filteredItems}
        onSelectItem={(id) => toggleSelect(id)}
        onSelectSlot={(iso) => onSelectSlot(iso)}
        publishWindow={publishWindow}
      />
    );
  }

  React.useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (selected.size === 0) {
        return;
      }
      if (evt.key.toLowerCase() === "a") {
        evt.preventDefault();
        openReasonedAction({
          title: "Approve selected",
          desc: "Keyboard action: approve selected items. Reason required.",
          confirmText: "Confirm approve",
          action: (reason) => applyStatus(Array.from(selected), "scheduled", reason),
        });
      } else if (evt.key.toLowerCase() === "p") {
        evt.preventDefault();
        openReasonedAction({
          title: "Mark selected pending",
          desc: "Keyboard action: move selected items back to pending. Reason required.",
          confirmText: "Confirm pending",
          action: (reason) => applyStatus(Array.from(selected), "pending_approval", reason),
        });
      } else if (evt.key === "Delete" || evt.key === "Backspace") {
        evt.preventDefault();
        openReasonedAction({
          title: "Delete selected",
          desc: "Keyboard action: delete selected items. Reason required.",
          confirmText: "Confirm delete",
          danger: true,
          action: (reason) => deleteItems(Array.from(selected), reason),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, state]);

  return (
    <AppShell title="Scheduler">
      <div style={{ display: "grid", gap: 12 }}>
        {bufferHealth.isBelowMinimum ? (
          <div style={alertStyle}>
            Buffer low: {bufferHealth.coveredDays}/{MIN_BUFFER_DAYS} days covered. Keep {MIN_POSTS_PER_DAY} to {MAX_POSTS_PER_DAY} posts per day and rebuild the queue.
          </div>
        ) : null}

        {state.categoryPerformance.some((entry) => entry.outputMultiplier < 1) ? (
          <div style={softPanelStyle}>
            {state.categoryPerformance
              .filter((entry) => entry.outputMultiplier < 1)
              .map((entry) => `${entry.category} reduced to ${entry.outputMultiplier}x after ${entry.lowScoreStreak} low-score runs`)
              .join(" • ")}
          </div>
        ) : null}

        {selected.size > 1 ? (
          <div
            style={{
              position: "sticky",
              top: 8,
              zIndex: 20,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: 14,
              background: tokens.colors.surface,
              padding: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13 }}>
              <span style={{ color: tokens.colors.gold, fontWeight: 700 }}>{selected.size}</span> items selected
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  openReasonedAction({
                    title: "Quick schedule selected",
                    desc: "Shift selected items by one hour.",
                    confirmText: "Confirm schedule",
                    action: (reason) => shiftSchedule(Array.from(selected), 60, reason),
                  })
                }
                style={quickButton}
              >
                Schedule
              </button>
              <button
                onClick={() =>
                  openReasonedAction({
                    title: "Approve selected",
                    desc: "Moves selected items to scheduled. Reason required.",
                    confirmText: "Confirm approve",
                    action: (reason) => applyStatus(Array.from(selected), "scheduled", reason),
                  })
                }
                style={quickButton}
              >
                Approve
              </button>
              <button onClick={clearSelected} style={quickButton}>
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <Filters value={filters} onChange={setFilters} />

        <BatchBar
          selectedCount={selected.size}
          onClear={clearSelected}
          onApprove={() =>
            openReasonedAction({
              title: "Approve selected",
              desc: "Moves selected items to scheduled. Reason required.",
              confirmText: "Confirm approve",
              action: (reason) => applyStatus(Array.from(selected), "scheduled", reason),
            })
          }
          onMarkPending={() =>
            openReasonedAction({
              title: "Mark selected pending",
              desc: "Moves selected items to pending approval. Reason required.",
              confirmText: "Confirm pending",
              action: (reason) => applyStatus(Array.from(selected), "pending_approval", reason),
            })
          }
          onReschedule={(deltaMinutes) =>
            openReasonedAction({
              title: "Reschedule selected",
              desc: `Shifts selected items by ${deltaMinutes} minutes. Reason required.`,
              confirmText: "Confirm reschedule",
              action: (reason) => shiftSchedule(Array.from(selected), deltaMinutes, reason),
            })
          }
          onDelete={() =>
            openReasonedAction({
              title: "Delete selected",
              desc: "This cannot be undone. Reason required.",
              confirmText: "Confirm delete",
              danger: true,
              action: (reason) => deleteItems(Array.from(selected), reason),
            })
          }
        />

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "minmax(320px, 420px) 1fr", alignItems: "start" }}>
          <div
            style={{
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: 14,
              background: tokens.colors.surface,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 650 }}>Queue</div>
              <button
                onClick={() => setCreateOpen(true)}
                style={{
                  borderRadius: 14,
                  border: `1px solid ${tokens.colors.border}`,
                  background: tokens.colors.gold,
                  color: tokens.colors.bg,
                  padding: "8px 10px",
                  fontWeight: 650,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                + New
              </button>
            </div>

            <div style={{ marginTop: 10, color: tokens.colors.muted, fontSize: 12 }}>
              Click View to select items for batch actions. Approval blocks posting when first-frame checks fail or the day cap is full.
            </div>

            <div style={{ marginTop: 12 }}>
              <Queue items={filteredItems} onReorder={onReorderQueue} onSelect={(id) => toggleSelect(id)} selectedIds={selected} />
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>
              Selected: <span style={{ color: tokens.colors.gold, fontWeight: 650 }}>{selected.size}</span>
            </div>
          </div>

          <div>{viewCalendar()}</div>
        </div>
      </div>
      {isMobile && selected.size > 0 ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: tokens.colors.bg,
            borderTop: `1px solid ${tokens.colors.border}`,
            padding: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            zIndex: 70,
          }}
        >
          <span style={{ fontSize: 13 }}>{selected.size} selected</span>
          <button
            onClick={() =>
              openReasonedAction({
                title: "Approve selected",
                desc: "Approve selected items from mobile action bar.",
                confirmText: "Confirm approve",
                action: (reason) => applyStatus(Array.from(selected), "scheduled", reason),
              })
            }
            style={mobileAction}
          >
            Approve
          </button>
          <button onClick={clearSelected} style={mobileAction}>
            Clear
          </button>
        </div>
      ) : null}

      {toast ? (
        <div
          style={{
            position: "fixed",
            right: 14,
            bottom: isMobile && selected.size > 0 ? 66 : 14,
            borderRadius: 12,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface,
            padding: "10px 12px",
            color: tokens.colors.text,
            fontSize: 12,
            zIndex: 80,
          }}
        >
          {toast}
        </div>
      ) : null}

      <ConfirmActionModal
        open={createOpen}
        title="Create schedule item"
        description="Scheduling a post changes the campaign timeline. A reason is required."
        confirmText="Create"
        onCancel={() => setCreateOpen(false)}
        onConfirm={(reason) => createItem(reason)}
      />

      {createOpen ? (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            width: "min(420px, calc(100vw - 36px))",
            borderRadius: 18,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.panel,
            padding: 14,
            zIndex: 60,
          }}
        >
          <div style={{ fontWeight: 650 }}>Details</div>

          <label style={{ display: "block", marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>Title</label>
          <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="What are we posting?" style={fieldStyle} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: tokens.colors.muted }}>Platform</label>
              <select value={createPlatform} onChange={(e) => setCreatePlatform(e.target.value as ScheduleItem["platform"])} style={fieldStyle}>
                <option value="x">X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: tokens.colors.muted }}>Status</label>
              <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as ScheduleItem["status"])} style={fieldStyle}>
                <option value="pending_approval">Pending approval</option>
                <option value="scheduled">Scheduled</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <label style={{ display: "block", marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>Publish window</label>
          <input value={createPublishWindow} onChange={(e) => setCreatePublishWindow(e.target.value)} style={fieldStyle} />

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13 }}>
            <input type="checkbox" checked={createFirstFrameMatchesHook} onChange={(e) => setCreateFirstFrameMatchesHook(e.target.checked)} />
            First frame matches hook
          </label>

          <div style={{ marginTop: 10, fontSize: 12, color: tokens.colors.muted }}>
            Daily cap: {MIN_POSTS_PER_DAY}-{MAX_POSTS_PER_DAY} posts | Minimum buffer: {MIN_BUFFER_DAYS} days
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

const fieldStyle: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
};

const quickButton: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.panel,
  color: tokens.colors.text,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 650,
  fontSize: 12,
};

const mobileAction: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.gold,
  color: tokens.colors.bg,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
};

const alertStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.gold}`,
  borderRadius: 14,
  background: tokens.colors.surface,
  padding: 12,
  color: tokens.colors.text,
  fontSize: 13,
};

const softPanelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  background: tokens.colors.surface,
  padding: 12,
  color: tokens.colors.muted,
  fontSize: 12,
};
