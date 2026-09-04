import { useState } from 'react'
import { api } from '../lib/api'
import { usePolling } from '../hooks/usePolling'

export default function DemoControls() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')
  const [days, setDays] = useState(1)

  const { data: simState } = usePolling(() => api.getSimState(), 5000)
  const { data: invariants } = usePolling(() => api.getInvariants(), 5000)
  const { data: summary } = usePolling(() => api.getSummary(), 5000)

  const handleStart = async () => {
    setLoading(true); setResult('')
    try {
      const r = await api.startRecovery()
      setResult(JSON.stringify(r, null, 2))
    } catch (e: any) { setResult('Error: ' + e.message) }
    finally { setLoading(false) }
  }

  const handleAdvance = async () => {
    setLoading(true); setResult('')
    try {
      const r = await api.advanceDays(days)
      setResult(`Advanced ${days} day(s). Now: ${new Date(r.simNow).toLocaleString()}`)
    } catch (e: any) { setResult('Error: ' + e.message) }
    finally { setLoading(false) }
  }

  const handleReset = async () => {
    if (!confirm('Reset the entire simulation? This is deterministic.')) return
    setLoading(true); setResult('')
    try {
      await api.resetSimulation()
      setResult('Simulation reset. Ready to re-seed.')
    } catch (e: any) { setResult('Error: ' + e.message) }
    finally { setLoading(false) }
  }

  const isOk = invariants?.ok ?? null

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-white">Demo Controls</h2>

      <div className="grid grid-cols-2 gap-4">
        <InfoCard title="Simulation Clock" content={
          <p className="text-white font-mono">{simState ? new Date(simState.simNow).toLocaleString() : '—'}</p>
        } />
        <InfoCard title="Total Cases" content={
          <p className="text-white font-mono">{summary?.counts?.totalCases ?? '—'}</p>
        } />
        <InfoCard title="Audit Entries" content={
          <p className="text-white font-mono">{invariants?.totals?.auditEntries ?? '—'}</p>
        } />
        <InfoCard title="Invariants" content={
          <span className={`font-bold ${isOk ? 'text-green-400' : 'text-red-400'}`}>
            {isOk ? '✓ PASS' : '✗ FAIL'}
          </span>
        } />
      </div>

      {!isOk && invariants && (
        <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
          <h4 className="text-red-400 text-sm font-medium mb-2">⚠ Invariant violations detected</h4>
          {invariants.limboCases && invariants.limboCases.length > 0 && (
            <p className="text-xs text-red-300">Limbo cases: {invariants.limboCases.length}</p>
          )}
          {invariants.stuckActions && invariants.stuckActions.length > 0 && (
            <p className="text-xs text-red-300">Stuck actions: {invariants.stuckActions.length}</p>
          )}
        </div>
      )}

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Pipeline Controls</h3>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition"
        >
          {loading ? 'Processing…' : '▶ START RECOVERY'}
        </button>

        <div className="flex gap-2">
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 text-white rounded px-3 py-2 w-20 text-center"
            min={1}
            max={30}
          />
          <button
            onClick={handleAdvance}
            disabled={loading}
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white font-medium py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition"
          >
            Advance {days}d
          </button>
        </div>

        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition"
        >
          ↺ RESET SIMULATION
        </button>
      </section>

      {result && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-sm text-zinc-400 font-medium mb-2">Last Response</h4>
          <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{result}</pre>
        </section>
      )}

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Live Summary</h3>
        {summary ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-zinc-500">At Risk:</span> <span className="text-white">₹{(Number(summary.money.atRiskPaise) / 100).toLocaleString('en-IN')}</span></div>
            <div><span className="text-zinc-500">Recovered:</span> <span className="text-green-400">₹{(Number(summary.money.recoveredPaise) / 100).toLocaleString('en-IN')}</span></div>
            <div><span className="text-zinc-500">Rate:</span> <span className="text-white">{summary.money.recoveryRate}%</span></div>
            <div><span className="text-zinc-500">Recovered:</span> <span className="text-zinc-300">{summary.counts.recovered}</span></div>
            <div><span className="text-zinc-500">Escalated:</span> <span className="text-amber-400">{summary.counts.escalated}</span></div>
            <div><span className="text-zinc-500">Rule Blocks:</span> <span className="text-zinc-300">{summary.counts.ruleBlocks}</span></div>
          </div>
        ) : <p className="text-zinc-500">Loading…</p>}
      </section>
    </div>
  )
}

function InfoCard({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <h4 className="text-xs text-zinc-500 font-medium mb-1">{title}</h4>
      {content}
    </div>
  )
}
