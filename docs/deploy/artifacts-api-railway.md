# Railway Artifacts API Deployment

This document captures the deployment contract for the API service that serves:

- `/v1/artifacts/*`
- `/v1/agents/*`
- `/v1/orchestration/*`

## Important separation

- `zbestmedia-production.up.railway.app` / `app.zbestmedia.com` is the web service in `luminous-possibility`
- `api.caelumprime.com` is currently attached to `orca-router` in `gallant-perception`

Do not point Agent OS deployed checks at the web service or the ORCA Router service.

## Required Railway service

Create a dedicated Railway service for `artifacts-api`.

Recommended placement:

- project: `luminous-possibility`
- service: `artifacts-api`

## Repo root and commands

Use repo root as the Railway root directory so workspace dependencies resolve.

Build command:

```bash
pnpm install --frozen-lockfile && pnpm api:build
```

Start command:

```bash
pnpm api:start
```

Healthcheck path:

```text
/healthz
```

## Required environment

Required:

- `DATABASE_URL`
- `AUTH_JWT_SECRET`
- `ARTIFACT_SIGNING_KEY`

Recommended:

- `NODE_ENV=production`
- `PORT` provided by Railway
- `ORCA_ROUTER_URL`
- `ORCA_ROUTER_TOKEN`
- `ORCA_MODEL`
- `ORCA_TIMEOUT_MS`

## Required database step

Apply the API migrations against the service database:

```bash
pnpm api:db:migrate
```

The Agent OS deployed release lane will not pass until the database contains the Agent OS tables and runtime-control migrations.

## Domain guidance

Use either:

- the Railway-generated default domain for the `artifacts-api` service, or
- a dedicated custom API domain mapped to that service

Do not reuse `api.caelumprime.com` unless you intentionally move that domain away from `orca-router`.

## Agent OS deployed verification contract

Set:

```bash
AGENT_OS_BASE_URL=https://<artifacts-api-domain>
AGENT_OS_TENANT_ID=<tenant>
AGENT_OS_AUTH_TOKEN=<token>
AGENT_OS_DATABASE_URL=<database-url>
AGENT_OS_VERIFY_DB=true
```

Then run:

```bash
pnpm agent-os:env:preflight
pnpm agent-os:execution:smoke:deployed
pnpm agent-os:release:check:deployed
```
