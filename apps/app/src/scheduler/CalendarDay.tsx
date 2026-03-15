import React from "react";
import { format, isSameDay, setHours, setMinutes } from "date-fns";
import { tokens } from "@zbest/ui";
import type { ScheduleItem } from "./types";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6);
const HALF_HOURS = Array.from({ length: 32 }, (_, i) => i);
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;

type PublishWindow = {
  startHour: number;
  endHour: number;
  daysAllowed: number[];
};

export function CalendarDay({
  day,
  items,
  onSelectItem,
  onSelectSlot,
  publishWindow,
}: {
  day: Date;
  items: ScheduleItem[];
  onSelectItem?: (id: string) => void;
  onSelectSlot?: (iso: string) => void;
  publishWindow?: PublishWindow;
}) {
  const dayItems = items.filter((item) => isSameDay(new Date(item.scheduledAtIso), day));
  const startHour = publishWindow?.startHour ?? 9;
  const endHour = publishWindow?.endHour ?? 17;
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const startMinutes = DAY_START_HOUR * 60;
  const slotHeight = 34;
  const currentLineTop = (currentMinutes - startMinutes) / 30 * slotHeight;
  const showCurrentLine =
    isSameDay(day, new Date()) && currentMinutes >= startMinutes && currentMinutes <= (DAY_END_HOUR + 1) * 60;

  return (
    <div
      style={{
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.panel,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          padding: 12,
          borderBottom: `1px solid ${tokens.colors.border}`,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 650 }}>{format(day, "EEEE, MMM d")}</div>
        <div style={{ fontSize: 12, color: tokens.colors.muted }}>Tap a slot to schedule</div>
      </div>

      <div style={{ display: "grid" }}>
        {HALF_HOURS.map((index) => {
          const hour = DAY_START_HOUR + Math.floor(index / 2);
          const minute = index % 2 === 0 ? 0 : 30;
          const slot = setMinutes(setHours(day, hour), minute);
          const slotIso = slot.toISOString();
          const isFullHour = minute === 0;
          const inWindow = hour >= startHour && hour < endHour;
          const slotItems = dayItems.filter(
            (item) => new Date(item.scheduledAtIso).getHours() === hour && new Date(item.scheduledAtIso).getMinutes() >= minute && new Date(item.scheduledAtIso).getMinutes() < minute + 30,
          );

          return (
            <div
              key={`${hour}-${minute}`}
              onClick={() => onSelectSlot?.(slotIso)}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 1fr",
                borderBottom: `1px solid ${tokens.colors.border}`,
                cursor: "pointer",
                minHeight: slotHeight,
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  background: tokens.colors.surface,
                  color: tokens.colors.muted,
                  fontSize: 11,
                }}
              >
                {isFullHour ? format(slot, "ha") : ""}
              </div>
              <div style={{ padding: 6, position: "relative", background: inWindow ? "rgba(198,161,74,0.06)" : "rgba(255,255,255,0.03)" }}>
                {slotItems.length === 0 ? <div style={{ fontSize: 11, color: tokens.colors.muted }}>{isFullHour ? "-" : ""}</div> : null}

                {slotItems.map((item) => {
                  const itemDate = new Date(item.scheduledAtIso);
                  const conflict = dayItems.some((other) => {
                    if (other.id === item.id) return false;
                    return Math.abs(new Date(other.scheduledAtIso).getTime() - itemDate.getTime()) <= 15 * 60 * 1000;
                  });
                  return (
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
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 650, fontSize: 12 }}>{item.platform.toUpperCase()}</div>
                        <div style={{ fontSize: 12, color: tokens.colors.muted }}>{item.status}</div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>{item.title}</div>
                      {conflict ? <span style={{ marginTop: 4, display: "inline-block", fontSize: 11, color: "#F08C00" }}>Time conflict</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {showCurrentLine ? (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 0,
            top: currentLineTop + 52,
            height: 1,
            background: tokens.colors.gold,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}
