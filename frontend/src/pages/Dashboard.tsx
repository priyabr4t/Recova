import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Wallet, IndianRupee, TrendingUp, Activity, ArrowUpRight, ShieldOff,
  Bot, AlertTriangle, KeyRound, Plug, Users, Circle, CircleCheck, Loader2,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, formatPercent, cn } from '../lib/utils'
import { CAUSE_META, PIPELINE_STATES, metaFor, STATE_META } from '../lib/labels'

import { Card, CardHeader, StatCard, StateBadge, CauseBadge, EmptyState, PageLoading } from '../components/ui'
import StartButton from '../components/StartButton'

type Summary = {
  money: { atRiskPaise: number; recoveredPaise: number; outstandingPaise: number; attemptedPaise: number; recoveryRate: number }
  counts: { totalCases: number; recovered: number; escalated: number; writtenOff: number; inFlight: number; ruleBlocks: number; llmDecisions: number; escalations: number }
  states: Record<string, number>
  recoveryByCause: Array<{ cause: string; total: number; recovered: number; recoveryRate: number; totalPaise?: number }>
  exceptions: Array<{ caseNumber: string; invoiceNumber: string; customer: string; amountPaise: number; state: string; cause: string | null; attempts: number }>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: summary, loading, refetch } = usePolling<Summary>(() => api.getSummary(), 3000)

  if (loading || !summary) return <PageLoading />

  const m = summary.money
  const c = summary.counts

  const atRiskByCause = (summary.recoveryByCause ?? [])
    .filter((d) => (d.totalPaise ?? 0) > 0)
    .sort((a, b) => Number(b.totalPaise ?? 0n) - Number(a.totalPaise ?? 0n))
    .map((d) => ({
      name: metaFor(CAUSE_META, d.cause).label,
      value: Number(d.totalPaise ?? 0n),
    }))

  return (
    <div className="space-y-6">
      {c.totalCases === 0 && <OnboardingChecklist onStarted={refetch} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="At Risk" value={formatRupees(m.atRiskPaise)} hint={`${c.totalCases} cases in the batch`} icon={<Wallet className="h-4.5 w-4.5" />} tone="zinc" />
        <StatCard label="Recovered" value={formatRupees(m.recoveredPaise)} hint={`${formatRupees(m.attemptedPaise)} attempted`} icon={<IndianRupee className="h-4.5 w-4.5" />} tone="emerald" />
        <StatCard label="Recovery Rate" value={formatPercent(m.recoveryRate, 1)} hint="recovered ÷ at risk, from the ledger" icon={<TrendingUp className="h-4.5 w-4.5" />} tone="violet" />
        <StatCard label="In Flight" value={String(c.inFlight)} hint={`${c.escalated} escalated · ${c.writtenOff} written off`} icon={<Activity className="h-4.5 w-4.5" />} tone="blue" />
      </div>

      {/* Agent behaviour strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniStat icon={<Bot className="h-4 w-4" />} label="LLM decisions" value={c.llmDecisions} hint="actions proposed by the model" />
        <MiniStat icon={<ShieldOff className="h-4 w-4" />} label="Rule blocks" value={c.ruleBlocks} hint="vetoed by the rules engine" />
        <MiniStat icon={<AlertTriangle className="h-4 w-4" />} label="Escalations" value={c.escalations} hint="handed to humans with reasons" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Money at risk by cause — donut */}
        <Card className="xl:col-span-2">
          <CardHeader title="Money at Risk by Cause" subtitle="Share of outstanding exposure per failure cause" />
          <div className="flex flex-col items-center gap-4 p-5 sm:flex-row">
            <div className="h-52 w-52 shrink-0">
              {atRiskByCause.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-zinc-600">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={atRiskByCause} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                      {atRiskByCause.map((entry, i) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number | string) => formatRupees(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
              {atRiskByCause.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{entry.name}</span>
                  <span className="tabular-nums text-zinc-500">{formatRupees(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Pipeline */}
        <Card>
          <CardHeader title="Pipeline" subtitle="Where every case currently sits — click to filter" />
          <div className="p-4">
            <div className="space-y-1">
              {PIPELINE_STATES.map((state) => {
                const count = summary.states?.[state] ?? 0
                const meta = metaFor(STATE_META, state)
                return (
                  <button
                    key={state}
                    onClick={() => navigate(`/cases?state=${state}`)}
                    className="group flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-zinc-800 hover:bg-zinc-800/40"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-zinc-300">
                      <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                      {meta.label}
                    </span>
                    <span className="flex items-center gap-2 text-sm font-semibold tabular-nums text-zinc-200">
                      {count}
                      <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition group-hover:text-zinc-400" />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Exceptions */}
      <Card>
        <CardHeader
          title="Exceptions"
          subtitle="Escalated and written-off cases that need human attention — largest first"
          action={<Link to="/cases" className="text-xs font-medium text-zinc-400 transition hover:text-white">View all cases →</Link>}
        />
        {summary.exceptions.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="No exceptions" body="Nothing needs a human right now. The agent is inside its bounds." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2.5 font-medium">Case</th>
                  <th className="px-5 py-2.5 font-medium">Customer</th>
                  <th className="px-5 py-2.5 font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">State</th>
                  <th className="px-5 py-2.5 font-medium">Cause</th>
                  <th className="px-5 py-2.5 font-medium">Attempts</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {summary.exceptions.map((exc) => (
                  <tr
                    key={exc.caseNumber}
                    onClick={() => navigate(`/cases/${exc.caseNumber}`)}
                    className="cursor-pointer transition hover:bg-zinc-800/30"
                  >
                    <td className="px-5 py-3 font-medium text-blue-400">{exc.caseNumber}</td>
                    <td className="px-5 py-3 text-zinc-300">{exc.customer}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-200">{formatRupees(exc.amountPaise)}</td>
                    <td className="px-5 py-3"><StateBadge state={exc.state} /></td>
                    <td className="px-5 py-3">{exc.cause ? <CauseBadge cause={exc.cause} /> : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-400">{exc.attempts}</td>
                    <td className="px-5 py-3 text-right"><ArrowUpRight className="ml-auto h-4 w-4 text-zinc-600" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function MiniStat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
        <p className="truncate text-xs text-zinc-500">{label} · {hint}</p>
      </div>
    </Card>
  )
}

// ---------- onboarding (new workspaces) ----------

const DONUT_COLORS = ['#8b5cf6', '#6366f1', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#14b8a6', '#71717a']

function OnboardingChecklist({ onStarted }: { onStarted: () => void }) {
  const [state, setState] = useState<{ keys: number; razorpayConfigured: boolean; members: number } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [keys, integ, org] = await Promise.all([api.listKeys(), api.getIntegrations(), api.getOrg()])
        setState({ keys: keys.length, razorpayConfigured: integ.razorpay.configured, members: org.members.length })
      } catch {
        setState({ keys: 0, razorpayConfigured: false, members: 1 })
      }
    })()
  }, [])

  const steps = [
    { done: true, icon: <Plug className="h-4 w-4" />, title: 'Workspace created', to: null as string | null },
    { done: (state?.keys ?? 0) > 0, icon: <KeyRound className="h-4 w-4" />, title: 'Create a webhook API key', to: '/settings?tab=keys' },
    { done: state?.razorpayConfigured ?? false, icon: <Plug className="h-4 w-4" />, title: 'Connect Razorpay (optional — simulator until then)', to: '/settings?tab=integrations' },
    { done: (state?.members ?? 1) > 1, icon: <Users className="h-4 w-4" />, title: 'Invite your team', to: '/settings?tab=team' },
  ]
  const remaining = steps.filter((s) => !s.done).length

  return (
    <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">Welcome to Recova</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Failed payments will land here as webhooks. Finish setup, or press START RECOVERY to load the demo batch.
          </p>
          <ul className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.title} className="flex items-center gap-2.5 text-sm">
                <span className={s.done ? 'text-emerald-400' : 'text-zinc-600'}>
                  {s.done ? <CircleCheck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </span>
                <span className={s.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}>{s.title}</span>
                {!s.done && s.to && (
                  <Link to={s.to} className="text-xs font-medium text-violet-400 hover:text-violet-300">→</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-end gap-2">
          {state === null && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          <StartButton onStarted={onStarted} />
          {remaining > 0 && (
            <p className="text-[11px] text-zinc-600">{remaining} setup step{remaining > 1 ? 's' : ''} left</p>
          )}
        </div>
      </div>
    </Card>
  )
}
