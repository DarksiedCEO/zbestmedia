import { makeKey, saveJson } from "../state/storage";
import type { ContentCategory } from "../content/types";
import { ScheduleItemSchema, ScheduleStateSchema, type ScheduleItem, type ScheduleState } from "./types";

export const MIN_POSTS_PER_DAY = 3;
export const MAX_POSTS_PER_DAY = 7;
export const MIN_BUFFER_DAYS = 3;
export const CATEGORY_SCORE_THRESHOLD = 70;
export const LOW_SCORE_STREAK_DAYS = 3;

const EMPTY: ScheduleState = { items: [], categoryPerformance: [] };

export function loadSchedule(targetId: string): ScheduleState {
  if (typeof window === "undefined") {
    return EMPTY;
  }

  const raw = window.localStorage.getItem(makeKey(targetId, "scheduler"));
  if (!raw) {
    return EMPTY;
  }

  try {
    return ScheduleStateSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

export function saveSchedule(targetId: string, state: ScheduleState) {
  saveJson(makeKey(targetId, "scheduler"), state);
}

export function upsertItem(state: ScheduleState, item: ScheduleItem): ScheduleState {
  const normalized = ScheduleItemSchema.parse(item);
  const idx = state.items.findIndex((x) => x.id === normalized.id);
  if (idx === -1) {
    return { ...state, items: [normalized, ...state.items] };
  }

  const next = [...state.items];
  next[idx] = normalized;
  return { ...state, items: next };
}

export function removeItem(state: ScheduleState, id: string): ScheduleState {
  return { ...state, items: state.items.filter((x) => x.id !== id) };
}

export function reorder(state: ScheduleState, ids: string[]): ScheduleState {
  const map = new Map(state.items.map((x) => [x.id, x] as const));
  const next = ids.map((id) => map.get(id)).filter(Boolean) as ScheduleItem[];
  const leftovers = state.items.filter((x) => !ids.includes(x.id));
  return { ...state, items: [...next, ...leftovers] };
}

function toDayKey(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isCountedForPosting(item: ScheduleItem) {
  return item.status === "pending_approval" || item.status === "scheduled" || item.status === "posted";
}

export function getDailyPostingCount(state: ScheduleState, iso: string, ignoreId?: string) {
  const dayKey = toDayKey(iso);
  return state.items.filter((item) => item.id !== ignoreId && isCountedForPosting(item) && toDayKey(item.scheduledAtIso) === dayKey).length;
}

export function assertDailyPostingCap(state: ScheduleState, iso: string, ignoreId?: string) {
  const count = getDailyPostingCount(state, iso, ignoreId);
  if (count >= MAX_POSTS_PER_DAY) {
    throw new Error(`Posting blocked: max daily cap of ${MAX_POSTS_PER_DAY} reached`);
  }
}

export function getBufferHealth(state: ScheduleState, now = new Date()) {
  const futureDayKeys = new Set(
    state.items
      .filter((item) => isCountedForPosting(item) && new Date(item.scheduledAtIso).getTime() >= now.getTime())
      .map((item) => toDayKey(item.scheduledAtIso)),
  );

  return {
    coveredDays: futureDayKeys.size,
    minimumDays: MIN_BUFFER_DAYS,
    isBelowMinimum: futureDayKeys.size < MIN_BUFFER_DAYS,
  };
}

export function updateCategoryPerformance(state: ScheduleState, category: ContentCategory, score: number): ScheduleState {
  const ts = new Date().toISOString();
  const existing = state.categoryPerformance.find((entry) => entry.category === category);
  if (!existing) {
    return {
      ...state,
      categoryPerformance: [
        ...state.categoryPerformance,
        {
          category,
          avgScore: score,
          sampleCount: 1,
          lowScoreStreak: score < CATEGORY_SCORE_THRESHOLD ? 1 : 0,
          outputMultiplier: 1,
          updatedAtIso: ts,
        },
      ],
    };
  }

  const sampleCount = existing.sampleCount + 1;
  const avgScore = (existing.avgScore * existing.sampleCount + score) / sampleCount;
  const lowScoreStreak = score < CATEGORY_SCORE_THRESHOLD ? existing.lowScoreStreak + 1 : 0;
  const outputMultiplier = lowScoreStreak >= LOW_SCORE_STREAK_DAYS && avgScore < CATEGORY_SCORE_THRESHOLD ? 0.5 : 1;

  return {
    ...state,
    categoryPerformance: state.categoryPerformance.map((entry) =>
      entry.category === category
        ? {
            ...entry,
            avgScore,
            sampleCount,
            lowScoreStreak,
            outputMultiplier,
            updatedAtIso: ts,
          }
        : entry,
    ),
  };
}
