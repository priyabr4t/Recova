import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/layout/AuthLayout'
import { useAuth } from '../lib/auth'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signup({ name, orgName, email, password })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signup failed')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/40'
  const labelClass = 'mb-1.5 block text-xs font-medium text-zinc-400'

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start recovering failed revenue in minutes."
      footer={
        <>
          Already have a workspace?{' '}
          <Link to="/login" className="font-medium text-violet-400 hover:text-violet-300">Sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>Your name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Merchant" className={inputClass} />
        </div>
        <div>
          <label htmlFor="orgName" className={labelClass}>Company / workspace</label>
          <input id="orgName" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Retail Pvt Ltd" className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Work email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acme.com" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputClass} />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Creating workspace…' : 'Create workspace'}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-zinc-600">
          You are the workspace owner. The agent's actions stay bounded by the rules engine —
          opt-outs, contact caps and quiet hours are enforced in deterministic code.
        </p>
      </form>
    </AuthLayout>
  )
}
