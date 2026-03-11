## Railway Frontend Deploy

Use repo root as the Railway root directory so workspace dependencies resolve correctly.

### Marketing site (`apps/web`)

- Build command: `pnpm install --frozen-lockfile && pnpm web:build`
- Start command: `pnpm web:preview`

### Product app (`apps/app`)

- Build command: `pnpm install --frozen-lockfile && pnpm app:build`
- Start command: `pnpm app:preview`

If a Railway service is pointed at the repo root without explicit commands, autodetect will treat this monorepo like a generic Node service and fail to find a valid start entrypoint.
