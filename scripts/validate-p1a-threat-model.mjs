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
export const REQUIRED_CHECKS = ["manifest_identity","trust_anchor","file_scope","evidence_integrity","evidence_binding","required_coverage","id_uniqueness","cross_references","authority_completeness","separation_rules","tenant_operations","credential_custody","escalation_completeness","documentation_consistency","negative_controls"];

// Runtime evidence must bind to these exact repositories. base-sha evidence resolves in the
// specification repo; runtime-pin evidence resolves in the runtime repo. Any other pairing is spoofing.
export const AUTHORIZED_REPOSITORIES = { base: "DarksiedCEO/zbestmedia", runtime: "DarksiedCEO/zbestmedia-ui" };

// A control that cannot be evaluated (missing external trust anchor, unreachable object store,
// unauthenticated cross-repository read) is NOT_VERIFIED and blocks — it is never silently PASS.
export class NotVerifiedError extends Error {
  constructor(message){ super(message); this.name="NotVerifiedError"; this.notVerified=true; }
}

export function parseLineRange(spec, label){
  const m=/^(\d+)-(\d+)$/.exec(spec);
  assert.ok(m,`${label}: malformed line range ${JSON.stringify(spec)}`);
  const start=Number(m[1]), end=Number(m[2]);
  assert.ok(Number.isInteger(start)&&Number.isInteger(end),`${label}: non-integer line range`);
  assert.ok(start>=1,`${label}: line range start must be >= 1 (${start})`);
  assert.ok(end>=start,`${label}: inverted line range ${start}-${end}`);
  return {start,end};
}

export function assertSafeRepoPath(p, label){
  assert.ok(typeof p==="string"&&p.length>0,`${label}: empty evidence path`);
  assert.ok(!p.includes("\0"),`${label}: NUL byte in path`);
  // Printable-ASCII only: rejects unicode slash/backslash lookalikes (U+2044/2215/2216/FF0F/FF3C),
  // zero-width, and control characters that could smuggle a separator past the segment checks.
  assert.ok(/^[\x20-\x7e]+$/.test(p),`${label}: non-ASCII or control character in path`);
  // Explicitly reject percent-encoded sequences (%2e %2f %5c and their double-encoded %25xx forms)
  // rather than relying on the referenced blob not existing.
  assert.ok(!/%[0-9a-fA-F]{2}/.test(p),`${label}: percent-encoded sequence in path (${p})`);
  assert.ok(!p.includes("\\"),`${label}: backslash in path`);
  assert.ok(!p.startsWith("/"),`${label}: absolute path not allowed (${p})`);
  assert.ok(!/^[A-Za-z]:/.test(p),`${label}: drive-absolute path not allowed (${p})`);
  const segs=p.split("/");
  assert.ok(!segs.includes("..")&&!segs.includes("."),`${label}: path traversal segment (${p})`);
  assert.ok(!segs.some((s)=>s===""),`${label}: empty path segment (${p})`);
  const norm=path.posix.normalize(p);
  assert.ok(norm===p&&!norm.startsWith("..")&&!path.posix.isAbsolute(norm),`${label}: non-normalized or escaping path (${p})`);
  return norm;
}

