import { loadJson, makeKey, saveJson } from "../state/storage";
import { DraftStateSchema, type Draft, type DraftState } from "./types";

const EMPTY: DraftState = { drafts: [], activeId: null };

export function loadDrafts(targetId: string): DraftState {
  return loadJson(makeKey(targetId, "drafts"), DraftStateSchema, EMPTY);
}

export function saveDrafts(targetId: string, state: DraftState) {
  saveJson(makeKey(targetId, "drafts"), state);
}

export function upsertDraft(state: DraftState, draft: Draft): DraftState {
  const idx = state.drafts.findIndex((item) => item.id === draft.id);
  const next = [...state.drafts];
  if (idx === -1) {
    next.unshift(draft);
  } else {
    next[idx] = draft;
  }
  return { ...state, drafts: next };
}

export function setActive(state: DraftState, id: string | null): DraftState {
  return { ...state, activeId: id };
}
