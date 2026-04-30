import { useMemo } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, Clock, Download, Loader2, Truck } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_COLOR,
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../lib/types'
import { exportarHojaRuta } from '../lib/exportacion/excel'
import { usePedidosDelDia } from '../lib/queries'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

const REPARTIDOR_HEADER: Record<Repartidor, string> = {
  TORRES: 'border-blue-400 bg-blue-200 text-blue-900',
  GERMAN: 'border-emerald-400 bg-emerald-200 text-emerald-900',
  RAUL:   'border-orange-400 bg-orange-200 text-orange-900',
  ALEX:   'border-violet-400 bg-violet-200 text-violet-900',
}

export function HojaRuta() {
  const fechaIso = format(new Date(), 'yyyy-MM-dd')
  const titulo = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const { data: pedidos, isLoading, error } = usePedidosDelDia(fechaIso)

  const grupos = useMemo(() => {
    const map = new Map<Repartidor, Pedido[]>()
    for (const p of pedidos ?? []) {
      const r = p.cliente?.repartidor
      if (!r) continue
      if (!map.has(r)) map.set(r, [])
      map.get(r)!.push(p)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const sa = ordenSalida(a.cliente?.salida)
        const sb = ordenSalida(b.cliente?.salida)
        if (sa !== sb) return sa - sb
        return (a.cliente?.horario ?? '').localeCompare(b.cliente?.horario ?? '')
      })
    }
    return REPARTIDOR_ORDER
      .filter(r => map.has(r))
      .map(r => ({ repartidor: r, pedidos: map.get(r)! }))
  }, [pedidos])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando hoja de ruta…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error: {(error as Error).message}
      </div>
    )
  }

  const total = (pedidos ?? []).length

  const onExport = () => {
    if (total === 0) {
      toast({ title: 'Sin pedidos', description: 'Aún no hay pedidos para exportar.', variant: 'error' })
      return
    }
    try {
      exportarHojaRuta(pedidos ?? [], fechaIso)
      toast({ title: 'Excel descargado', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error exportando', description: (e as Error).message, variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] capitalize">
          Hoja de ruta · {titulo}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--color-ink-3)]">
            {total} {total === 1 ? 'pedido' : 'pedidos'} · {grupos.length} {grupos.length === 1 ? 'repartidor' : 'repartidores'}
          </span>
          <Button size="sm" variant="secondary" onClick={onExport} disabled={total === 0}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          No hay pedidos para hoy todavía.
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(g => (
            <BloqueRepartidor
              key={g.repartidor}
              repartidor={g.repartidor}
              pedidos={g.pedidos}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BloqueRepartidor({
  repartidor,
  pedidos,
}: {
  repartidor: Repartidor
  pedidos: Pedido[]
}) {
  const filas: Array<
    | { kind: 'pedido'; pedido: Pedido }
    | { kind: 'separator'; label: string }
  > = []

  let prevSalida: string | null | undefined
  for (const p of pedidos) {
    const salida = p.cliente?.salida ?? null
    if (
      (repartidor === 'GERMAN' || repartidor === 'RAUL') &&
      salida === 'SEGUNDA' &&
      prevSalida !== 'SEGUNDA'
    ) {
      filas.push({ kind: 'separator', label: 'Segunda salida' })
    }
    filas.push({ kind: 'pedido', pedido: p })
    prevSalida = salida
  }

  return (
    <section className={cn('overflow-hidden rounded-[var(--radius-lg)] border', REPARTIDOR_COLOR[repartidor])}>
      <header className={cn('flex items-center justify-between border-b px-4 py-2', REPARTIDOR_HEADER[repartidor])}>
        <div className="inline-flex items-center gap-2 font-semibold">
          <Truck className="h-4 w-4" />
          {REPARTIDOR_LABEL[repartidor]}
        </div>
        <span className="text-xs">
          {pedidos.length} {pedidos.length === 1 ? 'parada' : 'paradas'}
        </span>
      </header>

      <ul className="divide-y divide-[var(--color-border)]/40 bg-white/60">
        {filas.map((f, i) =>
          f.kind === 'separator' ? (
            <li key={`sep-${i}`} className="bg-zinc-100 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
              ── {f.label} ──
            </li>
          ) : (
            <ParadaRow key={f.pedido.id} pedido={f.pedido} />
          ),
        )}
      </ul>
    </section>
  )
}

function ParadaRow({ pedido }: { pedido: Pedido }) {
  const cliente = pedido.cliente
  const lineas = pedido.lineas ?? []

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-ink)]">
            <Clock className="h-3 w-3" />
            {cliente?.horario ?? '—'}
          </span>
          <span className="truncate font-semibold text-[var(--color-ink)]">
            {cliente?.nombre ?? '—'}
          </span>
          {cliente?.tipo_factura && cliente.tipo_factura !== 'HOLDED' && (
            <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">
              {cliente.tipo_factura}
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--color-ink-3)]">
          {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
        </span>
      </div>

      {cliente?.notas && (
        <div className="mt-1 inline-flex items-start gap-1 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{cliente.notas}</span>
        </div>
      )}

      {pedido.notas_admin && (
        <div className="mt-1 text-xs italic text-amber-700">
          {pedido.notas_admin}
        </div>
      )}

      {lineas.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--color-ink-2)]">
          {lineas.map(l => (
            <li key={l.id}>
              <span className="font-medium">{formatN(Number(l.cantidad))} {UNIDAD_LABEL[l.unidad]}</span>
              {' · '}
              <span>{l.producto_normalizado}</span>
              {l.subseccion && <span className="text-[var(--color-ink-3)]"> ({l.subseccion})</span>}
              {l.es_gratis && <span className="text-emerald-700"> · GRATIS</span>}
              {l.notas && <span className="italic text-[var(--color-ink-3)]"> — {l.notas}</span>}
            </li>
          ))}
        </ul>
      )}

      {pedido.faltas && (
        <div className="mt-1 text-xs text-rose-700">
          <strong>Faltas:</strong> {pedido.faltas}
        </div>
      )}
    </li>
  )
}

function ordenSalida(s: string | null | undefined): number {
  if (s === 'PRIMERA' || s == null) return 0
  if (s === 'SEGUNDA') return 1
  return 2
}

function formatN(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
