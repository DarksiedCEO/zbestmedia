import type { InspectionRequest, SqlstateCategory } from './requests';
export type OperationalEvent = {
  requestId:string;
  operation?:InspectionRequest['kind'];
  keyId?:string;
  decision:'observed'|'unauthenticated'|'invalid'|'denied'|'unavailable'|'error';
  latencyMs:number;
  sqlstateCategory?:SqlstateCategory;
};
export function safeLog(log:((event:Readonly<Record<string,unknown>>)=>void)|undefined,event:OperationalEvent):void {
  if(!log) return;
  const safe:Record<string,unknown>={requestId:event.requestId,decision:event.decision,latencyMs:event.latencyMs};
  if(event.operation!==undefined) safe.operation=event.operation;
  if(event.keyId!==undefined) safe.keyId=event.keyId;
  if(event.sqlstateCategory!==undefined) safe.sqlstateCategory=event.sqlstateCategory;
  try { log(Object.freeze(safe)); } catch { /* Operational logging cannot alter an inspection's outcome. */ }
}
