import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/shared/lib/sentry'
import { isChunkLoadError, recoverFromChunkLoadError } from '@/shared/lib/chunk-recovery'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      if (recoverFromChunkLoadError(error)) return
      console.warn('[ErrorBoundary] chunk load error after reload attempt', error)
      return
    }
    console.error('[ErrorBoundary]', error, info)
    reportError(error, { componentStack: info.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
        <div className="max-w-md rounded-[var(--radius-lg)] border border-[var(--color-danger)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold text-[var(--color-danger)]">
            Algo ha fallado
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink-2)]">
            La aplicación encontró un error inesperado. Recarga la página o
            copia este mensaje al desarrollador.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-2 text-[10px] text-[var(--color-ink-2)]">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
