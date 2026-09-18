import { z } from 'zod';
import { tenantIdSchema } from '@zbest/service-auth';

export const identifierSchema = z.string().min(1).max(160).refine(value => !value.includes('\0'));
export const issuerSchema = z.enum(['FOUNDER_CREATIVE','RIGHTS','EDITORIAL','TECHNICAL_QC','PUBLICATION','INDEPENDENT_APPEAL']);
const scope = z.object({tenantId:tenantIdSchema,campaignId:identifierSchema}).strict();
export const inspectionSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('SCOPE_READ'),scope}).strict(),
  z.object({kind:z.literal('APPROVAL_READ'),scope,approval:z.object({
    id:identifierSchema,subjectType:identifierSchema,subjectId:identifierSchema,subjectVersion:identifierSchema,
    subjectSha256:z.string().regex(/^[a-f0-9]{64}$/),issuer:issuerSchema
  }).strict()}).strict()
]);
export type InspectionRequest = z.infer<typeof inspectionSchema>;
export type InspectionResponse = {
  status:'OBSERVED_ONLY'; execution:'DISABLED'; kind:InspectionRequest['kind']; requestId:string;
};
export type SqlstateCategory = 'authorization' | 'contention' | 'connection' | 'internal';
export class BoundaryError extends Error {
  constructor(public readonly statusCode:400|401|403|500|503, public readonly sqlstateCategory?:SqlstateCategory, public readonly destroy=false) {
    super('Boundary request failed');
  }
}
