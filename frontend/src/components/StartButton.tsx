import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import { cn } from '../lib/utils'

/** Fires POST /recovery/start (the demo's headline button) with busy state. */
export default function StartButton({
  onStarted,
  className,
  label = 'START RECOVERY',
}: {
  onStarted?: () => void
  className?: string
  label?: string
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  return (
    <button
      onClick={async () => {
        setBusy(true)
        try {
          const r = await api.startRecovery()
          onStarted?.()
          const created = (r as { casesCreated?: number }).casesCreated ?? 0
          if (created > 0) {
            toast.success(`${created} cases entered the pipeline`)
            navigate('/')
          } else {
            toast.info('Nothing to ingest — no unprocessed webhooks.')
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 402) {
            toast.error(err.message)
            navigate('/settings?tab=billing')
          } else {
            toast.error(err instanceof Error ? err.message : 'failed to start recovery')
          }
        } finally {
          setBusy(false)
        }
      }}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-black/30 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <Play className="h-4 w-4 fill-current" />
      {busy ? 'Ingesting…' : label}
    </button>
  )
}
