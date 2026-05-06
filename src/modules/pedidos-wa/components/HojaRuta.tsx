import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  MoreVertical,
  Package,
  RotateCcw,
  Truck,
  Undo2,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../lib/types'
import { exportarHojaRuta } from '../lib/exportacion/excel'
import { usePedidosDelDia, useReasignarPedido } from '../lib/queries'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

// Paletas por repartidor: header saturado + fondo de columna sutil + acentos.
const PALETA: Record<Repartidor, {
  bgCol: string
  border: string
  headerBg: string
  headerText: string
  dot: string
}> = {
  TORRES: {
    bgCol:      'bg-blue-50/50 dark:bg-blue-950/20',
    border:     'border-blue-200 dark:border-blue-900/60',
    headerBg:   'bg-blue-500',
    headerText: 'text-white',
    dot:        'bg-blue-500',
  },
  GERMAN: {
    bgCol:      'bg-emerald-50/50 dark:bg-emerald-950/20',
    border:     'border-emerald-200 dark:border-emerald-900/60',
    headerBg:   'bg-emerald-500',
    headerText: 'text-white',
    dot:        'bg-emerald-500',
  },
  RAUL: {
    bgCol:      'bg-orange-50/50 dark:bg-orange-950/20',
    border:     'border-orange-200 dark:border-orange-900/60',
    headerBg:   'bg-orange-500',
    headerText: 'text-white',
    dot:        'bg-orange-500',
  },
  ALEX: {
    bgCol:      'bg-violet-50/50 dark:bg-violet-950/20',
    border:     'border-violet-200 dark:border-violet-900/60',
    headerBg:   'bg-violet-500',
    headerText: 'text-white',
    dot:        'bg-violet-500',
  },
}

export function HojaRuta() {
  const fechaIso = format(new Date(), 'yyyy-MM-dd')
  const titulo = format(new Date(), "EEEE d 'de' MMMM", { locale: es })
  const { data: pedidos, isLoading, error } = usePedidosDelDia(fechaIso)

  const [colapsadas, setColapsadas] = useState<Record<Repartidor, boolean>>({
    TORRES: false, GERMAN: false, RAUL: false, ALEX: false,
  })

  const grupos = useMemo(() => {
    const map = new Map<Repartidor, Pedido[]>()
    for (const r of REPARTIDOR_ORDER) map.set(r, [])
    for (const p of pedidos ?? []) {
      const r = (p.override_repartidor ?? p.cliente?.repartidor) as Repartidor | undefined
      if (!r) continue
      map.get(r)!.push(p)
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const sa = ordenSalida(a.override_salida ?? a.cliente?.salida)
        const sb = ordenSalida(b.override_salida ?? b.cliente?.salida)
        if (sa !== sb) return sa - sb
        const ha = a.override_horario ?? a.cliente?.horario ?? ''
        const hb = b.override_horario ?? b.cliente?.horario ?? ''
        return ha.localeCompare(hb)
      })
    }
    return REPARTIDOR_ORDER.map(r => ({ repartidor: r, pedidos: map.get(r)! }))
  }, [pedidos])

  const total = (pedidos ?? []).length
  const repartidoresActivos = grupos.filter(g => g.pedidos.length > 0).length

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)] capitalize">
            Hoja de ruta · {titulo}
          </h2>
          <p className="text-xs text-[var(--color-ink-3)]">
            {total} {total === 1 ? 'pedido' : 'pedidos'} · {repartidoresActivos} {repartidoresActivos === 1 ? 'repartidor activo' : 'repartidores activos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setColapsadas({ TORRES: false, GERMAN: false, RAUL: false, ALEX: false })}
            className="text-xs"
          >
            <ChevronDown className="h-3.5 w-3.5" /> Expandir todo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setColapsadas({ TORRES: true, GERMAN: true, RAUL: true, ALEX: true })}
            className="text-xs"
          >
            <ChevronUp className="h-3.5 w-3.5" /> Plegar todo
          </Button>
          <Button size="sm" variant="secondary" onClick={onExport} disabled={total === 0}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          No hay pedidos para hoy todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {grupos.map(g => (
            <ColumnaRepartidor
              key={g.repartidor}
              repartidor={g.repartidor}
              pedidos={g.pedidos}
              colapsada={colapsadas[g.repartidor]}
              onToggle={() => setColapsadas(c => ({ ...c, [g.repartidor]: !c[g.repartidor] }))}
              fecha={fechaIso}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ColumnaRepartidor({
  repartidor, pedidos, colapsada, onToggle, fecha,
}: {
  repartidor: Repartidor
  pedidos: Pedido[]
  colapsada: boolean
  onToggle: () => void
  fecha: string
}) {
  const p = PALETA[repartidor]
  const totalLineas = useMemo(
    () => pedidos.reduce((acc, x) => acc + (x.lineas?.length ?? 0), 0),
    [pedidos],
  )

  return (
    <section className={cn(
      'flex flex-col overflow-hidden rounded-[var(--radius-lg)] border',
      p.border, p.bgCol,
    )}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-90',
          p.headerBg, p.headerText,
        )}
        aria-expanded={!colapsada}
      >
        <div className="inline-flex items-center gap-2">
          <Truck className="h-4 w-4" />
          <span>{REPARTIDOR_LABEL[repartidor]}</span>
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-medium opacity-90">
          <span className="rounded-full bg-white/25 px-2 py-0.5 tabular-nums">
            {pedidos.length} {pedidos.length === 1 ? 'parada' : 'paradas'}
          </span>
          {totalLineas > 0 && (
            <span className="hidden tabular-nums sm:inline">· {totalLineas} líneas</span>
          )}
          {colapsada ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </button>

      {!colapsada && (
        <div className="space-y-2 p-2">
          {pedidos.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-ink-3)]">
              Sin pedidos para {REPARTIDOR_LABEL[repartidor]}.
            </div>
          ) : (
            renderConSeparadores(pedidos, repartidor, fecha)
          )}
        </div>
      )}
    </section>
  )
}

