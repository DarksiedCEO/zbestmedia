import { ContractError } from "./canonical-json.mjs";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const fail = (code, message) => { throw new ContractError(code, message); };
const EXPECTED_KEYS = ["aegisArtifactSha256","bundleSha256","changedFiles","founderAuthorized","manifestBlob","manifestByteCount","manifestPath","manifestSha256","orderedParents","parentCount","remoteProvenance","rollbackTarget","successorSha","successorTree"];
const OBSERVED_KEYS = ["changedFiles","manifestBlob","manifestByteCount","manifestPath","manifestSha256","orderedParents","parentCount","successorSha","successorTree"];
const canonicalPath=(value)=>typeof value==="string"&&value.length>0&&value===value.normalize("NFC")&&!value.startsWith("/")&&!value.includes("\\")&&!value.includes("%")&&!value.includes("//")&&!value.includes("\0")&&!value.split("/").some((part)=>part==="."||part==="..");
function validateInventory(entries){
  if(!Array.isArray(entries)||entries.length===0) fail("ACTIVATION_DIFF_INVALID","changed-file inventory missing");
  const sorted=[...entries].sort((a,b)=>Buffer.from(a.path??"").compare(Buffer.from(b.path??""))); if(JSON.stringify(entries)!==JSON.stringify(sorted)) fail("ACTIVATION_DIFF_INVALID","changed-file inventory ordering invalid");
  const paths=[]; for(const entry of entries){if(JSON.stringify(Object.keys(entry).sort())!==JSON.stringify(["newBlob","oldBlob","path","status"])||!canonicalPath(entry.path)||!["A","M","D","T"].includes(entry.status)) fail("ACTIVATION_DIFF_INVALID","changed-file entry invalid"); if(entry.oldBlob!==null&&!SHA.test(entry.oldBlob)||entry.newBlob!==null&&!SHA.test(entry.newBlob)) fail("ACTIVATION_DIFF_INVALID","changed-file blob invalid"); if(entry.status==="A"&&!(entry.oldBlob===null&&SHA.test(entry.newBlob))||entry.status==="D"&&!(SHA.test(entry.oldBlob)&&entry.newBlob===null)||["M","T"].includes(entry.status)&&!(SHA.test(entry.oldBlob)&&SHA.test(entry.newBlob))) fail("ACTIVATION_DIFF_INVALID","changed-file status/blob contradiction"); paths.push(entry.path);}
  if(new Set(paths).size!==paths.length||new Set(paths.map((x)=>x.toLocaleLowerCase("en-US"))).size!==paths.length) fail("ACTIVATION_DIFF_INVALID","changed-file path duplicate or alias");
}

export function compareActivationEvidence(expected, observed) {
  if (!expected || !observed || expected.custodyDomain === observed.custodyDomain)
    fail("ACTIVATION_AUTHORITY_NOT_INDEPENDENT", "expected and observed evidence require distinct custody");
  if (JSON.stringify(Object.keys(expected.claims).sort()) !== JSON.stringify(EXPECTED_KEYS) ||
      JSON.stringify(Object.keys(observed.claims).sort()) !== JSON.stringify(OBSERVED_KEYS))
    fail("ACTIVATION_EVIDENCE_SHAPE_INVALID", "activation evidence shape differs");
  const e = expected.claims; const o = observed.claims;
  if(e.manifestPath!==".github/p1a/certification-contract.v2.json"||e.manifestPath!==o.manifestPath) fail("ACTIVATION_MANIFEST_PATH_MISMATCH","manifestPath mismatch");
  validateInventory(e.changedFiles); validateInventory(o.changedFiles); if(JSON.stringify(e.changedFiles)!==JSON.stringify(o.changedFiles)) fail("ACTIVATION_CHANGED_FILES_MISMATCH","changedFiles mismatch");
  for (const key of ["successorSha","successorTree","manifestBlob"])
    if (!SHA.test(e[key]) || e[key] !== o[key]) fail("ACTIVATION_IDENTITY_MISMATCH", `${key} mismatch`);
  if (e.rollbackTarget !== "62cbb8a90099e647ef7d91ecec7898f701babf8a")
    fail("ACTIVATION_TOPOLOGY_INVALID", "rollback authority mismatch");
  if (!DIGEST.test(e.bundleSha256) || !DIGEST.test(e.aegisArtifactSha256) || e.founderAuthorized !== true)
    fail("ACTIVATION_AUTHORITY_INVALID", "founder, bundle, and AEGIS authority invalid");
  if (!DIGEST.test(e.manifestSha256) || e.manifestSha256 !== o.manifestSha256) fail("ACTIVATION_IDENTITY_MISMATCH", "manifestSha256 mismatch");
  if (!Number.isSafeInteger(e.manifestByteCount) || e.manifestByteCount !== o.manifestByteCount)
    fail("ACTIVATION_IDENTITY_MISMATCH", "manifestByteCount mismatch");
  if (e.parentCount !== 1 || o.parentCount !== 1 || JSON.stringify(e.orderedParents) !== JSON.stringify(o.orderedParents) || e.orderedParents.length !== 1)
    fail("ACTIVATION_TOPOLOGY_INVALID", "ordered parent evidence mismatch");
  if (e.remoteProvenance !== "VERIFIED")
    fail("ACTIVATION_REMOTE_PROVENANCE_REQUIRED", "local evidence cannot activate v2");
  return Object.freeze({ decision:"MATCH", code:"INDEPENDENT_ACTIVATION_EVIDENCE_MATCH", successorSha:e.successorSha });
}
