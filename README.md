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

# 3. Push schema and seed 100 deterministic cases
npm run db:push && npm run db:seed

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
| `POST /webhooks/razorpay` | Razorpay webhook ingestion |
| `POST /recovery/start` | START RECOVERY button |
| `GET /recovery/cases` | List cases |
| `GET /recovery/cases/:id` | Case detail (by id or case number) |
| `GET /recovery/audit/export` | Full audit trail as CSV |
| `GET /summary` | Dashboard numbers |
| `GET /simulation/state` | Sim clock |
| `POST /simulation/advance` | Fast-forward time |
| `POST /simulation/reset` | Deterministic reset |
| `GET /health/invariants` | Limbo/stuck probe |
| `GET /health` | Liveness |

## Full project plan

See **[CONTEXT.md](./CONTEXT.md)**.
