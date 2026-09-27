import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Search } from 'lucide-react'
import { api } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { formatDateTime } from '../lib/labels'
import { cn } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '../lib/toast'

type AuditRow = {
  id: string
  actor: 'SYSTEM' | 'RULE_ENGINE' | 'LLM' | 'HUMAN'
  event: string
  metadata: unknown
  createdAt: string
  recoveryCase?: { caseNumber: string } | null
}

const ACTORS = ['ALL', 'SYSTEM', 'RULE_ENGINE', 'LLM', 'HUMAN'] as const

const ACTOR_CLASS: Record<string, string> = {
  SYSTEM: 'border-blue-500/30 bg-blue-500/5 text-blue-300',
  RULE_ENGINE: 'border-zinc-600/40 bg-zinc-500/5 text-zinc-300',
  LLM: 'border-violet-500/30 bg-violet-500/5 text-violet-300',
  HUMAN: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
}

export default function Audit() {
  const [actor, setActor] = useState<(typeof ACTORS)[number]>('ALL')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: rows, loading } = usePolling<AuditRow[]>(
    () => api.listAudit({ actor: actor === 'ALL' ? undefined : actor, q: query || undefined, limit: 200 }),
    5000,
  )

  // debounce the search box into the query
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const exportCsv = useCallback(async () => {
    try {
      await api.exportAuditCsv()
    } catch {
      toast.error('Export failed')
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {ACTORS.map((a) => (
            <button
              key={a}
              onClick={() => setActor(a)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                actor === a
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                  : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {a === 'ALL' ? 'All actors' : a.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by event…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
        {loading && !rows ? (
          <div className="flex justify-center py-16 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (rows?.length ?? 0) === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">No audit entries match this filter.</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {rows!.map((r) => (
              <div key={r.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium', ACTOR_CLASS[r.actor])}>
                    {r.actor.replace('_', ' ')}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs text-zinc-200">{r.event}</span>
                  {r.recoveryCase?.caseNumber && (
                    <span className="shrink-0 text-xs font-medium text-blue-400">{r.recoveryCase.caseNumber}</span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-600">
                    {formatDateTime(r.createdAt)}
                  </span>
                  {r.metadata != null && Object.keys(r.metadata as object).length > 0 && (
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="shrink-0 text-[11px] text-zinc-500 transition hover:text-zinc-300"
                    >
                      {expanded === r.id ? 'hide' : 'metadata'}
                    </button>
                  )}
                </div>
                {expanded === r.id && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                    {JSON.stringify(r.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
