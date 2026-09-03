import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStrictJson, canonicalDigest } from "./p1a/canonical-json.mjs";
import { REQUIRED_AUTHORITY_IDS, selectManifest, validateV2Manifest } from "./p1a/manifest-lifecycle.mjs";
import { compareActivationEvidence } from "./p1a/activation-decision.mjs";
import { evaluateGovernedPendingActivation } from "./p1a/activation-entrypoint.mjs";
import Ajv2020 from "ajv/dist/2020.js";

const v1=parseStrictJson(readFileSync(".github/p1a/certification-contract.v1.json"));
const v2=parseStrictJson(readFileSync(".github/p1a/certification-contract.v2.json"));
const tests=[]; const positive=(name,fn)=>tests.push([name,fn]);
const negative=(name,code,fn)=>tests.push([name,()=>assert.throws(fn,(e)=>e.code===code||e.message===code)]);
positive("exact_16_authorities",()=>assert.equal(validateV2Manifest(v2).authorityCount,16));
positive("v1_active_v2_pending",()=>assert.deepEqual(selectManifest({v1,v2}),{active:v1,pending:v2,activeCount:1,state:"V1_ACTIVE_V2_PENDING"}));
positive("authority_set_exact",()=>assert.deepEqual(v2.authorities.map((x)=>x.authority_id),REQUIRED_AUTHORITY_IDS));
positive("future_producer_parity",()=>validateV2Manifest(v2,{consumers:v2.consumerAuthorityBindings,futureProducers:v2.futureProducerContracts}));
positive("canonical_manifest_digest",()=>assert.match(canonicalDigest(v2),/^[0-9a-f]{64}$/));
negative("self_activation","MANIFEST_SELF_ACTIVATION",()=>validateV2Manifest({...v2,active:true}));
negative("wrong_lifecycle","MANIFEST_SELF_ACTIVATION",()=>validateV2Manifest({...v2,lifecycleState:"ACTIVE"}));
negative("remote_authorized_locally","MANIFEST_SELF_ACTIVATION",()=>validateV2Manifest({...v2,remoteAuthorized:true}));
negative("fifteen_of_sixteen","AUTHORITY_SET_MISMATCH",()=>validateV2Manifest({...v2,authorities:v2.authorities.slice(1)}));
negative("extra_optional_as_required","AUTHORITY_SET_MISMATCH",()=>validateV2Manifest({...v2,authorities:[...v2.authorities,{...v2.authorities[0],authority_id:"pr16_historical_source_fallback"}]}));
negative("correct_count_wrong_member","AUTHORITY_SET_MISMATCH",()=>validateV2Manifest({...v2,authorities:v2.authorities.map((x,i)=>i?x:{...x,authority_id:"attacker"})}));
negative("semantic_alias","AUTHORITY_ALIAS_DUPLICATE",()=>validateV2Manifest({...v2,authorities:v2.authorities.map((x,i)=>i===1?{...x,semantic_role:v2.authorities[0].semantic_role}:x)}));
negative("root_alias","AUTHORITY_BINDING_ALIAS",()=>validateV2Manifest({...v2,authorities:v2.authorities.map((x,i)=>i===1?{...x,environment_binding:v2.authorities[0].environment_binding}:x)}));
negative("consumer_membership_mismatch","PRODUCER_CONSUMER_MANIFEST_MISMATCH",()=>validateV2Manifest(v2,{consumers:v2.consumerAuthorityBindings.map((x)=>({...x,authority_ids:x.authority_ids.filter((id)=>id!=="ancestry_authority")})),futureProducers:v2.futureProducerContracts}));
negative("producer_membership_mismatch","PRODUCER_CONSUMER_MANIFEST_MISMATCH",()=>validateV2Manifest(v2,{consumers:v2.consumerAuthorityBindings,futureProducers:v2.futureProducerContracts.slice(1)}));
for(const key of ["activationRecordBytes","expectedActivationDigest","observed","authorityPath","repositoryPath","activationRecord","expectedBinding","manifestPath","changedFiles","diffBase","orderedParents"])
  negative(`caller_forbidden_${key}`,"REJECT_CALLER_SELECTED_ACTIVATION_BINDING",()=>selectManifest({v1,v2,[key]:{}}));
negative("production_entrypoint_takes_no_claims","REJECT_CALLER_SELECTED_ACTIVATION_BINDING",()=>evaluateGovernedPendingActivation({expected:"attacker"}));

