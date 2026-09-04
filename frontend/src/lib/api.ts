const BASE = ''

async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  getSummary: () => request<any>('/summary'),
  getCases: (state?: string) => request<any[]>(`/recovery/cases${state ? '?state=' + state : ''}`),
  getCase: (id: string) => request<any>(`/recovery/cases/${id}`),
  startRecovery: () => request<any>('/recovery/start', { method: 'POST' }),
  advanceDays: (days: number) => request<any>('/simulation/advance', { method: 'POST', body: JSON.stringify({ days }) }),
  resetSimulation: () => request<any>('/simulation/reset', { method: 'POST' }),
  getSimState: () => request<any>('/simulation/state'),
  getInvariants: () => request<any>('/health/invariants'),
  exportAuditCsv: async (): Promise<void> => {
    const res = await fetch(BASE + '/recovery/audit/export')
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'recova-audit-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  },
}
