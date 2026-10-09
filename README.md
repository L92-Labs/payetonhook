# Payetonhook

Self-hostable webhook relay and testing platform with durable ingestion, fan-out delivery, retry semantics, replay, and a local development tunnel.

**Live:** dashboard at <https://payetonhook.l92-labs.com>, API at <https://api.payetonhook.l92-labs.com>.

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
VITE_API_BASE="https://api.payetonhook.l92-labs.com" npm run build
npm run deploy
```

### Local tunnel

Run a local receiver and authenticate the CLI once:

```bash
relay login --worker-url https://api.payetonhook.l92-labs.com
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

### Delivery capability

Apply migration `0014_delivery_receipts.sql` before promoting the new Worker. Each event/destination
pair has a fenced lease and a durable delivered/exhausted receipt. Ordinary queue redelivery skips
terminal destinations and resumes the persisted attempt budget. Explicit replay creates a new
event ID and deliberately delivers again. Receipts and attempt history commit atomically.

Delivery deadlines cover response headers and body; capture is limited to 1 MiB. Retry budgets are
bounded to 20 retries and backoff to 30 seconds. Database/R2 failures cause queue retry rather than
an immediate HTTP retry. HTTP delivery remains at least once: a receiver may accept a request
before receipt persistence fails. Receivers should deduplicate the stable `x-webhook-id`.

Run Worker tests on Node 24 (`npm test -w @payetonhook/worker`); the receipt tests execute actual
SQL migrations and exercise leases, rollback, body deadlines, replay and infrastructure failure.

The project includes storage abstraction and cutover guidance:

- `apps/worker/src/lib/db.ts`
- `apps/worker/src/lib/migration.ts`
- `docs/cutover-runbook.md`

## CI/CD

- CI workflow: `.github/workflows/ci.yml` (typecheck, tests, build)
- Auto worker deploy on `main` changes: `.github/workflows/deploy-worker.yml`
- Auto dashboard deploy on `main` changes: `.github/workflows/deploy-dashboard.yml`
