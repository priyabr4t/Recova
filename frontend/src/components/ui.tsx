import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { metaFor, STATE_META, CAUSE_META, ACTOR_META } from '../lib/labels'

// ---------- surfaces ----------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------- badges ----------

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export function StateBadge({ state }: { state: string | null | undefined }) {
  const meta = metaFor(STATE_META, state)
  return (
    <Badge className={meta.className}>
      {meta.dot && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />}
      {meta.label}
    </Badge>
  )
}

export function CauseBadge({ cause }: { cause: string | null | undefined }) {
  const meta = metaFor(CAUSE_META, cause)
  return <Badge className={meta.className}>{meta.label}</Badge>
}

export function ActorBadge({ actor }: { actor: string }) {
  const meta = metaFor(ACTOR_META, actor)
  return <Badge className={meta.className}>{meta.label}</Badge>
}

// ---------- stat cards ----------

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'zinc',
}: {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  tone?: 'zinc' | 'emerald' | 'amber' | 'red' | 'blue' | 'violet'
}) {
  const tones: Record<string, string> = {
    zinc: 'bg-zinc-800 text-zinc-300',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
    blue: 'bg-blue-500/10 text-blue-400',
    violet: 'bg-violet-500/10 text-violet-400',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-white tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

// ---------- misc ----------

export function Progress({ value, tone = 'bg-emerald-500' }: { value: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={cn('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-400">{icon}</div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {body && <p className="mt-1 max-w-sm text-xs text-zinc-500">{body}</p>}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-zinc-800/70', className)} />
}

export function PageLoading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-72 col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}
