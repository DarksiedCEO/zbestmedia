import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root=path.resolve(import.meta.dirname,"..");
const mutants=[
  ["manifest-lifecycle.mjs","self_activation",'manifest.active !== false','false'],
  ["manifest-lifecycle.mjs","lifecycle",'manifest.lifecycleState !== "ACTIVATION_PENDING"','false'],
  ["manifest-lifecycle.mjs","remote_authorized",'manifest.remoteAuthorized !== false','false'],
  ["manifest-lifecycle.mjs","authority_set",'!exactSet(ids, REQUIRED_AUTHORITY_IDS)','false'],
  ["manifest-lifecycle.mjs","semantic_alias",'new Set(authorities.map((x) => x.semantic_role)).size !== authorities.length','false'],
  ["manifest-lifecycle.mjs","binding_alias",'new Set(authorities.map((x) => x.environment_binding)).size !== authorities.length','false'],
  ["manifest-lifecycle.mjs","consumer_parity",'!exactSet([...new Set(consumerRequired)], REQUIRED_AUTHORITY_IDS)','false'],
  ["manifest-lifecycle.mjs","caller_activation_rejection",'Object.keys(request).some((key) => !["v1", "v2"].includes(key))','false'],
  ["activation-decision.mjs","custody_separation",'expected.custodyDomain === observed.custodyDomain','false'],
  ["activation-decision.mjs","successor_identity",'e[key] !== o[key]','false'],
  ["activation-decision.mjs","rollback_authority",'e.rollbackTarget !== "62cbb8a90099e647ef7d91ecec7898f701babf8a"','false'],
  ["activation-decision.mjs","founder_authority",'e.founderAuthorized !== true','false'],
  ["activation-decision.mjs","manifest_digest",'e.manifestSha256 !== o.manifestSha256','false'],
  ["activation-decision.mjs","manifest_byte_count",'e.manifestByteCount !== o.manifestByteCount','false'],
  ["activation-decision.mjs","ordered_parents",'JSON.stringify(e.orderedParents) !== JSON.stringify(o.orderedParents)','false'],
  ["activation-decision.mjs","remote_provenance",'e.remoteProvenance !== "VERIFIED"','false'],
  ["activation-decision.mjs","manifest_path_binding",'e.manifestPath!==".github/p1a/certification-contract.v2.json"||e.manifestPath!==o.manifestPath','false'],
  ["activation-decision.mjs","changed_files_membership",'JSON.stringify(e.changedFiles)!==JSON.stringify(o.changedFiles)','false'],
  ["activation-decision.mjs","changed_files_order",'JSON.stringify(entries)!==JSON.stringify(sorted)','false'],
  ["activation-decision.mjs","changed_files_duplicates",'new Set(paths).size!==paths.length','false'],
  ["activation-decision.mjs","changed_files_status",'!["A","M","D","T"].includes(entry.status)','false'],
  ["activation-decision.mjs","changed_files_blob",'entry.newBlob!==null&&!SHA.test(entry.newBlob)','false'],
  ["activation-entrypoint.mjs","entrypoint_arguments",'arguments.length !== 0','false'],
  ["activation-authority-adapters.mjs","immutable_mode",'(before.mode&0o022)!==0','false'],
  ["activation-authority-adapters.mjs","dirty_repository",'git("status","--porcelain=v1")!==""','false'],
  ["activation-authority-adapters.mjs","persisted_credentials",'config("credential.helper")!==""','false'],
  ["activation-authority-adapters.mjs","root_alias",'!rootEntry.isDirectory()||rootEntry.isSymbolicLink()','false'],
  ["activation-authority-adapters.mjs","expected_manifest_path",'canonicalPath(record.manifestPath)!==CANONICAL_V2_MANIFEST_PATH','false'],
  ["activation-authority-adapters.mjs","diff_parent_selection",'orderedParents[0],successorSha','successorSha,successorSha'],
  ["activation-authority-adapters.mjs","changed_during_observation",'git("rev-parse","HEAD")!==successorSha||git("status","--porcelain=v1")!==""','false'],
  ["activation-authority-adapters.mjs","observed_manifest_hash",'createHash("sha256").update(manifestBytes).digest("hex")','"0".repeat(64)'],
  ["activation-authority-adapters.mjs","observed_manifest_blob",'const manifestBlob=git("rev-parse",`HEAD:${manifestPath}`)','const manifestBlob=successorTree'],
  ["activation-authority-adapters.mjs","descriptor_cleanup",'closeSync(fd);','void fd;'],
];
const run=(cwd)=>["scripts/test-p1a-manifest-successor.mjs","scripts/test-p1a-activation-authority-adapters.mjs"].map((test)=>spawnSync(process.execPath,[test],{cwd,encoding:"utf8"}));
const baseline=run(root); assert.ok(baseline.every((x)=>x.status===0),"unmutated baseline must pass");
let killed=0;
for(const [file,id,needle,replacement] of mutants){
  const dir=mkdtempSync(path.join(tmpdir(),"p1a-v2-mutant-"));
  try{
    cpSync(path.join(root,"scripts"),path.join(dir,"scripts"),{recursive:true}); cpSync(path.join(root,".github"),path.join(dir,".github"),{recursive:true});
    const target=path.join(dir,"scripts/p1a",file); const source=readFileSync(target,"utf8"); assert.ok(source.includes(needle),`${id}: mutation target absent`); writeFileSync(target,source.replace(needle,replacement));
    const results=run(dir); assert.ok(results.some((x)=>x.status!==0),`${id}: mutant survived`); killed++; console.log(`KILLED ${id}`);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({suite:"p1a-manifest-successor-implementation-mutations",attempted:mutants.length,executed:mutants.length,killed,survived:0,invalid:0}));
