import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { validateData, validateGit, runPackage, validateEvidenceBinding, assertTrustAnchor, assertAuthenticationStatus, AUTHORIZED_REPOSITORIES } from "./validate-p1a-threat-model.mjs";

// External trust-anchor constants (represent the founder/CI-supplied anchor, outside the candidate).
const ANCHOR_BASE="7056ea4ce24379c93549f0ac9b45ddd7a2600dd6";
const ANCHOR_RUNTIME="94376718e07df2e9d44864ed0394d58219224e61";
const ALT_RUNTIME="1f34b8dddf0c08e5a8d8c005951f4482d331eaef"; // real alternate runtime commit — must be rejected

// Hermetic evidence-binding fixture: a throwaway git repo containing a regular file, a directory,
// and a symlink, so binding controls (regular-file mode, blob identity, real line count) are proven
// without depending on any external mirror. This keeps the suite deterministic in CI.
function bindingScenario(){
  const dir=mkdtempSync(path.join(tmpdir(),"p1a-bind-"));
  const g=(...a)=>execFileSync("git",["-C",dir,...a],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
  g("init","-q");g("config","user.email","p1a@example.invalid");g("config","user.name","P1-A");
  writeFileSync(path.join(dir,"good.txt"),Array.from({length:10},(_,i)=>`line ${i+1}`).join("\n")+"\n");
  mkdirSync(path.join(dir,"sub"));writeFileSync(path.join(dir,"sub/inner.txt"),"x\n");
  symlinkSync("good.txt",path.join(dir,"link.txt"));
  g("add","-A");g("commit","-q","-m","base");
  const sha=g("rev-parse","HEAD").trim();
  const oid=g("ls-tree",sha,"--","good.txt").trim().split(/\s+/)[2];
  return {dir,sha,oid,gitdir:path.join(dir,".git"),cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
function runBinding(sc,override={}){
  const manifest={authorizedBaseSha:sc.sha,runtimeEvidenceSha:sc.sha};
  const evidence={references:[{id:"EV-T",repository:AUTHORIZED_REPOSITORIES.base,sha:sc.sha,blobSha:sc.oid,path:"good.txt",lines:"1-10",claim:"c",category:"X",basis:"DIRECT",confidence:"HIGH",...override}]};
  return validateEvidenceBinding(evidence,manifest,{specGitDir:sc.gitdir,runtimeGitDir:sc.gitdir});
}
const bindSc=bindingScenario();

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const load=(p)=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const clone=(x)=>structuredClone(x);
const baseModel=load("docs/security/p1-a/model.json");
const baseEvidence=load("docs/security/p1-a/evidence-register.json");
const baseManifest=load("docs/security/p1-a/validation-manifest.json");
const baseMarkdown=readFileSync(path.join(root,"docs/security/p1-a/threat-model.md"),"utf8");
const unprivilegedWorkflow=readFileSync(path.join(root,".github/workflows/ci.yml"),"utf8");
const trustedWorkflow=readFileSync(path.join(root,".github/workflows/p1a-certify.yml"),"utf8");
const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();

validateData(baseModel,baseEvidence,baseManifest,baseMarkdown);
const positives=[
  ["complete_threat_trace",()=>assert.ok(baseModel.threats[0].assets.length&&baseModel.threats[0].evidenceRefs.length&&baseModel.threats[0].controlIds.length)],
  ["valid_authority_rule_set",()=>assert.equal(baseModel.authorityPolicy.rules.length,616)],
  ["valid_credential_entry",()=>assert.ok(baseModel.credentialClasses[0].rotationAuthorityActorIds.length&&baseModel.credentialClasses[0].evidenceRefs.length)],
  ["valid_tenant_operation",()=>assert.equal(baseModel.tenantOperationPolicy.denialBehavior,"DENY_AND_LOG")],
  ["complete_escalation_chain",()=>assert.equal(baseModel.escalationChains.find(x=>x.threatId==="THR-001").closureEvidenceRequired.length,5)],
  ["consistent_package",()=>assert.equal(JSON.parse(baseMarkdown.match(/```json p1a-summary\n([^\n]+)\n```/)[1]).threats,baseModel.threats.length)],
  ["trust_anchor_binds_real_pins",()=>assertTrustAnchor(baseModel,baseEvidence,baseManifest,{baseSha:ANCHOR_BASE,runtimePin:ANCHOR_RUNTIME})],
  ["evidence_binding_valid",()=>runBinding(bindSc,{})],
  ["authentication_status_exact_agreement",()=>assert.equal(assertAuthenticationStatus("VERIFIED","VERIFIED"),"VERIFIED")],
  ["credential_isolation",()=>{
    assert.ok(!unprivilegedWorkflow.includes("P1A_RUNTIME_APP_PRIVATE_KEY"),"unprivileged CI references App private key");
    assert.ok(!unprivilegedWorkflow.includes("create-github-app-token"),"unprivileged CI mints a privileged token");
    assert.ok(!unprivilegedWorkflow.includes("zbestmedia-ui"),"unprivileged CI fetches runtime repository");
    assert.ok(!trustedWorkflow.includes("pull_request_target"),"trusted workflow uses pull_request_target");
    assert.ok(trustedWorkflow.includes("environment: p1a-certification"),"trusted workflow lacks protected environment");
    assert.ok(trustedWorkflow.includes("github.event.repository.default_branch"),"trusted verifier is not sourced from default branch");
    assert.ok(trustedWorkflow.includes("persist-credentials: false"),"trusted checkout persists credentials");
  }]
];
const mutations=[
  ["wrong_candidate_sha",()=>runPackage({candidateSha:"0".repeat(40)})],
  ["wrong_base_sha",()=>{const m=clone(baseModel);m.sources.specification.revision="0".repeat(40);return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["wrong_runtime_pin",()=>{const m=clone(baseModel);m.sources.runtime.revision="0".repeat(40);return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_evidence_line",()=>{const e=clone(baseEvidence);e.references[0].lines="";return validateData(baseModel,e,baseManifest,baseMarkdown)}],
  ["unsupported_claim",()=>{const e=clone(baseEvidence);e.references[0].basis="CURRENT_TRUTH";return validateData(baseModel,e,baseManifest,baseMarkdown)}],
  ["duplicate_threat_id",()=>{const m=clone(baseModel);m.threats[1].id=m.threats[0].id;return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["duplicate_actor_id",()=>{const m=clone(baseModel);m.actors[1].id=m.actors[0].id;return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["orphan_threat",()=>{const m=clone(baseModel);m.threats[0].assets=[];return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["orphan_control",()=>{const m=clone(baseModel);m.controls[0].threatIds=[];return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_escalation_owner",()=>{const m=clone(baseModel);delete m.escalationPolicy.detectionOwnerActorId;return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["builder_self_approve",()=>{const m=clone(baseModel);m.authorityPolicy.rules.find(x=>x.actorId==="ACT-006"&&x.actionId==="AXN-008").decision="ALLOW";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["reviewer_mutates_subject",()=>{const m=clone(baseModel);m.authorityPolicy.rules.find(x=>x.actorId==="ACT-007"&&x.actionId==="AXN-003").decision="ALLOW";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["aegis_implements",()=>{const m=clone(baseModel);m.authorityPolicy.rules.find(x=>x.actorId==="ACT-012"&&x.actionId==="AXN-003").decision="ALLOW";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["agent_self_certifies",()=>{const m=clone(baseModel);m.authorityPolicy.rules.find(x=>x.actorId==="ACT-021"&&x.actionId==="AXN-011").decision="ALLOW";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["database_arbitrary_tenant",()=>{const m=clone(baseModel);m.authorityPolicy.rules.find(x=>x.actorId==="ACT-018"&&x.actionId==="AXN-006").decision="ALLOW";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["credential_false_resolution",()=>{const m=clone(baseModel);m.credentialClasses[3].status="RESOLVED";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["markdown_count_mismatch",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown.replace('"actors":22','"actors":21'))],
  ["markdown_only_threat",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown.replace("| THR-030 |","| THR-031 |"))],
  ["json_only_threat",()=>{const m=clone(baseModel);m.threats.pop();return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["invalid_cross_reference",()=>{const m=clone(baseModel);m.threats[0].assets=["AST-999"];return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_actor",()=>{const m=clone(baseModel);m.actors.pop();return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_required_threat",()=>{const m=clone(baseModel);m.threats[0].name="other";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["skipped_required_check",()=>{const m=clone(baseManifest);m.requiredTests.pop();return validateData(baseModel,baseEvidence,m,baseMarkdown)}],
  ["stale_evidence",()=>{const e=clone(baseEvidence);e.references[0].sha="1".repeat(40);return validateData(baseModel,e,baseManifest,baseMarkdown)}],
  ["unauthorized_extra_file",()=>{const m=clone(baseManifest);m.allowedRemediationFiles=[];return validateGit(m,head)}],
  ["missing_source_to_sink",()=>{const m=clone(baseModel);m.sourceToSinkPaths[0].sink="";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_tenant_propagation",()=>{const m=clone(baseModel);m.tenantPropagation.pop();return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_credential_field",()=>{const m=clone(baseModel);delete m.credentialClasses[0].lifetime;return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["dangling_escalation",()=>{const m=clone(baseModel);m.escalationChains.shift();return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["generic_escalation",()=>{const m=clone(baseModel);m.escalationChains[0].detectionSignal="generic alert";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["invalid_authority_owner",()=>{const m=clone(baseModel);m.authorityPolicy.rules[0].approvalOwnerActorId="ACT-999";return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["missing_retry_threat",()=>{const m=clone(baseModel);m.threats.pop();return validateData(m,baseEvidence,baseManifest,baseMarkdown)}],
  ["boundary_doc_conflict",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown.replace("`BND-004`, ",""))],
  ["unauthorized_deletion",()=>{
    const dir=mkdtempSync(path.join(tmpdir(),"p1a-delete-"));
    const g=(...args)=>execFileSync("git",args,{cwd:dir,stdio:"ignore"});
    try{
      g("init");g("config","user.email","p1a@example.invalid");g("config","user.name","P1-A Test");
      writeFileSync(path.join(dir,"keep.txt"),"base\n");writeFileSync(path.join(dir,"victim.txt"),"evidence\n");
      g("add",".");g("commit","-m","base");const base=execFileSync("git",["rev-parse","HEAD"],{cwd:dir,encoding:"utf8"}).trim();
      writeFileSync(path.join(dir,"keep.txt"),"candidate\n");rmSync(path.join(dir,"victim.txt"));g("add","-A");g("commit","-m","candidate");
      const candidate=execFileSync("git",["rev-parse","HEAD"],{cwd:dir,encoding:"utf8"}).trim();
      return validateGit({authorizedBaseSha:base,allowedRemediationFiles:["keep.txt"],requiredFiles:["keep.txt"]},candidate,dir);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }],
  // Evidence-binding false-greens reproduced in Phase 1 — each must now be REJECTED.
  ["runtime_pin_substitution",()=>{const m=clone(baseModel);m.sources.runtime.revision=ALT_RUNTIME;const man=clone(baseManifest);man.runtimeEvidenceSha=ALT_RUNTIME;const e=clone(baseEvidence);for(const r of e.references)if(r.repository===AUTHORIZED_REPOSITORIES.runtime)r.sha=ALT_RUNTIME;return assertTrustAnchor(m,e,man,{baseSha:ANCHOR_BASE,runtimePin:ANCHOR_RUNTIME});}],
  ["missing_trust_anchor",()=>assertTrustAnchor(baseModel,baseEvidence,baseManifest,null)],
  ["runtime_source_unavailable",()=>validateEvidenceBinding(baseEvidence,baseManifest,{specGitDir:path.join(tmpdir(),"p1a-nonexistent-spec.git"),runtimeGitDir:path.join(tmpdir(),"p1a-nonexistent-runtime.git")})],
  ["evidence_path_traversal",()=>runBinding(bindSc,{path:"../../../../etc/passwd"})],
  ["evidence_absolute_path",()=>runBinding(bindSc,{path:"/etc/shadow"})],
  ["inverted_line_range",()=>runBinding(bindSc,{lines:"900-1"})],
  ["out_of_bounds_line_range",()=>runBinding(bindSc,{lines:"1-9999"})],
  ["symlink_evidence",()=>runBinding(bindSc,{path:"link.txt"})],
  ["directory_evidence",()=>runBinding(bindSc,{path:"sub"})],
  ["blob_identity_mismatch",()=>runBinding(bindSc,{blobSha:"0".repeat(40)})],
  ["encoded_traversal",()=>runBinding(bindSc,{path:"%2e%2e%2f%2e%2e%2fetc%2fpasswd"})],
  ["percent_encoded_traversal",()=>runBinding(bindSc,{path:"%2E%2E%2Fboot"})],
  ["double_encoded_traversal",()=>runBinding(bindSc,{path:"%252e%252e%252fetc"})],
  ["dotdot_percent_slash",()=>runBinding(bindSc,{path:"..%2f..%2fetc"})],
  ["backslash_encoded_traversal",()=>runBinding(bindSc,{path:"%2e%2e%5cwindows"})],
  ["unicode_slash_traversal",()=>runBinding(bindSc,{path:"..∕etc∕passwd"})],
  ["wrong_repository",()=>{const e=clone(baseEvidence);e.references[0].repository="DarksiedCEO/zbestmedia-ui";return validateData(baseModel,e,baseManifest,baseMarkdown);}]
  ,["declared_not_proven_while_verified",()=>assertAuthenticationStatus("NOT_PROVEN","VERIFIED")]
  ,["declared_verified_while_not_verified",()=>assertAuthenticationStatus("VERIFIED","NOT_VERIFIED")]
  ,["stale_status_after_evidence_changes",()=>{
    assert.equal(assertAuthenticationStatus("VERIFIED","VERIFIED"),"VERIFIED");
    return assertAuthenticationStatus("VERIFIED","NOT_VERIFIED");
  }]
];

let passed=0;
for(const [name,test] of positives){test();passed++;console.log(`PASS positive:${name}`);}
for(const [name,test] of mutations){
  let rejected=false;
  try{test()}catch{rejected=true}
  assert.ok(rejected,`negative mutation passed: ${name}`);
  passed++;console.log(`PASS negative:${name}`);
}
bindSc.cleanup();
const required=positives.length+mutations.length;
const totals={required,executed:required,passed,failed:0,skipped:0,cancelled:0,neutral:0,stale:0};
assert.equal(passed,required);
console.log(JSON.stringify({suite:"p1-a-validator-controls",positive:positives.length,negative:mutations.length,...totals}));
