# Recova — Project Context & Build Plan

**Autonomous, bounded AI revenue recovery agent.**
Razorpay /buildathon · Track 3: AI Revenue Recovery.

> **The one principle everything follows:** *the LLM decides what is appropriate; deterministic code decides what is allowed.*

The brief: detect revenue at risk → diagnose → choose the right intervention → recover the money, with **measured recovery across a batch**, **compliant escalation**, **stopping rules**, and an **audit trail**. This document is the single source of truth for the build: architecture, data model, pipeline semantics, demo script, and — critically — every gap we identified in the plan and its solution.

---

## 1. What we are demoing (the pitch)

A merchant has ₹6L+ of failed/overdue revenue. Click **START RECOVERY**: 100 failed payments enter a pipeline where an agent diagnoses each failure, chooses a bounded intervention (retry / outreach / escalate to human), executes it, and accounts for every rupee. Final screen, computed from the ledger:

> **₹6.1L at risk · ₹4.2L recovered (69%) · 12 escalated with reasons · 0 customers over-contacted · full audit trail (CSV export).**

Why this wins: most teams will build "AI detects failures." The bar in the brief is *bounded execution and honest accounting* — which is backend engineering, our home turf. The differentiator line for judges:

> "Dunning and collections are a compliance problem wearing an AI costume — so the LLM diagnoses and persuades, but a rules engine keeps its hands out of the till, and every rupee is accounted for."

---

## 2. Non-negotiables (agreed before writing code)

1. **LLM suggests, application authorizes.** The LLM output is a structured suggestion validated against the rules engine's allowed set. It can never call Razorpay, never invent an action, never touch a hard-blocked customer.
2. **DB is the source of truth for everything** — case state, "what's due" (`nextActionAt`), and money. Queues are transport, not memory.
3. **Money is BigInt paise.** No floats anywhere. JSON serialization converts via Express `json replacer`.
4. **The demo runs with zero external dependencies**: no real emails sent, no LLM required (offline template/deterministic fallbacks), payment outcomes simulated with a **seeded RNG** so a judge re-running it sees the same numbers. The dashboard labels simulated parts honestly.
5. **No case may end in limbo.** Every case ends in a terminal state (`RECOVERED | ESCALATED | WRITTEN_OFF`) or has a scheduled next action — enforced by the state machine and verified by `GET /health/invariants`.
6. **Everything is audited.** Append-only `AuditLog`, actor-labeled (`SYSTEM | RULE_ENGINE | LLM | HUMAN`), exported as CSV in the demo.

---

## 3. Architecture

```
Razorpay test-mode webhooks (payment.failed)         [seeded batch = demo input]
        │
        ▼
POST /webhooks/razorpay ── raw-body HMAC verify (timing-safe)
        │                      duplicate eventId ⇒ ack + skip
        ▼
WebhookEvent (Postgres) ── conditional claim (processedAt) ⇒ no double-ingest
        │
        ▼
ingestWebhookEvent() ⇒ Payment row (attempt evidence) + RecoveryCase + Ledger
        │
        ▼
┌─ classify queue ──────────────────────────────────────────────────┐
│ L1: error-code table (deterministic, free, offline)               │
│ L2: LLM only for unknown codes (8s timeout, zod-validated)        │
│ L3: fallback UNKNOWN ⇒ outreach-only, never auto-retry            │
└──────────────┬────────────────────────────────────────────────────┘
               ▼
┌─ decision queue ──────────────────────────────────────────────────┐
│ rules engine → allowed set (hard constraints FIRST, then cause    │
│ menus) ⇒ LLM picks within the set ⇒ veto + deterministic          │
│ fallback if it suggests outside / is down                         │
│ RecoveryAction row stores llmDecision + ruleDecision VERBATIM     │
└──────────────┬────────────────────────────────────────────────────┘
               ▼
      nextActionAt (Postgres)  ◄───── THE SWEEPER (2s tick)
               │                      claims WAITING_SCHEDULE cases
               ▼                      due at/ before simNow → decision queue
┌─ action queue ────────────────────────────────────────────────────┐
│ claim PENDING→EXECUTING (conditional update)                      │
│ RETRY_PAYMENT → seeded simulator → RECOVERED / schedule next      │
│ SEND_EMAIL    → draft (LLM or template) → simulate outcome        │
│ ESCALATE      → terminal, human handoff with reason               │
│ NO_ACTION     → WRITTEN_OFF                                       │
│ crash ⇒ action FAILED, case parked back to WAITING_SCHEDULE       │
└───────────────────────────────────────────────────────────────────┘
               ▼
   AuditLog (append-only)  ·  RecoveryLedger (₹ accounting)
               ▼
   Dashboard numbers computed ONLY from ledger/counts — never from LLM output
```

