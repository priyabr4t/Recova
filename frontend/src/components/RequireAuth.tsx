import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { useAuth } from '../lib/auth'

/** Blocks the app shell until the session is resolved; bounces to /login otherwise. */
export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <RefreshCcw className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          Loading workspace…
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
