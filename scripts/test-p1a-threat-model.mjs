import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REQUIRED_ACTORS, REQUIRED_THREATS, validateData, runPackage } from "./validate-p1a-threat-model.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const load=(p)=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const clone=(x)=>structuredClone(x);
const baseModel=load("docs/security/p1-a/model.json");
const baseEvidence=load("docs/security/p1-a/evidence-register.json");
const baseManifest=load("docs/security/p1-a/validation-manifest.json");
const baseMarkdown=readFileSync(path.join(root,"docs/security/p1-a/threat-model.md"),"utf8");
const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();

const positives=[
  ["complete_threat_trace",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)],
  ["valid_authority_rule_set",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)],
  ["valid_credential_entry",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)],
  ["valid_tenant_operation",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)],
  ["complete_escalation_chain",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)],
  ["consistent_package",()=>validateData(baseModel,baseEvidence,baseManifest,baseMarkdown)]
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
  ["unauthorized_extra_file",()=>{const m=clone(baseManifest);m.allowedRemediationFiles=[];return runPackage({candidateSha:head})}]
];

let passed=0;
for(const [name,test] of positives){test();passed++;console.log(`PASS positive:${name}`);}
for(const [name,test] of mutations){
  let rejected=false;
  try{test()}catch{rejected=true}
  assert.ok(rejected,`negative mutation passed: ${name}`);
  passed++;console.log(`PASS negative:${name}`);
}
const required=positives.length+mutations.length;
const totals={required,executed:required,passed,failed:0,skipped:0,cancelled:0,neutral:0,stale:0};
assert.equal(passed,required);
console.log(JSON.stringify({suite:"p1-a-validator-controls",positive:positives.length,negative:mutations.length,...totals}));
