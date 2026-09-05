import { useState } from 'react'
import {
  Play, FastForward, RotateCcw, Download, ShieldCheck, ShieldAlert, Clock3,
  AlertOctagon, PauseCircle,
} from 'lucide-react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, cn } from '../lib/utils'
import { Card, CardHeader } from '../components/ui'
import { formatDateTime } from '../lib/labels'

type Invariants = {
  ok: boolean
  limboCases?: Array<{ caseNumber: string; state: string }> | null
  stuckActions?: Array<{ id: string }> | null
  totals?: { cases: number; auditEntries: number }
}

type Summary = {
  money: { atRiskPaise: number; recoveredPaise: number; recoveryRate: number }
  counts: { totalCases: number; recovered: number; escalated: number; writtenOff: number; inFlight: number; ruleBlocks: number; llmDecisions: number }
}

export default function DemoControls() {
  const [days, setDays] = useState(2)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: simState } = usePolling(() => api.getSimState(), 3000)
  const { data: invariants } = usePolling<Invariants>(() => api.getInvariants(), 3000)
  const { data: summary } = usePolling<Summary>(() => api.getSummary(), 3000)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setMessage(null); setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const isOk = invariants?.ok ?? null
  const limboCount = invariants?.limboCases?.length ?? 0
  const stuckCount = invariants?.stuckActions?.length ?? 0

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{message}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Batch ingestion */}
        <Card className="xl:col-span-2">
          <CardHeader title="Batch Ingestion" subtitle="Ingest the 100 seeded failed payments as webhook events — cases enter the pipeline and the agent takes over" />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <button
              onClick={() => run('start', async () => {
                const r = await api.startRecovery()
                setMessage(`Batch ingested — ${(r as { casesCreated?: number }).casesCreated ?? 0} new cases created.`)
              })}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-bold text-black shadow-lg shadow-black/30 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              {busy === 'start' ? 'Ingesting…' : 'START RECOVERY'}
            </button>
            <p className="text-xs leading-relaxed text-zinc-500">
              Idempotent — safe to click twice. Already-processed webhooks are skipped,<br />
              so re-clicking never double-ingests a case.
            </p>
          </div>
        </Card>

        {/* Sim clock */}
        <Card>
          <CardHeader title="Simulation Clock" subtitle="Fast-forward the world; the sweeper follows" />
          <div className="p-5">
            <p className="flex items-center gap-2 text-lg font-semibold tabular-nums text-white">
              <Clock3 className="h-4 w-4 text-zinc-500" />
              {simState ? formatDateTime(simState.simNow) : '—'}
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-sm tabular-nums text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
              <button
                onClick={() => run('advance', async () => {
                  await api.advanceDays(days)
                  setMessage(`Simulation advanced ${days} day${days > 1 ? 's' : ''}. Due cases have been released to the pipeline.`)
                })}
                disabled={busy !== null}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
              >
                <FastForward className="h-4 w-4" />
                {busy === 'advance' ? 'Advancing…' : `Advance ${days}d`}
              </button>
            </div>
          </div>
        </Card>

        {/* Invariants */}
        <Card className={cn(isOk === false && 'border-red-500/40')}>
          <CardHeader
            title="Integrity"
            subtitle="No case may end in limbo — every case is terminal or scheduled"
            action={
              isOk === null ? null : isOk ? (
                <Badge2 className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><ShieldCheck className="h-3 w-3" /> PASS</Badge2>
              ) : (
                <Badge2 className="border-red-500/30 bg-red-500/10 text-red-300"><ShieldAlert className="h-3 w-3" /> FAIL</Badge2>
              )
            }
          />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Limbo cases</span>
              <span className={cn('font-semibold tabular-nums', limboCount > 0 ? 'text-red-400' : 'text-emerald-400')}>{limboCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Stuck actions</span>
              <span className={cn('font-semibold tabular-nums', stuckCount > 0 ? 'text-red-400' : 'text-emerald-400')}>{stuckCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Audit entries</span>
              <span className="font-semibold tabular-nums text-zinc-200">{invariants?.totals?.auditEntries ?? '—'}</span>
            </div>
            {limboCount > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300"><AlertOctagon className="h-3.5 w-3.5" /> Limbo cases detected</p>
                <p className="mt-1 text-xs text-zinc-400">{(invariants?.limboCases ?? []).slice(0, 5).map((c) => c.caseNumber).join(', ')}{limboCount > 5 ? ` +${limboCount - 5} more` : ''}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Data + reset */}
        <Card className="xl:col-span-2">
          <CardHeader title="Data & Reset" subtitle="Export the audit trail, or reset to a pristine deterministic seed" />
          <div className="flex flex-wrap gap-3 p-5">
            <button
              onClick={() => run('export', async () => {
                await api.exportAuditCsv()
                setMessage('Audit trail downloaded as recova-audit-log.csv.')
              })}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {busy === 'export' ? 'Exporting…' : 'Export audit CSV'}
            </button>
            <button
              onClick={() => {
                if (!window.confirm('Reset the entire simulation? All cases are wiped and the deterministic seed is re-run.')) return
                void run('reset', async () => {
                  await api.resetSimulation()
                  setMessage('Simulation reset. Press START RECOVERY for a fresh, reproducible run.')
                })
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {busy === 'reset' ? 'Resetting…' : 'Reset simulation'}
            </button>
            <p className="flex items-center gap-1.5 text-xs text-zinc-600"><PauseCircle className="h-3.5 w-3.5" /> Same seed ⇒ same recovery numbers, every run.</p>
          </div>
        </Card>
      </div>

      {/* Live ledger */}
      {summary && (
        <Card>
          <CardHeader title="Live Ledger" subtitle="Computed from RecoveryLedger only — never from model output" />
          <div className="grid grid-cols-2 gap-px bg-zinc-800/60 md:grid-cols-6">
            <Cell label="At risk" value={formatRupees(summary.money.atRiskPaise)} />
            <Cell label="Recovered" value={formatRupees(summary.money.recoveredPaise)} tone="text-emerald-400" />
            <Cell label="Rate" value={`${summary.money.recoveryRate}%`} />
            <Cell label="Total cases" value={String(summary.counts.totalCases)} />
            <Cell label="Escalated" value={String(summary.counts.escalated)} tone="text-amber-400" />
            <Cell label="Rule blocks" value={String(summary.counts.ruleBlocks)} tone="text-rose-400" />
          </div>
        </Card>
      )}
    </div>
  )
}

function Cell({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-zinc-900/80 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function Badge2({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold', className)}>
      {children}
    </span>
  )
}
