import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Copy, Plus, Trash2, Check, ShieldCheck, KeyRound, CreditCard, Plug,
  Users, Loader2,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime } from '../lib/labels'

type TabId = 'profile' | 'organization' | 'team' | 'keys' | 'integrations' | 'billing'

const TAB_LABELS: Array<[TabId, string]> = [
  ['profile', 'Profile'],
  ['organization', 'Organization'],
  ['team', 'Team'],
  ['keys', 'API Keys'],
  ['integrations', 'Integrations'],
  ['billing', 'Billing'],
]

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) ?? 'profile'
  const setTab = (t: string | number) => {
    if (typeof t === 'string') setParams({ tab: t }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Tabs value={tab} onValueChange={(v) => setTab(v)}>
        <TabsList className="mb-5 flex-wrap">
          {TAB_LABELS.map(([id, label]) => (
            <TabsTrigger key={id} value={id}>{label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="organization"><OrganizationTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="keys"><KeysTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        <TabsContent value="billing"><BillingTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- shared bits ----------

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-6 backdrop-blur-sm">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {desc && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/40'
const labelClass = 'mb-1.5 block text-xs font-medium text-zinc-400'

// ---------- profile ----------

function ProfileTab() {
  const { user, refresh } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveName() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await api.updateProfile(name.trim())
      await refresh()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to update profile')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent(''); setNext('')
      toast.success('Password changed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Your profile" desc={`Signed in as ${user?.email}`}>
        <div className="max-w-sm space-y-3">
          <div>
            <label className={labelClass} htmlFor="profile-name">Name</label>
            <div className="flex gap-2">
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
              <Button onClick={saveName} disabled={busy || !name.trim()}>Save</Button>
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Change password" desc="You'll stay signed in on this device.">
        <div className="max-w-sm space-y-3">
          <div>
            <label className={labelClass} htmlFor="pw-current">Current password</label>
            <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pw-next">New password (min 8 chars)</label>
            <Input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <Button onClick={savePassword} disabled={busy || !current || next.length < 8}>Update password</Button>
        </div>
      </Panel>
    </div>
  )
}

// ---------- organization ----------

function OrganizationTab() {
  const { org, role, refresh } = useAuth()
  const [name, setName] = useState(org?.name ?? '')
  const [busy, setBusy] = useState(false)
  const canEdit = role === 'OWNER' || role === 'ADMIN'

  async function save() {
    setBusy(true)
    try {
      await api.updateOrg(name.trim())
      await refresh()
      toast.success('Workspace renamed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to rename workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Workspace" desc="The workspace scopes all data: cases, ledger, audit trail and API keys.">
      <div className="max-w-sm space-y-3">
        <div>
          <label className={labelClass} htmlFor="org-name">Name</label>
          <div className="flex gap-2">
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" disabled={!canEdit} />
            <Button onClick={save} disabled={busy || !canEdit || !name.trim()}>Save</Button>
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Workspace ID: <span className="font-mono text-zinc-400">{org?.slug || '—'}</span> · your role:{' '}
          <span className="font-mono text-zinc-400">{role ?? '—'}</span>
        </p>
        {!canEdit && <p className="text-xs text-amber-400/80">Only owners and admins can rename the workspace.</p>}
      </div>
    </Panel>
  )
}

// ---------- team ----------

type Member = { userId: string; name: string; email: string; role: string }
type OrgData = { name: string; slug: string; members: Member[] }

function TeamTab() {
  const { refresh } = useAuth()
  const [org, setOrg] = useState<OrgData | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setOrg(await api.getOrg())
  }, [])
  useEffect(() => { void load() }, [load])

  async function invite() {
    setBusy(true)
    try {
      const r = await api.inviteMember({ email, role })
      if (r.tempPassword) {
        toast.success('Teammate added', `One-time password: ${r.tempPassword} — share it securely.`)
      } else {
        toast.success('Teammate added', email)
      }
      setEmail('')
      await load()
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'invite failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    try {
      await api.removeMember(userId)
      toast.success('Member removed')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to remove member')
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Invite a teammate" desc="No email delivery yet (Phase 4) — new accounts get a one-time password shown to you.">
        <div className="flex max-w-lg flex-wrap gap-2">
          <Input placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-56 flex-1" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 text-sm text-zinc-200">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button onClick={invite} disabled={busy || !email.includes('@')}>Invite</Button>
        </div>
      </Panel>
      <Panel title={`Members (${org?.members.length ?? 0})`}>
        <div className="divide-y divide-zinc-800/50">
          {org?.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{m.name}</p>
                <p className="truncate text-xs text-zinc-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">{m.role}</span>
                {m.role !== 'OWNER' && (
                  <button onClick={() => remove(m.userId)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400" aria-label={`Remove ${m.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ---------- api keys ----------

function KeysTab() {
  const [keys, setKeys] = useState<Array<{ id: string; prefix: string; label: string; lastUsedAt: string | null; createdAt: string }>>([])
  const [label, setLabel] = useState('Razorpay webhooks')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setKeys(await api.listKeys())
  }, [])
  useEffect(() => { void load() }, [load])

  async function create() {
    setBusy(true)
    try {
      const r = await api.createKey(label || 'webhook')
      setCreated(r.key)
      setCopied(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to create key')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeKey(id)
      toast.success('Key revoked')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to revoke key')
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Create an API key"
        desc="Send this as the x-api-key header when you forward Razorpay webhooks to Recova. The raw key is shown ONCE — only a hash is stored."
      >
        <div className="flex max-w-lg gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="key label" />
          <Button onClick={create} disabled={busy}><Plus className="mr-1.5 h-4 w-4" /> Create key</Button>
        </div>
        {created && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-emerald-300">
              <KeyRound className="h-3.5 w-3.5" /> Copy this key now — it will not be shown again
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs text-emerald-200">{created}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => { await navigator.clipboard.writeText(created); setCopied(true); toast.success('Copied to clipboard') }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </Panel>
      <Panel title={`Keys (${keys.length})`}>
        <div className="divide-y divide-zinc-800/50">
          {keys.length === 0 && <p className="py-3 text-sm text-zinc-500">No keys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{k.label}</p>
                <p className="truncate font-mono text-xs text-zinc-500">rk_{k.prefix}_••• · created {formatDateTime(k.createdAt)} · last used {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'never'}</p>
              </div>
              <button onClick={() => revoke(k.id)} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400" aria-label={`Revoke ${k.label}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ---------- integrations ----------

function IntegrationsTab() {
  const [state, setState] = useState<any>(null)
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [livePayments, setLivePayments] = useState(false)
  const [emailFrom, setEmailFrom] = useState('')
  const [emailReplyTo, setEmailReplyTo] = useState('')
  const [emailLive, setEmailLive] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const s = await api.getIntegrations()
      setState(s)
      setLivePayments(s.razorpay.livePayments)
      setEmailLive(s.email.live)
      setEmailFrom(s.email.fromName ?? '')
      setEmailReplyTo(s.email.replyTo ?? '')
    })()
  }, [])

  async function saveRazorpay() {
    setBusy(true)
    try {
      await api.saveRazorpay({ keyId, keySecret, webhookSecret, livePayments })
      toast.success('Razorpay credentials saved (encrypted)')
      const s = await api.getIntegrations(); setState(s)
      setKeySecret(''); setWebhookSecret('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function saveEmail() {
    setBusy(true)
    try {
      await api.saveEmail({ fromName: emailFrom || null, replyTo: emailReplyTo || null, live: emailLive })
      toast.success('Email settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to save')
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return <div className="flex justify-center py-16 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Razorpay"
        desc="Keys are AES-256-GCM encrypted at rest and never returned by the API. With live payments OFF, retry outcomes come from the seeded simulator (the demo default). Live retry execution ships with Phase 4."
      >
        <div className="flex items-center gap-2 text-xs">
          {state.razorpay.configured
            ? <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Credentials configured</span>
            : <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-zinc-500">Not configured</span>}
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-zinc-400">
            retry mode: {state.razorpay.livePayments ? 'live gateway' : 'simulator'}
          </span>
        </div>
        <div className="mt-4 max-w-md space-y-3">
          <div>
            <label className={labelClass} htmlFor="rzp-id">Key ID</label>
            <Input id="rzp-id" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_…" />
          </div>
          <div>
            <label className={labelClass} htmlFor="rzp-secret">Key secret</label>
            <Input id="rzp-secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="••••••" />
          </div>
          <div>
            <label className={labelClass} htmlFor="rzp-whsec">Webhook secret (optional)</label>
            <Input id="rzp-whsec" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="••••••" />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={livePayments} onChange={(e) => setLivePayments(e.target.checked)} className="accent-violet-500" />
            Route retries to the live gateway (sandbox by default)
          </label>
          <Button onClick={saveRazorpay} disabled={busy || !keyId || !keySecret}>Save Razorpay credentials</Button>
        </div>
      </Panel>

      <Panel
        title="Email outreach"
        desc="Drafts are always stored in the audit trail. Turn live sending on to actually deliver them via the platform's email provider (Resend)."
      >
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full border px-2.5 py-1 ${state.email.providerConfigured ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}>
            provider: {state.email.providerConfigured ? 'connected' : 'not configured (RESEND_API_KEY)'}
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-zinc-400">
            mode: {state.email.live ? 'live sending' : 'draft-only'}
          </span>
        </div>
        <div className="mt-4 max-w-md space-y-3">
          <div>
            <label className={labelClass} htmlFor="em-from">From name</label>
            <Input id="em-from" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} placeholder="Acme Billing Team" />
          </div>
          <div>
            <label className={labelClass} htmlFor="em-reply">Reply-to</label>
            <Input id="em-reply" value={emailReplyTo} onChange={(e) => setEmailReplyTo(e.target.value)} placeholder="billing@acme.com" />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={emailLive} onChange={(e) => setEmailLive(e.target.checked)} className="accent-violet-500" />
            Send emails for real (off = draft-only, always audited)
          </label>
          <Button onClick={saveEmail} disabled={busy}>Save email settings</Button>
        </div>
      </Panel>
    </div>
  )
}

// ---------- billing ----------

type BillingData = {
  plan: string
  planLabel: string
  limits: { casesPerMonth: number; apiKeys: number; seats: number }
  usage: { casesThisMonth: number; apiKeys: number; members: number }
  availablePlans: Array<{ id: string; label: string; priceInr: number; casesPerMonth: number; apiKeys: number; seats: number }>
  devMode: boolean
}

function formatNumber(n: number) {
  return n >= Number.MAX_SAFE_INTEGER ? 'Unlimited' : n.toLocaleString('en-IN')
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit >= Number.MAX_SAFE_INTEGER
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-500">{used.toLocaleString('en-IN')} / {formatNumber(limit)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-violet-500'}`}
          style={{ width: `${unlimited ? 2 : pct}%` }}
        />
      </div>
    </div>
  )
}

function BillingTab() {
  const [data, setData] = useState<BillingData | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => { setData(await api.getBilling()) }, [])
  useEffect(() => { void load() }, [load])

  async function change(plan: string) {
    setBusy(true)
    try {
      await api.changePlan(plan)
      toast.success(`Plan switched to ${plan}`, data?.devMode ? 'Dev mode — no payment was charged.' : undefined)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'failed to change plan')
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <div className="flex justify-center py-16 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }

  const isDemo = data.plan === 'demo'

  return (
    <div className="space-y-4">
      <Panel title="Usage this month" desc="Limits are enforced in deterministic code — over-limit webhook events are parked, never lost.">
        <div className="grid gap-5 sm:grid-cols-3">
          <UsageBar label="Cases automated" used={data.usage.casesThisMonth} limit={data.limits.casesPerMonth} />
          <UsageBar label="API keys" used={data.usage.apiKeys} limit={data.limits.apiKeys} />
          <UsageBar label="Seats" used={data.usage.members} limit={data.limits.seats} />
        </div>
      </Panel>

      {data.devMode && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          <CreditCard className="h-4 w-4 shrink-0" />
          Dev mode: no payment provider is configured (STRIPE_SECRET_KEY unset), so plan changes apply instantly and charge nothing. Real Stripe checkout is the remaining Phase 3 item.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {data.availablePlans.map((p) => {
          const current = isDemo ? false : data.plan === p.id
          const recommended = p.id === 'pro'
          return (
            <div
              key={p.id}
              className={`relative rounded-xl border p-5 backdrop-blur-sm ${
                current ? 'border-violet-500/50 bg-violet-500/5' : 'border-zinc-800/80 bg-zinc-900/50'
              }`}
            >
              {recommended && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Popular
                </span>
              )}
              <p className="text-sm font-semibold text-white">{p.label}</p>
              <p className="mt-1">
                <span className="text-2xl font-semibold tabular-nums text-white">₹{p.priceInr.toLocaleString('en-IN')}</span>
                <span className="text-xs text-zinc-500"> /mo</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-zinc-400">
                <li>{formatNumber(p.casesPerMonth)} cases / month</li>
                <li>{p.apiKeys} API key{p.apiKeys > 1 ? 's' : ''}</li>
                <li>{p.seats} seat{p.seats > 1 ? 's' : ''}</li>
              </ul>
              <Button
                className="mt-5 w-full"
                variant={current ? 'outline' : 'default'}
                disabled={busy || current || isDemo}
                onClick={() => change(p.id)}
              >
                {current ? 'Current plan' : isDemo ? 'Demo workspace' : `Switch to ${p.label}`}
              </Button>
            </div>
          )
        })}
      </div>

      {isDemo && (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Plug className="h-3.5 w-3.5" /> This is the seeded demo workspace on the unlimited demo plan.
        </p>
      )}
    </div>
  )
}
