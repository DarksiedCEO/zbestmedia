import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalBytes } from "./p1a/canonical-json.mjs";

const sourceRoot=path.resolve(import.meta.dirname,".."); const sandbox=mkdtempSync(path.join(tmpdir(),"p1a-activation-adapters-"));
const authority=path.join(sandbox,"authority"); const repository=path.join(sandbox,"repository"); const moduleDir=path.join(sandbox,"module");
const git=(...args)=>execFileSync("git",["-C",repository,...args],{encoding:"utf8"}).trim();
try {
  mkdirSync(authority); mkdirSync(repository); mkdirSync(moduleDir);
  cpSync(path.join(sourceRoot,"scripts/p1a/canonical-json.mjs"),path.join(moduleDir,"canonical-json.mjs"));
  const adapterSource=readFileSync(path.join(sourceRoot,"scripts/p1a/activation-authority-adapters.mjs"),"utf8")
    .replace('"/var/lib/zbestmedia/p1a/manifest-activation-authority"',JSON.stringify(authority))
    .replace('"/var/lib/zbestmedia/p1a/observed-repository"',JSON.stringify(repository));
  writeFileSync(path.join(moduleDir,"activation-authority-adapters.mjs"),adapterSource);
  execFileSync("git",["-C",repository,"init","-q"]); execFileSync("git",["-C",repository,"config","user.email","p1a@example.invalid"]); execFileSync("git",["-C",repository,"config","user.name","P1A"]);
  execFileSync("git",["-C",repository,"remote","add","origin","https://github.com/DarksiedCEO/zbestmedia"]);
  writeFileSync(path.join(repository,"README.md"),"base\n"); execFileSync("git",["-C",repository,"add","."]); execFileSync("git",["-C",repository,"commit","-qm","base"]);
  mkdirSync(path.join(repository,".github/p1a"),{recursive:true}); writeFileSync(path.join(repository,".github/p1a/certification-contract.v2.json"),'{"active":false}\n');
  execFileSync("git",["-C",repository,"add","."]); execFileSync("git",["-C",repository,"commit","-qm","fixture"]);
  const manifestBytes=execFileSync("git",["-C",repository,"show","HEAD:.github/p1a/certification-contract.v2.json"]);
  const manifestBlob=git("rev-parse","HEAD:.github/p1a/certification-contract.v2.json");
  const changedFiles=[{path:".github/p1a/certification-contract.v2.json",status:"A",oldBlob:null,newBlob:manifestBlob}];
  const record={aegisArtifactSha256:"7".repeat(64),aegisVerdict:"GREEN",bundleSha256:"6".repeat(64),changedFiles,founderAuthorized:true,manifestBlob,manifestByteCount:manifestBytes.length,manifestPath:".github/p1a/certification-contract.v2.json",manifestSha256:createHash("sha256").update(manifestBytes).digest("hex"),orderedParents:[git("rev-parse","HEAD^")],parentCount:1,remoteProvenance:"VERIFIED",rollbackTarget:"62cbb8a90099e647ef7d91ecec7898f701babf8a",schemaVersion:"p1a-manifest-activation/v1",successorSha:git("rev-parse","HEAD"),successorTree:git("show","-s","--format=%T","HEAD")};
  const bytes=canonicalBytes(record); writeFileSync(path.join(authority,"activation-record.json"),bytes); writeFileSync(path.join(authority,"activation-record.sha256"),createHash("sha256").update(bytes).digest("hex")); chmodSync(path.join(authority,"activation-record.json"),0o444); chmodSync(path.join(authority,"activation-record.sha256"),0o444);
  const mod=await import(`${pathToFileURL(path.join(moduleDir,"activation-authority-adapters.mjs"))}?v=1`);
  const expected=mod.acquireExpectedBindingAuthority(); const observed=mod.acquireObservedGitIdentity();
  assert.equal(expected.custodyDomain,"founder_bootstrap_authority"); assert.equal(observed.custodyDomain,"observed_git_repository");
  assert.equal(observed.claims.manifestPath,record.manifestPath); assert.equal(observed.claims.manifestByteCount,manifestBytes.length); assert.equal(observed.claims.manifestSha256,record.manifestSha256); assert.deepEqual(observed.claims.orderedParents,record.orderedParents); assert.deepEqual(observed.claims.changedFiles,changedFiles);
  const fdBefore=readdirSync("/dev/fd").length; for(let i=0;i<20;i++)mod.acquireExpectedBindingAuthority(); const fdAfter=readdirSync("/dev/fd").length; assert.ok(fdAfter<=fdBefore+1,"authority file descriptors must close unconditionally");
  const wrongPathBytes=canonicalBytes({...record,manifestPath:".github/p1a/certification-contract.v1.json"}); chmodSync(path.join(authority,"activation-record.json"),0o644); chmodSync(path.join(authority,"activation-record.sha256"),0o644); writeFileSync(path.join(authority,"activation-record.json"),wrongPathBytes); writeFileSync(path.join(authority,"activation-record.sha256"),createHash("sha256").update(wrongPathBytes).digest("hex")); chmodSync(path.join(authority,"activation-record.json"),0o444); chmodSync(path.join(authority,"activation-record.sha256"),0o444); assert.throws(()=>mod.acquireExpectedBindingAuthority(),(e)=>e.code==="ACTIVATION_MANIFEST_PATH_MISMATCH");
  chmodSync(path.join(authority,"activation-record.json"),0o644); chmodSync(path.join(authority,"activation-record.sha256"),0o644); writeFileSync(path.join(authority,"activation-record.json"),bytes); writeFileSync(path.join(authority,"activation-record.sha256"),createHash("sha256").update(bytes).digest("hex")); chmodSync(path.join(authority,"activation-record.json"),0o444); chmodSync(path.join(authority,"activation-record.sha256"),0o444);
  chmodSync(path.join(authority,"activation-record.json"),0o666); assert.throws(()=>mod.acquireExpectedBindingAuthority(),(e)=>e.code==="ACTIVATION_AUTHORITY_FILE_INVALID"); chmodSync(path.join(authority,"activation-record.json"),0o444);
  const hardlink=path.join(authority,"activation-record-hardlink"); linkSync(path.join(authority,"activation-record.json"),hardlink); assert.throws(()=>mod.acquireExpectedBindingAuthority(),(e)=>e.code==="ACTIVATION_AUTHORITY_FILE_INVALID"); rmSync(hardlink);
  renameSync(path.join(authority,"activation-record.json"),path.join(authority,"activation-record.missing")); assert.throws(()=>mod.acquireExpectedBindingAuthority()); renameSync(path.join(authority,"activation-record.missing"),path.join(authority,"activation-record.json"));
  writeFileSync(path.join(repository,"dirty.txt"),"dirty"); assert.throws(()=>mod.acquireObservedGitIdentity(),(e)=>e.code==="ACTIVATION_REPOSITORY_DIRTY"); rmSync(path.join(repository,"dirty.txt"));
  git("config","--local","credential.helper","attacker"); assert.throws(()=>mod.acquireObservedGitIdentity(),(e)=>e.code==="ACTIVATION_GIT_AMBIENT_AUTHORITY"); git("config","--local","--unset","credential.helper");
  const realGit=execFileSync("which",["git"],{encoding:"utf8"}).trim(); const bin=path.join(sandbox,"bin"); mkdirSync(bin); const wrapper=path.join(bin,"git"); writeFileSync(wrapper,`#!/bin/sh\n${JSON.stringify(realGit)} "$@"\nstatus=$?\ncase " $* " in *" diff-tree "*) ${JSON.stringify(realGit)} -C ${JSON.stringify(repository)} update-ref HEAD ${JSON.stringify(record.orderedParents[0])} >/dev/null;; esac\nexit $status\n`); chmodSync(wrapper,0o755); const priorPath=process.env.PATH; process.env.PATH=`${bin}:${priorPath}`; assert.throws(()=>mod.acquireObservedGitIdentity(),(e)=>e.code==="ACTIVATION_CHANGED_DURING_USE"); process.env.PATH=priorPath; execFileSync(realGit,["-C",repository,"update-ref","HEAD",record.successorSha]);
  const alias=path.join(sandbox,"authority-alias"); symlinkSync(authority,alias); const aliased=adapterSource.replace(JSON.stringify(authority),JSON.stringify(alias)); writeFileSync(path.join(moduleDir,"aliased.mjs"),aliased); const aliasMod=await import(`${pathToFileURL(path.join(moduleDir,"aliased.mjs"))}?v=2`); assert.throws(()=>aliasMod.acquireExpectedBindingAuthority(),(e)=>e.code==="ACTIVATION_PATH_ALIAS");
  console.log(JSON.stringify({suite:"p1a-activation-authority-adapters",required:16,executed:16,passed:16,failed:0,skipped:0}));
} finally { rmSync(sandbox,{recursive:true,force:true}); }
