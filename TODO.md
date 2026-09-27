# Recova — SaaS Roadmap / TODO

Ordered build plan to take the working demo engine (see [PRODUCT.md](PRODUCT.md)) to a complete
SaaS product. UI stays in the existing trendy dark SaaS style: zinc-950 surfaces, violet→indigo
gradient accent, glassy rounded cards, tinted badges, tabular money — extended, not redesigned.

Guiding rule for every phase: **the LLM decides what is appropriate; deterministic code decides
what is allowed.** Auth, tenancy, billing, and limits are deterministic walls, never model choices.

---

## Phase 1 — Core SaaS foundation: auth + multi-tenancy ✅ *(built — this phase is done)*

The biggest gap. Nothing about tenancy existed (explicit hackathon scope cut, CONTEXT.md §16).

### Data model
- [x] Add `Organization` (name, slug @unique, plan placeholder), `User` (email @unique, name, passwordHash), `Membership` (orgId+userId @unique, role: OWNER/ADMIN/MEMBER), `ApiKey` (orgId, prefix, hashed key, label) models.
- [x] Add `orgId` FK + index to `Customer`, `Invoice`, `Payment`, `RecoveryCase`, `RecoveryAction`, `AuditLog`, `RecoveryLedger`, `WebhookEvent` (uniques made per-org: invoiceNumber, caseNumber, eventId, razorpayPaymentId).
- [x] Keep `SystemState` global (simulation stays a demo feature).
- [x] Switch from `prisma db push` to `prisma migrate` (baseline migration `20260907000000_init_saas_tenancy`).

### Backend
- [x] `bcryptjs` password hashing; JWT (jose) in httpOnly cookie; `AUTH_SECRET` env.
- [x] Routes: `POST /auth/signup` (creates user + org + OWNER membership), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- [x] `requireAuth` middleware (attaches `{userId, orgId, role}`); applied to `/recovery`, `/summary`, `/simulation`.
- [x] Org-scope every service query (`recovery.service.ts`, `summary.service.ts`, `audit.service.ts`); workers resolve org from the case row.
- [x] Webhook auth: `x-api-key` header → hashed lookup (timing-safe) → org; Razorpay HMAC verify stays layered on top.
- [x] Seed: demo org + demo user (creds in `.env.example`) + webhook API key (printed once); all demo data attached to demo org; identity survives simulation reset.

### Frontend
- [x] `/login` and `/signup` pages outside `AppShell` — split-screen: brand panel with gradient glow + "Bounded agent · every rupee accounted for" tagline, right side clean form card.
- [x] `AuthContext` (me/logout), API client sends credentials + typed errors.
- [x] `RequireAuth` route guard (401 → redirect to `/login` with return path).
- [x] App shell header: user menu (avatar initials, name, org slug, logout); sidebar gains Settings nav entry (+ placeholder Settings page listing upcoming sections).

### Verification
- [x] Typecheck + unit tests green (22/22); migration + seed clean.
- [x] E2E in browser: unauth → /login redirect · demo login → org-scoped dashboard · user menu · sign out · signup new org → empty isolated workspace. API smoke: 401s without session/key, scoped summary, webhook ingest via API key.

---

## Phase 2 — Product polish + UI ✅ *(built, with two carried-over items)*

- [x] **Settings pages**: Profile (name, password), Organization (rename), Team (invite + remove, one-time temp password for new accounts), API Keys (create/revoke, shown once). *Notifications page: not built — carried over.*
- [x] **Onboarding checklist** on the dashboard for new workspaces (key → Razorpay → team → START RECOVERY). *Full wizard: carried over — checklist covers the flow.*
- [x] **Charts with recharts**: Money-at-Risk-by-Cause donut on the dashboard (themed). *Recovery-over-time series: needs a trends endpoint — carried over.*
- [ ] **Data layer**: replace raw `usePolling` with React Query (kept polling for now — works, toasts cover errors). *Carried over.*
- [x] **Responsive app shell**: off-canvas sidebar with top bar < lg.
- [x] Wire shadcn `dialog/tabs/toast/input/button` primitives (reset confirmation dialog, settings tabs, toasts on all actions, theme tokens added to index.css).
- [x] Toast-based error/success feedback on every mutation; spinners on async panels.
- [x] **Audit Trail page** (`/audit`): actor filter pills, event search, expandable metadata, CSV export.
- [x] Case detail: **Human Actions** card — add note, escalate, write off, re-decide; all audited with the HUMAN actor.

## Phase 3 — Monetization 🚧 *(core built — deterministic limits + billing UI; real Stripe checkout remains)*

- [ ] Stripe integration: products/prices (Free / Pro / Scale), checkout session, customer portal webhook.
- [x] Plan state on `Organization` (free/pro/scale + unlimited demo plan); Stripe columns when checkout lands.
- [x] Usage metering: cases/month, API keys, seats — per-org counters with themed usage bars on the Billing tab.
- [x] Enforce plan limits deterministically: `START RECOVERY` claims only up to the remaining monthly allowance; over-limit events stay parked + `USAGE_LIMIT_BLOCKED` audit; 402 drives the UI upsell. Same for seats and key counts.
- [x] Per-org API keys: full management UI (create once-shown, revoke, last-used). *Per-key rate limits: carried over.*
- [x] Billing settings page: current plan, usage vs limits, plan grid with upgrade CTAs. *Invoices link: awaits Stripe.*
- [x] Gating UX: 402 responses surface as error toasts + redirect to Billing (in-theme, no dead ends).

## Phase 4 — Real integrations 🚧 *(config layer + live email built; live payment execution remains)*

- [x] **Razorpay key vault**: per-org credentials, AES-256-GCM encrypted at rest, write-only API (never returned), live/simulator flag per org. *Actual live retry execution against the gateway: remaining.*
- [x] **Live email sending**: Resend integration (flag-gated per org, from-name/reply-to), `EMAIL_SENT` vs `EMAIL_GENERATED` in the audit trail; drafts remain the default. *Unsubscribe flow: remaining.*
- [ ] **Reply parsing** (old stretch goal G16): detect promise-to-pay / refusal / wrong-person; feed as case events; LLM classification stays bounded by rules engine.
- [x] Webhook onboarding: per-org API keys + key management in Settings. *Signed per-org webhook URL page: carried over.*
- [ ] Live/simulation toggle per org, clearly labeled everywhere (honesty principle).
- [ ] Per-org LLM cost tracking + reporting.

## Phase 5 — Production hardening 🚧 *(basics built)*

- [x] Rate limiting: global 300 req/min/IP + strict 10 req/min on login/signup (in-memory; Redis-backed when multi-node). *Per-API-key limits + CORS allowlist + helmet: remaining.*
- [x] CI: GitHub Actions — typecheck + tests + prisma validate + frontend build + backend compile on every push/PR.
- [x] Dockerfile (multi-stage: build frontend + backend, serve via Express, `migrate deploy` on boot) + `.dockerignore`. *Compose full-stack + deploy target: remaining.*
- [ ] Redis persistence config; queue dashboard (BullMQ Board) behind auth.
- [ ] Audit retention policy + per-org data export/delete (GDPR-style).
- [ ] Staging/prod envs, secrets management, error tracking (Sentry), uptime checks on `/health/invariants`.
- [ ] Load test the sweeper + workers at 10k+ cases; add integration tests for route + tenancy isolation.

---

## Deliberate non-goals (keep cut)

- Multi-currency (INR/paise assumption is load-bearing for now).
- Self-hosted/on-prem deployment story.
- LLM-driven changes to rules, limits, or permissions — ever.
