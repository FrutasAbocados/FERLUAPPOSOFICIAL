import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'

type LocationState = { from?: string }

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error: err } = await signIn(email, password)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      navigate(state?.from ?? '/', { replace: true })
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)] px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-md">
            <span className="font-display text-2xl font-bold">A</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)]">
            Abocados OS
          </h1>
          <p className="text-sm text-[var(--color-ink-2)]">
            Operativa interna de Frutas Abocados
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-xs text-[var(--color-ink-3)]">
          ¿No tienes cuenta? Pide acceso a Luis.
        </p>
      </div>
    </div>
  )
}
