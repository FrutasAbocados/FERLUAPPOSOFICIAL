import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, Clock } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import type { Period } from '../lib/period'

interface DiaSemana {
  dow: number
  dia: string
  ventas: number
  docs: number
  ndias: number
}

interface PedidoProximo {
  contact_name_canon: string
  ultima_compra: string
  cadencia_dias: number
  proxima_esperada: string
  dias_para: number
  ventas_medias: number
  prioridad: 'urgente' | 'pronto' | 'esta_semana'
}

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

function usePatronesDow(period: Period) {
  return useQuery({
    queryKey: ['manager', 'patrones', 'dow', period.from, period.to] as const,
    queryFn: async (): Promise<DiaSemana[]> => {
      const { data, error } = await supabase.rpc('manager_patrones_dia_semana', { p_from: period.from, p_to: period.to })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        dow:    Number(r.dow),
        dia:    String(r.dia),
        ventas: Number(r.ventas ?? 0),
        docs:   Number(r.docs ?? 0),
        ndias:  Number(r.ndias ?? 0),
      }))
    },
  })
}

function usePedidosProximos() {
  return useQuery({
    queryKey: ['manager', 'patrones', 'proximos'] as const,
    queryFn: async (): Promise<PedidoProximo[]> => {
      const { data, error } = await supabase.rpc('manager_pedidos_proximos')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        contact_name_canon: String(r.contact_name_canon ?? ''),
        ultima_compra:      String(r.ultima_compra ?? ''),
        cadencia_dias:      Number(r.cadencia_dias ?? 0),
        proxima_esperada:   String(r.proxima_esperada ?? ''),
        dias_para:          Number(r.dias_para ?? 0),
        ventas_medias:      Number(r.ventas_medias ?? 0),
        prioridad:          (r.prioridad as PedidoProximo['prioridad']) ?? 'esta_semana',
      }))
    },
  })
}

interface Props {
  period: Period
}

export function PatronesView({ period }: Props) {
  const dow = usePatronesDow(period)
  const proximos = usePedidosProximos()

  const maxVentas = Math.max(1, ...(dow.data ?? []).map(d => d.ventas))

  const grupos = (proximos.data ?? []).reduce<Record<PedidoProximo['prioridad'], PedidoProximo[]>>((acc, p) => {
    (acc[p.prioridad] ??= []).push(p)
    return acc
  }, { urgente: [], pronto: [], esta_semana: [] })

  return (
    <div className="space-y-4">
      {/* Patrones día semana */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-baseline gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--color-ink-3)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Patrón por día de la semana</h2>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{period.from} → {period.to}</span>
        </div>
        {dow.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {dow.data && (
          <ul className="space-y-2">
            {dow.data.map(d => (
              <li key={d.dow} className="grid grid-cols-[80px_1fr_auto] items-center gap-3">
                <span className="text-sm text-[var(--color-ink)]">{d.dia}</span>
                <div className="relative h-6 overflow-hidden rounded-md bg-[var(--color-surface-2,#f1f5f9)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md bg-emerald-500/70"
                    style={{ width: `${(d.ventas / maxVentas) * 100}%` }}
                  />
                  <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium text-[var(--color-ink)]">
                    {eur(d.ventas)} · {d.docs} docs
                  </span>
                </div>
                <span className="text-xs text-[var(--color-ink-3)] tabular-nums">
                  ~{d.ndias > 0 ? eur(d.ventas / d.ndias) : '—'}/día
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Esperados próximos 7d */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-baseline gap-2">
          <Clock className="h-4 w-4 text-[var(--color-ink-3)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Esperados próximos 7 días</h2>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{(proximos.data?.length ?? 0)} clientes</span>
        </div>
        {proximos.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {proximos.data?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Nadie tiene patrón regular detectado</p>}

        {grupos.urgente.length > 0 && (
          <Grupo titulo="Urgente — pasada fecha esperada" tono="critica" rows={grupos.urgente} />
        )}
        {grupos.pronto.length > 0 && (
          <Grupo titulo="Pronto (próximos 3 días)" tono="aviso" rows={grupos.pronto} />
        )}
        {grupos.esta_semana.length > 0 && (
          <Grupo titulo="Esta semana" tono="info" rows={grupos.esta_semana} />
        )}
      </section>
    </div>
  )
}

function Grupo({ titulo, tono, rows }: { titulo: string; tono: 'critica' | 'aviso' | 'info'; rows: PedidoProximo[] }) {
  const color = tono === 'critica' ? 'text-red-700' : tono === 'aviso' ? 'text-amber-700' : 'text-blue-700'
  return (
    <div className="mt-3 first:mt-0">
      <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${color}`}>{titulo}</h3>
      <ul className="space-y-1">
        {rows.map(p => (
          <li key={p.contact_name_canon} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 text-sm">
            <span className="truncate text-[var(--color-ink)]">{p.contact_name_canon}</span>
            <span className="text-xs text-[var(--color-ink-3)]">cad. {p.cadencia_dias.toFixed(0)}d</span>
            <span className="text-xs text-[var(--color-ink-3)]">{fmt(p.ultima_compra)} → {fmt(p.proxima_esperada)}</span>
            <span className={`text-xs font-medium tabular-nums ${color}`}>
              {p.dias_para === 0 ? 'hoy' : p.dias_para < 0 ? `${Math.abs(p.dias_para)}d tarde` : `en ${p.dias_para}d`} · ~{eur(p.ventas_medias)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
