// Canonical display metadata for every enum-ish value in the domain.
// Single source of truth so badges, tables and timelines never drift apart.

export type Meta = { label: string; className: string; dot?: string }

export const STATE_META: Record<string, Meta> = {
  DIAGNOSING: { label: 'Diagnosing', className: 'bg-blue-500/10 text-blue-300 border-blue-500/30', dot: 'bg-blue-400' },
  DECIDING: { label: 'Deciding', className: 'bg-violet-500/10 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  ACTING: { label: 'Acting', className: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-400' },
  WAITING_SCHEDULE: { label: 'Scheduled', className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30', dot: 'bg-zinc-400' },
  RECOVERED: { label: 'Recovered', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  ESCALATED: { label: 'Escalated', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  WRITTEN_OFF: { label: 'Written off', className: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' },
}

export const CAUSE_META: Record<string, Meta> = {
  INSUFFICIENT_FUNDS: { label: 'Insufficient Funds', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  EXPIRED_CARD: { label: 'Expired Card', className: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  BANK_DECLINE: { label: 'Bank Decline', className: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  AUTHENTICATION_FAILED: { label: 'Auth Failed', className: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30' },
  NETWORK_ERROR: { label: 'Network Error', className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  SUSPECTED_FRAUD: { label: 'Suspected Fraud', className: 'bg-red-500/10 text-red-300 border-red-500/30' },
  CUSTOMER_CHURN: { label: 'Customer Churn', className: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
  UNKNOWN: { label: 'Unknown', className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' },
  UNCLASSIFIED: { label: 'Unclassified', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
}

export const ACTOR_META: Record<string, Meta> = {
  SYSTEM: { label: 'System', className: 'bg-zinc-700/60 text-zinc-300', dot: 'bg-zinc-400' },
  RULE_ENGINE: { label: 'Rule Engine', className: 'bg-blue-500/10 text-blue-300', dot: 'bg-blue-400' },
  LLM: { label: 'LLM', className: 'bg-violet-500/10 text-violet-300', dot: 'bg-violet-400' },
  HUMAN: { label: 'Human', className: 'bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
}

export const ACTION_META: Record<string, Meta> = {
  RETRY_PAYMENT: { label: 'Retry Payment', className: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  SEND_EMAIL: { label: 'Send Email', className: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  ESCALATE: { label: 'Escalate', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  NO_ACTION: { label: 'No Action', className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' },
}

export const ACTION_STATUS_META: Record<string, Meta> = {
  PENDING: { label: 'Pending', className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30', dot: 'bg-zinc-400' },
  EXECUTING: { label: 'Executing', className: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-400' },
  SUCCESS: { label: 'Success', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  FAILED: { label: 'Failed', className: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' },
  BLOCKED: { label: 'Blocked', className: 'bg-rose-500/10 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
}

// Pipeline display order for the dashboard funnel.
export const PIPELINE_STATES = [
  'DIAGNOSING',
  'DECIDING',
  'ACTING',
  'WAITING_SCHEDULE',
  'RECOVERED',
  'ESCALATED',
  'WRITTEN_OFF',
] as const

export function metaFor(table: Record<string, Meta>, key: string | null | undefined): Meta {
  const k = key ?? 'UNKNOWN'
  return table[k] ?? { label: k.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), className: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
