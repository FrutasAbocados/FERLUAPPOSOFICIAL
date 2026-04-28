import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Clock, EyeOff, Lightbulb, Moon } from 'lucide-react'
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

type RecoTipo = 'vendiendo_bajo_coste' | 'cliente_caida_pedido' | 'cliente_subida_pedido' | 'cliente_dejo_producto' | 'producto_se_apaga'

interface Recomendacion {
  tipo: RecoTipo
  prioridad: number
  cliente: string
  producto: string
  valor_eur: number
  detalle: string
  fecha_ref: string
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

function useRecomendaciones() {
  return useQuery({
    queryKey: ['manager', 'recomendaciones'] as const,
    queryFn: async (): Promise<Recomendacion[]> => {
      const { data, error } = await supabase.rpc('manager_recomendaciones')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        tipo:       (r.tipo as RecoTipo),
        prioridad:  Number(r.prioridad ?? 3),
        cliente:    String(r.cliente ?? ''),
        producto:   String(r.producto ?? ''),
        valor_eur:  Number(r.valor_eur ?? 0),
        detalle:    String(r.detalle ?? ''),
        fecha_ref:  String(r.fecha_ref ?? ''),
      }))
    },
  })
}

const RECO_META: Record<RecoTipo, { titulo: string; Icon: typeof Lightbulb; color: string; accent: string }> = {
  vendiendo_bajo_coste:   { titulo: 'Vendiendo bajo coste',   Icon: AlertTriangle, color: 'text-red-700',     accent: 'border-l-red-500' },
  cliente_caida_pedido:   { titulo: 'Cliente baja pedido',    Icon: ArrowDown,     color: 'text-amber-700',   accent: 'border-l-amber-500' },
  cliente_subida_pedido:  { titulo: 'Cliente sube pedido',    Icon: ArrowUp,       color: 'text-emerald-700', accent: 'border-l-emerald-500' },
  cliente_dejo_producto:  { titulo: 'Cliente dejó producto',  Icon: EyeOff,        color: 'text-amber-700',   accent: 'border-l-amber-500' },
  producto_se_apaga:      { titulo: 'Producto en caída',      Icon: Moon,          color: 'text-blue-700',    accent: 'border-l-blue-500' },
}

interface Props {
  period: Period
}