function renderConSeparadores(pedidos: Pedido[], repartidor: Repartidor, fecha: string) {
  const out: React.ReactNode[] = []
  let prevSalida: string | null | undefined

  for (const p of pedidos) {
    const salida = p.override_salida ?? p.cliente?.salida ?? null
    if (
      (repartidor === 'GERMAN' || repartidor === 'RAUL') &&
      salida === 'SEGUNDA' &&
      prevSalida !== 'SEGUNDA'
    ) {
      out.push(
        <div
          key={`sep-${p.id}`}
          className="flex items-center gap-2 px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]"
        >
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          2ª salida
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>,
      )
    }
    out.push(<TarjetaPedido key={p.id} pedido={p} fecha={fecha} />)
    prevSalida = salida
  }
  return out
}

function TarjetaPedido({ pedido, fecha }: { pedido: Pedido; fecha: string }) {
  const cliente = pedido.cliente
  const lineas = pedido.lineas ?? []
  const reasignar = useReasignarPedido()

  const repActual: Repartidor = (pedido.override_repartidor ?? cliente?.repartidor ?? 'TORRES') as Repartidor
  const horarioActual = pedido.override_horario ?? cliente?.horario ?? ''
  const salidaActual = pedido.override_salida ?? cliente?.salida ?? null
  const movido = pedido.override_repartidor && pedido.override_repartidor !== cliente?.repartidor

  const [horarioEdit, setHorarioEdit] = useState(horarioActual)
  useEffect(() => { setHorarioEdit(horarioActual) }, [horarioActual])

  const guardarHorario = () => {
    const nuevo = horarioEdit.trim()
    if (nuevo === (cliente?.horario ?? '')) {
      // Igual al del cliente → reset override.
      if (pedido.override_horario !== null) {
        reasignar.mutate(
          { id: pedido.id, fecha, patch: { override_horario: null } },
          { onSuccess: () => toast({ title: 'Horario restaurado', variant: 'success' }) },
        )
      }
      return
    }
    if (nuevo === (pedido.override_horario ?? '')) return
    reasignar.mutate(
      { id: pedido.id, fecha, patch: { override_horario: nuevo || null } },
      {
        onSuccess: () => toast({ title: 'Horario actualizado', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const moverA = (r: Repartidor) => {
    const patch =
      r === cliente?.repartidor
        ? { override_repartidor: null, override_salida: null }
        : { override_repartidor: r }
    reasignar.mutate(
      { id: pedido.id, fecha, patch },
      {
        onSuccess: () => toast({
          title: r === cliente?.repartidor
            ? `Vuelve a ${REPARTIDOR_LABEL[r]}`
            : `Movido a ${REPARTIDOR_LABEL[r]}`,
          variant: 'success',
        }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const cambiarSalida = (s: 'PRIMERA' | 'SEGUNDA' | null) => {
    const patch = s === (cliente?.salida ?? null)
      ? { override_salida: null }
      : { override_salida: s }
    reasignar.mutate(
      { id: pedido.id, fecha, patch },
      {
        onSuccess: () => toast({ title: 'Salida actualizada', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const resetOverrides = () => {
    if (!pedido.override_repartidor && !pedido.override_horario && !pedido.override_salida) return
    reasignar.mutate(
      {
        id: pedido.id,
        fecha,
        patch: {
          override_repartidor: null,
          override_horario:    null,
          override_salida:     null,
        },
      },
      {
        onSuccess: () => toast({ title: 'Volcado al cliente original', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <article className={cn(
      'group rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-3 shadow-sm transition-shadow hover:shadow-md',
      movido ? 'border-amber-300 ring-1 ring-amber-200' : 'border-[var(--color-border)]',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={horarioEdit}
              onChange={(e) => setHorarioEdit(e.target.value)}
              onBlur={guardarHorario}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="—:—"
              inputMode="numeric"
              className={cn(
                'w-14 shrink-0 rounded-md border bg-transparent px-1.5 py-0.5 text-xs font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
                pedido.override_horario
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-[var(--color-border)] text-[var(--color-ink)]',
              )}
              title="Editar horario solo para hoy"
            />
            <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-ink)]">
              {cliente?.nombre ?? '—'}
            </h3>
            <MenuPedido
              repActual={repActual}
              repCliente={cliente?.repartidor}
              salidaActual={salidaActual}
              salidaCliente={cliente?.salida ?? null}
              tieneOverride={!!(pedido.override_repartidor || pedido.override_horario || pedido.override_salida)}
              onMover={moverA}
              onCambiarSalida={cambiarSalida}
              onReset={resetOverrides}
              pending={reasignar.isPending}
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-ink-3)]">
            {cliente?.subseccion_default && (
              <span>sub: <strong>{cliente.subseccion_default}</strong></span>
            )}
            {salidaActual && (repActual === 'GERMAN' || repActual === 'RAUL') && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                pedido.override_salida ? 'bg-amber-100 text-amber-800' : 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
              )}>
                {salidaActual === 'PRIMERA' ? '1ª' : '2ª'}
              </span>
            )}
            {cliente?.tipo_factura && cliente.tipo_factura !== 'HOLDED' && (
              <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase">
                {cliente.tipo_factura}
              </span>
            )}
            {lineas.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Package className="h-3 w-3" />
                {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
              </span>
            )}
            {movido && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                <Undo2 className="h-2.5 w-2.5" /> movido (era {REPARTIDOR_LABEL[cliente?.repartidor ?? 'TORRES']})
              </span>
            )}
          </div>

          {cliente?.notas && (
            <div className="mt-1.5 inline-flex items-start gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{cliente.notas}</span>
            </div>
          )}

          {pedido.notas_admin && (
            <div className="mt-1 text-[11px] italic text-amber-700">
              {pedido.notas_admin}
            </div>
          )}

          {lineas.length > 0 && (
            <details className="mt-1.5 group/lineas">
              <summary className="cursor-pointer list-none text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]">
                <span className="inline-flex items-center gap-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-open/lineas:rotate-180" />
                  Ver líneas
                </span>
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-[11px] text-[var(--color-ink-2)]">
                {lineas.map(l => (
                  <li key={l.id}>
                    <span className="font-semibold tabular-nums">{formatN(Number(l.cantidad))} {UNIDAD_LABEL[l.unidad]}</span>
                    {' · '}
                    <span>{l.producto_normalizado}</span>
                    {l.subseccion && <span className="text-[var(--color-ink-3)]"> ({l.subseccion})</span>}
                    {l.es_gratis && <span className="text-emerald-700"> · GRATIS</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {pedido.faltas && (
            <div className="mt-1 text-[11px] text-rose-700">
              <strong>Faltas:</strong> {pedido.faltas}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function MenuPedido({
  repActual, repCliente, salidaActual, salidaCliente,
  tieneOverride, onMover, onCambiarSalida, onReset, pending,
}: {
  repActual: Repartidor
  repCliente: Repartidor | undefined
  salidaActual: 'PRIMERA' | 'SEGUNDA' | null
  salidaCliente: 'PRIMERA' | 'SEGUNDA' | null
  tieneOverride: boolean
  onMover: (r: Repartidor) => void
  onCambiarSalida: (s: 'PRIMERA' | 'SEGUNDA' | null) => void
  onReset: () => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const muestraSalida = repActual === 'GERMAN' || repActual === 'RAUL'

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className={cn(
          'rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:opacity-50',
          open && 'bg-[var(--color-surface-2)] text-[var(--color-ink)]',
        )}
        aria-label="Acciones del pedido"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-52 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          <div className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
            Mover a
          </div>
          <ul className="py-1">
            {REPARTIDOR_ORDER.map(r => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => { onMover(r); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]',
                    repActual === r && 'font-bold text-[var(--color-ink)]',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', PALETA[r].dot)} />
                  {REPARTIDOR_LABEL[r]}
                  {repActual === r && <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">actual</span>}
                  {repCliente === r && repActual !== r && (
                    <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">cliente</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {muestraSalida && (
            <>
              <div className="border-t border-[var(--color-border)] px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
                Salida
              </div>
              <ul className="py-1">
                {(['PRIMERA', 'SEGUNDA'] as const).map(s => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => { onCambiarSalida(s); setOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]',
                        salidaActual === s && 'font-bold text-[var(--color-ink)]',
                      )}
                    >
                      {s === 'PRIMERA' ? '1ª salida' : '2ª salida'}
                      {salidaActual === s && <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">actual</span>}
                      {salidaCliente === s && salidaActual !== s && (
                        <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">cliente</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {tieneOverride && (
            <div className="border-t border-[var(--color-border)] py-1">
              <button
                type="button"
                onClick={() => { onReset(); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
              >
                <RotateCcw className="h-3 w-3" /> Volver al cliente original
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
