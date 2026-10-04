# Payetonhook

Self-hostable webhook relay and testing platform with durable ingestion, fan-out delivery, retry semantics, replay, and a local development tunnel.

## Workspace

- `apps/worker`: Cloudflare Worker (receiver, queue consumer, workflow logic, API).
- `apps/dashboard`: React dashboard for event and dead-letter visibility.
- `apps/cli`: local tunnel CLI (`relay login`, `relay tunnel`).
- `packages/shared`: shared contracts and utility types.

## Quick start

```bash
npm install
npm run test
npm run typecheck
```

## Deploy and test

### Worker

```bash
cd apps/worker
npx wrangler d1 migrations apply payetonhook --remote
npx wrangler deploy
```

### Dashboard

Set `VITE_API_BASE` to your Worker URL when building:

```bash
cd apps/dashboard
VITE_API_BASE="https://payetonhook-worker.<subdomain>.workers.dev" npm run build
npm run deploy
```

### Local tunnel

Run a local receiver and authenticate the CLI once:

```bash
relay login --worker-url https://payetonhook-worker.<subdomain>.workers.dev
```

Then start tunneling:

```bash
relay tunnel --to http://localhost:3000/webhook
```

`relay tunnel` now logs each forwarded request by default.

#### CLI auth and config resolution

- `relay login` uses device-style browser auth and stores config/token in `~/.payetonhook/config.json`.
- Resolution order for `worker-url`: CLI flag -> `PAYETONHOOK_WORKER_URL` -> saved config -> built-in default.
- Resolution order for `project`: CLI flag -> `PAYETONHOOK_PROJECT` -> saved config.
- If project is not provided and multiple projects are available, CLI prompts you to select one interactively.
- Alternative non-login auth for tunnel command:
  - `--api-key` or `PAYETONHOOK_API_KEY`
  - `--tunnel-token` or `PAYETONHOOK_TUNNEL_TOKEN`

## Database migration readiness

The project includes storage abstraction and cutover guidance:

- `apps/worker/src/lib/db.ts`
- `apps/worker/src/lib/migration.ts`
- `docs/cutover-runbook.md`

## CI/CD

- CI workflow: `.github/workflows/ci.yml` (typecheck, tests, build)
- Auto worker deploy on `main` changes: `.github/workflows/deploy-worker.yml`
- Auto dashboard deploy on `main` changes: `.github/workflows/deploy-dashboard.yml`