**Case state machine** (all transitions conditional-update guarded):

```
DIAGNOSING → DECIDING → ACTING → (terminal | WAITING_SCHEDULE)
                                   WAITING_SCHEDULE → DECIDING   (sweeper, when due)
Terminals: RECOVERED | ESCALATED | WRITTEN_OFF
```

---

## 4. Repo structure (single package — deliberately not a monorepo)

Monorepo/workspace machinery buys nothing in a 48h build and costs 3am debugging. Plain folders, one `package.json`.

```
recova/
├── CONTEXT.md                  ← this file
├── prisma/
│   ├── schema.prisma           ← invoice-linked RecoveryCase (see §5)
│   └── seed.ts                 ← 100 deterministic cases + planted fixtures
├── src/
│   ├── server.ts               ← Express; json replacer for BigInt; raw-body webhooks
│   ├── lib/                    env, logger, prisma, redis, queues, money, rng
│   ├── services/
│   │   ├── rules.service.ts    ← THE RULES ENGINE (most important file)
│   │   ├── classify.service.ts ← deterministic error-code → cause table
│   │   ├── llm.service.ts      ← LLM boundary: timeouts, zod, offline fallbacks
│   │   ├── razorpay-sim.service.ts ← seeded payment-outcome simulator
│   │   ├── recovery.service.ts ← ingestion, case creation, batch start
│   │   ├── simclock.service.ts ← sim clock (DB row id=1)
│   │   ├── audit.service.ts    ← append-only audit helper
│   │   └── summary.service.ts  ← dashboard aggregation + exceptions
│   ├── routes/                 webhooks, simulation, recovery, summary, health
│   └── workers/                sweeper, classify, decision, action, index
├── docker-compose.yml          postgres + redis
└── .env.example                all knobs; empty OPENAI_API_KEY = offline mode
```

---

## 5. Data model — the two decisions that changed from draft v1

**(a) RecoveryCase links to the INVOICE, not to one failed payment.** The v1 draft had `paymentId @unique` on the case while also tracking `attemptCount` — retries had nowhere to live. Now: every attempt (original failure + retries) is a `Payment` row belonging to the case, so attempt history is **evidence in the audit trail**, not just a counter. One active case per invoice (`invoiceId @unique`); a late failure on a closed case is audited (`LATE_FAILURE_AFTER_CLOSURE`), never silently dropped.

**(b) `nextActionAt` lives on the case in Postgres.** Not BullMQ delayed jobs (see gap G1).

Other load-bearing choices:
- `RecoveryAction.ruleDecision` / `llmDecision` store **both** decisions verbatim as JSON — the case-detail screen renders "what the model suggested" vs "what was allowed" side by side. That's the explainability demo.
- `RecoveryLedger` per case: `atRiskPaise / attemptedPaise / recoveredPaise`. All dashboard money = aggregates of this table.
- `WebhookEvent.eventId @unique` = webhook idempotency.
- `SystemState.simNow` = the simulation clock (single row).

---

## 6. The rules engine (contract)

`rules.service.ts` exports `allowedActions(ctx) → AllowedAction[]`. Hard constraints are checked **before** cause menus — they cannot be talked around by any prompt:

| Constraint | Effect |
|---|---|
| `optedOut` | ESCALATE / NO_ACTION only — zero automation |
| `harassmentCount ≥ 2` | outreach blocked, ESCALATE / NO_ACTION only |
| `attemptCount ≥ 3` | retry ladder exhausted → human |
| `cause = SUSPECTED_FRAUD` | never automated, ever |
| `amountPaise > ₹5,00,000` | above auto-retry ceiling → humans only |
| `contactCount ≥ 3` | outreach done; retry/stairs only |
| quiet hours (22:00–08:00 IST) | outreach **deferred** to 08:00 IST, never dropped |

Cause menus (extract): `INSUFFICIENT_FUNDS → retry+email ok` · `EXPIRED_CARD/AUTHENTICATION_FAILED → email only (retry is pointless until the customer acts)` · `CUSTOMER_CHURN → exactly one respectful outreach, then humans`.

Fallback chain when the LLM is down/silenced/out-of-set: **record the veto as a BLOCKED action row** (judge-visible metric: "rule blocks") → deterministic `fallbackAction()` picks from the allowed set by priority → case proceeds. The unit tests in `rules.service.test.ts` pin all of this.

---

## 7. LLM usage policy

The LLM does exactly three jobs — all inside the rules engine's bounds:

1. **Classify ambiguous failures** — only when the deterministic error-code table returns nothing. Structured JSON, zod-validated, 8s abort timeout.
2. **Choose the intervention** — from the allowed set only, with a stated `reason` + `confidence` that go verbatim into the audit log and the case-detail screen.
3. **Draft outreach** — warm, human, ≤90 words; Hinglish tone is a stretch goal straight from the brief's example directions.