const sha=(n)=>n.repeat(40), digest=(n)=>n.repeat(64);
const changedFiles=Object.freeze([{path:".github/p1a/certification-contract.v2.json",status:"A",oldBlob:null,newBlob:sha("4")}]);
const observedClaims=Object.freeze({changedFiles,manifestBlob:sha("4"),manifestByteCount:4312,manifestPath:".github/p1a/certification-contract.v2.json",manifestSha256:digest("5"),orderedParents:[sha("3")],parentCount:1,successorSha:sha("1"),successorTree:sha("2")});
const expectedClaims=Object.freeze({...observedClaims,aegisArtifactSha256:digest("7"),bundleSha256:digest("6"),founderAuthorized:true,remoteProvenance:"VERIFIED",rollbackTarget:"62cbb8a90099e647ef7d91ecec7898f701babf8a"});
const expected=Object.freeze({custodyDomain:"founder_bootstrap_authority",claims:expectedClaims});
const observed=Object.freeze({custodyDomain:"observed_git_repository",claims:observedClaims});
positive("activation_schema_runtime_parity",()=>{const schema=parseStrictJson(readFileSync(".github/p1a/manifest-activation.v1.schema.json"));const validate=new Ajv2020({strict:true,allErrors:true}).compile(schema);assert.equal(validate({schemaVersion:"p1a-manifest-activation/v1",aegisVerdict:"GREEN",...expectedClaims}),true,JSON.stringify(validate.errors));});
positive("independent_evidence_matches",()=>assert.deepEqual(compareActivationEvidence(expected,observed),{decision:"MATCH",code:"INDEPENDENT_ACTIVATION_EVIDENCE_MATCH",successorSha:sha("1")}));
negative("same_custody","ACTIVATION_AUTHORITY_NOT_INDEPENDENT",()=>compareActivationEvidence({...expected,custodyDomain:observed.custodyDomain},observed));
for(const key of ["successorSha","successorTree","manifestBlob"])
  negative(`wrong_${key}`,"ACTIVATION_IDENTITY_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,[key]:sha("8")}},observed));
negative("wrong_manifest_digest","ACTIVATION_IDENTITY_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,manifestSha256:digest("8")}},observed));
negative("wrong_manifest_byte_count","ACTIVATION_IDENTITY_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,manifestByteCount:4313}},observed));
for(const manifestPath of ["/github/p1a/certification-contract.v2.json","../certification-contract.v2.json",".github//p1a/certification-contract.v2.json",".github\\p1a\\certification-contract.v2.json",".github/p1a/certification-contract.v2%2ejson",".github/p1a/certification-contract.v1.json",".GITHUB/p1a/certification-contract.v2.json"])
  negative(`wrong_manifest_path_${manifestPath}`,"ACTIVATION_MANIFEST_PATH_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,manifestPath}},observed));
negative("observed_manifest_path_substitution","ACTIVATION_MANIFEST_PATH_MISMATCH",()=>compareActivationEvidence(expected,{...observed,claims:{...observedClaims,manifestPath:".github/p1a/certification-contract.v1.json"}}));
negative("missing_changed_file","ACTIVATION_CHANGED_FILES_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[...changedFiles,{path:"scripts/x.mjs",status:"A",oldBlob:null,newBlob:sha("8")}] }},observed));
negative("extra_observed_changed_file","ACTIVATION_CHANGED_FILES_MISMATCH",()=>compareActivationEvidence(expected,{...observed,claims:{...observedClaims,changedFiles:[...changedFiles,{path:"scripts/x.mjs",status:"A",oldBlob:null,newBlob:sha("8")}]}}));
negative("reordered_changed_files","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{path:"z",status:"A",oldBlob:null,newBlob:sha("8")},...changedFiles]}},observed));
negative("duplicate_changed_file","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[...changedFiles,...changedFiles]}},observed));
negative("wrong_changed_status","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{...changedFiles[0],status:"D"}]}},observed));
negative("invalid_changed_status","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{...changedFiles[0],status:"R"}]}},observed));
negative("invalid_changed_blob","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{...changedFiles[0],newBlob:"invalid"}]}},observed));
negative("wrong_changed_blob","ACTIVATION_CHANGED_FILES_MISMATCH",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{...changedFiles[0],newBlob:sha("8")}]}},observed));
negative("changed_path_alias","ACTIVATION_DIFF_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,changedFiles:[{...changedFiles[0],path:".github//p1a/certification-contract.v2.json"}]}},observed));
negative("wrong_parent_order","ACTIVATION_TOPOLOGY_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,orderedParents:[sha("9")]}},observed));
negative("extra_parent","ACTIVATION_TOPOLOGY_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,orderedParents:[sha("3"),sha("9")],parentCount:2}},observed));
negative("wrong_activation_rollback","ACTIVATION_TOPOLOGY_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,rollbackTarget:sha("0")}},observed));
negative("founder_not_authorized","ACTIVATION_AUTHORITY_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,founderAuthorized:false}},observed));
negative("remote_not_verified","ACTIVATION_REMOTE_PROVENANCE_REQUIRED",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,remoteProvenance:"PENDING"}},observed));
negative("missing_aegis_binding","ACTIVATION_AUTHORITY_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,aegisArtifactSha256:""}},observed));
negative("extra_expected_claim","ACTIVATION_EVIDENCE_SHAPE_INVALID",()=>compareActivationEvidence({...expected,claims:{...expectedClaims,attacker:true}},observed));
negative("extra_observed_claim","ACTIVATION_EVIDENCE_SHAPE_INVALID",()=>compareActivationEvidence(expected,{...observed,claims:{...observedClaims,expectedDigest:digest("a")}}));
negative("rollback_unknown","ROLLBACK_TARGET_INVALID",()=>validateV2Manifest({...v2,previousContract:{...v2.previousContract,rollbackTarget:sha("0")}}));

let passed=0; for(const [name,fn] of tests){fn();passed++;console.log(`PASS ${name}`);} console.log(JSON.stringify({suite:"p1a-manifest-successor",required:tests.length,executed:tests.length,passed,failed:0,skipped:0}));
