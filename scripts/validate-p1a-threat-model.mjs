import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const unique = (xs, label) => assert.equal(new Set(xs).size, xs.length, `${label}: duplicate`);
const exists = (xs, id, label) => assert.ok(xs.some((x) => x.id === id), `${label}: ${id}`);

export const REQUIRED_ACTORS = ["founder","authorized human operator","authenticated client user","tenant administrator","workspace member","builder","reviewer","Security Reviewer","Reliability Reviewer","Test Verification Reviewer","Release Guardian","AEGIS","Embedded Red Team","Embedded Sentinel","external Master Sentinel","application service","background worker","database service role","credential custodian","emergency responder","agent","tool executor"];
export const REQUIRED_THREATS = ["SSRF","DNS rebinding","metadata-service access","tenant spoofing","workspace spoofing","cross-tenant access","horizontal privilege escalation","vertical privilege escalation","confused deputy","service-account misuse","background-job context forgery","artifact enumeration","artifact substitution","evidence forgery","stale evidence reuse","approval forgery","approval replay","reviewer impersonation","self-certification","CI bypass","credential leakage","credential misuse","SHA substitution","malicious pull request","tool privilege escalation","prompt injection or poisoned tool result","duplicate execution","race condition","rollback failure audit-log tampering or Sentinel suppression","emergency-access abuse","retry amplification exhaustion or permanent-failure loop"];
export const REQUIRED_CHECKS = ["manifest_identity","file_scope","evidence_integrity","required_coverage","id_uniqueness","cross_references","authority_completeness","separation_rules","tenant_operations","credential_custody","escalation_completeness","documentation_consistency","negative_controls"];

