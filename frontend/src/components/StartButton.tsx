import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { api } from '../lib/api'
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
          if ((r as { casesCreated?: number }).casesCreated) {
            navigate('/')
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
