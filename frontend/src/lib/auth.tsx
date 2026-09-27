import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

export type AuthUser = { id: string; name: string; email: string }
export type AuthOrg = { id: string; name: string; slug: string }

type AuthState = {
  user: AuthUser | null
  org: AuthOrg | null
  role: string | null
  /** true until the first /auth/me round-trip resolves */
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (data: { name: string; orgName: string; email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<AuthState, 'user' | 'org' | 'role' | 'loading'>>({
    user: null,
    org: null,
    role: null,
    loading: true,
  })

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setState({ user: me.user, org: me.org, role: me.role, loading: false })
    } catch {
      setState({ user: null, org: null, role: null, loading: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password)
    await refresh()
  }, [refresh])

  const signup = useCallback(async (data: { name: string; orgName: string; email: string; password: string }) => {
    await api.signup(data)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setState({ user: null, org: null, role: null, loading: false })
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, refresh, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