export function repoForSha(sha, manifest){
  if(sha===manifest.authorizedBaseSha) return AUTHORIZED_REPOSITORIES.base;
  if(sha===manifest.runtimeEvidenceSha) return AUTHORIZED_REPOSITORIES.runtime;
  return null;
}

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
    // Static evidence hardening (no repository/network access required): reject traversal/absolute
    // paths, inverted/zero-based ranges, missing blob identity, and repository/SHA mismatches.
    parseLineRange(ref.lines, ref.id);
    assertSafeRepoPath(ref.path, ref.id);
    assert.match(ref.blobSha ?? "", /^[0-9a-f]{40}$/, `${ref.id}: missing or malformed blob identity`);
    const expectedRepo = repoForSha(ref.sha, manifest);
    assert.ok(expectedRepo, `${ref.id}: evidence SHA is not an authorized pin`);
    assert.equal(ref.repository, expectedRepo, `${ref.id}: repository/SHA mismatch (repository ${ref.repository} vs sha resolves to ${expectedRepo})`);
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
    assert.ok(e.requiredDetectionTokens.length>=2&&e.requiredDetectionTokens.every((token)=>e.detectionSignal.includes(token)),`${e.id}: generic or semantically incomplete detection signal`);
    assert.ok(!e.recoveryOrRollback.includes(`contain ${t.name},`),`${e.id}: templated recovery posture`);
  }
  unique(model.escalationChains.map((x)=>x.detectionSignal),"escalation detection signals");
  unique(model.escalationChains.map((x)=>x.recoveryOrRollback),"escalation recovery postures");
  assert.equal(model.retryPolicy.status,"PROPOSED_CONTROL_NOT_IMPLEMENTED");
  assert.deepEqual(model.retryPolicy.classes.map((x)=>x.class),["PERMANENT","TRANSIENT","THROTTLED","UNKNOWN"]);
  assert.ok(model.retryPolicy.classes.every((x)=>x.examples.length&&x.action));
  assert.ok(model.retryPolicy.backoff.maxAttempts>0&&model.retryPolicy.backoff.capMs>=model.retryPolicy.backoff.baseMs);
  assert.ok(model.retryPolicy.budget.exhaustionAction&&model.retryPolicy.quarantine.releaseCriteria.length>=4);
  assert.equal(model.retryPolicy.implementationClaim,false);

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

// External trust anchor: the authorized base + runtime pins are supplied out-of-band (operator CLI /
// CI secret), NOT read from candidate-controlled files. The candidate's self-declared pins must match
// the anchor exactly, which defeats coordinated SHA substitution (e.g. runtime pin -> alternate commit).
// Absent anchor => NOT_VERIFIED (fail-closed), never PASS.
export function assertTrustAnchor(model, evidence, manifest, anchor){
  if(!anchor||!anchor.baseSha||!anchor.runtimePin)
    throw new NotVerifiedError("trust anchor absent: external authorized base/runtime pins not supplied (fail-closed)");
  assert.match(anchor.baseSha,/^[0-9a-f]{40}$/,"external anchor baseSha malformed");
  assert.match(anchor.runtimePin,/^[0-9a-f]{40}$/,"external anchor runtimePin malformed");
  assert.equal(manifest.authorizedBaseSha,anchor.baseSha,"manifest base SHA does not match external trust anchor (substitution)");
  assert.equal(manifest.runtimeEvidenceSha,anchor.runtimePin,"manifest runtime pin does not match external trust anchor (substitution)");
  assert.equal(model.sources.specification.revision,anchor.baseSha,"model base revision does not match external trust anchor");
  assert.equal(model.sources.runtime.revision,anchor.runtimePin,"model runtime revision does not match external trust anchor");
  for(const ref of evidence.references){
    const expected=ref.repository===AUTHORIZED_REPOSITORIES.runtime?anchor.runtimePin:anchor.baseSha;
    assert.equal(ref.sha,expected,`${ref.id}: evidence SHA does not match external trust anchor (substitution)`);
  }
}

