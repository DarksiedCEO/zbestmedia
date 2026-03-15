import React from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { tokens } from "@zbest/ui";
import type { ScheduleItem } from "./types";

export function CalendarMonth({
  month,
  items,
  onDayClick,
}: {
  month: Date;
  items: ScheduleItem[];
  onDayClick?: (day: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }

  return (
    <div style={{ border: `1px solid ${tokens.colors.border}`, borderRadius: 14, background: tokens.colors.panel }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${tokens.colors.border}`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 650 }}>{format(monthStart, "MMMM yyyy")}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
          <div
            key={weekday}
            style={{ padding: 10, fontSize: 12, color: tokens.colors.muted, borderBottom: `1px solid ${tokens.colors.border}` }}
          >
            {weekday}
          </div>
        ))}

        {days.map((day) => {
          const dayItems = items.filter((item) => isSameDay(new Date(item.scheduledAtIso), day));
          const muted = !isSameMonth(day, monthStart);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayClick?.(day)}
              style={{
                textAlign: "left",
                minHeight: 90,
                padding: 10,
                borderRight: `1px solid ${tokens.colors.border}`,
                borderBottom: `1px solid ${tokens.colors.border}`,
                background: "transparent",
                color: tokens.colors.text,
                cursor: "pointer",
                opacity: muted ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 12, color: tokens.colors.muted }}>{format(day, "d")}</div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {dayItems.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    style={{ fontSize: 11, color: tokens.colors.text, borderLeft: `2px solid ${tokens.colors.gold}`, paddingLeft: 6 }}
                  >
                    {item.platform.toUpperCase()}: {item.title.slice(0, 22)}
                  </div>
                ))}
                {dayItems.length > 2 ? (
                  <div style={{ fontSize: 11, color: tokens.colors.muted }}>+{dayItems.length - 2} more</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
