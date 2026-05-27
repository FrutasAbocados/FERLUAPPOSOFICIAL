const RELOAD_FLAG = 'abocadosos:chunk-reload-at'
const RELOAD_WINDOW_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
  'dynamically imported module',
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'is not a valid javascript mime type',
]

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getMessage(error).toLowerCase()
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export function recoverFromChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false

  try {
    const lastReload = Number(window.sessionStorage.getItem(RELOAD_FLAG) ?? 0)
    if (Number.isFinite(lastReload) && Date.now() - lastReload < RELOAD_WINDOW_MS) {
      return false
    }
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    // Si sessionStorage falla, recargamos igualmente: es mejor que dejar la PWA rota.
  }

  window.location.reload()
  return true
}

export function initChunkRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    const payload = (event as Event & { payload?: unknown }).payload
    if (recoverFromChunkLoadError(payload)) event.stopImmediatePropagation()
  })

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (!recoverFromChunkLoadError(event.reason)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true,
  )

  window.addEventListener(
    'error',
    (event) => {
      const error = event.error ?? event.message
      if (!recoverFromChunkLoadError(error)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true,
  )
}
