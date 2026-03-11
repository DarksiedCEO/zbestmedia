import { loadJson, makeKey, saveJson } from "../state/storage";
import { ResearchStateSchema, type EvidenceItem, type Finding, type ResearchState, type TimelineEvent } from "./types";

const EMPTY: ResearchState = { evidence: [], timeline: [], findings: [] };

export function loadResearch(targetId: string): ResearchState {
  const raw = loadJson(makeKey(targetId, "research"), ResearchStateSchema, EMPTY);
  return {
    evidence: (raw.evidence ?? []).map((item) => ({
      ...item,
      tags: item.tags ?? []
    })),
    timeline: (raw.timeline ?? []).map((item) => ({
      ...item,
      summary: item.summary ?? "",
      linkedEvidenceIds: item.linkedEvidenceIds ?? []
    })),
    findings: (raw.findings ?? []).map((item) => ({
      ...item,
      linkedEvidenceIds: item.linkedEvidenceIds ?? []
    }))
  };
}

export function saveResearch(targetId: string, state: ResearchState) {
  saveJson(makeKey(targetId, "research"), state);
}

export function upsertEvidence(state: ResearchState, evidence: EvidenceItem): ResearchState {
  const idx = state.evidence.findIndex((item) => item.id === evidence.id);
  const next = [...state.evidence];
  if (idx === -1) {
    next.unshift(evidence);
  } else {
    next[idx] = evidence;
  }
  return { ...state, evidence: next };
}

export function upsertTimeline(state: ResearchState, event: TimelineEvent): ResearchState {
  const idx = state.timeline.findIndex((item) => item.id === event.id);
  const next = [...state.timeline];
  if (idx === -1) {
    next.unshift(event);
  } else {
    next[idx] = event;
  }
  return { ...state, timeline: next };
}

export function upsertFinding(state: ResearchState, finding: Finding): ResearchState {
  const idx = state.findings.findIndex((item) => item.id === finding.id);
  const next = [...state.findings];
  if (idx === -1) {
    next.unshift(finding);
  } else {
    next[idx] = finding;
  }
  return { ...state, findings: next };
}
