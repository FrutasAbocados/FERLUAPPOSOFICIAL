import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'

type EstadoAviso = {
  empleado_id: string
  nombre: string
  version: number | null
  aceptado_at: string | null
  ultima_version: number | null
}

/** Quién ha aceptado el aviso de fichaje con ubicación (solo administración). */
export function AvisosAceptadosPanel() {
  const q = useQuery({
    queryKey: ['trabajadores', 'avisos-estado', 'fichaje_ubicacion'] as const,
    queryFn: async (): Promise<EstadoAviso[]> => {
      const { data, error } = await supabase.rpc('trabajadores_avisos_estado', { p_codigo: 'fichaje_ubicacion' })
      if (error) throw error
      return (data ?? []) as EstadoAviso[]
    },
  })
  if (!q.data || q.data.length === 0) return null
  const ok = q.data.filter((r) => r.aceptado_at && r.version === r.ultima_version).length

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        Aviso de fichaje con ubicación · aceptado {ok}/{q.data.length}
      </h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {q.data.map((r) => {
          const vigente = !!r.aceptado_at && r.version === r.ultima_version
          return (
            <li key={r.empleado_id} className="flex items-center gap-1.5">
              {vigente ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
              ) : (
                <Clock className="h-4 w-4 text-[var(--coral)]" />
              )}
              <span className="text-[var(--color-ink)]">{r.nombre}</span>
              <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
                {vigente && r.aceptado_at
                  ? format(parseISO(r.aceptado_at), "d LLL yyyy · HH:mm", { locale: es })
                  : 'pendiente'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
