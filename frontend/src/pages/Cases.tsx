import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ArrowUpRight, FolderOpen, Clock3 } from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, cn } from '../lib/utils'
import { STATE_META, PIPELINE_STATES, metaFor } from '../lib/labels'
import { Card, StateBadge, CauseBadge, Badge, EmptyState, PageLoading } from '../components/ui'

type CaseRow = {
  id: string
  caseNumber: string
  state: string
  cause: string | null
  attemptCount: number
  contactCount: number
  amountPaise: number
  nextActionAt: string | null
  customer: { name: string }
  ledger: { recoveredPaise: number; atRiskPaise: number } | null
}

type Filters = 'ALL' | (typeof PIPELINE_STATES)[number]

export default function Cases() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const stateFilter = (searchParams.get('state') as Filters) || 'ALL'
  const [query, setQuery] = useState('')

  const { data: cases, loading } = usePolling<CaseRow[]>(() => api.getCases(), 4000)

  const filtered = useMemo(() => {
    if (!cases) return []
    const q = query.trim().toLowerCase()
    return cases.filter((c) => {
      if (stateFilter !== 'ALL' && c.state !== stateFilter) return false
      if (!q) return true
      return c.caseNumber.toLowerCase().includes(q) || (c.customer?.name ?? '').toLowerCase().includes(q)
    })
  }, [cases, stateFilter, query])

  if (loading) return <PageLoading />

  const tabs: Filters[] = ['ALL', ...PIPELINE_STATES]

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const meta = tab === 'ALL' ? null : STATE_META[tab]
            const active = stateFilter === tab
            return (
              <button
                key={tab}
                onClick={() => setSearchParams(tab === 'ALL' ? {} : { state: tab })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  active
                    ? 'border-zinc-600 bg-zinc-800 text-white'
                    : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {meta ? meta.label : 'All'}
              </button>
            )
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search case number or customer…"
            className="w-64 rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
          />
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-5 w-5" />}
            title={query || stateFilter !== 'ALL' ? 'No cases match the current filters' : 'No cases yet'}
            body={query || stateFilter !== 'ALL' ? 'Try a different search or clear the state filter.' : 'Press START RECOVERY on the dashboard to ingest the batch.'}
          />
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
                  <th className="px-5 py-2.5 font-medium">Next Action</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/cases/${c.caseNumber}`)}
                    className="cursor-pointer transition hover:bg-zinc-800/30"
                  >
                    <td className="px-5 py-3 font-medium text-blue-400">{c.caseNumber}</td>
                    <td className="px-5 py-3 text-zinc-300">{c.customer?.name ?? '—'}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-200">{formatRupees(c.amountPaise)}</td>
                    <td className="px-5 py-3"><StateBadge state={c.state} /></td>
                    <td className="px-5 py-3">{c.cause ? <CauseBadge cause={c.cause} /> : <Badge className="border-zinc-800 bg-zinc-800/50 text-zinc-500">—</Badge>}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-400">{c.attemptCount} pay · {c.contactCount} msg</td>
                    <td className="px-5 py-3">
                      {c.state === 'WAITING_SCHEDULE' && c.nextActionAt ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums">
                          <Clock3 className="h-3 w-3" />
                          {new Date(c.nextActionAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right"><ArrowUpRight className="ml-auto h-4 w-4 text-zinc-600" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-zinc-800/80 px-5 py-2.5 text-xs text-zinc-500">
          Showing {filtered.length} of {cases?.length ?? 0} cases
          {stateFilter !== 'ALL' && <> · filtered to <span className="text-zinc-300">{metaFor(STATE_META, stateFilter).label}</span></>}
        </div>
      </Card>
    </div>
  )
}
