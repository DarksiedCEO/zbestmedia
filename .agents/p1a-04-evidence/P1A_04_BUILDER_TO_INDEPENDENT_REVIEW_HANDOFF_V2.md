# P1A_04_BUILDER_TO_INDEPENDENT_REVIEW_HANDOFF_V2

## Exact remediation subject

- HEAD: `aca0c548d9de8541bb0841f4f26c23abbdde097e`
- TREE: `98dafcd72370da62251c57fad9a543c28a70ed60`
- ORDERED PARENTS: `e13b02fd7c2f1c2dbb33cd9052ea7f7ad622c760`
- BRANCH: `codex/p1a-04-identity`
- AUTHORIZED BASE: `b0c1b2129123b941c6a350c16dae0ae3a8e076ca`
- BASE IS ANCESTOR: YES
- IMMUTABLE REVIEWED IMPLEMENTATION SUBJECT: `24e21d73e5a0cc993cee1375794071d8868c84bd`
- REVIEWED IMPLEMENTATION TREE: `7b8e6843840bf2a4506c853b9de3958060542e4f`
- REVIEWED SUBJECT IS ANCESTOR: YES

The remediation subject is a new descendant. No amend, rebase, squash, merge, push, or remote mutation occurred.

## Controlling review and reproduction

- Claude receipt: `/Users/andrelove/Documents/zbestmedia-p1a-claude-bootstrap/P1A_04_INDEPENDENT_REVIEW_RECEIPT_CLAUDE_V1.md`
- Receipt SHA-256: `06e8da7a903776eff6ea1a2c43deb78bb3c7bb6d837e78be90dcf16628e0f3e9`
- All six findings were reproduced before code modification.
- Seven pre-remediation mutation survivors and the killed negative control are preserved in `P1A_04_REMEDIATION_V2_REPRODUCTION_EVIDENCE.json`.
- Failed reproductions: none.

## Finding disposition

1. F1 CLOSED LOCALLY — both HTTP consumers enforce a separate, server-owned, fail-closed principal allowlist plus subject, audience, tenant, and operation scope. Self-consistent forged principal/subject pairs reject.
2. F2 CLOSED LOCALLY — expanded mutation harness: 17/17 killed, 0 survivors.
3. F3 CLOSED LOCALLY WITH AUTHORITY LIMITATION — exact external ledger bytes are committed as evidence with SHA-256 `f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf`. The source self-identifies as an unfrozen candidate; this handoff does not upgrade its authority or claim ownership of P1A-06/P1A-08 rows.
4. F4 CLOSED LOCALLY — forged-token hostile test has an explicit acceptance-failure sentinel.
5. F5 CLOSED LOCALLY — both service HTTP boundaries reject expired, not-yet-valid, revoked, stale-generation, wrong-audience, wrong-scope, wrong-subject, and unauthorized-principal credentials.
6. F6 CLOSED LOCALLY — revoked rotation returns `CREDENTIAL_REVOKED`; other non-active lifecycle states return `CREDENTIAL_NOT_ACTIVE`.

## Verification denominator

- Static: repository lint PASS; repository TypeScript typecheck PASS.
- P1A-04 affected suites: 130/130.
  - service-auth: 50/50
  - agent-lifecycle: 4/4
  - artifact-registry: 34/34
  - brandgraph: 42/42
- Repository denominator: 199/199.
  - Vitest: 148/148
  - reconciliation checks: 51/51
- Mutation: 17/17 killed; 0 survivors.
- Hostile/negative HTTP coverage: PASS at artifact-registry and BrandGraph.
- Syntax: `git diff --check`, Node syntax, and JSON parse gates PASS.

## Continuity and assurance gates

- Continuity: `CONTINUITY_READY`
- Continuity authority: `.agents/p1a-lane-start/P1A_04_LANE_START_RECEIPT_V2.json`
- Drift: `ON_TASK`
- Hallucination: `ACCEPT`
- Verification gate: `SATISFIED_FOR_LOCAL_REMEDIATION_FREEZE`
- Fresh read-only candidate review: F1 initially remained open; after server-owned allowlists and hostile negatives, follow-up verdict CLOSED with no direct regression.

## Requirement denominator

P1A-04 frozen-row denominator remains 11:

- CLOSED_LOCALLY: P1AF-057, P1AF-058, P1AF-059, P1AF-060, P1AF-061, P1AF-062, P1AF-064
- PARTIAL: P1AF-016, P1AF-063, P1AF-065
- BLOCKED_EXTERNALLY: P1AF-066

Each requirement-to-implementation-to-test-to-evidence binding remains in `P1A_04_IMPLEMENTATION_EVIDENCE_V2.json`; remediation-specific bindings and results are in `P1A_04_REMEDIATION_V2_VERIFICATION_EVIDENCE.json`. No status was upgraded beyond available evidence.

## Known limitations and NOT_RUN surfaces

- Protected GitHub workflow execution: NOT_RUN.
- Protected threat-model / trusted-verifier execution: NOT_RUN.
- Distributed multi-process revocation-cache propagation: NOT_PROVEN.
- P1AF-066: BLOCKED_EXTERNALLY.
- Three requirements remain PARTIAL.
- The repository-contained ledger snapshot retains its own `frozen:false` and `implementationAuthorized:false` metadata; this builder does not override external authority.
- Service deployments must supply `SERVICE_AUTH_ALLOWED_PRINCIPALS` separately from credential records; startup fails closed when it is absent.

## Evidence digests

- Reproduction evidence SHA-256: `f32002ed16a59a05dda738f0460ccd79b591b6fecff0b1330d407746b593becd`
- Verification evidence SHA-256: `116700d9dc4c81573f53fcae389e733facc527e977194cc7838fee13e2593e0f`
- Repository-contained ledger snapshot SHA-256: `f1010f1be105d05ea93bf6dc79a84ae09cee7d9470d024bd5d2b3d4948195fcf`

P1A-04 BUILDER HANDOFF READY

FRESH CLAUDE INDEPENDENT REVIEW REQUIRED

CERTIFIED = NO

NO PUSH

NO MERGE

NO REMOTE MUTATION
