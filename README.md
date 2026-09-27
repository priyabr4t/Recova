# Recova

Autonomous, **bounded** AI revenue recovery agent — Razorpay /buildathon, Track 3 (AI Revenue Recovery).

> The LLM decides what is appropriate. Deterministic code decides what is allowed.

## Architecture

- **Backend** (`backend/`): Express API + BullMQ workers + Prisma + PostgreSQL + Redis
- **Frontend** (`frontend/`): React + shadcn/ui + Tailwind dark theme + Vite

## Quickstart

```bash
# 0. Environment (first time only)
cp .env.example .env                       # docker compose ports (defaults fine unless 5432/6379 are taken)
cp backend/.env.example backend/.env       # API config
# If you changed POSTGRES_PORT/REDIS_PORT above, keep DATABASE_URL/REDIS_URL
# in backend/.env in sync.

# 1. Install dependencies (workspaces: root + backend + frontend)
npm install

# 2. Start infrastructure (postgres + redis via docker compose)
npm run db:up

# 3. Apply migrations and seed 100 deterministic cases (+ demo login & webhook key)
npm run db:migrate && npm run db:seed

# 4. Start API + frontend together
npm run dev
```

- API: `http://localhost:8080` (from `PORT` in `backend/.env`) — also serves the
  built dashboard from `backend/dist-frontend` in production mode.
- Frontend dev server: vite (5173, or the next free port) — proxies API routes
  to the backend automatically.
- No `OPENAI_API_KEY`? Everything still runs — deterministic fallbacks (error-code
  table + template emails) take over. That's the offline demo mode.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /webhooks/razorpay` | Razorpay webhook ingestion (per-org `x-api-key` + HMAC verify) |
| `POST /auth/signup` / `login` / `logout` · `GET /auth/me` | Session auth (JWT httpOnly cookie) |
| `POST /recovery/start` | START RECOVERY (plan-limit aware) |
| `GET /recovery/cases` · `GET /recovery/cases/:id` | List cases / case detail (by id or case number) |
| `POST /recovery/cases/:id/notes` · `/escalate` · `/write-off` · `/re-decide` | Human overrides (HUMAN actor, audited) |
| `GET /recovery/audit` · `GET /recovery/audit/export` | Audit feed (filterable) / CSV export |
| `GET /summary` | Dashboard numbers (ledger-computed, per org) |
| `GET /billing` · `POST /billing/plan` | Usage vs plan limits; dev-mode plan switch |
| `GET/PATCH /org` · `POST /org/invite` · `DELETE /org/members/:id` | Workspace + team |
| `GET/POST/DELETE /org/keys` | Webhook API key management |
| `GET/PUT /integrations` | Razorpay / email integration config (secrets write-only) |
| `GET /simulation/state` · `POST /simulation/advance` · `POST /simulation/reset` | Demo controls (auth required) |
| `GET /health/invariants` · `GET /health` | Limbo/stuck probe · liveness |

## Product docs

| Doc | What it is |
|---|---|
| [PRODUCT.md](./PRODUCT.md) | SaaS product vision, intention, current state, target architecture |
| [TODO.md](./TODO.md) | Phased roadmap to the complete SaaS (auth/tenancy → polish → billing → integrations → hardening) |
| [docs/FEATURES.md](./docs/FEATURES.md) | Feature-by-feature inventory with file references and status |
| [CONTEXT.md](./CONTEXT.md) | Original hackathon design doc (preserved) |

## Full project plan

See **[CONTEXT.md](./CONTEXT.md)** (hackathon era) and **[PRODUCT.md](./PRODUCT.md)** (SaaS era).
