import * as Sentry from '@sentry/react'
import { env } from './env'

/**
 * Inicializa Sentry frontend.
 * No-op si VITE_SENTRY_DSN está vacío (entorno local sin DSN configurado).
 */
export function initSentry(): void {
  if (!env.sentryDsn) {
    if (env.appEnv !== 'production') {
      console.info('[sentry] DSN vacío — Sentry desactivado en este entorno')
    }
    return
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.appEnv,
    release: env.appVersion,
    // Tag obligatorio multi-tenant Plan Maestro Fase 2.
    // Mirror de @lumo/shared-observability buildSentryConfig — mantener sincronizado.
    initialScope: {
      tags: { tenant: 'ferlu', app: 'abocados-os' },
    },
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,    // app interna, no tenemos PII sensible visible
        blockAllMedia: true,   // pero sí bloqueamos imágenes/canvas
      }),
    ],
    // Sample rates conservadores — 5k eventos/mes free tier
    tracesSampleRate: env.appEnv === 'production' ? 0.1 : 0,
    replaysSessionSampleRate: 0,        // no grabamos sesiones por defecto
    replaysOnErrorSampleRate: 1.0,      // sí grabamos cuando hay error (para reproducir)
    // Filtros de ruido típico — mirror de COMMON_IGNORE_ERRORS en @lumo/shared-observability
    ignoreErrors: [
      'ResizeObserver loop',
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // Network errors transitorios — no son bugs nuestros
      'NetworkError',
      'Failed to fetch',
      'Load failed',
    ],
    beforeSend(event, hint) {
      // En dev local nunca enviamos
      if (env.appEnv === 'development') return null
      // No enviamos errores con mensaje vacío
      const msg = hint?.originalException instanceof Error
        ? hint.originalException.message
        : String(hint?.originalException ?? '')
      if (!msg.trim()) return null
      return event
    },
  })
}

/**
 * Asocia el usuario actual al scope Sentry (llamar al hacer login).
 * Solo email + role + display_name. No mandamos nada sensible.
 */
export function setSentryUser(user: { id: string; email: string; role?: string; display_name?: string }): void {
  if (!env.sentryDsn) return
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.display_name,
    role: user.role,
  } as Sentry.User)
}

export function clearSentryUser(): void {
  if (!env.sentryDsn) return
  Sentry.setUser(null)
}

/**
 * Captura manual de un error con contexto extra.
 * Wrapper de Sentry.captureException para no exponer el SDK directamente.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!env.sentryDsn) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

export { Sentry }
