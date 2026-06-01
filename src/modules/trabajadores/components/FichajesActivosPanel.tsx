import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Radio, MapPin, AlertTriangle } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'

interface ActivoRow {
  id: string
  empleado_id: string
  empleado_nombre: string
  empleado_color: string | null
  ts_in: string
  segundos_dentro: number
  lat_in: number | null
  lng_in: number | null
  dia_anterior: boolean
}

function fmtDuracion(segs: number): string {
  if (segs < 0) segs = 0
  const h = Math.floor(segs / 3600)
  const m = Math.floor((segs % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

/**
 * Panel de control en vivo para admin/responsable: quién está fichado ahora
 * mismo, desde cuándo y cuánto llevan. Marca en rojo a quien arrastra un
 * fichaje de un día anterior (olvidó fichar salida) para que Álvaro lo cierre
 * desde el detalle mensual.
 */
export function FichajesActivosPanel() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const activos = useQuery({
    queryKey: ['fichajes', 'activos'] as const,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ActivoRow[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_activos_admin')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        empleado_id: String(r.empleado_id ?? ''),
        empleado_nombre: String(r.empleado_nombre ?? ''),
        empleado_color: r.empleado_color == null ? null : String(r.empleado_color),
        ts_in: String(r.ts_in ?? ''),
        segundos_dentro: Number(r.segundos_dentro ?? 0),
        lat_in: r.lat_in == null ? null : Number(r.lat_in),
        lng_in: r.lng_in == null ? null : Number(r.lng_in),
        dia_anterior: !!r.dia_anterior,
      }))
    },
  })

  const rows = activos.data ?? []
  const olvidos = rows.filter(r => r.dia_anterior).length

  return (
    <section className="ao-card p-0 overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {rows.length > 0 && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--mint)] opacity-60" style={{ animation: 'ping 2s cubic-bezier(0,0,.2,1) infinite' }} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${rows.length > 0 ? 'bg-[var(--mint)]' : 'bg-[var(--color-ink-3)]'}`} />
          </span>
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Fichados ahora</h2>
          <span className="rounded-full bg-[var(--mint-glow)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--mint)]">
            {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
          <Radio className="h-3 w-3" /> en vivo{void tick}
        </div>
      </header>

      {olvidos > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[oklch(30%_.12_25_/_0.18)] px-4 py-2 text-xs text-[var(--coral)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {olvidos === 1 ? '1 fichaje sigue abierto desde un día anterior' : `${olvidos} fichajes siguen abiertos desde días anteriores`}
            {' '}— probable olvido de salida. Ciérralos en el detalle del empleado.
          </span>
        </div>
      )}

      {activos.isLoading ? (
        <p className="px-4 py-4 text-sm text-[var(--color-ink-3)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-[var(--color-ink-3)]">Nadie fichado ahora mismo.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className="h-7 w-1.5 shrink-0 rounded-full"
                style={{ background: r.empleado_color ?? 'var(--mint)' }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-ink)]">{r.empleado_nombre}</span>
                  {r.dia_anterior && (
                    <span className="rounded-full bg-[oklch(30%_.12_25_/_0.35)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--coral)]">
                      olvido
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--color-ink-3)] tabular-nums">
                  Entrada {format(parseISO(r.ts_in), r.dia_anterior ? "d LLL · HH:mm" : 'HH:mm', { locale: es })}
                  {r.lat_in != null && r.lng_in != null && (
                    <>
                      {' · '}
                      <a
                        href={`https://www.google.com/maps?q=${r.lat_in},${r.lng_in}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[var(--color-primary-2)] hover:underline"
                      >
                        <MapPin className="h-3 w-3" /> ubicación
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`font-display text-lg font-bold tabular-nums ${r.dia_anterior ? 'text-[var(--coral)]' : 'text-[var(--mint)]'}`}>
                  {fmtDuracion(r.segundos_dentro + Math.max(0, tick) * 30)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">dentro</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
