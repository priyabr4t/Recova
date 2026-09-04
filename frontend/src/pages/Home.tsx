import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { api } from '../lib/api'
import { formatRupees, formatPercent } from '../lib/utils'

export default function Home() {
  const { data: summary, loading } = usePolling(() => api.getSummary(), 3000)
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [startResult, setStartResult] = useState<string>('')

  const handleStart = async () => {
    setStarting(true)
    setStartResult('')
    try {
      const r = await api.startRecovery()
      setStartResult(`Recovery started — ${r.casesCreated} cases ingested`)
      setTimeout(() => navigate('/controls'), 1200)
    } catch (e: any) {
      setStartResult('Error: ' + e.message)
    } finally {
      setStarting(false)
    }
  }

  if (loading || !summary) {
    return <div className="p-8 text-zinc-400">Loading dashboard…</div>
  }

  const m = summary.money
  const c = summary.counts

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Revenue Recovery</h2>
          {startResult && <p className="text-sm text-zinc-400 mt-1">{startResult}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={starting}
            className="bg-white text-black px-4 py-2 rounded text-sm font-bold hover:bg-zinc-200 disabled:opacity-50 transition"
          >
            {starting ? 'STARTING…' : '▶ START RECOVERY'}
          </button>
          <button
            onClick={() => navigate('/controls')}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 px-4 py-2 rounded text-sm font-medium hover:bg-zinc-700 transition"
          >
            Demo Controls
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="At Risk" value={formatRupees(Number(m.atRiskPaise))} />
        <MetricCard label="Recovered" value={formatRupees(Number(m.recoveredPaise))} />
        <MetricCard label="Rate" value={formatPercent(m.recoveryRate)} />
        <MetricCard label="Cases" value={String(c.totalCases)} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MiniCard label="Recovered" value={String(c.recovered)} color="text-green-400" />
        <MiniCard label="Escalated" value={String(c.escalated)} color="text-amber-400" />
        <MiniCard label="Written Off" value={String(c.writtenOff)} color="text-red-400" />
        <MiniCard label="In Flight" value={String(c.inFlight)} color="text-blue-400" />
      </div>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">Recovery by Cause</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <CauseChart data={summary.recoveryByCause} />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">Exceptions</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-3 text-zinc-400 font-medium">Case</th>
                <th className="text-left p-3 text-zinc-400 font-medium">Invoice</th>
                <th className="text-left p-3 text-zinc-400 font-medium">Amount</th>
                <th className="text-left p-3 text-zinc-400 font-medium">State</th>
                <th className="text-left p-3 text-zinc-400 font-medium">Cause</th>
                <th className="text-left p-3 text-zinc-400 font-medium">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {summary.exceptions.map((exc: any, i: number) => (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="p-3"><Link to={`/cases/${exc.caseNumber}`} className="text-blue-400 hover:underline">{exc.caseNumber}</Link></td>
                  <td className="p-3 text-zinc-300">{exc.invoiceNumber}</td>
                  <td className="p-3 text-zinc-300">{formatRupees(Number(exc.amountPaise))}</td>
                  <td className="p-3"><StateBadge state={exc.state} /></td>
                  <td className="p-3 text-zinc-300">{exc.cause}</td>
                  <td className="p-3 text-zinc-300">{exc.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.exceptions.length === 0 && (
            <p className="p-8 text-center text-zinc-500">No exceptions yet</p>
          )}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <p className="text-zinc-500 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function CauseChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-zinc-500 text-center py-8">No data yet</p>
  }
  const maxTotal = Math.max(...data.map((d: any) => d.total))
  return (
    <div className="space-y-3">
      {data.map((d: any, i: number) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 w-40 truncate">{d.cause}</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-4 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.total / maxTotal) * 100}%` }}
            />
          </div>
          <span className="text-xs text-zinc-300 w-12 text-right">{d.total}</span>
        </div>
      ))}
    </div>
  )
}

function StateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    RECOVERED: 'bg-green-900/50 text-green-400',
    ESCALATED: 'bg-amber-900/50 text-amber-400',
    WRITTEN_OFF: 'bg-red-900/50 text-red-400',
    DIAGNOSING: 'bg-blue-900/50 text-blue-400',
    DECIDING: 'bg-purple-900/50 text-purple-400',
    ACTING: 'bg-indigo-900/50 text-indigo-400',
    WAITING_SCHEDULE: 'bg-gray-900/50 text-gray-400',
  }
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[state] ?? 'bg-zinc-800 text-zinc-400'}`}>
      {state}
    </span>
  )
}
