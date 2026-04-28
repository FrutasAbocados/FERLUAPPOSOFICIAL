import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { canAccess, type ModuleKey } from '@/shared/types'

type Props = {
  module?: ModuleKey
}

export function ProtectedRoute({ module }: Props) {
  const { loading, user, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--color-ink-3)]">
        Cargando…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-[var(--color-ink-2)]">
        Tu cuenta existe pero no tiene perfil asociado todavía. Avisa a Luis.
      </div>
    )
  }

  if (module && !canAccess(module, profile.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