Every LLM function degrades gracefully: disabled (`OPENAI_API_KEY` empty) / timeout / malformed output ⇒ `null` ⇒ deterministic fallback. **The demo must survive a dead network.** Template emails per cause exist for exactly this.

---

## 8. Simulation design (the demo's engine room)

- **`POST /simulation/advance {days}`** moves `SystemState.simNow`; the sweeper (2s tick) picks up everything due. This is the demo's fast-forward control.
- **Payment outcomes are ours to decide.** In Razorpay test mode, 100 retries behave unpredictably — so `razorpay-sim.service.ts` owns outcomes via `mulberry32(hash(caseId:attemptNo:SIM_SEED))` with per-cause probability tables (insufficient funds ~65% on retry, expired card ~5% until card update, etc.). Same seed ⇒ same recovery rate every run.
- **`POST /simulation/reset`** re-runs the deterministic seed — for the judge who clicks twice.
- Dashboard copy says "payment outcomes simulated, seeded" — honest about what's real (pipeline, rules, accounting) vs simulated (the bank).
- Seed plants demo fixtures: **case 0** opted-out customer (straight to human), **case 1** harassment-flagged, **case 2** suspected fraud, **case 3** ₹5L+ B2B invoice *with successful payment history* (the LLM's "retry" reason writes itself), **case 4** expired card (email-first path).

---

## 9. API surface

| Route | Purpose |
|---|---|
| `POST /webhooks/razorpay` | live ingestion; raw-body HMAC verify, idempotent |
| `POST /recovery/start` | **START RECOVERY button** — ingests the seeded batch |
| `GET /recovery/cases?state=` · `GET /recovery/cases/:id` | list / full detail (payments, actions, audit) |
| `GET /summary` | all dashboard numbers (ledger-computed) |
| `GET /simulation/state` · `POST /simulation/advance` · `POST /simulation/reset` | demo controls |
| `GET /health/invariants` | limbo-case + stuck-action probe (see G5) |
| `GET /health` | liveness |

---

## 10. Gap analysis — what could sink this, and the implemented/planned solution

| # | Gap | Solution (status) |
|---|-----|-------------------|
| G1 | BullMQ delayed jobs die with Redis; can't be fast-forwarded for the demo | DB `nextActionAt` is the only schedule; **sweeper** claims due cases with conditional `updateMany` → re-enqueue. Advancing simNow advances the world. *(implemented)* |
| G2 | LLM in the critical path ×100 cases = latency + flakiness during judging | Deterministic error-code **pre-classifier** first; LLM only for unknown codes and drafting; 8s timeout; template fallbacks. *(implemented)* |
| G3 | Test-mode Razorpay retries are non-reproducible ⇒ pitch numbers won't repeat | Seeded-RNG outcome simulator owned by us; dashboard labeled honestly; `SIM_SEED` in env. *(implemented)* |
| G4 | Duplicate webhooks / concurrent double-execution | Unique `eventId` + conditional claim; action rows claimed `PENDING→EXECUTING` conditionally; unique BullMQ jobIds per stage transition. *(implemented)* |
| G5 | Cases stuck in limbo after any crash/edge | Explicit state machine with terminal states + `GET /health/invariants` (limbo = non-terminal with no `nextActionAt`; stuck = EXECUTING actions). Failure-mode checklist runs against this endpoint. *(implemented)* |
| G6 | LLM suggests a disallowed action | Veto recorded as BLOCKED action row (metric) + deterministic fallback; never an exception path. *(implemented)* |
| G7 | Float money bugs | BigInt paise everywhere; Express json replacer; `en-IN` formatting. *(implemented)* |
| G8 | Compliance moments: quiet hours, harassment, opt-out | In the rules engine **before** cause menus; `nextContactableTime` defers outreach to 08:00 IST. *(implemented)* |
| G9 | Worker crash mid-action | catch → action `FAILED` + case parked to `WAITING_SCHEDULE` + `ACTION_FAILED_PARKED` audit — failure is a visible state, not silence. *(implemented)* |
| G10 | Judge clicks twice / wants a fresh run | `POST /simulation/reset` = truncate + deterministic re-seed. *(implemented)* |
| G11 | Dashboard eats the whole hackathon | Hard budget **5–6h**, exactly 3 screens (§12). Cut: auth, multi-tenant anything, charts beyond one breakdown. *(planned — cut scope)* |
| G12 | Real email/SMS integration rabbit hole | Emails are **rendered + audited, not sent**. Demo shows the draft in the case detail. *(scope cut)* |
| G13 | Attempt history is a bare counter (v1 schema flaw) | Payments belong to the case; every retry is a row. *(implemented — schema revision)* |
| G14 | Secrets/env mistakes | `.env.example`; no real keys in repo; `DEV_ALLOW_UNSIGNED` documented as dev-only. *(implemented)* |
| G15 | Judge asks "prove the numbers" | Everything computed from `RecoveryLedger`; audit CSV export; `/health/invariants` public. *(planned for dashboard)* |
| G16 | Promise-to-pay (reply parsing) overruns time | Stretch goal only; scripted demo beat if built. *(stretch)* |

---

## 11. Build order (24–48h, two backend-focused builders)

| Phase | Hours (cumulative) | Deliverable |
|---|---|---|
| 1. Foundation | 0–2 | `db:up`, `db:push`, `db:seed` green; both processes boot |
| 2. Pipeline E2E | 2–6 | webhook → case → classify (table-only) → decision (fallback only) → action → terminal states |
| 3. Rules + audit + ledger | 6–9 | full rules engine + unit tests green; audit trail populated |
| 4. Sim clock + sweeper + batch | 9–12 | `advance`, `start`, `reset`; 100 cases flow |
| 5. LLM integration | 12–16 | real classification/decision/drafting with fallbacks proven off |
| 6. Dashboard | 16–20 | 3 screens only (below) |
| 7. Failure scenarios | 20–24 | §13 checklist vs `/health/invariants` |
| 8. Buffer + rehearsal | 24+ | demo script ×3, timing, backup screen recording |

---

## 12. Dashboard (3 screens, money-first — it's a finance product, not an AI toy)

1. **Home = the money screen** (mocked layout below). Everything from `/summary`.
```
┌────────────────────────────────────────────────────┐
│ RECOVA · Autonomous Revenue Recovery               │
├────────────────────────────────────────────────────┤
│ ₹6.10L At Risk   ₹4.20L Recovered   69% Rate       │
│ 100 Cases        73 Recovered      12 Escalated    │
│ RECOVERY BY CAUSE                                  │
│  Insufficient Funds 78% · Expired Card 64% · ...   │
│ EXCEPTIONS (needs_human)                           │
│  INV-1042 ₹52,000 retries exhausted                │
│  INV-1098 ₹31,500 customer opted out               │
└────────────────────────────────────────────────────┘
```
2. **Case detail** — customer, amount, cause + confidence, **AGENT DECISION** (action + LLM reason), **RULE CHECK** (✓/✗ list from `ruleDecision` JSON), **AUDIT TRAIL** timeline.
3. **Demo controls** — START RECOVERY, advance days, reset, invariants badge.

## 13. Failure-scenario checklist (Phase 7 — run all, against `/health/invariants`)

Razorpay timeout (force in sim) · LLM timeout/garbage (kill key mid-run) · duplicate webhook (replay same eventId) · retry-limit exhaustion · opted-out customer · fraud case · re-failure after recovery · double `POST /recovery/start` · advance with zero due cases · worker killed mid-action (expect `ACTION_FAILED_PARKED`, case re-decided). **Pass = every case terminal or scheduled; zero limbo; audit explains every transition.**

## 14. The 3-minute demo script

1. "Here's ₹6.1L of failed revenue." → Home screen.
2. Click **START RECOVERY** → 100 cases enter the pipeline; live state churn.
3. Open **case RCV-1003** (₹5L+ B2B, prior successful history): FAILED → DIAGNOSING → DECIDING → RULE CHECK ✓ → RETRY → RECOVERED, with the LLM's stated reason on screen.
4. Open an escalation case: 3 attempts → RETRY LIMIT → RULE BLOCKED → human escalation with reason. Point at audit trail.
5. Advance 3 days → recovery-by-cause numbers move.
6. Final ledger line + the architecture line: *"The model never had authority to act outside the rules engine."*
7. If time: kill `OPENAI_API_KEY`, re-run — system degrades, nothing stalls.

## 15. Metrics to have ready for Q&A

Recovery rate overall / by cause / by intervention · false-contact rate (paid without contact or opted-out — must be 0) · escalation rate + reason distribution · rule blocks vs LLM decisions vs human escalations · average time-to-recovery (sim days) · audit coverage (audit rows per case).

## 16. Explicit scope cuts (do not build)

Real email/WhatsApp/SMS sending · reply parsing (G16) · auth/multi-tenant (this is a demo product) · Dockerfile for the app itself · charts beyond one breakdown · mobile anything · Redis persistence tuning.

## 17. After the hackathon — resume framing

This becomes the fourth project row: *"Built an LLM agent that recovered N% of failed payments with bounded, audited actions — rules-engine authorization layer, idempotent webhook ingestion, BullMQ pipeline with DB-driven scheduling, seeded simulation for reproducible evaluation."* The multi-tenant SaaS idea remains a separate post-hackathon build; Track 3 already covers the payments-domain story better than a CRUD invoicing app would.