export function PatronesView({ period }: Props) {
  const dow = usePatronesDow(period)
  const proximos = usePedidosProximos()
  const recos = useRecomendaciones()

  const maxVentas = Math.max(1, ...(dow.data ?? []).map(d => d.ventas))

  const grupos = (proximos.data ?? []).reduce<Record<PedidoProximo['prioridad'], PedidoProximo[]>>((acc, p) => {
    (acc[p.prioridad] ??= []).push(p)
    return acc
  }, { urgente: [], pronto: [], esta_semana: [] })

  return (
    <div className="space-y-4">
      {/* Patrón día semana — heatmap horizontal */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <header className="mb-4 flex items-baseline gap-2">
          <CalendarClock className="h-5 w-5 text-[var(--color-ink-3)]" />
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Patrón por día de la semana</h2>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{period.from} → {period.to}</span>
        </header>

        {dow.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

        {dow.data && (
          <div className="grid grid-cols-7 gap-2">
            {dow.data.map(d => {
              const intensidad = d.ventas / maxVentas
              const promedioDia = d.ndias > 0 ? d.ventas / d.ndias : 0
              return (
                <div key={d.dow} className="flex flex-col items-stretch overflow-hidden rounded-lg border border-[var(--color-border)]">
                  <div
                    className="px-2 py-3 text-center"
                    style={{
                      backgroundColor: `rgba(16, 185, 129, ${0.10 + intensidad * 0.65})`,
                    }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]">{d.dia.slice(0, 3)}</div>
                    <div className="mt-1 font-display text-lg font-bold text-emerald-900 tabular-nums">{eur(d.ventas)}</div>
                  </div>
                  <div className="border-t border-[var(--color-border)] px-2 py-1.5 text-center text-[10px] tabular-nums text-[var(--color-ink-3)]">
                    {d.docs} docs · ~{eur(promedioDia)}/día
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Esperados próximos 7d — 3 grupos en grid */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <header className="mb-4 flex items-baseline gap-2">
          <Clock className="h-5 w-5 text-[var(--color-ink-3)]" />
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Esperados próximos 7 días</h2>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{(proximos.data?.length ?? 0)} clientes con cadencia regular</span>
        </header>

        {proximos.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {proximos.data?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Nadie tiene patrón regular detectado</p>}

        <div className="grid gap-3 md:grid-cols-3">
          <Columna titulo="Urgente" subtitulo="pasada fecha" tono="critica" rows={grupos.urgente} />
          <Columna titulo="Pronto"  subtitulo="próximos 3 días" tono="aviso" rows={grupos.pronto} />
          <Columna titulo="Esta semana" subtitulo="próximos 7 días" tono="info" rows={grupos.esta_semana} />
        </div>
      </section>

      {/* Recomendaciones */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <header className="mb-4 flex items-baseline gap-2">
          <Lightbulb className="h-5 w-5 text-[var(--color-ink-3)]" />
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Recomendaciones</h2>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{recos.data?.length ?? 0} insights</span>
        </header>

        {recos.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {recos.data?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Nada relevante por ahora — todo dentro de patrón.</p>}

        <ul className="grid gap-2 md:grid-cols-2">
          {recos.data?.map((r, i) => {
            const meta = RECO_META[r.tipo]
            const Icon = meta.Icon
            return (
              <li key={i} className={`flex items-start gap-3 rounded-lg border border-[var(--color-border)] border-l-4 ${meta.accent} bg-[var(--color-surface)] p-3`}>
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{meta.titulo}</span>
                    <span className={`text-xs font-medium tabular-nums ${meta.color}`}>
                      {r.valor_eur > 0 ? '+' : ''}{eur(r.valor_eur)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium text-[var(--color-ink)]">
                    {r.cliente && <span>{r.cliente}</span>}
                    {r.cliente && r.producto && <span className="text-[var(--color-ink-3)]"> · </span>}
                    {r.producto && <span>{r.producto}</span>}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">{r.detalle}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Columna({ titulo, subtitulo, tono, rows }: { titulo: string; subtitulo: string; tono: 'critica' | 'aviso' | 'info'; rows: PedidoProximo[] }) {
  const accent = tono === 'critica' ? 'border-l-red-500'
                : tono === 'aviso'   ? 'border-l-amber-500'
                : 'border-l-blue-500'
  const color = tono === 'critica' ? 'text-red-700'
              : tono === 'aviso'   ? 'text-amber-700'
              : 'text-blue-700'
  const badge = tono === 'critica' ? 'bg-red-100 text-red-800'
              : tono === 'aviso'   ? 'bg-amber-100 text-amber-800'
              : 'bg-blue-100 text-blue-800'
  return (
    <div className={`rounded-lg border border-[var(--color-border)] border-l-4 ${accent} p-3`}>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <div className={`text-sm font-bold ${color}`}>{titulo}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{subtitulo}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-3)]">—</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(p => (
            <li key={p.contact_name_canon} className="border-t border-[var(--color-border)]/60 pt-1.5 first:border-t-0 first:pt-0">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">{p.contact_name_canon}</div>
              <div className="flex items-baseline justify-between text-[11px] text-[var(--color-ink-3)] tabular-nums">
                <span>cad. {p.cadencia_dias.toFixed(0)}d · ~{eur(p.ventas_medias)}</span>
                <span className={color + ' font-medium'}>
                  {p.dias_para === 0 ? 'hoy' : p.dias_para < 0 ? `${Math.abs(p.dias_para)}d tarde` : `en ${p.dias_para}d`}
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-ink-3)]">
                {fmt(p.ultima_compra)} → {fmt(p.proxima_esperada)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
