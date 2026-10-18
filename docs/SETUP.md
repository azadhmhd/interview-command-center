# Setup, deployment and operations

## Processes

| Process | Command (dev) | Command (prod) | Notes |
|---|---|---|---|
| API | `pnpm dev:api` | `node dist/main.js` | REST on `:4000`, Swagger `/api/docs`, health `/api/health` |
| Worker | `pnpm dev:worker` | `node dist/worker.js` | BullMQ consumer + 30 s scheduler tick. Run ≥1. Safe to run several. |
| Web | `pnpm dev:web` | `node apps/web/server.js` (standalone) | Proxies `/api/*` to the API (same origin) |
| PostgreSQL 17 | `pnpm infra:up` | managed or compose | Source of truth |
| Redis 7 | `pnpm infra:up` | compose | Job transport only; loss is recoverable |

## Environment

All configuration is environment-based; see [`.env.example`](../.env.example) for every variable. Required:

- `DATABASE_URL`, `REDIS_URL`
- `APP_ENCRYPTION_KEY` — 32 random bytes, base64. Encrypts stored LLM API keys. **Back it up**; losing it makes saved keys unreadable (re-enter them).
- `APP_URL` — public URL of the web app (used in reset / invite links).
- `COOKIE_SECURE=true` whenever served over HTTPS.

## Production deployment (single host, Docker Compose)

1. Provision a small VM (2 vCPU / 2–4 GB RAM is enough for one user or a small group).
2. `git clone`, `cp .env.example .env`, set `APP_ENCRYPTION_KEY`, `APP_URL=https://your.domain`, `COOKIE_SECURE=true`,
   `LLM_ALLOW_PRIVATE_NETWORK=false` if other people can configure endpoints, and optionally `SMTP_URL`.
3. Change the Postgres password in `docker-compose.yml` (and `DATABASE_URL`) for anything internet-facing.
4. `docker compose up -d --build`.
5. Put a TLS reverse proxy in front of `127.0.0.1:3000` (Caddy example):
   ```
   your.domain {
     reverse_proxy 127.0.0.1:3000
   }
   ```
   Only the web container is published; API, Postgres and Redis listen on the internal network / loopback.
6. Verify: `curl https://your.domain/api/health` → `{"ok":true,"db":true,"redis":true}`.

Upgrades: `git pull && docker compose up -d --build` (migrations apply on API start).

## Docker images

One root `Dockerfile` with two targets built from a shared install/build stage:

| Target | Image | Used by |
|---|---|---|
| `api` | `icc-api` | `api` service (`node dist/main.js`, runs migrations first) and `worker` service (`node dist/worker.js`) |
| `web` | `icc-web` | `web` service (Next.js standalone) |

`docker compose up -d --build` starts all five services. Start order is enforced with health checks:
postgres + redis → api → worker + web. `./agent-workspace` is bind-mounted into api and worker at `/agent-workspace`,
so exported task packages appear on the host for Claude Code / Cursor / Antigravity.

## Running the Claude Code headless adapter

- **Docker:** the image includes the Claude Code CLI. Run `claude setup-token` on your machine, then set
  `AGENT_CLAUDE_CLI_ENABLED=true` and `CLAUDE_CODE_OAUTH_TOKEN=<token>` in `.env` and `docker compose up -d --build`.
  Only the worker receives the token.
- **Local (`pnpm dev:*`):** set `AGENT_CLAUDE_CLI_ENABLED=true` in `.env` and restart the API and the worker. The
  worker uses your existing `claude` login.

The worker installs the skill pack into `./agent-workspace` on start (Docker). Step-by-step instructions, including
Cursor, are in the README's **AI setup** section; details in [AGENTS.md](AGENTS.md).

## Logs and health

- API and worker log JSON when `NODE_ENV=production` (one line per event, no secrets).
- `GET /api/health` checks Postgres and Redis. Compose uses it as the API healthcheck.
- Audit events (logins, password resets, sharing, membership, LLM config changes, exports, deletions) are stored in
  `AuditEvent` and visible to workspace owners in **Workspace & members**.

## Scaling notes

The modular monolith comfortably serves a personal deployment. Add worker replicas for throughput (leases make it safe).
Increase Prisma's pool with `?connection_limit=` on `DATABASE_URL` if you raise worker concurrency.
