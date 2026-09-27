const BASE = ''

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    let message = `API error: ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message)
  }
  return res.json()
}

export { ApiError }

export const api = {
  // ---- auth ----
  me: () => request<any>('/auth/me'),
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (data: { name: string; orgName: string; email: string; password: string }) =>
    request<any>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<any>('/auth/logout', { method: 'POST' }),

  // ---- recovery ----
  getSummary: () => request<any>('/summary'),
  getCases: (state?: string) => request<any[]>(`/recovery/cases${state ? '?state=' + state : ''}`),
  getCase: (id: string) => request<any>(`/recovery/cases/${id}`),
  startRecovery: () => request<any>('/recovery/start', { method: 'POST' }),
  advanceDays: (days: number) => request<any>('/simulation/advance', { method: 'POST', body: JSON.stringify({ days }) }),
  resetSimulation: () => request<any>('/simulation/reset', { method: 'POST' }),
  getSimState: () => request<any>('/simulation/state'),
  getInvariants: () => request<any>('/health/invariants'),
  exportAuditCsv: async (): Promise<void> => {
    const res = await fetch(BASE + '/recovery/audit/export', { credentials: 'include' })
    if (!res.ok) throw new ApiError(res.status, `API error: ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'recova-audit-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  },
  listAudit: (params: { actor?: string; q?: string; limit?: number }) => {
    const usp = new URLSearchParams()
    if (params.actor) usp.set('actor', params.actor)
    if (params.q) usp.set('q', params.q)
    if (params.limit) usp.set('limit', String(params.limit))
    const qs = usp.toString()
    return request<any[]>(`/recovery/audit${qs ? '?' + qs : ''}`)
  },

  // ---- human case overrides ----
  addCaseNote: (id: string, body: string) =>
    request<any>(`/recovery/cases/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  escalateCase: (id: string, reason: string) =>
    request<any>(`/recovery/cases/${id}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  writeOffCase: (id: string, reason: string) =>
    request<any>(`/recovery/cases/${id}/write-off`, { method: 'POST', body: JSON.stringify({ reason }) }),
  redecideCase: (id: string, reason: string) =>
    request<any>(`/recovery/cases/${id}/re-decide`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ---- workspace / team ----
  getOrg: () => request<any>('/org'),
  updateOrg: (name: string) => request<any>('/org', { method: 'PATCH', body: JSON.stringify({ name }) }),
  inviteMember: (data: { email: string; role: string; name?: string }) =>
    request<any>('/org/invite', { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (userId: string) => request<any>(`/org/members/${userId}`, { method: 'DELETE' }),
  listKeys: () => request<any[]>('/org/keys'),
  createKey: (label: string) => request<any>('/org/keys', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeKey: (id: string) => request<any>(`/org/keys/${id}`, { method: 'DELETE' }),

  // ---- billing ----
  getBilling: () => request<any>('/billing'),
  changePlan: (plan: string) => request<any>('/billing/plan', { method: 'POST', body: JSON.stringify({ plan }) }),

  // ---- integrations ----
  getIntegrations: () => request<any>('/integrations'),
  saveRazorpay: (data: { keyId: string; keySecret: string; webhookSecret?: string; livePayments: boolean }) =>
    request<any>('/integrations/razorpay', { method: 'PUT', body: JSON.stringify(data) }),
  saveEmail: (data: { fromName?: string | null; replyTo?: string | null; live: boolean }) =>
    request<any>('/integrations/email', { method: 'PUT', body: JSON.stringify(data) }),

  // ---- profile ----
  updateProfile: (name: string) => request<any>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  changePassword: (current: string, next: string) =>
    request<any>('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
}
