import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/shared/auth/useAuth'
import LoginHero from '@/components/login-hero/LoginHero'

type LocationState = { from?: string }

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--color-ink-3)]">
        Cargando…
      </div>
    )
  }
  if (user) {
    return <Navigate to={state?.from ?? '/'} replace />
  }

  return (
    <LoginHero
      logoSrc="/brand/abocados-logo.png"
      version="v2.4.1"
      onSubmit={async ({ email, password }) => {
        const { error } = await signIn(email, password)
        if (error) throw new Error(error)
        navigate(state?.from ?? '/', { replace: true })
      }}
    />
  )
}