// Resolve every evidence reference against real repository objects using a read-only object query
// (git cat-file / ls-tree) against isolated object stores — never a checkout, so no worktree is dirtied.
// Enforces: commit + path existence, regular-file mode (rejects symlink/tree), immutable blob-OID
// identity, and that the cited range fits within the real line count. Unreachable store => NOT_VERIFIED.
export function validateEvidenceBinding(evidence, manifest, opts={}){
  const {specGitDir,runtimeGitDir}=opts;
  if(!specGitDir||!runtimeGitDir)
    throw new NotVerifiedError("evidence binding not verified: specification/runtime object sources not supplied (fail-closed)");
  const gitRead=(gitdir,args)=>{
    try{ return execFileSync("git",["--git-dir",gitdir,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}); }
    catch(e){ throw new NotVerifiedError(`read-only object query failed in ${gitdir}: ${String(e.message).split("\n")[0]}`); }
  };
  for(const [gitdir,sha,tag] of [[specGitDir,manifest.authorizedBaseSha,"base"],[runtimeGitDir,manifest.runtimeEvidenceSha,"runtime"]]){
    let type;
    try{ type=execFileSync("git",["--git-dir",gitdir,"cat-file","-t",sha],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim(); }
    catch{ throw new NotVerifiedError(`${tag} pin ${sha} not present in object store ${gitdir} (fail-closed)`); }
    assert.equal(type,"commit",`${tag} pin ${sha} is not a commit object`);
  }
  for(const ref of evidence.references){
    const gitdir=ref.repository===AUTHORIZED_REPOSITORIES.runtime?runtimeGitDir:specGitDir;
    const safePath=assertSafeRepoPath(ref.path,ref.id);
    const {start,end}=parseLineRange(ref.lines,ref.id);
    const lst=gitRead(gitdir,["ls-tree",ref.sha,"--",safePath]).trim();
    assert.ok(lst,`${ref.id}: path ${safePath} absent at ${ref.sha}`);
    const [mode,type,oid]=lst.split(/\s+/);
    assert.equal(type,"blob",`${ref.id}: ${safePath} is not a blob (type ${type})`);
    assert.ok(mode==="100644"||mode==="100755",`${ref.id}: unsafe object mode ${mode} for ${safePath} (symlink/dir/other rejected)`);
    assert.equal(oid,ref.blobSha,`${ref.id}: blob identity mismatch (resolved ${oid} != bound ${ref.blobSha})`);
    const blob=gitRead(gitdir,["cat-file","blob",oid]);
    const nl=(blob.match(/\n/g)||[]).length;
    const lineCount=blob.length===0?0:(blob.endsWith("\n")?nl:nl+1);
    assert.ok(end<=lineCount,`${ref.id}: cited range ${start}-${end} exceeds real line count ${lineCount}`);
  }
}

export function validateGit(manifest, candidateSha, repoRoot=root) {
  const g=(...args)=>execFileSync("git",args,{cwd:repoRoot,encoding:"utf8"}).trim();
  assert.ok(candidateSha, "candidate SHA absent");
  const before=g("rev-parse","HEAD");
  assert.equal(candidateSha,before,"candidate SHA does not equal checked-out HEAD");
  assert.equal(g("merge-base","--is-ancestor",manifest.authorizedBaseSha,before),"","authorized base is not ancestor");
  const changed=g("diff","--name-only","--diff-filter=ACMRTD",`${manifest.authorizedBaseSha}..${before}`).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed,[...manifest.allowedRemediationFiles].sort(),"unauthorized extra file in scope or required diff file absent");
  for(const file of manifest.requiredFiles) {
    const stat=lstatSync(path.join(repoRoot,file));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(),`${file}: missing or unsafe`);
  }
  assert.equal(g("status","--porcelain"),"","dirty worktree");
  assert.equal(g("rev-parse","HEAD"),before,"HEAD moved during validation");
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

