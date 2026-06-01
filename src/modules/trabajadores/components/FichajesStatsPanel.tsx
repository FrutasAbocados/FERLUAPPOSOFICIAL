import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth, startOfWeek, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart3, Clock, CalendarDays, Timer, FileDown, Loader2 } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { imprimirRegistroJornada, type FichajeExport } from '../lib/registroJornadaPdf'

interface StatRow {
  empleado_id: string
  empleado_nombre: string
  empleado_color: string | null
  total_horas: number
  dias_trabajados: number
  media_horas_dia: number
  num_fichajes: number
  abiertos: number
  hora_media_entrada: string | null
  hora_media_salida: string | null
  horario_entrada: string | null
  retraso_medio_min: number | null
  jornada_horas_semana: number | null
}

type Preset = 'semana' | 'mes' | '30d' | 'custom'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function rangoDe(preset: Preset, customDesde: string, customHasta: string): { desde: string; hasta: string } {
  const hoy = new Date()
  if (preset === 'semana') return { desde: iso(startOfWeek(hoy, { weekStartsOn: 1 })), hasta: iso(hoy) }
  if (preset === 'mes') return { desde: iso(startOfMonth(hoy)), hasta: iso(hoy) }
  if (preset === '30d') {
    const d = new Date(hoy); d.setDate(d.getDate() - 29)
    return { desde: iso(d), hasta: iso(hoy) }
  }
  return { desde: customDesde, hasta: customHasta }
}

function Puntualidad({ min }: { min: number | null }) {
  if (min == null) return <span className="text-[var(--color-ink-3)]">—</span>
  const abs = Math.abs(min)
  if (min <= 5 && min >= -10) {
    return <span className="rounded-full bg-[var(--mint-glow)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mint)]">Puntual</span>
  }
  if (min < -10) {
    return <span className="rounded-full bg-[oklch(76%_.12_235_/_0.18)] px-2 py-0.5 text-[11px] font-semibold text-[var(--sky)]" title="Entra antes de su hora">−{abs}min</span>
  }
  const color = min > 20 ? 'var(--coral)' : 'var(--amber)'
  const bg = min > 20 ? 'oklch(30% .12 25 / 0.30)' : 'oklch(85% .12 82 / 0.18)'
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: bg, color }} title="Retraso medio sobre su horario">+{abs}min</span>
}

/**
 * Estadísticas de fichaje por empleado en un periodo, para que Álvaro vea de un
 * vistazo cómo van los chicos: horas, días, media/día, hora media de entrada y
 * puntualidad sobre el horario contractual.
 */