export function validateData(model, evidence, manifest, markdown, opts = {}) {
  assert.equal(model.sources.specification.revision, manifest.authorizedBaseSha, "wrong base SHA");
  assert.equal(model.sources.runtime.revision, manifest.runtimeEvidenceSha, "wrong runtime evidence pin");
  assert.deepEqual(manifest.requiredTests, REQUIRED_CHECKS, "required tests changed or skipped");
  assert.deepEqual(model.gate, {runtimeChanged:false,productionClaimed:false,p1bAuthorized:false,selfCertified:false});

  for (const [name, rows] of Object.entries({actors:model.actors,attackers:model.attackerProfiles,actions:model.actions,assets:model.assets,boundaries:model.boundaries,flows:model.flows,paths:model.sourceToSinkPaths,propagation:model.tenantPropagation,controls:model.controls,threats:model.threats,tenantOperations:model.tenantOperations,credentialClasses:model.credentialClasses,escalations:model.escalationChains,founderDecisions:model.founderDecisions,assumptions:model.assumptions,evidence:evidence.references})) unique(rows.map((x)=>x.id), name);
  assert.deepEqual(model.actors.map((x)=>x.name), REQUIRED_ACTORS, "missing actor coverage");
  assert.deepEqual(model.threats.map((x)=>x.name), REQUIRED_THREATS, "missing required threat or duplicate semantics");
  assert.equal(model.actions.length, 28);
  assert.equal(model.actors.length * model.actions.length, 616);
  assert.equal(model.tenantOperations.length, 18);
  assert.equal(model.credentialClasses.length, 10);

  for (const ref of evidence.references) {
    assert.match(ref.sha, /^[0-9a-f]{40}$/);
    assert.match(ref.lines, /^\d+-\d+$/, `${ref.id}: missing evidence line range`);
    assert.ok(["DIRECT","INFERRED","UNRESOLVED"].includes(ref.basis));
    assert.ok(["HIGH","MEDIUM","LOW"].includes(ref.confidence));
    assert.ok(ref.path && ref.claim && ref.category);
    assert.ok([manifest.authorizedBaseSha,manifest.runtimeEvidenceSha].includes(ref.sha), `${ref.id}: stale evidence SHA`);
  }
  const evidenceIds = new Set(evidence.references.map((x)=>x.id));
  const actorIds = new Set(model.actors.map((x)=>x.id));
  const boundaryIds = new Set(model.boundaries.map((x)=>x.id));
  const flowIds = new Set(model.flows.map((x)=>x.id));
  const assetIds = new Set(model.assets.map((x)=>x.id));
  const attackerIds = new Set(model.attackerProfiles.map((x)=>x.id));
  const controlIds = new Set(model.controls.map((x)=>x.id));
  const threatIds = new Set(model.threats.map((x)=>x.id));
  for (const p of model.sourceToSinkPaths) {
    assert.ok(p.source&&p.hops.length&&p.sink&&p.consequence,`${p.id}: incomplete source-to-sink path`);
    assert.ok(boundaryIds.has(p.entryBoundaryId)&&flowIds.has(p.flowId));
    for(const id of [...p.threatIds]) assert.ok(threatIds.has(id));
    for(const id of p.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  assert.equal(model.tenantPropagation.length,7);
  for(const p of model.tenantPropagation) {
    assert.ok(p.stage&&p.trustedSource&&p.tenantDerivation&&p.workspaceDerivation&&p.status&&p.next,`${p.id}: incomplete tenant propagation`);
    for(const id of p.threatIds) assert.ok(threatIds.has(id));
    for(const id of p.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  for (const row of [...model.boundaries,...model.flows]) for (const id of row.evidenceRefs) assert.ok(evidenceIds.has(id), `${row.id}: invalid evidence ref ${id}`);
  for (const t of model.threats) {
    assert.ok(t.assets.length && t.attackers.length && t.boundaries.length && t.flows.length && t.evidenceRefs.length && t.controlIds.length && t.escalationId === `ESC-${t.id}`, `${t.id}: orphan threat`);
    for (const id of t.assets) assert.ok(assetIds.has(id));
    for (const id of t.attackers) assert.ok(attackerIds.has(id));
    for (const id of t.boundaries) assert.ok(boundaryIds.has(id));
    for (const id of t.flows) assert.ok(flowIds.has(id));
    for (const id of t.evidenceRefs) assert.ok(evidenceIds.has(id));
    for (const id of t.controlIds) assert.ok(controlIds.has(id));
  }
  for (const c of model.controls) {
    assert.ok(c.threatIds.length, `${c.id}: orphan control`);
    for (const id of c.threatIds) assert.ok(threatIds.has(id));
    for (const id of c.threatIds) assert.ok(model.threats.find((t)=>t.id===id).controlIds.includes(c.id), `${c.id}: reverse mapping missing`);
  }
  assert.equal(model.authorityPolicy.actorOverrides.length, model.actors.length);
  for (const o of model.authorityPolicy.actorOverrides) {
    assert.ok(actorIds.has(o.actorId));
    const all = [...o.allow,...o.scoped,...o.human];
    unique(all, `${o.actorId} authority actions`);
    for (const id of all) exists(model.actions,id,"action");
  }
  assert.equal(model.authorityPolicy.rules.length,616,"authority matrix must materialize 616 rules");
  unique(model.authorityPolicy.rules.map((r)=>r.id),"authority rules");
  unique(model.authorityPolicy.rules.map((r)=>`${r.actorId}:${r.actionId}`),"authority pairs");
  for(const a of model.actors) for(const x of model.actions) assert.ok(model.authorityPolicy.rules.some((r)=>r.actorId===a.id&&r.actionId===x.id),`missing authority pair ${a.id}/${x.id}`);
  for(const r of model.authorityPolicy.rules) {
    assert.ok(actorIds.has(r.actorId)&&actorIds.has(r.approvalOwnerActorId)&&actorIds.has(r.executionOwnerActorId)&&actorIds.has(r.reviewOwnerActorId)&&actorIds.has(r.certificationOwnerActorId)&&actorIds.has(r.credentialAuthorityActorId)&&actorIds.has(r.escalationOwnerActorId)&&actorIds.has(r.evidenceOwnerActorId),`${r.id}: invalid authority owner`);
    exists(model.actions,r.actionId,"action");
    assert.ok(model.authorityPolicy.decisions.includes(r.decision),`${r.id}: invalid decision`);
  }
  const decision = (actorId, actionId) => model.authorityPolicy.rules.find((r)=>r.actorId===actorId&&r.actionId===actionId).decision;
  const denied = (a,x)=>assert.equal(decision(a,x),"DENY",`${a} must deny ${x}`);
  for(const x of ["AXN-008","AXN-010","AXN-011"]) denied("ACT-006",x);
  for(const a of ["ACT-007","ACT-008","ACT-009","ACT-010","ACT-011","ACT-012"]) for(const x of ["AXN-002","AXN-003"]) denied(a,x);
  for(const x of ["AXN-002","AXN-003"]) denied("ACT-013",x);
  for(const a of ["ACT-014","ACT-015"]) denied(a,"AXN-011");
  for(const x of ["AXN-007","AXN-008","AXN-010","AXN-011"]) denied("ACT-021",x);
  for(const a of model.actors.map((x)=>x.id)) denied(a,"AXN-006");
  denied("ACT-018","AXN-028"); denied("ACT-019","AXN-025");
  for(const r of model.authorityPolicy.rules.filter((x)=>["AXN-002","AXN-003"].includes(x.actionId)&&x.decision!=="DENY")) {
    assert.notEqual(r.executionOwnerActorId,r.approvalOwnerActorId,`${r.id}: implementer owns approval`);
    assert.notEqual(r.executionOwnerActorId,r.reviewOwnerActorId,`${r.id}: implementer owns review`);
    assert.notEqual(r.executionOwnerActorId,r.certificationOwnerActorId,`${r.id}: implementer owns certification`);
  }
  assert.equal(decision("ACT-013","AXN-002"),"DENY","Red Team cannot repair");
  assert.equal(decision("ACT-014","AXN-011"),"DENY","Sentinel cannot certify");
  assert.equal(decision("ACT-015","AXN-011"),"DENY","Master Sentinel cannot certify");
  assert.equal(decision("ACT-019","AXN-008"),"DENY","credential custodian cannot bypass approval evidence");
  assert.equal(decision("ACT-020","AXN-028"),"ALLOW_WITH_HUMAN_APPROVAL","emergency elevation must require human approval");
  assert.ok(model.authorityPolicy.separationRules.find((x)=>x.id==="SEP-009").statement.includes("logged"),"emergency elevation logging/review absent");

  assert.equal(model.tenantOperationPolicy.status,"FOUNDER_DECISION_REQUIRED");
  assert.equal(model.tenantOperationPolicy.denialBehavior,"DENY_AND_LOG");
  for(const c of model.credentialClasses) {
    for(const key of ["custodianActorId","creatorActorIds","authorizedReaderActorIds","authorizedUserActorIds","rotationAuthorityActorIds","revocationAuthorityActorIds","storageBoundary","deliveryMechanism","lifetime","auditEvent","emergencyProcedure","evidenceRefs","founderDecisionId"]) assert.ok(c[key]!==undefined,`${c.id}: missing credential field ${key}`);
    assert.ok(actorIds.has(c.custodianActorId));
    for(const id of [...c.creatorActorIds,...c.authorizedReaderActorIds,...c.authorizedUserActorIds,...c.rotationAuthorityActorIds,...c.revocationAuthorityActorIds]) assert.ok(actorIds.has(id));
    for(const id of c.evidenceRefs) assert.ok(evidenceIds.has(id));
  }
  for(const c of model.credentialClasses.slice(2)) assert.equal(c.status,"FOUNDER_DECISION_REQUIRED","unresolved credential authority represented as resolved");
  assert.equal(model.credentialPolicy.readerActorIds.length,0,"raw credential readers must remain unresolved/empty");
  for(const key of ["detectionOwnerActorId","triageOwnerActorId","remediationOwnerActorId","approvalOwnerActorId","certificationOwnerActorId","closureAuthorityActorId"]) assert.ok(actorIds.has(model.escalationPolicy[key]),`missing escalation owner ${key}`);
  assert.equal(model.escalationChains.length,model.threats.length);
  for(const t of model.threats) {
    const e=model.escalationChains.find((x)=>x.id===t.escalationId&&x.threatId===t.id);
    assert.ok(e,`${t.id}: dangling escalation`);
    for(const key of ["detectionOwnerActorId","triageOwnerActorId","containmentOwnerActorId","remediationOwnerActorId","approvalOwnerActorId","certificationOwnerActorId","closureAuthorityActorId"]) assert.ok(actorIds.has(e[key]),`${e.id}: missing ${key}`);
    assert.ok(e.detectionSignal&&e.recoveryOrRollback&&e.founderEscalationCondition&&e.closureEvidenceRequired.length,`${e.id}: incomplete escalation`);
  }

  const match=markdown.match(/```json p1a-summary\n([^\n]+)\n```/);
  assert.ok(match,"documentation summary absent");
  const summary=JSON.parse(match[1]);
  assert.deepEqual(summary,{actors:model.actors.length,actions:model.actions.length,authorityRules:model.authorityPolicy.rules.length,assets:model.assets.length,trustBoundaries:model.boundaries.length,dataFlows:model.flows.length,sourceToSinkPaths:model.sourceToSinkPaths.length,tenantPropagationStages:model.tenantPropagation.length,threats:model.threats.length,controls:model.controls.length,tenantOperations:model.tenantOperations.length,credentialClasses:model.credentialClasses.length,escalationChains:model.escalationChains.length,founderDecisions:model.founderDecisions.length,sourceEvidenceReferences:evidence.references.length},"Markdown/JSON count mismatch");
  const mdThreatIds=[...markdown.matchAll(/\| (THR-\d{3}) \|/g)].map((m)=>m[1]);
  assert.deepEqual(mdThreatIds,model.threats.map((x)=>x.id),"Markdown-only or JSON-only threat");
  for(const t of model.threats) assert.ok(markdown.includes(`| ${t.id} | ${t.name.replaceAll(" or ", ", ")} | ${t.severity} |`)||markdown.includes(`| ${t.id} | ${t.name} | ${t.severity} |`),`${t.id}: threat name/severity documentation mismatch`);
  for(const b of model.boundaries) assert.ok(markdown.includes(b.id),`${b.id}: boundary missing from documentation`);
  for(const d of model.founderDecisions) assert.ok(markdown.includes(d.id),`${d.id}: founder decision missing from documentation`);
  for(const s of model.authorityPolicy.separationRules) assert.ok(markdown.includes(s.statement.split(" ").slice(0,3).join(" "))||markdown.includes(s.id),`${s.id}: authority narrative missing`);
  for(const ref of [...markdown.matchAll(/\[(EV-[A-Z0-9-]+)\]/g)].map((m)=>m[1])) assert.ok(evidenceIds.has(ref),`invalid Markdown evidence ${ref}`);
  return { authorityRules:model.actors.length*model.actions.length, decision };
}

export function validateGit(manifest, candidateSha) {
  assert.ok(candidateSha, "candidate SHA absent");
  const before=git("rev-parse","HEAD");
  assert.equal(candidateSha,before,"candidate SHA does not equal checked-out HEAD");
  assert.equal(git("merge-base","--is-ancestor",manifest.authorizedBaseSha,before),"","authorized base is not ancestor");
  const changed=git("diff","--name-only","--diff-filter=ACMRT",`${manifest.authorizedBaseSha}..${before}`).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed,[...manifest.allowedRemediationFiles].sort(),"unauthorized extra file in scope or required diff file absent");
  for(const file of manifest.requiredFiles) {
    const stat=lstatSync(path.join(root,file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(),`${file}: missing or unsafe`);
  }
  assert.equal(git("status","--porcelain"),"","dirty worktree");
  assert.equal(git("rev-parse","HEAD"),before,"HEAD moved during validation");
  return before;
}

export function runPackage({candidateSha, runGit=true}={}) {
  const model=load("docs/security/p1-a/model.json");
  const evidence=load("docs/security/p1-a/evidence-register.json");
  const manifest=load("docs/security/p1-a/validation-manifest.json");
  const markdown=readFileSync(path.join(root,"docs/security/p1-a/threat-model.md"),"utf8");
  const result=validateData(model,evidence,manifest,markdown);
  const head=runGit?validateGit(manifest,candidateSha):candidateSha;
  return {model,evidence,manifest,head,...result};
}

function main(){
  const arg=process.argv.indexOf("--candidate-sha");
  const candidate=arg>=0?process.argv[arg+1]:process.env.P1A_CANDIDATE_SHA;
  const names=[...REQUIRED_CHECKS];
  const totals={required:names.length,executed:0,passed:0,failed:0,skipped:0,cancelled:0,neutral:0,stale:0};
  let out;
  for(const name of names){
    totals.executed++;
    try { out=runPackage({candidateSha:candidate,runGit:true}); totals.passed++; console.log(`PASS ${name}`); }
    catch(error){totals.failed++;console.error(`FAIL ${name}: ${error.message}`);}
  }
  console.log(JSON.stringify({suite:"p1-a-threat-model",candidateSha:out?.head??candidate??null,...totals,authorityRules:out?.authorityRules??null,threats:out?.model.threats.length??null,controls:out?.model.controls.length??null}));
  if(totals.executed!==totals.required||totals.passed!==totals.required||totals.failed||totals.skipped||totals.cancelled||totals.neutral||totals.stale) process.exitCode=1;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main();
