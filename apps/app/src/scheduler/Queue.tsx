import React from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fortressStates, tokens } from "@zbest/ui";
import type { ScheduleItem } from "./types";

export function Queue({
  items,
  onReorder,
  onSelect,
  selectedIds,
}: {
  items: ScheduleItem[];
  onReorder: (ids: string[]) => void;
  onSelect: (id: string) => void;
  selectedIds?: Set<string>;
}) {
  const ids = items.map((x) => x.id);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={(evt) => {
          const activeId = String(evt.active.id);
          const overId = evt.over ? String(evt.over.id) : null;
          if (!overId || activeId === overId) {
            return;
          }
          const oldIndex = ids.indexOf(activeId);
          const newIndex = ids.indexOf(overId);
          if (oldIndex === -1 || newIndex === -1) {
            return;
          }
          const nextIds = arrayMove(ids, oldIndex, newIndex);
          onReorder(nextIds);
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <Row key={item.id} item={item} onSelect={onSelect} isSelected={Boolean(selectedIds?.has(item.id))} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Row({ item, onSelect, isSelected }: { item: ScheduleItem; onSelect: (id: string) => void; isSelected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: 14,
        background: tokens.colors.panel,
        padding: 12,
        opacity: isDragging ? 0.7 : 1,
        ...(isSelected ? fortressStates.selected : undefined),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag"
          style={{
            cursor: "grab",
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.surface,
            color: tokens.colors.muted,
            borderRadius: 12,
            padding: "8px 10px",
          }}
        >
          ::
        </button>

        <div>
          <div style={{ fontWeight: 650 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: tokens.colors.muted }}>
            {item.platform.toUpperCase()} | {new Date(item.scheduledAtIso).toLocaleString()} | {item.status}
          </div>
          {isSelected ? (
            <div style={{ marginTop: 4, fontSize: 11, color: tokens.colors.gold, fontWeight: 650 }}>Selected</div>
          ) : null}
        </div>
      </div>

      <button
        onClick={() => onSelect(item.id)}
        style={{
          borderRadius: 14,
          border: `1px solid ${tokens.colors.border}`,
          background: "transparent",
          color: tokens.colors.text,
          padding: "10px 12px",
          cursor: "pointer",
        }}
      >
        View
      </button>
    </div>
  );
}
