/** Persistence DTOs only. These types do not authenticate an HTTP principal. */
export type Capability = 'READ' | 'AUDIT' | 'MANAGE_TENANT' | 'MANAGE_GRANT' | 'RECORD_APPROVAL' | 'APPEND_EVIDENCE' | 'EXECUTE_SIMULATION' | 'PROCESS_SIMULATION';
export interface AuthorityObservation {
 principal: string; tenant: string; campaign: string | null;
 purpose: 'SIMULATION'; capability: Capability; bindingVersion: number;
}
export interface EvidenceRecord {
 id: string; tenant_id: string; campaign_id: string | null; stream: string;
 sequence: string; operation: 'APPEND' | 'SUPERSEDE'; predecessor: string | null;
 canonical: string; prior_hash: string; hash: string; actor: string;
 custodial_login: string; appended_at: string;
}
/** Implementations must use the current authenticated DB session and scoped SQL functions. */
export interface AuthorityEvidenceReader {
 observe(tenant: string, campaign: string | null, purpose: 'SIMULATION', capability: Capability): Promise<AuthorityObservation>;
 readEvidence(tenant: string, campaign: string | null, purpose: 'SIMULATION', id: string): Promise<EvidenceRecord>;
}
