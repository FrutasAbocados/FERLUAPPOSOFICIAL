import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  Loader2,
  MoreVertical,
  Package,
  Printer,
  RotateCcw,
  Truck,
  Undo2,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { cn, getBusinessDate } from '@/shared/lib/utils'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type Pedido,
  type Repartidor,
} from '../lib/types'
import { exportarHojaRuta } from '../lib/exportacion/excel'
import { imprimirHojaRuta } from '../lib/exportacion/print'
import { useActualizarPedido, usePedidosDelDia, useReasignarPedido, useReordenarRuta } from '../lib/queries'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

// Paletas por repartidor: header saturado + fondo de columna sutil + acentos.
const PALETA: Record<Repartidor, {
  hue: string
  bgCol: string
  border: string
  headerBg: string
  headerText: string
  dot: string
}> = {
  TORRES: {
    hue:        '235',
    bgCol:      'bg-[oklch(24%_.08_235_/_0.18)]',
    border:     'border-[oklch(76%_.12_235_/_0.22)]',
    headerBg:   'bg-[linear-gradient(90deg,oklch(28%_.12_235_/_0.55),oklch(20%_.08_235_/_0.15))]',
    headerText: 'text-[var(--sky)]',
    dot:        'bg-[var(--sky)]',
  },
  GERMAN: {
    hue:        '158',
    bgCol:      'bg-[oklch(24%_.08_158_/_0.18)]',
    border:     'border-[var(--mint-glow)]',
    headerBg:   'bg-[linear-gradient(90deg,oklch(28%_.12_158_/_0.55),oklch(20%_.08_158_/_0.15))]',
    headerText: 'text-[var(--mint)]',
    dot:        'bg-[var(--mint)]',
  },
  RAUL: {
    hue:        '25',
    bgCol:      'bg-[oklch(24%_.08_25_/_0.18)]',
    border:     'border-[oklch(70%_.18_25_/_0.22)]',
    headerBg:   'bg-[linear-gradient(90deg,oklch(28%_.12_25_/_0.55),oklch(20%_.08_25_/_0.15))]',
    headerText: 'text-[var(--coral)]',
    dot:        'bg-[var(--coral)]',
  },
  ALEX: {
    hue:        '295',
    bgCol:      'bg-[oklch(24%_.08_295_/_0.18)]',
    border:     'border-[oklch(72%_.16_295_/_0.22)]',
    headerBg:   'bg-[linear-gradient(90deg,oklch(28%_.12_295_/_0.55),oklch(20%_.08_295_/_0.15))]',
    headerText: 'text-[var(--violet)]',
    dot:        'bg-[var(--violet)]',
  },
}

