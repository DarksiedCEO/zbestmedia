import { makeKey, saveJson } from "../state/storage";
import {
  DraftSchema,
  DraftStateSchema,
  type ContentMetrics,
  type ContentStatus,
  type Draft,
  type DraftState,
  type PlatformPerformance,
  type ShortformPlatform,
} from "./types";

export const MAX_SCALES_PER_WINNER = 3;

const EMPTY: DraftState = { drafts: [], activeId: null };

export function loadDrafts(targetId: string): DraftState {
  if (typeof window === "undefined") {
    return EMPTY;
  }

  const raw = window.localStorage.getItem(makeKey(targetId, "drafts"));
  if (!raw) {
    return EMPTY;
  }

  try {
    return DraftStateSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

export function saveDrafts(targetId: string, state: DraftState) {
  saveJson(makeKey(targetId, "drafts"), state);
}

export function upsertDraft(state: DraftState, draft: Draft): DraftState {
  const normalized = DraftSchema.parse(draft);
  const idx = state.drafts.findIndex((item) => item.id === normalized.id);
  const next = [...state.drafts];
  if (idx === -1) {
    next.unshift(normalized);
  } else {
    next[idx] = normalized;
  }
  return { ...state, drafts: next };
}

export function setActive(state: DraftState, id: string | null): DraftState {
  return { ...state, activeId: id };
}

function makeScaleVariant(source: Draft, nextScale: number, nowIso: string): Draft {
  return {
    ...source,
    id: crypto.randomUUID(),
    title: `${source.title} / Scale ${nextScale}`,
    status: "testing",
    scaleCount: 0,
    scaledFromId: source.id,
    performance: { tiktok: [], reels: [], shorts: [] },
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export async function autoGenerateVariants(state: DraftState, draftId: string): Promise<DraftState> {
  const current = state.drafts.find((item) => item.id === draftId);
  if (!current) {
    throw new Error("Scaling blocked: content not found");
  }
  if (current.status === "dead") {
    throw new Error("Scaling blocked: content marked dead");
  }
  if (current.scaleCount >= MAX_SCALES_PER_WINNER) {
    throw new Error("Scaling blocked: max scales reached");
  }

  const remaining = MAX_SCALES_PER_WINNER - current.scaleCount;
  const ts = new Date().toISOString();
  const variants = Array.from({ length: remaining }, (_, index) => makeScaleVariant(current, current.scaleCount + index + 1, ts));
  const updatedCurrent: Draft = {
    ...current,
    scaleCount: current.scaleCount + remaining,
    updatedAtIso: ts,
  };

  const withoutCurrent = state.drafts.filter((item) => item.id !== draftId);
  return {
    ...state,
    drafts: [updatedCurrent, ...variants, ...withoutCurrent],
  };
}

export async function setDraftStatus(state: DraftState, draftId: string, status: ContentStatus): Promise<DraftState> {
  const current = state.drafts.find((item) => item.id === draftId);
  if (!current) {
    throw new Error("Content not found");
  }

  const ts = new Date().toISOString();
  let next = upsertDraft(state, {
    ...current,
    status,
    updatedAtIso: ts,
  });

  if (status === "winner") {
    next = await autoGenerateVariants(next, draftId);
  }

  return next;
}

export function appendMetric(state: DraftState, draftId: string, platform: ShortformPlatform, metric: ContentMetrics): DraftState {
  const current = state.drafts.find((item) => item.id === draftId);
  if (!current) {
    return state;
  }

  const performance: PlatformPerformance = {
    ...current.performance,
    [platform]: [...current.performance[platform], metric],
  };

  return upsertDraft(state, {
    ...current,
    performance,
    updatedAtIso: new Date().toISOString(),
  });
}
