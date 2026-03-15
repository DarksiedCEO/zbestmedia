import { loadJson, makeKey, saveJson } from "../state/storage";
import { ScheduleStateSchema, type ScheduleItem, type ScheduleState } from "./types";

const EMPTY: ScheduleState = { items: [] };

export function loadSchedule(targetId: string): ScheduleState {
  return loadJson(makeKey(targetId, "scheduler"), ScheduleStateSchema, EMPTY);
}

export function saveSchedule(targetId: string, state: ScheduleState) {
  saveJson(makeKey(targetId, "scheduler"), state);
}

export function upsertItem(state: ScheduleState, item: ScheduleItem): ScheduleState {
  const idx = state.items.findIndex((x) => x.id === item.id);
  if (idx === -1) {
    return { items: [item, ...state.items] };
  }

  const next = [...state.items];
  next[idx] = item;
  return { items: next };
}

export function removeItem(state: ScheduleState, id: string): ScheduleState {
  return { items: state.items.filter((x) => x.id !== id) };
}

export function reorder(state: ScheduleState, ids: string[]): ScheduleState {
  const map = new Map(state.items.map((x) => [x.id, x] as const));
  const next = ids.map((id) => map.get(id)).filter(Boolean) as ScheduleItem[];
  const leftovers = state.items.filter((x) => !ids.includes(x.id));
  return { items: [...next, ...leftovers] };
}
