import React from "react";
import { addDays, format, isSameDay, setHours, setMinutes, startOfWeek } from "date-fns";
import { tokens } from "@zbest/ui";
import type { ScheduleItem } from "./types";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
type PublishWindow = {
  startHour: number;
  endHour: number;
  daysAllowed: number[];
};

export function CalendarWeek({
  anchor,
  items,
  onSelectItem,
  onSelectSlot,
  publishWindow,
}: {
  anchor: Date;
  items: ScheduleItem[];
  onSelectItem?: (id: string) => void;
  onSelectSlot?: (iso: string) => void;
  publishWindow?: PublishWindow;
}) {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const startHour = publishWindow?.startHour ?? 9;
  const endHour = publishWindow?.endHour ?? 17;
  const daysAllowed = publishWindow?.daysAllowed ?? [0, 1, 2, 3, 4, 5, 6];

  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.panel,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: 12,
          borderBottom: `1px solid ${tokens.colors.border}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 650 }}>Week of {format(weekStart, "MMM d, yyyy")}</div>
        <div style={{ fontSize: 12, color: tokens.colors.muted }}>Tap a slot to schedule | Click an item to view</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7, 1fr)" }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${tokens.colors.border}` }} />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            style={{
              padding: 10,
              borderBottom: `1px solid ${tokens.colors.border}`,
              borderLeft: `1px solid ${tokens.colors.border}`,
              color: tokens.colors.muted,
              fontSize: 12,
            }}
          >
            <div style={{ color: tokens.colors.text, fontWeight: 650 }}>{format(day, "EEE")}</div>
            <div>{format(day, "MMM d")}</div>
          </div>
        ))}

        {HOURS.map((hour) => (
          <React.Fragment key={hour}>
            <div
              style={{
                padding: 10,
                borderBottom: `1px solid ${tokens.colors.border}`,
                color: tokens.colors.muted,
                fontSize: 12,
                background: tokens.colors.surface,
              }}
            >
              {format(setMinutes(setHours(new Date(), hour), 0), "ha")}
            </div>

            {days.map((day) => {
              const slot = setMinutes(setHours(day, hour), 0);
              const slotIso = slot.toISOString();

              const slotItems = items
                .filter((item) => isSameDay(new Date(item.scheduledAtIso), day))
                .filter((item) => new Date(item.scheduledAtIso).getHours() === hour);
              const inWindow = hour >= startHour && hour < endHour && daysAllowed.includes(day.getDay());

              return (
                <div
                  key={`${day.toISOString()}${hour}`}
                  onClick={() => onSelectSlot?.(slotIso)}
                  style={{
                    minHeight: 68,
                    padding: 8,
                    borderBottom: `1px solid ${tokens.colors.border}`,
                    borderLeft: `1px solid ${tokens.colors.border}`,
                    cursor: "pointer",
                    background: inWindow ? "rgba(198,161,74,0.05)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    {slotItems.slice(0, 2).map((item) => (
                      <button
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem?.(item.id);
                        }}
                        style={{
                          textAlign: "left",
                          borderRadius: 12,
                          border: `1px solid ${tokens.colors.border}`,
                          background: tokens.colors.surface,
                          color: tokens.colors.text,
                          padding: "8px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 650 }}>{item.platform.toUpperCase()}</div>
                        <div style={{ fontSize: 12, color: tokens.colors.muted }}>{item.title.slice(0, 26)}</div>
                        {slotItems.length > 1 ? (
                          <span style={{ marginTop: 4, display: "inline-block", fontSize: 11, color: "#F08C00" }}>Time conflict</span>
                        ) : null}
                      </button>
                    ))}
                    {slotItems.length > 2 ? (
                      <div style={{ fontSize: 11, color: tokens.colors.muted }}>+{slotItems.length - 2} more</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
