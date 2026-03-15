import type { AaliyahSessionContext, AaliyahWorkingItemContext } from "./session-types.js";

export function assertAaliyahSessionIntegrity(session: AaliyahSessionContext): void {
  if (!session.sessionId || !session.tenantId || !session.actorId) {
    throw new Error("aaliyah_session_invalid_identity");
  }
  if (session.activeModeState.activeMode !== "founder" && session.activeModeState.activeMode !== "zbestmedia") {
    throw new Error("aaliyah_session_invalid_mode");
  }
  if (session.interactionState.intentTrail.length > session.retentionPolicy.intentTrailMaxEntries) {
    throw new Error("aaliyah_session_intent_trail_unbounded");
  }
  if (session.companyScope !== "zbestmedia") {
    throw new Error("aaliyah_session_invalid_company_scope");
  }
  if (session.interactionState.reviewApprovalContext?.reviewItemId && !session.interactionState.workingItem?.reviewItemId) {
    throw new Error("aaliyah_session_review_context_detached");
  }
  assertWorkingItem(session.interactionState.workingItem);
}

function assertWorkingItem(workingItem: AaliyahWorkingItemContext | null): void {
  if (!workingItem) {
    return;
  }
  if (!workingItem.sourceItemId || !workingItem.title) {
    throw new Error("aaliyah_session_working_item_incomplete");
  }
  if (workingItem.closureState !== "open" && !workingItem.closureReason) {
    throw new Error("aaliyah_session_working_item_missing_closure_reason");
  }
  if (workingItem.closureState === "open" && workingItem.closedAt !== null) {
    throw new Error("aaliyah_session_working_item_invalid_closed_at");
  }
}
