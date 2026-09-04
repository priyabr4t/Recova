# Recova

Autonomous, **bounded** AI revenue recovery agent — Razorpay /buildathon, Track 3 (AI Revenue Recovery).

> The LLM decides what is appropriate. Deterministic code decides what is allowed.

## Architecture

- **Backend** (`backend/`): Express API + BullMQ workers + Prisma + PostgreSQL + Redis
- **Frontend** (`frontend/`): React + shadcn/ui + Tailwind dark theme + Vite

## Quickstart

```bash
# 1. Install dependencies
cd backend && npm install && cd ../frontend && npm install

# 2. Start infrastructure
cd backend && npm run db:up

# 3. Push schema and seed
cd backend && npm run db:push && npm run db:seed

# 4. Start both processes
npm run dev  # from root — concurrently starts API + frontend

# Or separately:
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd frontend && npm run dev
```

## Endpoints

| Route | Purpose |
|---|---|
| `POST /webhooks/razorpay` | Razorpay webhook ingestion |
| `POST /recovery/start` | START RECOVERY button |
| `GET /recovery/cases` | List cases |
| `GET /recovery/cases/:id` | Case detail |
| `GET /summary` | Dashboard numbers |
| `GET /simulation/state` | Sim clock |
| `POST /simulation/advance` | Fast-forward time |
| `POST /simulation/reset` | Deterministic reset |
| `GET /health/invariants` | Limbo/stuck probe |
| `GET /health` | Liveness |

## Full project plan

See **[CONTEXT.md](./CONTEXT.md)**.
