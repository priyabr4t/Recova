# Recova — Feature Inventory

Status legend: ✅ implemented · 🚧 partial · ❌ not built

## SaaS platform (Phases 2–5 of TODO.md)

| Feature | Status | Where | Notes |
|---|---|---|---|
| Auth: signup/login/logout/me, JWT httpOnly cookie, bcrypt | ✅ | `backend/src/routes/auth.ts`, `lib/auth.ts` | + profile update & password change |
| Multi-tenancy: orgs, memberships (OWNER/ADMIN/MEMBER), orgId scoping on all tables | ✅ | `prisma/schema.prisma`, services | per-org uniques on invoice/case/event ids |
| API keys (webhook ingestion, hashed, shown once) + management UI | ✅ | `routes/org.ts`, Settings → API Keys | plan-limited counts |
| Team management: invite (one-time temp password), remove, roles | ✅ | `routes/org.ts`, Settings → Team | email delivery is Phase 4 |
| Plans + deterministic usage limits (cases/mo, keys, seats) | ✅ | `lib/plans.ts`, `routes/recovery.ts` `/start` | over-limit events parked + audited, 402 → UI upsell |
| Billing page: usage bars, plan grid, dev-mode plan switch | ✅ | `routes/billing.ts`, Settings → Billing | real Stripe checkout: remaining |
| Integrations: Razorpay credentials (AES-256-GCM at rest, write-only) + live/sim flags | ✅ | `routes/integrations.ts`, `lib/crypto.ts`, Settings → Integrations | |
| Live email sending (Resend), flag-gated per org; drafts always audited | ✅ | `services/integrations.service.ts`, `workers/action.worker.ts` | `EMAIL_SENT` vs `EMAIL_GENERATED` |
| Human case overrides: notes, escalate, write off, re-decide (HUMAN actor) | ✅ | `routes/recovery.ts`, `services/recovery.service.ts`, Case Detail | |
| Audit viewer page: actor filters, event search, metadata, CSV export | ✅ | `pages/Audit.tsx`, `GET /recovery/audit` | |
| Onboarding checklist for new workspaces | ✅ | `pages/Dashboard.tsx` | |
| Responsive app shell (off-canvas sidebar < lg) + toasts + confirm dialogs | ✅ | `components/layout/AppShell.tsx`, `lib/toast.ts` | |
| Dashboard donut chart (money at risk by cause) | ✅ | `pages/Dashboard.tsx` (recharts) | |
| Rate limiting (global + auth endpoints) | ✅ | `lib/rateLimit.ts` | in-memory; Redis when multi-node |
| Dockerfile (multi-stage, migrate-on-boot) + CI (typecheck/tests/validate/build) | ✅ | `Dockerfile`, `.github/workflows/ci.yml` | |
| Real payment retry execution (Razorpay gateway call) | ❌ | — | credentials vault + flag built; execution remaining |
| Real Stripe checkout / customer portal / invoices | ❌ | — | dev-mode plan switch in place |
| Recovery-over-time trends endpoint + chart | ❌ | — | |
| Reply parsing (G16) | ❌ | — | |

## Backend

