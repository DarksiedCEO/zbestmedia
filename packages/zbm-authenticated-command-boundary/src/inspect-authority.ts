import { z } from 'zod';
import type { ConnectionBinding } from './config';
import { BoundaryError, identifierSchema, issuerSchema, type InspectionRequest } from './requests';
const observationSchema=z.object({principal:identifierSchema,tenant:identifierSchema,campaign:identifierSchema,
  purpose:z.literal('SIMULATION'),capability:z.literal('READ'),bindingVersion:z.number().int().nonnegative().max(2147483647)}).strict();
const timestamp=z.string().datetime({offset:true});
const approvalSchema=z.object({
  id:identifierSchema,tenant_id:identifierSchema,campaign_id:identifierSchema,subject_type:identifierSchema,
  subject_id:identifierSchema,subject_version:identifierSchema,subject_hash:z.string().regex(/^[a-f0-9]{64}$/),issuer:issuerSchema,
  actor:z.string().min(1),custodial_login:z.string().min(1),valid_from:timestamp,expires_at:timestamp,
  status:z.literal('ACTIVE'),version:z.number().int().nonnegative().max(2147483647),changed_at:z.null(),successor_id:z.null()
}).strict().refine(a=>Date.parse(a.valid_from)<Date.parse(a.expires_at));

export function verifyObservation(value:unknown,binding:ConnectionBinding,request:InspectionRequest):void {
  const parsed=observationSchema.safeParse(value);
  if(!parsed.success || parsed.data.principal!==binding.principal || parsed.data.tenant!==request.scope.tenantId || parsed.data.campaign!==request.scope.campaignId)
    throw new BoundaryError(500,'internal',true);
}
export function verifyApproval(value:unknown,request:Extract<InspectionRequest,{kind:'APPROVAL_READ'}>):void {
  const parsed=approvalSchema.safeParse(value);
  if(!parsed.success) throw new BoundaryError(500,'internal',true);
  const row=parsed.data, a=request.approval;
  if(row.id!==a.id || row.tenant_id!==request.scope.tenantId || row.campaign_id!==request.scope.campaignId || row.subject_type!==a.subjectType
    || row.subject_id!==a.subjectId || row.subject_version!==a.subjectVersion || row.subject_hash!==a.subjectSha256 || row.issuer!==a.issuer)
    throw new BoundaryError(500,'internal',true);
  // read_approval owns decision-time validation. Do not substitute the JS credential clock or certify a current aggregate version.
}
