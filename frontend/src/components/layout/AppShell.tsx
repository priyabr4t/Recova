import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, SlidersHorizontal, Settings as SettingsIcon,
  ScrollText, RefreshCcw, Clock3, ShieldCheck, ShieldAlert, IndianRupee,
  LogOut, Menu, X,
} from 'lucide-react'
import { usePolling } from '../../hooks/usePolling'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/utils'
import { formatDateTime } from '../../lib/labels'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cases', label: 'Cases', icon: FolderOpen },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText },
  { to: '/controls', label: 'Demo Controls', icon: SlidersHorizontal },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Recovery performance across the whole batch, computed from the ledger' },
  '/cases': { title: 'Cases', subtitle: 'Every recovery case — filter by state, search, drill into the audit trail' },
  '/audit': { title: 'Audit Trail', subtitle: 'Every decision and transition, actor-labeled — filter and export' },
  '/controls': { title: 'Demo Controls', subtitle: 'Drive the simulation clock, ingest the batch, verify invariants' },
  '/settings': { title: 'Settings', subtitle: 'Workspace, team, keys, integrations and billing' },
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, org, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function onLogout() {
    setOpen(false)
    onNavigate?.()
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-1 pr-3 transition hover:border-zinc-700"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-semibold text-white">
          {initials(user?.name ?? '')}
        </span>
        <span className="hidden max-w-[140px] truncate text-xs font-medium text-zinc-300 sm:block">
          {org?.name || 'Workspace'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl shadow-black/40">
          <div className="border-b border-zinc-800/80 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{user?.email}</p>
            {org?.slug && (
              <p className="mt-1.5 inline-block rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                {org.slug}
              </p>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); onNavigate?.(); navigate('/settings') }}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800/80 hover:text-white"
          >
            <SettingsIcon className="h-4 w-4" /> Workspace settings
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800/80 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppShell() {
  const location = useLocation()
  const { data: simState } = usePolling(() => api.getSimState(), 5000)
  const { data: invariants } = usePolling(() => api.getInvariants(), 5000)
  const [mobileOpen, setMobileOpen] = useState(false)

  // close the drawer on navigation
  useEffect(() => setMobileOpen(false), [location.pathname])

  const header = TITLES[location.pathname]
    ?? { title: 'Case Detail', subtitle: 'Diagnosis, decisions and the full audit trail for one case' }
  const isOk = invariants?.ok ?? null

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <RefreshCcw className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <p className="text-sm font-semibold text-white">Recova</p>
        </div>
        <div className="flex items-center gap-2">
          <UserMenu />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 text-zinc-300"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Sidebar backdrop (mobile) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800/80 bg-zinc-950 transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'pt-14 lg:pt-0',
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-950/40">
            <RefreshCcw className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Recova</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Revenue Recovery</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
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
      <div className="ml-0 flex min-h-screen flex-1 flex-col pt-14 lg:ml-60 lg:pt-0">
        <header className="sticky top-14 z-10 hidden border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur lg:sticky lg:top-0 lg:block">
          <div className="flex items-center justify-between px-8 py-4">
            <div>
              <h1 className="text-base font-semibold text-white">{header.title}</h1>
              <p className="mt-0.5 text-xs text-zinc-500">{header.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400 xl:flex">
                <IndianRupee className="h-3.5 w-3.5 text-emerald-400" />
                <span>Bounded agent · every rupee accounted for</span>
              </div>
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-zinc-800/80 px-6 py-3 text-[11px] text-zinc-600">
          Recova — Razorpay /buildathon · payment outcomes are simulated with a seeded RNG · dashboard numbers computed from the ledger only
        </footer>
      </div>
    </div>
  )
}
