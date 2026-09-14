# Environment and Promotion Matrix

| Environment | Purpose | Data | External publication | Money adapter | Promotion authority |
|---|---|---|---|---|---|
| Local | developer feedback | synthetic only | disabled | deterministic fake | none |
| Test | automated verification | fixtures and generated adversarial cases | fake adapter | fake adapter | CI only |
| Simulation | end-to-end pilot rehearsal | approved pilot copies, minimized PII | receipt simulator | production state machine with transfer disabled | Founder + control owners |
| Staging | migration, restore and integration proof | masked or purpose-approved | sandbox accounts only | provider sandbox only | release board |
| Production | approved live operation | authorized live records | explicitly authorized adapters | real provider, disabled initially | exact-SHA AEGIS + human release authority |

## Isolation requirements

- Separate cloud accounts or hard administrative boundaries.
- Separate databases, object stores, encryption keys, secrets and service identities.
- Environment identity embedded in every event, receipt and audit record.
- Production credentials cannot be read by local, test or simulation workloads.
- Simulation code rejects real-provider endpoints and real transfer capabilities.
- Data cannot be copied downward without an approved minimization and masking job.

## Configuration validation

Startup fails when environment, database, NATS, storage, identity, publication,
or payout endpoints disagree. Secrets are referenced, never committed. Every
adapter declares `FAKE`, `SANDBOX`, or `LIVE`; `LIVE` is prohibited outside
production and initially disabled in production.

## Promotion sequence

`LOCAL_VERIFIED -> CONTRACT_TESTED -> SIMULATION_RECONCILED -> STAGING_MIGRATED -> RESTORE_PROVEN -> SECURITY_REVIEWED -> EXACT_SHA_VERIFIED -> AEGIS_CERTIFIED -> SUPERVISED_PRODUCTION`

Stages cannot be skipped. Revoked evidence invalidates dependent promotions.

