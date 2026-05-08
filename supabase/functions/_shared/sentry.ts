// Helper Sentry para edge functions Deno (sin SDK — fetch directo al envelope).
// Lee SENTRY_EDGE_DSN de env vars. Si no está configurado, es no-op.
//
// Uso:
//   import { reportEdgeError } from '../_shared/sentry.ts'
//   try { ... } catch (e) {
//     await reportEdgeError(e, { fn: 'holded-sync', extra: { ... } })
//     throw e
//   }

const SENTRY_DSN = Deno.env.get('SENTRY_EDGE_DSN') ?? ''

interface ParsedDSN {
  publicKey: string
  host: string
  projectId: string
  protocol: string
}

function parseDSN(dsn: string): ParsedDSN | null {
  // formato: https://<publicKey>@oXXXX.ingest.us.sentry.io/<projectId>
  const m = dsn.match(/^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/)
  if (!m) return null
  return { protocol: m[1], publicKey: m[2], host: m[3], projectId: m[4] }
}

/**
 * Envía un error al Sentry envelope endpoint.
 * No bloquea si Sentry tarda — usa fetch sin await en el caller si quieres fire-and-forget.
 */
export async function reportEdgeError(
  error: unknown,
  context: { fn: string; extra?: Record<string, unknown>; user?: { id: string; email?: string } } = { fn: 'unknown' },
): Promise<void> {
  if (!SENTRY_DSN) return

  const parsed = parseDSN(SENTRY_DSN)
  if (!parsed) {
    console.error('[sentry] DSN inválido:', SENTRY_DSN.slice(0, 40))
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const eventId = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()

  const event: Record<string, unknown> = {
    event_id: eventId,
    timestamp: now,
    platform: 'javascript',
    level: 'error',
    server_name: context.fn,
    environment: Deno.env.get('SENTRY_ENV') ?? 'production',
    release: Deno.env.get('SENTRY_RELEASE') ?? undefined,
    tags: {
      runtime: 'deno-edge',
      function: context.fn,
    },
    extra: context.extra ?? {},
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : 'Error',
          value: message,
          stacktrace: stack ? { frames: parseStack(stack) } : undefined,
        },
      ],
    },
    user: context.user,
  }

  const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: now, dsn: SENTRY_DSN })
  const itemHeader = JSON.stringify({ type: 'event', length: 0 })  // length 0 → Sentry calcula
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`

  const url = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=abocados-edge/1.0`,
      },
      body,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[sentry] envelope rejected', res.status, txt.slice(0, 200))
    }
  } catch (e) {
    console.error('[sentry] envelope failed', e instanceof Error ? e.message : e)
  }
}

/** Parsea un stack trace V8 a frames Sentry. */
function parseStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number; colno?: number; in_app: boolean }> {
  const lines = stack.split('\n').slice(1, 30)  // Skip primera línea (mensaje)
  return lines.map((line) => {
    // Formato típico:   at funcName (https://example.com/file.ts:10:5)
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?([^)]+):(\d+):(\d+)\)?$/)
    if (!m) return { function: line.trim(), in_app: true }
    return {
      function: m[1] ?? '<anonymous>',
      filename: m[2],
      lineno: parseInt(m[3], 10),
      colno: parseInt(m[4], 10),
      in_app: true,
    }
  }).filter((f) => f.function || f.filename)
}
