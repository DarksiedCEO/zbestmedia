import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, openSync, readFileSync, realpathSync, closeSync, fstatSync } from "node:fs";
import path from "node:path";
import { parseStrictJson, canonicalBytes, ContractError } from "./canonical-json.mjs";

export const EXPECTED_AUTHORITY_ROOT = "/var/lib/zbestmedia/p1a/manifest-activation-authority";
export const OBSERVED_REPOSITORY_ROOT = "/var/lib/zbestmedia/p1a/observed-repository";
const fail = (code, message) => { throw new ContractError(code, message); };
export const CANONICAL_V2_MANIFEST_PATH = ".github/p1a/certification-contract.v2.json";
function canonicalPath(value) {
  if (typeof value!=="string"||value.length===0||value!==value.normalize("NFC")||value.startsWith("/")||value.includes("\\")||value.includes("%")||value.includes("//")||value.includes("\0")||value.split("/").some((part)=>part==="."||part===".."||part.length===0)) fail("ACTIVATION_PATH_INVALID","repository path is not canonical");
  return value;
}
function immutableRead(path) {
  const before=lstatSync(path); if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o022)!==0) fail("ACTIVATION_AUTHORITY_FILE_INVALID","authority file is not immutable");
  const fd=openSync(path,"r"); try { const opened=fstatSync(fd); const bytes=readFileSync(fd); const after=fstatSync(fd); if(opened.dev!==after.dev||opened.ino!==after.ino||opened.size!==after.size||opened.mtimeNs!==after.mtimeNs) fail("ACTIVATION_CHANGED_DURING_USE","authority changed during immutable read"); return bytes; } finally { closeSync(fd); }
}
export function acquireExpectedBindingAuthority() {
  const rootEntry=lstatSync(EXPECTED_AUTHORITY_ROOT); if(!rootEntry.isDirectory()||rootEntry.isSymbolicLink()) fail("ACTIVATION_PATH_ALIAS","expected authority root aliased");
  const root=realpathSync(EXPECTED_AUTHORITY_ROOT);
  const recordBytes=immutableRead(`${root}/activation-record.json`); const digestBytes=immutableRead(`${root}/activation-record.sha256`);
  const expectedDigest=digestBytes.toString("utf8"); if(!/^[0-9a-f]{64}$/.test(expectedDigest)||createHash("sha256").update(recordBytes).digest("hex")!==expectedDigest) fail("ACTIVATION_DIGEST_MISMATCH","external expected binding mismatch");
  const record=parseStrictJson(recordBytes); if(canonicalBytes(record).compare(recordBytes)!==0||record.schemaVersion!=="p1a-manifest-activation/v1"||record.founderAuthorized!==true||record.aegisVerdict!=="GREEN") fail("ACTIVATION_AUTHORITY_INVALID","external founder/AEGIS authority invalid");
  if(canonicalPath(record.manifestPath)!==CANONICAL_V2_MANIFEST_PATH) fail("ACTIVATION_MANIFEST_PATH_MISMATCH","expected authority selected a noncanonical manifest");
  const {schemaVersion: _schemaVersion, aegisVerdict: _aegisVerdict, ...claims}=record;
  return Object.freeze({custodyDomain:"founder_bootstrap_authority",claims:Object.freeze(claims)});
}
export function acquireObservedGitIdentity() {
  const rootEntry=lstatSync(OBSERVED_REPOSITORY_ROOT); if(!rootEntry.isDirectory()||rootEntry.isSymbolicLink()) fail("ACTIVATION_PATH_ALIAS","observed repository root aliased");
  const root=realpathSync(OBSERVED_REPOSITORY_ROOT); if(root===realpathSync(EXPECTED_AUTHORITY_ROOT)) fail("ACTIVATION_PATH_ALIAS","observed repository root aliased");
  const git=(...args)=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  if(git("status","--porcelain=v1")!=="") fail("ACTIVATION_REPOSITORY_DIRTY","observed repository is dirty");
  if(git("remote","get-url","origin")!=="https://github.com/DarksiedCEO/zbestmedia") fail("ACTIVATION_REPOSITORY_MISMATCH","observed repository origin mismatch");
  const config=(key)=>{const result=spawnSync("git",["-C",root,"config","--local","--get",key],{encoding:"utf8"}); if(![0,1].includes(result.status)) fail("ACTIVATION_GIT_INSPECTION_FAILED",`cannot inspect ${key}`); return result.status===0?result.stdout.trim():"";};
  const gitDir=path.resolve(root,git("rev-parse","--git-dir"));
  if(git("replace","-l")!==""||config("core.alternateRefsCommand")!==""||config("http.https://github.com/.extraheader")!==""||config("credential.helper")!==""||
     existsSync(`${gitDir}/objects/info/alternates`)||existsSync(`${gitDir}/info/grafts`)) fail("ACTIVATION_GIT_AMBIENT_AUTHORITY","replace, graft, alternate, or persisted credential authority forbidden");
  const successorSha=git("rev-parse","HEAD"); const successorTree=git("show","-s","--format=%T","HEAD"); const orderedParents=git("show","-s","--format=%P","HEAD").split(" ").filter(Boolean);
  if(orderedParents.length!==1) fail("ACTIVATION_TOPOLOGY_INVALID","pending activation requires one exact parent");
  const manifestPath=CANONICAL_V2_MANIFEST_PATH; const manifestBlob=git("rev-parse",`HEAD:${manifestPath}`); const manifestBytes=execFileSync("git",["-C",root,"show",`HEAD:${manifestPath}`],{encoding:null});
  if(git("show","-s","--format=%H","HEAD")!==successorSha||git("ls-tree","HEAD",manifestPath).split(/\s+/u)[0]!=="100644") fail("ACTIVATION_CHANGED_DURING_USE","subject or manifest changed during observation");
  const tokens=execFileSync("git",["-C",root,"diff-tree","-r","--no-commit-id","--name-status","--no-renames","-z",orderedParents[0],successorSha],{encoding:null}).toString("utf8").split("\0"); tokens.pop();
  if(tokens.length%2!==0) fail("ACTIVATION_DIFF_INVALID","Git changed-file inventory malformed");
  const blob=(commit,file)=>{const result=spawnSync("git",["-C",root,"rev-parse",`${commit}:${file}`],{encoding:"utf8"}); if(result.status===0)return result.stdout.trim(); if(result.status===128)return null; fail("ACTIVATION_GIT_INSPECTION_FAILED",`cannot inspect ${file}`);};
  const changedFiles=[]; for(let i=0;i<tokens.length;i+=2){const status=tokens[i],file=canonicalPath(tokens[i+1]); if(!["A","M","D","T"].includes(status)) fail("ACTIVATION_DIFF_INVALID",`unsupported change status ${status}`); changedFiles.push({path:file,status,oldBlob:blob(orderedParents[0],file),newBlob:blob(successorSha,file)});}
  changedFiles.sort((a,b)=>Buffer.from(a.path).compare(Buffer.from(b.path))); if(new Set(changedFiles.map((entry)=>entry.path)).size!==changedFiles.length) fail("ACTIVATION_DIFF_INVALID","duplicate changed path");
  if(git("rev-parse","HEAD")!==successorSha||git("status","--porcelain=v1")!=="") fail("ACTIVATION_CHANGED_DURING_USE","repository changed during observation");
  return Object.freeze({custodyDomain:"observed_git_repository",claims:Object.freeze({changedFiles:Object.freeze(changedFiles.map(Object.freeze)),manifestBlob,manifestByteCount:manifestBytes.length,manifestPath,manifestSha256:createHash("sha256").update(manifestBytes).digest("hex"),orderedParents,parentCount:orderedParents.length,successorSha,successorTree})});
}
