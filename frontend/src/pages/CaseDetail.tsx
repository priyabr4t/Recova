import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { formatRupees } from '../lib/utils'

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const [caseData, setCaseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.getCase(id!).then((d) => { setCaseData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  // Poll every 5s
  useEffect(() => {
    if (!id) return
    const id_ = setInterval(() => {
      api.getCase(id!).then((d) => setCaseData(d)).catch(() => {})
    }, 5000)
    return () => clearInterval(id_)
  }, [id])

  if (loading) return <div className="p-8 text-zinc-400">Loading case…</div>
  if (!caseData) return <div className="p-8 text-red-400">Case not found</div>

  const customer = caseData.customer ?? {}
  const invoice = caseData.invoice ?? {}
  const payments = caseData.payments ?? []
  const actions = caseData.actions ?? []
  const auditLogs = caseData.auditLogs ?? []
  const ledger = caseData.ledger ?? {}
  const ruleDecision = caseData.actions?.[0]?.ruleDecision ?? {}
  const llmDecision = caseData.actions?.[0]?.llmDecision ?? null

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-zinc-400 hover:text-white text-sm">← Dashboard</Link>
        <h2 className="text-2xl font-bold text-white">{caseData.caseNumber}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InfoCard title="Customer" content={
          <div className="space-y-1 text-sm">
            <p className="text-white font-medium">{customer.name}</p>
            <p className="text-zinc-400">{customer.email}</p>
            {customer.optedOut && <span className="text-red-400 text-xs bg-red-900/30 px-2 py-1 rounded">OPTED OUT</span>}
            {customer.harassmentCount > 0 && <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-1 rounded">Harassment: {customer.harassmentCount}</span>}
          </div>
        } />
        <InfoCard title="Amount" content={
          <div className="text-sm">
            <p className="text-white font-bold text-xl">{formatRupees(Number(caseData.amountPaise))}</p>
            <p className="text-zinc-400">At risk</p>
          </div>
        } />
        <InfoCard title="Cause" content={
          <div className="text-sm">
            <p className="text-white font-medium">{caseData.cause}</p>
            <p className="text-zinc-400">Confidence: {caseData.causeConfidence ? (caseData.causeConfidence * 100).toFixed(1) + '%' : 'N/A'}</p>
            <p className="text-zinc-500 text-xs">Source: {caseData.causeSource}</p>
          </div>
        } />
        <InfoCard title="State" content={
          <span className="text-white font-bold">{caseData.state}</span>
        } />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">🤖 Agent Decision</h3>
          {actions[0] ? (
            <div className="space-y-3 text-sm">
              <div><span className="text-zinc-500">Action:</span> <span className="text-white font-medium">{actions[0].type}</span></div>
              <div><span className="text-zinc-500">Reason:</span> <span className="text-zinc-300">{actions[0].reason}</span></div>
              <div><span className="text-zinc-500">Confidence:</span> <span className="text-white">{actions[0].confidence?.toFixed(2)}</span></div>
              {llmDecision && (
                <div className="mt-4 p-3 bg-zinc-800 rounded">
                  <p className="text-xs text-purple-400 font-medium mb-1">LLM Suggested</p>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{JSON.stringify(llmDecision, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : <p className="text-zinc-500">No action yet</p>}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">✓ Rule Check</h3>
          {actions[0] && ruleDecision ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-zinc-500">Allowed Actions:</span></div>
              <div className="flex flex-wrap gap-1">
                {(ruleDecision.allowed ?? []).map((a: string, i: number) => (
                  <span key={i} className="bg-green-900/40 text-green-400 px-2 py-0.5 rounded text-xs">✓ {a}</span>
                ))}
              </div>
              {ruleDecision.blockedSuggestion && (
                <div className="mt-3 p-3 bg-red-900/20 border border-red-900/30 rounded">
                  <p className="text-xs text-red-400 font-medium">🚫 Blocked</p>
                  <pre className="text-xs text-red-300 whitespace-pre-wrap">{JSON.stringify(ruleDecision.blockedSuggestion, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : <p className="text-zinc-500">No rule check yet</p>}
        </div>
      </div>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">Payment Attempts</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-3 text-zinc-400">Attempt</th>
                <th className="text-left p-3 text-zinc-400">Status</th>
                <th className="text-left p-3 text-zinc-400">Error Code</th>
                <th className="text-left p-3 text-zinc-400">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any, i: number) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="p-3">#{p.attemptNo}</td>
                  <td className="p-3"><span className={p.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>{p.status}</span></td>
                  <td className="p-3 text-zinc-400">{p.errorCode ?? '—'}</td>
                  <td className="p-3 text-zinc-400">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-4">Audit Trail</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-0">
          {auditLogs.length === 0 && <p className="text-zinc-500 text-sm">No audit entries</p>}
          {auditLogs.map((log: any, i: number) => (
            <div key={i} className="flex gap-3 items-start pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${actorColor(log.actor)}`} />
                {i < auditLogs.length - 1 && <div className="w-px h-full bg-zinc-800 mt-1" />}
              </div>
              <div className="text-sm">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${actorBg(log.actor)}`}>{log.actor}</span>
                <span className="text-zinc-300 ml-2">{log.event}</span>
                {log.metadata && (
                  <pre className="text-xs text-zinc-500 mt-1 whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 2)}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function InfoCard({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h4 className="text-xs text-zinc-500 font-medium mb-2">{title}</h4>
      {content}
    </div>
  )
}

function actorColor(actor: string): string {
  const colors: Record<string, string> = {
    SYSTEM: 'bg-zinc-400', RULE_ENGINE: 'bg-blue-400', LLM: 'bg-purple-400', HUMAN: 'bg-amber-400'
  }
  return colors[actor] ?? 'bg-zinc-400'
}

function actorBg(actor: string): string {
  const colors: Record<string, string> = {
    SYSTEM: 'bg-zinc-800 text-zinc-300', RULE_ENGINE: 'bg-blue-900/50 text-blue-400',
    LLM: 'bg-purple-900/50 text-purple-400', HUMAN: 'bg-amber-900/50 text-amber-400'
  }
  return colors[actor] ?? 'bg-zinc-800 text-zinc-300'
}
