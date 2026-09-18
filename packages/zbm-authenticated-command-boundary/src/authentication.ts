import { authenticateBearerToken, type ServiceAuthConfig, type ServiceIdentity } from '@zbest/service-auth';
import type { CredentialPolicy } from './config';
import { BoundaryError } from './requests';

export function authenticate(header:string|string[]|undefined, rawHeaders:readonly string[], authConfig:ServiceAuthConfig, policies:readonly CredentialPolicy[], now:number):ServiceIdentity {
  let occurrences=0;
  for(let i=0;i<rawHeaders.length;i+=2) if(rawHeaders[i].toLowerCase()==='authorization') occurrences++;
  if(occurrences!==1 || typeof header!=='string') throw new BoundaryError(401);
  const match=/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(header);
  if(!match) throw new BoundaryError(401);
  let identity:ServiceIdentity;
  try { identity=authenticateBearerToken(match[1],authConfig); } catch { throw new BoundaryError(401); }
  const policy=policies.find(p=>p.keyId===identity.keyId);
  // Audience is protected LOCAL opaque-token metadata, never a verified JWT/OIDC claim.
  if(!policy || !policy.enabled || policy.audience!=='zbm-command-boundary/simulation' || !Number.isFinite(now)
    || !(Date.parse(policy.notBefore)<=now && now<Date.parse(policy.expiresAt))) throw new BoundaryError(401);
  return identity;
}