export function HojaRuta() {
  const fechaIso = format(getBusinessDate(), 'yyyy-MM-dd')
  const titulo = format(getBusinessDate(), "EEEE d 'de' MMMM", { locale: es })
  const { data: pedidos, isLoading, error } = usePedidosDelDia(fechaIso)
  const [vista, setVista] = useState<'tabla' | 'tarjetas'>('tabla')

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
        // Si alguno tiene orden manual: los ordenados delante por su valor;
        // los que no tienen, detrás, ordenados por salida+horario.
        const oa = a.override_orden
        const ob = b.override_orden
        if (oa != null && ob != null) return oa - ob
        if (oa != null) return -1
        if (ob != null) return 1
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

  const reasignar = useReasignarPedido()
  const reordenar = useReordenarRuta()

  // Mapa rápido id → repartidor actual (según override_repartidor o cliente)
  const repartidorPorId = useMemo(() => {
    const m = new Map<string, Repartidor>()
    for (const g of grupos) for (const p of g.pedidos) m.set(p.id, g.repartidor)
    return m
  }, [grupos])

  const idsPorRepartidor = useMemo(() => {
    const m = new Map<Repartidor, string[]>()
    for (const g of grupos) m.set(g.repartidor, g.pedidos.map(p => p.id))
    return m
  }, [grupos])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const repOrigen = repartidorPorId.get(activeId)
    if (!repOrigen) return

    // overId puede ser otro pedido o "col:REPARTIDOR" (drop sobre columna vacía)
    let repDestino: Repartidor | undefined
    if (overId.startsWith('col:')) {
      repDestino = overId.slice(4) as Repartidor
    } else {
      repDestino = repartidorPorId.get(overId)
    }
    if (!repDestino) return

    const pedido = (pedidos ?? []).find(p => p.id === activeId)
    if (!pedido) return

    if (repOrigen === repDestino) {
      // Reordenar dentro de la misma columna
      const ids = idsPorRepartidor.get(repDestino) ?? []
      const from = ids.indexOf(activeId)
      const to = overId.startsWith('col:') ? ids.length - 1 : ids.indexOf(overId)
      if (from < 0 || to < 0 || from === to) return
      const next = arrayMove(ids, from, to)
      reordenar.mutate(
        { fecha: fechaIso, repartidor: repDestino, ids: next },
        { onError: (err: Error) => toast({ title: 'Error reordenando', description: err.message, variant: 'error' }) },
      )
      return
    }

    // Cambio de columna: cambiar override_repartidor + colocar en posición destino
    const idsDest = idsPorRepartidor.get(repDestino) ?? []
    const insertAt = overId.startsWith('col:') ? idsDest.length : idsDest.indexOf(overId)
    const nextDest = [...idsDest]
    nextDest.splice(Math.max(0, insertAt), 0, activeId)
    const idsOrig = (idsPorRepartidor.get(repOrigen) ?? []).filter(id => id !== activeId)

    const nuevoOverride: Repartidor | null =
      repDestino === pedido.cliente?.repartidor ? null : repDestino

    // 1) Reasignar repartidor + reset salida si vuelve al original; 2) reordenar destino; 3) reordenar origen
    reasignar.mutate(
      {
        id: activeId,
        fecha: fechaIso,
        patch: nuevoOverride === null
          ? { override_repartidor: null, override_salida: null }
          : { override_repartidor: nuevoOverride },
      },
      {
        onSuccess: () => {
          reordenar.mutate({ fecha: fechaIso, repartidor: repDestino, ids: nextDest })
          if (idsOrig.length > 0) {
            reordenar.mutate({ fecha: fechaIso, repartidor: repOrigen, ids: idsOrig })
          }
        },
        onError: (err: Error) => toast({ title: 'Error moviendo', description: err.message, variant: 'error' }),
      },
    )
  }

  const onExport = async () => {
    if (total === 0) {
      toast({ title: 'Sin pedidos', description: 'Aún no hay pedidos para exportar.', variant: 'error' })
      return
    }
    try {
      await exportarHojaRuta(pedidos ?? [], fechaIso)
      toast({ title: 'Excel descargado', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error exportando', description: (e as Error).message, variant: 'error' })
    }
  }

  const onPrint = () => {
    if (total === 0) {
      toast({ title: 'Sin pedidos', description: 'Aún no hay pedidos para imprimir.', variant: 'error' })
      return
    }
    imprimirHojaRuta(pedidos ?? [], fechaIso)
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
      <div className="rounded-[var(--radius-lg)] border border-[oklch(70%_.18_25_/_0.28)] bg-[oklch(30%_.12_25_/_0.18)] p-4 text-sm text-[var(--coral)]">
        Error: {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)] capitalize">
            Hoja de ruta · {titulo}
          </h2>
          <p className="mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {total} {total === 1 ? 'pedido' : 'pedidos'} · {repartidoresActivos} {repartidoresActivos === 1 ? 'repartidor activo' : 'repartidores activos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-0.5">
            <Button size="sm" variant={vista === 'tabla' ? 'secondary' : 'ghost'} onClick={() => setVista('tabla')} className="h-8 text-xs">
              Montaje
            </Button>
            <Button size="sm" variant={vista === 'tarjetas' ? 'secondary' : 'ghost'} onClick={() => setVista('tarjetas')} className="h-8 text-xs">
              Tarjetas
            </Button>
          </div>
          {vista === 'tarjetas' && (
            <>
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
            </>
          )}
          <Button size="sm" variant="secondary" onClick={onPrint} disabled={total === 0}>
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
          <Button size="sm" variant="secondary" onClick={onExport} disabled={total === 0}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <div className="ao-card border-dashed p-8 text-center text-sm text-[var(--ink-mute)]">
          No hay pedidos para hoy todavía.
        </div>
      ) : (
        vista === 'tabla' ? (
          <HojaRutaTabla grupos={grupos} fecha={fechaIso} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
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
          </DndContext>
        )
      )}
    </div>
  )
}

