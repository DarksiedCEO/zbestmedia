# Z Best Clips Phase 1 Architecture

## Mission

Create a governed vertical slice that joins Hollywood-grade editorial controls
to creator distribution, payout-grade evidence, and performance learning without
granting AI or campaign operators unilateral authority.

## System boundaries

| Boundary | Owns | Must not own |
|---|---|---|
| Z Best Media control plane | tenant identity, campaign authority, evidence, finance interfaces, policy and oversight | editorial judgment or legal self-approval |
| Z Best Clips practice | brief, creator matching, editorial workflow, submissions, measurement cases | legal clearance, payout execution, appeal review, AEGIS certification |
| CinePhantom | ingest, transcription, moment candidates, draft variants, lineage observations | source release, rights approval, picture lock, publication |
| Finance | ledger authority, settlement and reconciliation | creative approval or fraud investigation |
| Legal/Rights | rights decision and takedown authority | campaign economics or creator ranking |
| AEGIS | independent exact-subject assurance | implementation or self-certification |

## Architectural laws

1. One authoritative owner exists for every record type.
2. AI proposes; deterministic policy and authorized humans decide.
3. State transitions are explicit, attributable, and fail closed.
4. Approved versions are immutable; changes create successors.
5. Money movement and publication are idempotent external effects.
6. Evidence is append-only; corrections supersede rather than erase.
7. Tenant, campaign, and purpose scope are enforced at every boundary.
8. Missing, expired, mismatched, or revoked authority produces `BLOCKED`.

## Canonical editorial chain

`Source -> Rights Grant -> Source Package -> Detected Moment -> Edit Project -> Cut Version -> Review -> Picture Lock -> Platform Variant -> QC -> Publication Approval -> Published Post`

Every link records tenant, campaign, predecessor, checksum, actor, authority,
timestamp, contract version, and evidence reference.

## Core modules

- Campaign Authority: scope, budget, rights and activation gates.
- Media Custody: encrypted ingest, packages, watermark identity and revocation.
- Editorial Lineage: immutable cuts, successor versions and approval invalidation.
- Creator Trust: identity, account control, certification, capacity and conflicts.
- Submission Review: editorial, disclosure, rights and technical checkpoints.
- Publication Control: final dual approval, idempotent publish intent and receipt.
- Metric Evidence: authorized observations with raw hashes and calculation version.
- Fraud Cases: flags, quarantine, investigation, decision and independent appeal.
- Reward Accounting: reservation, earning, hold, payable and simulated transfer.
- Archive/Takedown: retention, legal hold, expiry, revocation and preserved receipts.

## External-effect rule

No domain transaction calls a platform or payment provider inline. The database
transaction records the authorized intent and outbox event. An adapter consumes
the event with an idempotency key, records attempts, and writes a receipt. A
timeout remains `UNKNOWN_PENDING_RECONCILIATION`; it never becomes success by
assumption.

## Budget-concurrency assurance boundary

The Phase 1 domain-contract package validates the inputs to a budget reservation
decision, but it contains no database transaction, persistence repository, or
runtime command handler. It therefore does **not** establish atomic reservation
under concurrent requests and must not be represented as concurrency-safe
runtime enforcement.

Before any runtime can expose reservation, Gate 6 must implement the campaign
balance and reward reservation in one PostgreSQL transaction using either a
row lock or serializable compare-and-swap on the expected balance version. The
transaction must reject stale versions and insufficient funds before commitment,
write the balanced ledger entries and idempotency record atomically, and be
covered by adversarial concurrent-request tests proving that total committed
reservations never exceed the ring-fenced balance. Until that persistence gate
passes, reservation remains specification and simulation evidence only.

## Data posture

- PostgreSQL is authoritative for transactional and audit state.
- Object storage contains encrypted media addressed by checksum and tenant scope.
- NATS JetStream transports versioned events; it is not a source of record.
- Sensitive identity/tax data is separately encrypted and purpose-scoped.
- Python/CinePhantom outputs are advisory artifacts with model and input lineage.

## Technology baseline

TypeScript 5.9 strict mode, Node 24 LTS, PostgreSQL, Zod plus JSON Schema/AJV,
Fastify, Pino, OpenTelemetry, Prisma during the existing foundation period, and
NATS JetStream with a transactional outbox. Python is isolated behind versioned
contracts. Rust requires a measured security or performance justification.

## Phase 1 success condition

One internally controlled campaign completes source ingest through archive and a
fully reconciled simulated payout. Every gate, failure, correction, appeal, and
override must be replayable from evidence. Passing the happy path alone is not
sufficient.
