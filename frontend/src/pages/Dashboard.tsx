import { Link, useNavigate } from 'react-router-dom'
import {
  Wallet, IndianRupee, TrendingUp, Activity, ArrowUpRight, ShieldOff,
  Bot, AlertTriangle, Search,
} from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, formatPercent, cn } from '../lib/utils'
import { CAUSE_META, PIPELINE_STATES, metaFor, STATE_META } from '../lib/labels'

import { Card, CardHeader, StatCard, StateBadge, CauseBadge, Progress, EmptyState, PageLoading } from '../components/ui'
import StartButton from '../components/StartButton'

type Summary = {
  money: { atRiskPaise: number; recoveredPaise: number; outstandingPaise: number; attemptedPaise: number; recoveryRate: number }
  counts: { totalCases: number; recovered: number; escalated: number; writtenOff: number; inFlight: number; ruleBlocks: number; llmDecisions: number; escalations: number }
  states: Record<string, number>
  recoveryByCause: Array<{ cause: string; total: number; recovered: number; recoveryRate: number }>
  exceptions: Array<{ caseNumber: string; invoiceNumber: string; customer: string; amountPaise: number; state: string; cause: string | null; attempts: number }>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: summary, loading, refetch } = usePolling<Summary>(() => api.getSummary(), 3000)

  if (loading || !summary) return <PageLoading />

  const m = summary.money
  const c = summary.counts
  const maxCauseTotal = Math.max(1, ...summary.recoveryByCause.map((d) => d.total))

  return (
    <div className="space-y-6">
      {c.totalCases === 0 && (
        <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">No cases in the pipeline yet</h2>
              <p className="mt-1 text-sm text-zinc-400">
                100 failed payments are waiting as webhooks. Press START RECOVERY to let the agent loose.
              </p>
            </div>
            <StartButton onStarted={refetch} />
          </div>
        </Card>
      )}

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
        {/* Recovery by cause */}
        <Card className="xl:col-span-2">
          <CardHeader title="Recovery by Cause" subtitle="Volume (grey) and recovery rate (colour) per failure cause" />
          <div className="space-y-4 p-5">
            {summary.recoveryByCause.length === 0 && (
              <EmptyState icon={<Search className="h-5 w-5" />} title="No classified causes yet" body="Start the recovery batch to populate this breakdown." />
            )}
            {summary.recoveryByCause.map((d) => {
              const meta = metaFor(CAUSE_META, d.cause)
              return (
                <div key={d.cause} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="text-zinc-200">{meta.label}</span>
                      <span className="text-xs tabular-nums text-zinc-500">{d.recovered}/{d.total} recovered</span>
                    </div>
                    <span className={cn(
                      'text-xs font-semibold tabular-nums',
                      d.recoveryRate >= 50 ? 'text-emerald-400' : d.recoveryRate > 0 ? 'text-amber-400' : 'text-zinc-500',
                    )}>
                      {d.recoveryRate}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1"><Progress value={(d.total / maxCauseTotal) * 100} tone="bg-zinc-700" /></div>
                    <div className="w-24"><Progress value={d.recoveryRate} tone={d.recoveryRate >= 50 ? 'bg-emerald-500' : 'bg-amber-500'} /></div>
                  </div>
                </div>
              )
            })}
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