function HojaRutaTabla({
  grupos,
  fecha,
}: {
  grupos: Array<{ repartidor: Repartidor; pedidos: Pedido[] }>
  fecha: string
}) {
  const sections = useMemo(() => {
    const out: Array<{ key: string; label: string; repartidor: Repartidor; pedidos: Pedido[] }> = []
    for (const g of grupos) {
      if (g.pedidos.length === 0) continue
      const primera = g.pedidos.filter((p) => (p.override_salida ?? p.cliente?.salida ?? 'PRIMERA') !== 'SEGUNDA')
      const segunda = g.pedidos.filter((p) => (p.override_salida ?? p.cliente?.salida ?? null) === 'SEGUNDA')
      if (primera.length > 0) {
        out.push({
          key: `${g.repartidor}-primera`,
          label: `Salida del campo · ${REPARTIDOR_LABEL[g.repartidor]}`,
          repartidor: g.repartidor,
          pedidos: primera,
        })
      }
      if (segunda.length > 0) {
        out.push({
          key: `${g.repartidor}-segunda`,
          label: `Segunda salida · ${REPARTIDOR_LABEL[g.repartidor]}`,
          repartidor: g.repartidor,
          pedidos: segunda,
        })
      }
    }
    return out
  }, [grupos])

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <table className="min-w-[1220px] w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--brand-green,#1d4e2a)] text-white">
            <th className="w-[170px] border border-black/40 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide">Cliente</th>
            <th className="w-[92px] border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Horario</th>
            <th className="w-[94px] border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Factura</th>
            <th className="border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Pedido</th>
            <th className="w-[300px] border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Faltas</th>
            <th className="w-[130px] border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Vehículo</th>
            <th className="w-[130px] border border-black/40 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide">Reparto</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <TableSection key={s.key} section={s} fecha={fecha} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableSection({
  section,
  fecha,
}: {
  section: { label: string; repartidor: Repartidor; pedidos: Pedido[] }
  fecha: string
}) {
  const storageKey = `abocados:hoja-ruta:vehiculo:${fecha}:${section.repartidor}`
  const [vehiculo, setVehiculo] = useState('')

  useEffect(() => {
    setVehiculo(window.localStorage.getItem(storageKey) ?? '')
  }, [storageKey])

  const guardarVehiculo = (valor: string) => {
    setVehiculo(valor)
    if (valor.trim()) {
      window.localStorage.setItem(storageKey, valor)
    } else {
      window.localStorage.removeItem(storageKey)
    }
  }

  return (
    <>
      <tr>
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5" />
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5" />
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5" />
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5 text-center font-display text-lg font-bold text-black dark:text-[var(--color-ink)]">
          {section.label}
        </td>
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5" />
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5 text-center">
          <input
            value={vehiculo}
            onChange={(e) => guardarVehiculo(e.target.value)}
            className="w-full rounded border border-black/20 bg-white/80 px-2 py-1 text-center font-display text-sm font-bold uppercase text-black outline-none focus:border-[var(--mint)] dark:bg-black/20 dark:text-[var(--color-ink)]"
            placeholder="Vehículo"
          />
        </td>
        <td className="border border-black/50 bg-[var(--color-surface-3,#a3a3a3)] px-2 py-1.5" />
      </tr>
      {section.pedidos.map((pedido) => (
        <HojaRutaTableRow key={pedido.id} pedido={pedido} fecha={fecha} repartidor={section.repartidor} />
      ))}
    </>
  )
}

function HojaRutaTableRow({
  pedido,
  fecha,
  repartidor,
}: {
  pedido: Pedido
  fecha: string
  repartidor: Repartidor
}) {
  const cliente = pedido.cliente
  const horarioActual = pedido.override_horario ?? cliente?.horario ?? ''
  const [horarioEdit, setHorarioEdit] = useState(horarioActual)
  const [faltasEdit, setFaltasEdit] = useState(pedido.faltas ?? '')
  const reasignar = useReasignarPedido()
  const actualizarPedido = useActualizarPedido()

  useEffect(() => { setHorarioEdit(horarioActual) }, [horarioActual])
  useEffect(() => { setFaltasEdit(pedido.faltas ?? '') }, [pedido.faltas])

  const guardarHorario = () => {
    const raw = horarioEdit.trim()
    const normalizado = raw ? normalizarHorario(raw) : ''
    if (raw && normalizado === null) {
      toast({ title: 'Horario inválido', description: 'Usa HH:MM, por ejemplo 08:30.', variant: 'error' })
      setHorarioEdit(horarioActual)
      return
    }
    const valor = normalizado || ''
    if (valor === (cliente?.horario ?? '')) {
      if (pedido.override_horario !== null) {
        reasignar.mutate({ id: pedido.id, fecha, patch: { override_horario: null } })
      } else {
        setHorarioEdit(valor)
      }
      return
    }
    if (valor === (pedido.override_horario ?? '')) return
    reasignar.mutate(
      { id: pedido.id, fecha, patch: { override_horario: valor || null } },
      { onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }) },
    )
  }

  const guardarFaltas = () => {
    const valor = faltasEdit.trim() || null
    if (valor === (pedido.faltas ?? null)) return
    actualizarPedido.mutate(
      { id: pedido.id, fecha, patch: { faltas: valor } },
      { onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }) },
    )
  }

  return (
    <tr className="align-middle odd:bg-[var(--surface)] even:bg-[var(--surface-2)]">
      <td className="border border-black/50 px-2 py-2 text-center font-display text-base font-bold uppercase text-[var(--ink)]">
        {cliente?.nombre ?? '—'}
        {cliente?.notas && (
          <div className="mt-1 text-[10px] font-semibold normal-case text-[var(--coral)]">{cliente.notas}</div>
        )}
      </td>
      <td className="border border-black/50 px-2 py-2 text-center">
        <input
          value={horarioEdit}
          onChange={(e) => setHorarioEdit(e.target.value)}
          onBlur={guardarHorario}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-center font-display text-base font-bold tabular-nums text-[var(--ink)] focus:border-[var(--mint)] focus:outline-none"
          placeholder="—:—"
          inputMode="numeric"
        />
      </td>
      <td className="border border-black/50 px-2 py-2 text-center font-display text-base font-bold text-[var(--ink)]">
        {cliente?.tipo_factura ?? ''}
      </td>
      <td className="border border-black/50 px-2 py-2 text-center text-[15px] font-semibold leading-snug text-[var(--ink)]">
        {resumenPedidoPlano(pedido)}
      </td>
      <td className="border border-black/50 px-2 py-2">
        <textarea
          value={faltasEdit}
          onChange={(e) => setFaltasEdit(e.target.value)}
          onBlur={guardarFaltas}
          rows={2}
          className="min-h-[42px] w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-center text-sm leading-snug text-[var(--ink)] focus:border-[var(--mint)] focus:outline-none"
          placeholder="Faltas…"
        />
      </td>
      <td className="border border-black/50 px-2 py-2 text-center font-display text-base font-bold uppercase leading-tight text-[var(--ink)]">
        {REPARTIDOR_LABEL[repartidor]}
      </td>
    </tr>
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

  // Drop target para que se pueda soltar también en columna vacía o al final
  const { setNodeRef, isOver } = useDroppable({ id: `col:${repartidor}` })

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex flex-col overflow-hidden rounded-[var(--radius-lg)] border transition-colors',
        p.border, p.bgCol,
        isOver && 'ring-2 ring-[var(--mint)]',
      )}
    >
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
          <span className="rounded-full border border-current/20 bg-[rgba(255,255,255,.05)] px-2 py-0.5 tabular-nums">
            {pedidos.length} {pedidos.length === 1 ? 'parada' : 'paradas'}
          </span>
          {totalLineas > 0 && (
            <span className="hidden tabular-nums sm:inline">· {totalLineas} líneas</span>
          )}
          {colapsada ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </button>

      {!colapsada && (
        <div className="space-y-2 p-2 min-h-[60px]">
          {pedidos.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--line)] bg-[rgba(255,255,255,.02)] p-4 text-center text-xs text-[var(--ink-mute)]">
              Sin pedidos para {REPARTIDOR_LABEL[repartidor]}.
            </div>
          ) : (
            <SortableContext items={pedidos.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {renderConSeparadores(pedidos, repartidor, fecha)}
            </SortableContext>
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
          className="mono flex items-center gap-2 px-1 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]"
        >
          <span className="h-px flex-1 bg-[var(--line)]" />
          2ª salida
          <span className="h-px flex-1 bg-[var(--line)]" />
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
  const ordenManual = pedido.override_orden != null

  const actualizarPedido = useActualizarPedido()

  const [horarioEdit, setHorarioEdit] = useState(horarioActual)
  useEffect(() => { setHorarioEdit(horarioActual) }, [horarioActual])

  const [obsEdit, setObsEdit] = useState(pedido.faltas ?? '')
  useEffect(() => { setObsEdit(pedido.faltas ?? '') }, [pedido.faltas])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pedido.id })
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const guardarObs = () => {
    const valor = obsEdit.trim() || null
    if (valor === (pedido.faltas ?? null)) return
    actualizarPedido.mutate(
      { id: pedido.id, fecha, patch: { faltas: valor } },
      {
        onSuccess: () => toast({ title: 'Observaciones guardadas', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const guardarHorario = () => {
    const raw = horarioEdit.trim()
    const normalizado = raw ? normalizarHorario(raw) : ''
    if (raw && normalizado === null) {
      toast({
        title: 'Horario inválido',
        description: 'Usa formato HH:MM (p. ej. 8:30 o 14:00).',
        variant: 'error',
      })
      setHorarioEdit(horarioActual)
      return
    }
    const valor = normalizado || ''
    if (valor === (cliente?.horario ?? '')) {
      if (pedido.override_horario !== null) {
        reasignar.mutate(
          { id: pedido.id, fecha, patch: { override_horario: null } },
          { onSuccess: () => toast({ title: 'Horario restaurado', variant: 'success' }) },
        )
      } else {
        setHorarioEdit(valor)
      }
      return
    }
    if (valor === (pedido.override_horario ?? '')) {
      setHorarioEdit(valor)
      return
    }
    reasignar.mutate(
      { id: pedido.id, fecha, patch: { override_horario: valor || null } },
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
    if (!pedido.override_repartidor && !pedido.override_horario && !pedido.override_salida && pedido.override_orden == null) return
    reasignar.mutate(
      {
        id: pedido.id,
        fecha,
        patch: {
          override_repartidor: null,
          override_horario:    null,
          override_salida:     null,
          override_orden:      null,
        },
      },
      {
        onSuccess: () => toast({ title: 'Volcado al cliente original', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        'ao-panel group rounded-[var(--radius-md)] border p-3 transition-colors',
        movido ? 'border-[oklch(78%_.16_70_/_0.35)] ring-1 ring-[oklch(78%_.16_70_/_0.22)]' : 'border-[var(--line)]',
        isDragging && 'ring-2 ring-[var(--mint)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastrar para reordenar"
          className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-ink)] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
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
                  ? 'border-[oklch(78%_.16_70_/_0.35)] bg-[oklch(30%_.10_70_/_0.18)] text-[var(--amber)]'
                  : 'border-[var(--line)] text-[var(--ink)]',
              )}
              title="Editar horario solo para hoy"
            />
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
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

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ink-mute)]">
            {cliente?.subseccion_default && (
              <span>sub: <strong>{cliente.subseccion_default}</strong></span>
            )}
            {salidaActual && (repActual === 'GERMAN' || repActual === 'RAUL') && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                pedido.override_salida ? 'bg-[oklch(30%_.10_70_/_0.25)] text-[var(--amber)]' : 'bg-[rgba(255,255,255,.04)] text-[var(--ink-dim)]',
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
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[oklch(30%_.10_70_/_0.25)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--amber)]">
                <Undo2 className="h-2.5 w-2.5" /> movido (era {REPARTIDOR_LABEL[cliente?.repartidor ?? 'TORRES']})
              </span>
            )}
            {ordenManual && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--mint-glow)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--mint)]">
                #{pedido.override_orden}
              </span>
            )}
          </div>

          {cliente?.notas && (
            <div className="mt-1.5 inline-flex items-start gap-1 rounded-md bg-[oklch(30%_.12_25_/_0.18)] px-1.5 py-0.5 text-[11px] text-[var(--coral)]">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{cliente.notas}</span>
            </div>
          )}

          {pedido.notas_admin && (
            <div className="mt-1 text-[11px] italic text-[var(--amber)]">
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
                    {l.subseccion && <span className="text-[var(--ink-mute)]"> ({l.subseccion})</span>}
                    {l.es_gratis && <span className="text-[var(--mint)]"> · GRATIS</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <input
            type="text"
            value={obsEdit}
            onChange={(e) => setObsEdit(e.target.value)}
            onBlur={guardarObs}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Observaciones…"
            className={cn(
              'mt-1.5 w-full rounded-md border bg-transparent px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
              obsEdit
                ? 'border-[oklch(78%_.16_70_/_0.35)] bg-[oklch(30%_.10_70_/_0.18)] text-[var(--amber)]'
                : 'border-[var(--line)] text-[var(--ink-mute)]',
            )}
            title="Observaciones del pedido (solo hoy)"
          />
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
        <div className="ao-card absolute right-0 top-7 z-20 w-52 overflow-hidden p-0">
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

function formatN(n: number | null | undefined): string {
  if (n == null) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function resumenPedidoPlano(p: Pedido): string {
  const partes: string[] = []
  if (p.notas_admin) partes.push(p.notas_admin)
  for (const l of p.lineas ?? []) {
    const qty = formatN(Number(l.cantidad))
    const unit = UNIDAD_LABEL[l.unidad]
    const nota = l.notas ? ` (${l.notas})` : ''
    const gratis = l.es_gratis ? ' GRATIS' : ''
    const sec = l.subseccion ? `${l.subseccion}: ` : ''
    partes.push(`${sec}${qty} ${unit} ${l.producto_normalizado}${nota}${gratis}`)
  }
  return partes.join(' / ')
}

// Acepta '8', '8:30', '08:30', '8.30', '0830', '830' → 'HH:MM'. null si no parsea.
function normalizarHorario(raw: string): string | null {
  const s = raw.replace(/\s+/g, '')
  // HH:MM o H:MM con separador : o .
  let m = s.match(/^(\d{1,2})[:.h](\d{1,2})$/)
  if (!m) {
    // Solo dígitos: HHMM, HMM, HH, H
    m = s.match(/^(\d{1,2})(\d{2})$/) ?? s.match(/^(\d{1,2})$/)
    if (!m) return null
    if (!m[2]) return formatHora(parseInt(m[1], 10), 0)
  }
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return formatHora(h, mi)
}

function formatHora(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
