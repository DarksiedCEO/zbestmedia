# P1A_08_INTEGRATION_RESOLUTION_V1 (2026-08-20)

Lane P1A-08 (Integration / Contract Reconciliation, Claude-primary rows) — resolution of the
delegated cross-lane blockers at clean base `b0c1b2129123b941c6a350c16dae0ae3a8e076ca`.
Controlling artifacts: `P1A_02_TO_P1A_08_INTEGRATION_CONTRACT_V2.json`,
`P1A_08_RETURN_CONTRACTS_V1.json` (both in this directory).

## What this lane built (P1A-08-owned)

1. `scripts/p1a-trusted-verifier-summary-v2.mjs` — schema module of record for
   `P1A_TRUSTED_VERIFIER_SUMMARY_V2` (exact 22-field key set, schemaVersion enforcement,
   unknown-field rejection, integer counters, identity binding, clean-base law, anti-tautology
   nested bindings) and `P1A_NESTED_CERTIFICATION_SUMMARY_V2`. Pure module; fail-closed only.
2. `scripts/p1a-clean-authority.mjs` — current-lineage authority acquisition for the shared
   integration producer: 8-variable authority surface, no missing-authority fallback, explicit
   rejection of the five abandoned-lineage roots, hermetic runtime-pin verification, verifier
   digest DERIVED from the accounting consumer's bytes (never echoed).
3. `scripts/test-p1a-summary-v2.mjs` — 80 controls (unit + hostile: stale schema, wrong producer,
   wrong version, missing authority, wrong subject, cross-lane substitution, legacy-root
   substitution, greenwash counters) + 20-mutant pass, 0 survivors. Synthetic fixtures, labeled.
4. `scripts/test-p1a-trusted-verifier.mjs` (shared path, this lane's to edit) — integration-mode
   seam only: the 11-env passthrough gate replaced by clean-authority acquisition; the fabricated
   `crossRepositoryCiAuthentication: "VERIFIED"` removed; V2 summary emitted only when authority
   was acquired, the nested V2 contract held, and 21/21 controls passed (otherwise refuses, exit 1;
   optional `P1A_SUMMARY_OUT` exclusive-create output). The 21 controls' certification semantics
   were NOT touched (RC-02-D). Ordinary mode re-verified byte-identical PASS set (151/151, exit 0)
   before and after.
5. `.github/workflows/ci.yml` (shared path) — six `node --check` registrations + three
   unprivileged control steps (summary-v2, evidence contract, evidence mutation). The trusted
   workflow byte-composition control was EXTENDED, not bypassed: `composeCurrentTrustedWorkflow`
   now asserts ordinary CI equals the pinned trusted workflow plus exactly this declared delta.
   Secret-boundary detector re-run: PASS, findings [].
6. `.github/CODEOWNERS` (shared path, registration router) — reconciled sorted registration of all
   base-existing trusted surfaces + P1A-03's three evidence files + this lane's three files.

## Blocker dispositions (founder packet order)

1. **P1A-02 current-lineage authority acquisition** — CLOSED on the integration side
   (`p1a-clean-authority.mjs` + producer wiring). Certification-side re-anchoring of the 21/15
   control subjects remains P1A-02/07-owned: RC-02-D (blocking).
2. **P1A-02 V2 summary producer/schema** — CLOSED on the producer side (schema module + emission).
   Consumer-side enforcement gaps (schemaVersion unread, no key-set check, vacuous nested
   bindings): RC-02-A (blocking). Nested producer non-conformance: RC-02-C (blocking).
3. **Shared CI surfaces P1A-02 was forbidden to edit** — CLOSED via the declared composition delta.
   P1A-02's own +5-line ci.yml hunk contradicts its builder evidence and breaks the composition
   control in its own tree: RC-02-B (blocking).
4. **P1A-03 CODEOWNERS/CI registration** — CLOSED (CODEOWNERS entries + syntax gate + two CI
   steps). Certification candidate-scope inclusion is NOT claimed (RC-02-D); merge-order
   constraint recorded in contract V2 (the composed candidate must include ddd729a's files or
   ordinary CI fails closed — intended, not a skip). Follow-ups to P1A-03: RC-03-A.
5. **P1A-05 seams** — exactly one documented seam belongs here:
   `services/artifact-registry/prisma/schema.prisma` (03/05/06, routed via seam register and the
   03/06 receipts). P1A-05's uncommitted edit of that file is a live producer-lane collision:
   RC-05-A (blocking). Provider/payment seams: NONE_DOCUMENTED for P1A-08 — the provider block on
   P1AF-070..074 routes to founder decision P1AF-089 (lane P1A-06). No P1A-05→P1A-08 provider
   contract exists and none was invented.

## Findings surfaced in passing (not this lane's to fix)

- **Vacuous negative controls at base**: `mutateHistorical`/`mutateBaseline` needles that occur
  more than once in ci.yml (e.g. `set -euo pipefail`) make their count assertion throw, so the
  shouldThrow cases pass vacuously today (e.g. `historical_continues_after_fetch_failure`).
  Test-truth ownership: P1A-07.
- **P1A-02 evidence-manifest drift**: `filesChanged` lists 21 files, diff shows 28; ci.yml edit
  denied but present (RC-02-B).
- **`scripts/validate-p1a-certification-accounting 2.mjs`** (stray duplicate) untracked in the
  P1A-02 worktree; classified stale by P1A-02 — deletion is theirs.
- **P1A-05 stray duplicate test file** `events.outbox.test 2.ts` (RC-05-A).

## Claim ceiling (what is and is not claimed)

Claimed: the P1A-08-owned integration mechanism exists, is tested (80/80 controls, 20/20 mutants
killed, 0 survivors), fails closed at every specified failure mode, and the shared surfaces are
registered with the byte-composition control intact (ordinary producer run 151/151 PASS, exit 0,
identical to pre-change baseline; secret scan PASS).

NOT claimed: protected certification GREEN; real-object 21/21 or nested 15/15 under clean lineage
(blocked on RC-02-A/C/D by design); P1A-02 completion; P1AF-118 progress (remains
OPEN_PENDING_EXACT_FOUNDER_FREEZE); repo-wide integration-surface coverage (COVERAGE_UNKNOWN,
bounded discovery; HS-REG-001). Builder does not self-certify; next step is fresh Codex hostile
review against the frozen P1A-08 subject, then AEGIS.
