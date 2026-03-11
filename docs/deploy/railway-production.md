# Railway Production

This document captures the current production deployment contract for the Z Best Media web service.

## Service

- Railway project: `luminous-possibility`
- Railway service: `zbestmedia`
- Environment: `production`
- Production branch: `codex/pack1`

## Purpose

This service deploys the public marketing site from `apps/web`.

Do not reuse this service for `apps/app`.

## Root Directory

- Use repository root
- Do not set Railway Root Directory to `apps/web`
- Do not set Railway Root Directory to `apps/app`

The workspace packages resolve from repo root.

## Build Command

```bash
pnpm install --frozen-lockfile && pnpm --filter ./apps/web... build
```

## Start Command

```bash
pnpm --filter ./apps/web... preview -- --host 0.0.0.0 --port $PORT
```

`apps/web` uses a Node static runtime wrapper in `apps/web/scripts/preview.mjs` so the deployed service serves the built Astro output directly and binds to Railway's assigned port.

## Healthcheck

- Healthcheck path: `/`

## Domains

- Railway default domain: `zbestmedia-production.up.railway.app`
- Custom domain: `app.zbestmedia.com`

## Verification

After deploy, verify:

```bash
curl -i https://zbestmedia-production.up.railway.app
curl -i https://app.zbestmedia.com
```

Expected:

- `HTTP 200`
- HTML response for the marketing site

## Follow-on Split

Create a separate Railway service for `apps/app`.

Recommended target layout:

- `zbestmedia` or `zbestmedia-web` -> `apps/web`
- `zbestmedia-app` -> `apps/app`

Do not collapse both apps into one Railway service.
