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

// Purga el service worker + caches ANTES de recargar. Sin esto, un reload simple
// vuelve a pedir el index.html viejo cacheado (que referencia chunks ya inexistentes)
// y el error se repite. Verificado: revocar SW + limpiar caches es lo único que
// hace que la ruta lazy vuelva a cargar el chunk correcto tras un deploy.
export async function purgeServiceWorkerAndReload(): Promise<void> {
  try {
    // Vacía también la caché HTTP del navegador (cabecera Clear-Site-Data en
    // vercel.json): ni el SW ni caches.delete alcanzan un asset guardado mal
    // con cache larga, como pasó el 2026-09-23.
    await fetch('/__clear-cache', { cache: 'no-store' })
  } catch {
    // Sin red o navegador sin soporte: seguimos con la purga del SW.
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // Si la purga falla, recargamos igualmente: mejor un reload que la PWA rota.
  }
  window.location.reload()
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

  void purgeServiceWorkerAndReload()
  return true
}

export function initChunkRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    const payload = (event as Event & { payload?: unknown }).payload
    // Nunca se cancela: con preventDefault el helper de Vite resuelve el
    // import() a undefined y React.lazy falla con "reading 'default'", que el
    // ErrorBoundary reporta a Sentry como error de código mientras la purga
    // recarga. Sin cancelar, el lazy recibe el error de carga real y el
    // ErrorBoundary lo trata como chunk (sin reporte).
    recoverFromChunkLoadError(payload)
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
