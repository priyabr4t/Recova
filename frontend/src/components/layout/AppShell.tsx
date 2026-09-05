import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, SlidersHorizontal, RefreshCcw, Clock3,
  ShieldCheck, ShieldAlert, IndianRupee,
} from 'lucide-react'
import { usePolling } from '../../hooks/usePolling'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { formatDateTime } from '../../lib/labels'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cases', label: 'Cases', icon: FolderOpen },
  { to: '/controls', label: 'Demo Controls', icon: SlidersHorizontal },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Recovery performance across the whole batch, computed from the ledger' },
  '/cases': { title: 'Cases', subtitle: 'Every recovery case — filter by state, search, drill into the audit trail' },
  '/controls': { title: 'Demo Controls', subtitle: 'Drive the simulation clock, ingest the batch, verify invariants' },
}

export default function AppShell() {
  const location = useLocation()
  const { data: simState } = usePolling(() => api.getSimState(), 5000)
  const { data: invariants } = usePolling(() => api.getInvariants(), 5000)

  const header = TITLES[location.pathname]
    ?? { title: 'Case Detail', subtitle: 'Diagnosis, decisions and the full audit trail for one case' }
  const isOk = invariants?.ok ?? null

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-950/40">
            <RefreshCcw className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Recova</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Revenue Recovery</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Overview</p>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-zinc-800/80 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-zinc-800/80 p-4">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              <Clock3 className="h-3 w-3" /> Sim Clock
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-200 tabular-nums">
              {simState ? formatDateTime(simState.simNow) : '—'}
            </p>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
              isOk === null
                ? 'border-zinc-800 bg-zinc-900/60 text-zinc-500'
                : isOk
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                  : 'border-red-500/30 bg-red-500/5 text-red-400',
            )}
          >
            {isOk === false ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {isOk === null ? 'Invariants…' : isOk ? 'Invariants passing' : 'Invariant violation'}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
          <div className="flex items-center justify-between px-8 py-4">
            <div>
              <h1 className="text-base font-semibold text-white">{header.title}</h1>
              <p className="mt-0.5 text-xs text-zinc-500">{header.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
              <IndianRupee className="h-3.5 w-3.5 text-emerald-400" />
              <span>Bounded agent · every rupee accounted for</span>
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-6">
          <Outlet />
        </main>
        <footer className="border-t border-zinc-800/80 px-8 py-3 text-[11px] text-zinc-600">
          Recova — Razorpay /buildathon · payment outcomes are simulated with a seeded RNG · dashboard numbers computed from the ledger only
        </footer>
      </div>
    </div>
  )
}
