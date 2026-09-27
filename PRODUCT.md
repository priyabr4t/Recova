# Recova — Product Document

**Autonomous, bounded AI revenue recovery for merchants — as a SaaS.**

> **The one principle everything follows:** *the LLM decides what is appropriate; deterministic code decides what is allowed.*

Recova started as a Razorpay /buildathon build (Track 3: AI Revenue Recovery). The core engine —
bounded agent pipeline, rules engine, ledger, audit trail — is built and working. This document
defines what it takes to turn that engine into a complete, sellable SaaS product, without
compromising the intention that makes it different.

The original hackathon design doc is preserved in [CONTEXT.md](CONTEXT.md). A granular
feature-by-file inventory lives in [docs/FEATURES.md](docs/FEATURES.md), and the build plan lives
in [TODO.md](TODO.md).

---

## 1. The product in one paragraph

Merchants lose 5–10% of revenue to failed payments that never get retried and customers who were
never followed up with — politely, legally, or at all. Recova ingests `payment.failed` webhooks,
diagnoses each failure, and chooses a **bounded** intervention: retry the payment, send a warm
outreach email, escalate to a human, or write it off. A deterministic rules engine enforces the
compliance guardrails (opt-outs, contact caps, quiet hours, fraud, amount ceilings) *before* the
LLM is ever consulted, every rupee moves through an append-only ledger, and every decision —
including what the LLM was forbidden to do — lands in an audit trail the merchant can export.

## 2. The intention (what we must not lose as we SaaS-ify)

1. **LLM suggests, application authorizes.** Multi-tenancy, billing, and integrations are all
   *outside* the agent's authority. The rules engine stays the wall.
2. **DB is the source of truth** — case state, schedules, money. Queues are transport.
3. **Money is BigInt paise**, ledger-computed. Dashboard numbers are never LLM output.
4. **Honesty about what's real.** The demo labels simulated outcomes; the SaaS will keep that
   honesty by clearly distinguishing *live* integrations from *simulated* ones per workspace.
5. **No case in limbo.** Every case is terminal or has a scheduled next action — `GET /health/invariants`.
6. **Everything is audited**, actor-labeled, exportable. Tenants own their audit trail.

## 3. Where the product stands today (implemented)

### Core engine (complete, working)
- **Webhook ingestion**: `POST /webhooks/razorpay` — raw-body HMAC-SHA256 timing-safe verify,
  `eventId @unique` idempotency + conditional `processedAt` claim, unknown-invoice parking,
  late-failure auditing.
- **Agent pipeline**: BullMQ `classify → decision → action` queues + a 2s DB-backed sweeper that
  claims `WAITING_SCHEDULE` cases due at `nextActionAt`. Postgres is the schedule; queues self-heal.
- **Bounded decisioning**: hard constraints first (opt-out, harassment ≥2, attempt ≥3, fraud,
  ₹5L ceiling, contact ≥3, quiet hours 22:00–08:00 IST), then per-cause action menus. The LLM
  picks *within the allowed set*; out-of-set suggestions are recorded as BLOCKED (a visible
  "rule blocks" metric) with a deterministic fallback.
- **Diagnosis**: L1 deterministic error-code table → L2 LLM classification (zod-validated, 8s
  timeout) for unknown codes → L3 conservative fallback. Graceful offline mode when no API key.
- **Actions**: seeded-RNG payment-retry simulator with per-cause success tables, LLM-drafted
  outreach emails (template fallbacks, rendered + audited, never sent), escalation to human,
  write-off. Crash safety: failed actions park the case and audit it.
- **Accounting**: per-case `RecoveryLedger` (atRisk / attempted / recovered); all dashboard money
  aggregates from it; append-only `AuditLog` with CSV export.
- **Invariant probe**: limbo-case and stuck-action detection.

### UI (complete for the demo, trendy dark SaaS style)
React 18 + Vite + Tailwind v4, Linear/Vercel-style zinc-950 dark theme with a violet→indigo
gradient accent, glassy `rounded-xl` cards, tinted badges, tabular money, skeleton loading.
- **Dashboard**: KPI stat cards, agent-behaviour strip (LLM decisions / rule blocks /
  escalations), recovery-by-cause breakdown, clickable pipeline, exceptions table.
- **Cases**: state filter pills, search, full table, drill-down.
- **Case detail**: fact cards, **Agent Decision vs Rule Check** explainability panel, payment
  attempts, action history, audit timeline.
- **Demo controls**: START RECOVERY ingestion, sim-clock fast-forward, invariants panel, audit
  CSV export, deterministic reset.

### What is deliberately NOT built yet (the SaaS gaps)
- **Auth / multi-tenancy** — no users, orgs, sessions, or per-tenant scoping. Single-tenant demo.
- **Monetization** — no Stripe, plans, usage limits, or API keys.
- **Real integrations** — payment retries are simulated; emails are rendered, never sent; no
  per-merchant Razorpay account wiring.
- **Product polish** — no settings/onboarding, no charts (recharts installed, unused), desktop-only
  layout, raw polling instead of a query library, no toasts/dialogs wired despite shadcn
  primitives existing.
- **Production hardening** — no migrations (`db push`), CI, Dockerfile, rate limiting, or CORS.

## 4. Target SaaS architecture (delta from today)

```
Merchant ──► app.recova.io (React SPA)
             │  auth: email+password → JWT httpOnly cookie
             │  guard: RequireAuth + per-org scoping on every query
             ▼
Express API ── requireAuth/requireOrg middleware ──► org-scoped services
             │                                        │
             │  webhooks: x-api-key (org API key) +   │
             │  Razorpay HMAC verify                  │
             ▼                                        ▼
        Organization ──owns──► Customers / Invoices / Cases / Ledger / AuditLog
             │
             ├─► Stripe: subscription, seats, usage metering (Phase 3)
             ├─► Razorpay per-merchant keys: real retries (Phase 4)
             ├─► Resend/SES: real email send + reply parsing (Phase 4)
             └─► LLM usage metered per org (cost attribution)
```

**Tenancy model**: `Organization → Membership(User, role)`. Every domain table gains an `orgId`
FK with an index; every service query is org-scoped; workers resolve the org from the case row.
Simulation (`SystemState`, seeded demo data) remains a global demo feature, later per-org gated.

## 5. Non-goals (still)

- No real money movement without explicit per-merchant credentials and consent flows (Phase 4).
- No reinventing billing primitives — Stripe owns subscriptions; we own metering.
- No LLM authority creep: new features (team invites, API keys, plan limits) are deterministic
  code paths, never model decisions.