function loadContext(candidate,env={}){
  return {candidate,anchor:env.anchor??null,specGitDir:env.specGitDir??null,runtimeGitDir:env.runtimeGitDir??null,model:load("docs/security/p1-a/model.json"),evidence:load("docs/security/p1-a/evidence-register.json"),manifest:load("docs/security/p1-a/validation-manifest.json"),markdown:readFileSync(path.join(root,"docs/security/p1-a/threat-model.md"),"utf8")};
}
function runNamedCheck(name,c){
  const {model,evidence,manifest,markdown,candidate}=c;
  switch(name){
    case "manifest_identity":
      assert.equal(model.sources.specification.revision,manifest.authorizedBaseSha);assert.equal(model.sources.runtime.revision,manifest.runtimeEvidenceSha);assert.deepEqual(manifest.requiredTests,REQUIRED_CHECKS);return;
    case "trust_anchor": assertTrustAnchor(model,evidence,manifest,c.anchor);return;
    case "file_scope": c.head=validateGit(manifest,candidate);return;
    case "evidence_integrity":
      for(const r of evidence.references){assert.match(r.lines,/^\d+-\d+$/);assert.ok([manifest.authorizedBaseSha,manifest.runtimeEvidenceSha].includes(r.sha));assert.ok(r.path&&r.claim&&r.category);}return;
    case "evidence_binding": validateEvidenceBinding(evidence,manifest,{specGitDir:c.specGitDir,runtimeGitDir:c.runtimeGitDir});return;
    case "required_coverage": assert.deepEqual(model.actors.map(x=>x.name),REQUIRED_ACTORS);assert.deepEqual(model.threats.map(x=>x.name),REQUIRED_THREATS);return;
    case "id_uniqueness":
      for(const rows of [model.actors,model.actions,model.assets,model.boundaries,model.flows,model.sourceToSinkPaths,model.tenantPropagation,model.controls,model.threats,model.escalationChains,evidence.references]) unique(rows.map(x=>x.id),"named check IDs");return;
    case "cross_references": validateData(model,evidence,manifest,markdown);return;
    case "authority_completeness": assert.equal(model.authorityPolicy.rules.length,616);unique(model.authorityPolicy.rules.map(r=>`${r.actorId}:${r.actionId}`),"authority pairs");return;
    case "separation_rules": validateData(model,evidence,manifest,markdown);assert.equal(model.authorityPolicy.separationRules.length,9);return;
    case "tenant_operations": assert.equal(model.tenantOperations.length,18);assert.equal(model.tenantPropagation.length,7);assert.equal(model.tenantOperationPolicy.denialBehavior,"DENY_AND_LOG");return;
    case "credential_custody": assert.equal(model.credentialClasses.length,10);assert.ok(model.credentialClasses.every(x=>x.storageBoundary&&x.rotationAuthorityActorIds.length&&x.evidenceRefs.length));return;
    case "escalation_completeness": assert.equal(model.escalationChains.length,model.threats.length);unique(model.escalationChains.map(x=>x.detectionSignal),"signals");assert.equal(model.retryPolicy.classes.length,4);return;
    case "documentation_consistency": validateData(model,evidence,manifest,markdown);return;
    case "negative_controls": {
      const source=readFileSync(path.join(root,"scripts/test-p1a-threat-model.mjs"),"utf8");
      for(const id of ["wrong_candidate_sha","unauthorized_deletion","dangling_escalation","generic_escalation","boundary_doc_conflict","invalid_authority_owner","runtime_pin_substitution","evidence_path_traversal","evidence_absolute_path","inverted_line_range","out_of_bounds_line_range","symlink_evidence","directory_evidence","blob_identity_mismatch","missing_trust_anchor","runtime_source_unavailable","encoded_traversal","wrong_repository","percent_encoded_traversal","double_encoded_traversal","backslash_encoded_traversal","unicode_slash_traversal"]) assert.ok(source.includes(id),`missing negative control ${id}`);
      return;
    }
    default: throw new Error(`unknown required check ${name}`);
  }
}

function readArg(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:undefined;}
function main(){
  const candidate=readArg("--candidate-sha")??process.env.P1A_CANDIDATE_SHA;
  const anchorBase=readArg("--base-sha")??process.env.P1A_TRUST_BASE_SHA;
  const anchorRuntime=readArg("--runtime-pin")??process.env.P1A_TRUST_RUNTIME_PIN;
  const anchor=(anchorBase&&anchorRuntime)?{baseSha:anchorBase,runtimePin:anchorRuntime}:null;
  const specGitDir=readArg("--spec-git-dir")??process.env.P1A_SPEC_GIT_DIR??path.join(root,".git");
  const runtimeGitDir=readArg("--runtime-git-dir")??process.env.P1A_RUNTIME_GIT_DIR??null;
  const names=[...REQUIRED_CHECKS];
  const totals={required:names.length,executed:0,passed:0,failed:0,skipped:0,cancelled:0,neutral:0,stale:0,notVerified:0};
  const context=loadContext(candidate,{anchor,specGitDir,runtimeGitDir});
  for(const name of names){
    totals.executed++;
    try { runNamedCheck(name,context); totals.passed++; console.log(`PASS ${name}`); }
    catch(error){
      if(error&&error.notVerified){totals.notVerified++;console.error(`NOT_VERIFIED ${name}: ${error.message}`);}
      else {totals.failed++;console.error(`FAIL ${name}: ${error.message}`);}
    }
  }
  console.log(JSON.stringify({suite:"p1-a-threat-model",candidateSha:context.head??candidate??null,crossRepositoryCiAuthentication:context.manifest.crossRepositoryCiAuthentication??"NOT_PROVEN",...totals,authorityRules:context.model.authorityPolicy.rules.length,threats:context.model.threats.length,controls:context.model.controls.length}));
  if(totals.executed!==totals.required||totals.passed!==totals.required||totals.failed||totals.skipped||totals.cancelled||totals.neutral||totals.stale||totals.notVerified) process.exitCode=1;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main();