export function FichajesStatsPanel() {
  const [preset, setPreset] = useState<Preset>('mes')
  const [customDesde, setCustomDesde] = useState(iso(startOfMonth(new Date())))
  const [customHasta, setCustomHasta] = useState(iso(new Date()))

  const { desde, hasta } = rangoDe(preset, customDesde, customHasta)

  const stats = useQuery({
    queryKey: ['fichajes', 'stats', desde, hasta] as const,
    queryFn: async (): Promise<StatRow[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_stats', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        empleado_id: String(r.empleado_id ?? ''),
        empleado_nombre: String(r.empleado_nombre ?? ''),
        empleado_color: r.empleado_color == null ? null : String(r.empleado_color),
        total_horas: Number(r.total_horas ?? 0),
        dias_trabajados: Number(r.dias_trabajados ?? 0),
        media_horas_dia: Number(r.media_horas_dia ?? 0),
        num_fichajes: Number(r.num_fichajes ?? 0),
        abiertos: Number(r.abiertos ?? 0),
        hora_media_entrada: r.hora_media_entrada == null ? null : String(r.hora_media_entrada),
        hora_media_salida: r.hora_media_salida == null ? null : String(r.hora_media_salida),
        horario_entrada: r.horario_entrada == null ? null : String(r.horario_entrada),
        retraso_medio_min: r.retraso_medio_min == null ? null : Number(r.retraso_medio_min),
        jornada_horas_semana: r.jornada_horas_semana == null ? null : Number(r.jornada_horas_semana),
      }))
    },
  })

  const [exportando, setExportando] = useState(false)
  async function exportarPdf() {
    setExportando(true)
    try {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_export', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      const filas = (data ?? []).map((r: Record<string, unknown>): FichajeExport => ({
        empleado_id: String(r.empleado_id ?? ''),
        empleado_nombre: String(r.empleado_nombre ?? ''),
        ts_in: String(r.ts_in ?? ''),
        ts_out: r.ts_out == null ? null : String(r.ts_out),
        fecha: String(r.fecha ?? ''),
        horas: r.horas == null ? null : Number(r.horas),
        fuente: String(r.fuente ?? ''),
      }))
      if (filas.length === 0) {
        toast({ title: 'Sin fichajes en el periodo', description: 'No hay nada que exportar.', variant: 'error' })
        return
      }
      imprimirRegistroJornada(filas, desde, hasta)
    } catch (e) {
      toast({ title: 'No se pudo exportar', description: e instanceof Error ? e.message : '', variant: 'error' })
    } finally {
      setExportando(false)
    }
  }

  const rows = stats.data ?? []
  const conActividad = rows.filter(r => r.num_fichajes > 0)
  const maxHoras = useMemo(() => Math.max(1, ...conActividad.map(r => r.total_horas)), [conActividad])
  const totalEquipo = useMemo(() => conActividad.reduce((s, r) => s + r.total_horas, 0), [conActividad])

  const presets: Array<{ k: Preset; l: string }> = [
    { k: 'semana', l: 'Esta semana' },
    { k: 'mes', l: 'Este mes' },
    { k: '30d', l: '30 días' },
    { k: 'custom', l: 'Personalizado' },
  ]

  return (
    <section className="ao-card p-0 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--color-primary-2)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Estadísticas del equipo</h2>
          {totalEquipo > 0 && (
            <span className="text-xs text-[var(--color-ink-3)] tabular-nums">· {totalEquipo.toFixed(0)}h totales</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {presets.map(p => (
            <button
              key={p.k}
              type="button"
              onClick={() => setPreset(p.k)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                preset === p.k
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]'
              }`}
            >
              {p.l}
            </button>
          ))}
          <button
            type="button"
            onClick={exportarPdf}
            disabled={exportando}
            title="Exportar Registro de Jornada (PDF para Hacienda / Inspección / gestoría)"
            className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            PDF Hacienda
          </button>
        </div>
      </header>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs">
          <span className="text-[var(--color-ink-3)]">Desde</span>
          <input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1" />
          <span className="text-[var(--color-ink-3)]">hasta</span>
          <input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1" />
        </div>
      )}

      <div className="px-4 py-2 text-[11px] text-[var(--color-ink-3)] tabular-nums">
        {format(new Date(desde + 'T00:00'), "d LLL", { locale: es })} – {format(new Date(hasta + 'T00:00'), "d LLL yyyy", { locale: es })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-[var(--color-border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
              <th className="px-4 py-2 text-left">Empleado</th>
              <th className="px-2 py-2 text-right"><Clock className="inline h-3 w-3" /> Horas</th>
              <th className="px-2 py-2 text-right"><CalendarDays className="inline h-3 w-3" /> Días</th>
              <th className="px-2 py-2 text-right">Media/día</th>
              <th className="px-2 py-2 text-center"><Timer className="inline h-3 w-3" /> Entrada</th>
              <th className="px-2 py-2 text-center">Salida</th>
              <th className="px-2 py-2 text-center">Puntualidad</th>
              <th className="px-4 py-2 text-right">Reparto</th>
            </tr>
          </thead>
          <tbody>
            {stats.isLoading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--color-ink-3)]">Cargando…</td></tr>
            )}
            {!stats.isLoading && conActividad.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--color-ink-3)]">Sin fichajes en este periodo</td></tr>
            )}
            {conActividad.map(r => (
              <tr key={r.empleado_id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: r.empleado_color ?? 'var(--mint)' }} />
                    <span className="font-medium text-[var(--color-ink)]">{r.empleado_nombre}</span>
                    {r.abiertos > 0 && (
                      <span className="rounded-full bg-[oklch(30%_.12_25_/_0.30)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--coral)]" title="Fichajes sin salida en el periodo">
                        {r.abiertos} abierto{r.abiertos > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-[var(--color-ink)]">{r.total_horas.toFixed(1)}h</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--color-ink-2)]">{r.dias_trabajados}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--color-ink-2)]">{r.media_horas_dia.toFixed(1)}h</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-[var(--color-ink-2)]">
                  {r.hora_media_entrada ?? '—'}
                  {r.horario_entrada && <div className="text-[10px] text-[var(--color-ink-3)]">objetivo {r.horario_entrada}</div>}
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-[var(--color-ink-2)]">
                  {r.hora_media_salida ?? '—'}
                </td>
                <td className="px-2 py-2.5 text-center"><Puntualidad min={r.retraso_medio_min} /></td>
                <td className="px-4 py-2.5">
                  <div className="ml-auto flex items-center gap-2" style={{ maxWidth: 140 }}>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div className="h-full rounded-full" style={{ width: `${(r.total_horas / maxHoras) * 100}%`, background: r.empleado_color ?? 'var(--mint)' }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-ink-3)]">
                      {totalEquipo > 0 ? Math.round((r.total_horas / totalEquipo) * 100) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
