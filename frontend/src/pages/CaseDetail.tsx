import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, UserRound, Mail, Phone, ReceiptText, ShieldCheck, Bot,
  Scale, CheckCircle2, Ban, Wallet, IndianRupee, Landmark,
} from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, cn } from '../lib/utils'
import { ACTION_META, ACTION_STATUS_META, ACTOR_META, CAUSE_META, metaFor } from '../lib/labels'
import { Card, CardHeader, Badge, ActorBadge, StateBadge, CauseBadge, EmptyState } from '../components/ui'
import { formatDateTime } from '../lib/labels'

type CaseDetail = {
  id: string
  caseNumber: string
  state: string
  cause: string | null
  causeConfidence: number | null
  causeSource: string | null
  attemptCount: number
  contactCount: number
  amountPaise: number
  nextActionAt: string | null
  createdAt: string
  customer: { name: string; email: string | null; phone: string | null; optedOut: boolean; harassmentCount: number }
  invoice: { invoiceNumber: string; amountPaise: number; dueDate: string; status: string }
  payments: Array<{ id: string; attemptNo: number; status: string; errorCode: string | null; errorDescription: string | null; amountPaise: number; createdAt: string }>
  actions: Array<{ id: string; type: string; status: string; reason: string | null; confidence: number | null; ruleDecision: { allowed?: string[]; blockedSuggestion?: { action: string; reason: string } | null } | null; llmDecision: { action: string; reason: string; confidence: number } | null; outcome: string | null; createdAt: string }>
  ledger: { atRiskPaise: number; attemptedPaise: number; recoveredPaise: number } | null
  auditLogs: Array<{ id: string; actor: string; event: string; metadata: Record<string, unknown> | null; createdAt: string }>
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: kase, loading } = usePolling<CaseDetail | null>(
    () => (id ? api.getCase(id) : Promise.resolve(null)),
    5000,
  )

  if (loading) {
    return <div className="space-y-4"><div className="h-24 animate-pulse rounded-xl bg-zinc-800/70" /><div className="h-64 animate-pulse rounded-xl bg-zinc-800/70" /></div>
  }
  if (!kase) {
    return (
      <Card>
        <EmptyState
          icon={<ReceiptText className="h-5 w-5" />}
          title="Case not found"
          body={`No case matches "${id ?? ''}". It may have been removed by a simulation reset.`}
          action={<Link to="/cases" className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-700">Back to cases</Link>}
        />
      </Card>
    )
  }

  // The operative decision is the most recent non-BLOCKED action row.
  const decision = [...kase.actions].filter((a) => a.status !== 'BLOCKED').at(-1)
  const ruleDecision = decision?.ruleDecision ?? null
  const llmDecision = decision?.llmDecision ?? null
  const ledger = kase.ledger

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link to="/cases" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300">
            <ArrowLeft className="h-3.5 w-3.5" /> All cases
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">{kase.caseNumber}</h2>
            <StateBadge state={kase.state} />
            <CauseBadge cause={kase.cause} />
            {kase.customer.optedOut && <Badge className="border-red-500/30 bg-red-500/10 text-red-300">Opted out</Badge>}
            {kase.customer.harassmentCount > 0 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">Harassment guard ×{kase.customer.harassmentCount}</Badge>}
          </div>
          <p className="text-xs text-zinc-500">
            Invoice {kase.invoice.invoiceNumber} · opened {formatDateTime(kase.createdAt)}
            {kase.nextActionAt && kase.state === 'WAITING_SCHEDULE' && <> · next action {formatDateTime(kase.nextActionAt)}</>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-white">{formatRupees(kase.amountPaise)}</p>
          <p className="text-xs text-zinc-500">invoice value at risk</p>
        </div>
      </div>

      {/* Facts row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"><UserRound className="h-3 w-3" /> Customer</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{kase.customer.name}</p>
          {kase.customer.email && <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500"><Mail className="h-3 w-3" /> {kase.customer.email}</p>}
          {kase.customer.phone && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500"><Phone className="h-3 w-3" /> {kase.customer.phone}</p>}
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"><Scale className="h-3 w-3" /> Diagnosis</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{metaFor(CAUSE_META, kase.cause).label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            confidence {kase.causeConfidence != null ? `${Math.round(kase.causeConfidence * 100)}%` : '—'} · via {kase.causeSource ?? '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"><Landmark className="h-3 w-3" /> Ledger</p>
          <div className="mt-2 space-y-1 text-xs tabular-nums">
            <LedgerLine icon={<Wallet className="h-3 w-3" />} label="At risk" value={ledger?.atRiskPaise ?? kase.amountPaise} />
            <LedgerLine icon={<ArrowLeft className="h-3 w-3 rotate-180" />} label="Attempted" value={ledger?.attemptedPaise ?? 0} />
            <LedgerLine icon={<IndianRupee className="h-3 w-3" />} label="Recovered" value={ledger?.recoveredPaise ?? 0} tone="text-emerald-400" />
          </div>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"><ReceiptText className="h-3 w-3" /> Counters</p>
          <p className="mt-2 text-sm text-zinc-200"><span className="font-semibold tabular-nums">{kase.attemptCount}</span> payment retries</p>
          <p className="mt-0.5 text-sm text-zinc-200"><span className="font-semibold tabular-nums">{kase.contactCount}</span> outreach messages</p>
        </Card>
      </div>

      {/* Decision explainability */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Agent Decision"
            subtitle="What the model proposed, verbatim"
            action={<Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300"><Bot className="h-3 w-3" /> LLM</Badge>}
          />
          <div className="space-y-4 p-5">
            {!decision && <p className="text-sm text-zinc-500">No decision yet — the case is still moving through the pipeline.</p>}
            {decision && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Badge className={metaFor(ACTION_META, decision.type).className}>{metaFor(ACTION_META, decision.type).label}</Badge>
                  <div className="flex items-center gap-2">
                    <Badge className={metaFor(ACTION_STATUS_META, decision.status).className}>{decision.status}</Badge>
                    {decision.confidence != null && decision.confidence > 0 && (
                      <span className="text-xs tabular-nums text-zinc-500">confidence {Math.round(decision.confidence * 100)}%</span>
                    )}
                  </div>
                </div>
                {decision.reason && (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm leading-relaxed text-zinc-300">
                    “{decision.reason}”
                  </p>
                )}
                {llmDecision ? (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">Model's stated reason</p>
                    <p className="mt-1 text-sm text-zinc-300">{llmDecision.reason}</p>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">The model was unavailable (offline mode) — the deterministic fallback policy decided.</p>
                )}
                {decision.outcome && (
                  <p className="text-xs text-zinc-500">Outcome: <span className="text-zinc-300">{decision.outcome.replaceAll('_', ' ').toLowerCase()}</span></p>
                )}
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Rule Check"
            subtitle="What the rules engine allowed — hard constraints first"
            action={<Badge className="border-blue-500/30 bg-blue-500/10 text-blue-300"><ShieldCheck className="h-3 w-3" /> Deterministic</Badge>}
          />
          <div className="space-y-4 p-5">
            {!ruleDecision && <p className="text-sm text-zinc-500">No rule check recorded yet.</p>}
            {ruleDecision && (
              <>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Allowed set</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(ruleDecision.allowed ?? []).map((a) => (
                      <Badge key={a} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> {metaFor(ACTION_META, a).label}
                      </Badge>
                    ))}
                  </div>
                </div>
                {ruleDecision.blockedSuggestion && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300">
                      <Ban className="h-3 w-3" /> Vetoed — outside the allowed set
                    </p>
                    <p className="mt-1.5 text-sm text-zinc-300">
                      LLM wanted <span className="font-medium text-rose-300">{metaFor(ACTION_META, ruleDecision.blockedSuggestion.action).label}</span> — {ruleDecision.blockedSuggestion.reason}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Recorded as a BLOCKED action row and counted in the dashboard's rule-blocks metric.</p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-zinc-600">
                  The LLM never executes outside this set. Hard constraints (opt-out, harassment, fraud, amount ceiling, caps) are checked before any cause menu — they can't be talked around by a prompt.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Payments + actions */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Payment Attempts" subtitle="Original failure plus every retry — evidence, not a counter" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2.5 font-medium">#</th>
                  <th className="px-5 py-2.5 font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Error</th>
                  <th className="px-5 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {kase.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 tabular-nums text-zinc-400">{p.attemptNo}</td>
                    <td className="px-5 py-2.5 tabular-nums text-zinc-200">{formatRupees(p.amountPaise)}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn('text-xs font-semibold', p.status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400')}>
                        {p.status === 'SUCCESS' ? '✓ SUCCESS' : '✕ FAILED'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-zinc-500">{p.errorCode ?? '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-zinc-500 tabular-nums">{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Action History" subtitle="Every intervention proposed for this case" />
          <div className="divide-y divide-zinc-800/50">
            {kase.actions.length === 0 && <p className="p-5 text-sm text-zinc-500">No actions yet.</p>}
            {[...kase.actions].reverse().map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <Badge className={metaFor(ACTION_META, a.type).className}>{metaFor(ACTION_META, a.type).label}</Badge>
                  <Badge className={metaFor(ACTION_STATUS_META, a.status).className}>{a.status}</Badge>
                </div>
                <span className="text-xs tabular-nums text-zinc-600">{formatDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Audit trail */}
      <Card>
        <CardHeader title="Audit Trail" subtitle="Append-only, actor-labelled — every transition is explainable" />
        <div className="p-5">
          {kase.auditLogs.length === 0 ? (
            <p className="text-sm text-zinc-500">No audit entries yet.</p>
          ) : (
            <div className="relative space-y-0">
              {kase.auditLogs.map((log, i) => {
                const meta = metaFor(ACTOR_META, log.actor)
                return (
                  <div key={log.id} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < kase.auditLogs.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-zinc-800" />}
                    <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-zinc-950', meta.dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ActorBadge actor={log.actor} />
                        <span className="text-sm font-medium text-zinc-200">{log.event.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}</span>
                        <span className="text-xs tabular-nums text-zinc-600">{formatDateTime(log.createdAt)}</span>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-xs text-zinc-500 transition hover:text-zinc-300">metadata</summary>
                          <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-[11px] leading-relaxed text-zinc-400">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function LedgerLine({ icon, label, value, tone = 'text-zinc-200' }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-zinc-500">{icon} {label}</span>
      <span className={cn('font-semibold', tone)}>{formatRupees(value)}</span>
    </div>
  )
}
