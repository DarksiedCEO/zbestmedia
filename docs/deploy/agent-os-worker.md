# Agent OS Worker Deployment

Deploy the Agent OS worker as a separate process from the API.

## Required env

- `DATABASE_URL`
- `AGENT_OS_TENANT_ID`

## Optional env

- `AGENT_OS_AGENT_ID`
- `AGENT_OS_WORKER_LIMIT`
- `AGENT_OS_RETRY_DELAY_MS`
- `AGENT_OS_LOOP_INTERVAL_MS`
- `AGENT_OS_MAX_ITERATIONS`

## Commands

- Run one cycle:
  - `pnpm agent-os:worker:run-once`
- Run a bounded loop for diagnostics:
  - `pnpm agent-os:worker:loop`
- Run as a daemonized worker profile:
  - `pnpm agent-os:worker:daemon`
- Validate worker deployment profile:
  - `pnpm agent-os:deployment:check`

## Deployment note

Use a dedicated worker service/process profile. Do not colocate long-running worker loops with the public web runtime.

## Operational surfaces

- Replay bundle export:
  - `GET /v1/orchestration/executions/:executionId/replay-bundle`
- Replay bundle verification:
  - `POST /v1/orchestration/executions/:executionId/replay-bundle/verify`
- Dead-letter replay approval request:
  - `POST /v1/orchestration/executions/:executionId/replay-request`
- Dead-letter replay requeue:
  - `POST /v1/orchestration/executions/:executionId/requeue`
- Replay export history:
  - `GET /v1/orchestration/executions/:executionId/exports`
- Replay export persistence:
  - `POST /v1/orchestration/executions/:executionId/export-bundle`
- Diagnostics:
  - `GET /v1/orchestration/ops/diagnostics`
- Inventory:
  - `GET /v1/orchestration/ops/inventory`
- Worker health:
  - `GET /v1/orchestration/ops/workers`
- Ops alerts:
  - `GET /v1/orchestration/ops/alerts`
- Runbook:
  - `GET /v1/orchestration/ops/runbook`
