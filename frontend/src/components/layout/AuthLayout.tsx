import type { ReactNode } from 'react'
import { RefreshCcw, ShieldCheck, ScrollText, IndianRupee } from 'lucide-react'

/**
 * Split-screen auth layout: brand panel on the left (the product's promise),
 * form card on the right. Same dark violet identity as the app shell.
 */
export default function AuthLayout({ title, subtitle, children, footer }: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-200">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-zinc-800/80 p-12 lg:flex">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-950/40">
            <RefreshCcw className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">Recova</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Revenue Recovery</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Recover failed payments without losing your customers — or your compliance.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Recova diagnoses every failed payment, chooses a bounded intervention, and accounts for
            every rupee in an append-only ledger.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-zinc-300">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Bounded agent — the LLM decides what is appropriate, rules decide what is allowed
            </li>
            <li className="flex items-center gap-3">
              <IndianRupee className="h-4 w-4 text-violet-400" /> Ledger-first accounting, BigInt paise, no floats
            </li>
            <li className="flex items-center gap-3">
              <ScrollText className="h-4 w-4 text-blue-400" /> Append-only audit trail, exportable any time
            </li>
          </ul>
        </div>
        <p className="relative text-[11px] text-zinc-600">
          Bounded agent · every rupee accounted for
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <RefreshCcw className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-semibold tracking-tight text-white">Recova</p>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-center text-xs text-zinc-500">{footer}</p>
        </div>
      </div>
    </div>
  )
}