| Feature | Status | Where | SaaS notes |
|---|---|---|---|
| Express API server, BigInt json replacer, graceful shutdown | ✅ | `backend/src/server.ts` | — |
| Razorpay webhook ingestion, raw-body HMAC-SHA256 timing-safe verify | ✅ | `backend/src/routes/webhooks.ts` | needs per-org API key so webhooks land in the right tenant |
| Webhook idempotency (unique eventId + conditional processedAt claim) | ✅ | `routes/webhooks.ts`, `services/recovery.service.ts` | — |
| Case creation from `payment.failed` (case per invoice, ledger init) | ✅ | `services/recovery.service.ts` | — |
| Late-failure after closure / re-failure on open case handling | ✅ | `services/recovery.service.ts:74-89` | — |
| Batch ingestion (START RECOVERY) | ✅ | `startBatch()` in `recovery.service.ts` | per-org batch scoping needed |
| Classify worker: L1 error-code table → L2 LLM → L3 fallback | ✅ | `workers/classify.worker.ts`, `services/classify.service.ts` | — |
| Decision worker: rules engine → LLM pick within allowed set → veto+fallback | ✅ | `workers/decision.worker.ts`, `services/rules.service.ts`, `services/llm.service.ts` | — |
| Rules engine hard constraints (opt-out, harassment, attempt cap, fraud, ₹5L ceiling, contact cap) | ✅ | `services/rules.service.ts:46` | unit-tested |
| Quiet hours (22:00–08:00 IST) with deferral to 08:00 | ✅ | `rules.service.ts:29` | — |
| Retry backoff ladder 1h → 72h → 120h | ✅ | `rules.service.ts:106` | — |
| BLOCKED action rows (visible LLM-veto metric) | ✅ | `decision.worker.ts` | — |
| Action worker: retry / email / escalate / write-off, conditional claim | ✅ | `workers/action.worker.ts` | real retry execution needs Razorpay Orders API (Phase 4) |
| Seeded-RNG payment outcome simulator (per-cause probabilities) | ✅ | `services/razorpay-sim.service.ts` | simulation vs live must be per-org labeled |
| LLM email drafting + 8 per-cause template fallbacks | ✅ | `services/llm.service.ts:127-200` | emails never sent — send integration is Phase 4 |
| Crash safety: FAILED action + case parked + audit | ✅ | `action.worker.ts:149` | — |
| DB-backed sweeper (2s) claiming due WAITING_SCHEDULE cases | ✅ | `workers/sweeper.worker.ts` | — |
| Recovery ledger per case (atRisk/attempted/recovered, BigInt paise) | ✅ | `prisma/schema.prisma`, `lib/money.ts` | — |
| Append-only audit log, actor-labeled, CSV export | ✅ | `services/audit.service.ts` | per-org scoping needed |
| Dashboard summary (ledger-computed money, counts, byState, byCause, exceptions) | ✅ | `services/summary.service.ts` | per-org scoping needed |
| Invariants probe (limbo cases, stuck actions) | ✅ | `routes/health.ts` | — |
| Sim clock (SystemState.simNow), advance/reset endpoints | ✅ | `services/simclock.service.ts`, `routes/simulation.ts` | demo-only; gate or remove in prod |
| Deterministic seed: 100 cases + 5 planted fixtures | ✅ | `lib/seed.ts`, `prisma/seed.ts` | attach to demo org |
| Unit tests (rules engine, classify table, seeded RNG) | ✅ | `services/*.test.ts` | no route/integration tests |
| **Auth (users, sessions, passwords)** | ❌ | — | Phase 1 |
| **Organizations / memberships / roles** | ❌ | — | Phase 1 |
| **Per-tenant scoping on every table/query** | ❌ | — | Phase 1 |
| **Per-org API keys (webhook auth)** | ❌ | — | Phase 1 (basic) / Phase 3 (management UI) |
| Rate limiting, CORS config, request-id middleware | ❌ | — | Phase 5 |
| Prisma migrations (`migrate` vs `db push`) | ❌ | — | Phase 1 switch |
| Stripe billing, plans, usage metering | ❌ | — | Phase 3 |
| Real Razorpay retries (Orders/Payments API, per-merchant key vault) | ❌ | — | Phase 4 |
| Real email send (Resend/SES) + reply parsing | ❌ | — | Phase 4 |
| CI, Dockerfile, deployment config | ❌ | — | Phase 5 |

## Frontend

| Feature | Status | Where | SaaS notes |
|---|---|---|---|
| App shell: fixed sidebar, sticky blurred header, sim-clock + invariants widgets | ✅ | `frontend/src/components/layout/AppShell.tsx` | gains user menu + org identity (Phase 1) |
| Dashboard: KPI cards, agent-behaviour strip, cause breakdown, pipeline, exceptions | ✅ | `frontend/src/pages/Dashboard.tsx` | — |
| Cases: filter pills (?state=), search, table, drill-down | ✅ | `frontend/src/pages/Cases.tsx` | — |
| Case detail: badges, fact cards, Agent Decision vs Rule Check, attempts, actions, audit timeline | ✅ | `frontend/src/pages/CaseDetail.tsx` | — |
| Demo controls: start/advance/reset, invariants, CSV export, ledger strip | ✅ | `frontend/src/pages/DemoControls.tsx` | demo-only page; gate per org later |
| Design system: Card/Badge/StatCard/Progress/Skeleton + labels.ts badge metadata | ✅ | `frontend/src/components/ui.tsx`, `src/lib/labels.ts` | — |
| Polling data layer (usePolling, 3–5s) | ✅ | `frontend/src/hooks/usePolling.ts` | replace with React Query (Phase 2) |
| Typed API client | 🚧 | `frontend/src/lib/api.ts` | responses `any`; add credentials + 401 handling (Phase 1) |
| shadcn-style primitives (dialog, select, tabs, toast, button, input…) | 🚧 | `frontend/src/components/ui/*` | generated; only tooltip imported — wire up in Phase 2 |
| recharts | ❌ (installed, unused) | — | Phase 2 dashboards |
| **Login / Signup pages** | ❌ | — | Phase 1 |
| **Auth context + route guards** | ❌ | — | Phase 1 |
| **Settings (profile, org, team, API keys, notifications)** | ❌ | — | Phase 2 |
| **Onboarding wizard** | ❌ | — | Phase 2 |
| **Mobile-responsive shell (collapsible sidebar)** | ❌ | — | Phase 2 |
| **Org switcher / invites UI** | ❌ | — | Phase 2–3 |
| **Billing UI (plans, invoices, usage)** | ❌ | — | Phase 3 |

## Infra / DX

| Item | Status |
|---|---|
| npm workspaces (root + backend + frontend), concurrently dev | ✅ |
| docker-compose (postgres 16 + redis 7) | ✅ |
| zod-validated env (`backend/src/lib/env.ts`) + `.env.example` | ✅ |
| Vite proxy to backend; production build served by Express | ✅ |
| Prisma migrations, CI pipeline, app Dockerfile, deploy config | ❌ (Phase 5) |
