import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays, startOfYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { useClientes, useMovimientos, useDeleteMovimiento } from '../lib/queries'
import { eur, estadoMovimiento, importePendiente } from '../lib/utils'
import type { Estado, Movimiento } from '../lib/types'

type FiltroEstado = 'todos' | Estado | 'Pizarra'
type FiltroTipo = 'todos' | 'Factura' | 'Pizarra'
type FiltroSigno = 'todos' | 'cargos' | 'abonos'
type Preset = 'todo' | 'hoy' | '7d' | '30d' | 'mes' | 'mes_anterior' | '90d' | 'anio' | 'custom'
type SortKey = 'fecha' | 'cliente' | 'importe' | 'pendiente' | 'estado'
type SortDir = 'asc' | 'desc'

const fmtISO = (d: Date) => format(d, 'yyyy-MM-dd')
function rangeForPreset(p: Preset): { from: string | null; to: string | null } {
  const today = new Date()
  switch (p) {
    case 'todo':         return { from: null, to: null }
    case 'hoy':          return { from: fmtISO(today), to: fmtISO(today) }
    case '7d':           return { from: fmtISO(subDays(today, 6)), to: fmtISO(today) }
    case '30d':          return { from: fmtISO(subDays(today, 29)), to: fmtISO(today) }
    case 'mes':          return { from: fmtISO(startOfMonth(today)), to: fmtISO(endOfMonth(today)) }
    case 'mes_anterior': {
      const m = subMonths(today, 1)
      return { from: fmtISO(startOfMonth(m)), to: fmtISO(endOfMonth(m)) }
    }
    case '90d':          return { from: fmtISO(subDays(today, 89)), to: fmtISO(today) }
    case 'anio':         return { from: fmtISO(startOfYear(today)), to: fmtISO(today) }
    default:             return { from: null, to: null }
  }
}

type Props = {
  onCobrar: (movimientoId: string) => void
  onVerCliente: (clienteId: string) => void
}

const fmt = (iso: string) => format(parseISO(iso), 'd LLL yyyy', { locale: es })

const TONO_ESTADO: Record<Estado | 'Pizarra', string> = {
  Cobrado:    'bg-slate-100 text-slate-700',
  Pendiente:  'bg-emerald-100 text-emerald-800',
  Próximo:    'bg-amber-100 text-amber-800',
  Vencido:    'bg-red-100 text-red-700',
  Pizarra:    'bg-purple-100 text-purple-800',
}

export function ListadoFacturas({ onCobrar, onVerCliente }: Props) {
  const movs = useMovimientos()
  const clientes = useClientes()
  const del = useDeleteMovimiento()

  const eliminar = async (m: Movimiento, nombreCliente: string) => {
    const tipo = m.tipo === 'Pizarra' ? 'pizarra' : 'factura'
    const ref = m.numero_factura ? ` Nº ${m.numero_factura}` : ''
    const ok = await confirm({
      title: `¿Eliminar ${tipo}${ref}?`,
      description: `Cliente: ${nombreCliente}. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    del.mutate(m.id, {
      onError: (e) => toast({ title: 'No se pudo eliminar', description: e instanceof Error ? e.message : '', variant: 'error' }),
    })
  }

  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState<FiltroEstado>('todos')
  const [fTipo, setFTipo] = useState<FiltroTipo>('todos')
  const [fSigno, setFSigno] = useState<FiltroSigno>('todos')
  const [preset, setPreset] = useState<Preset>('todo')
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('fecha')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { from: rangoFrom, to: rangoTo } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom || null, to: customTo || null }
    return rangeForPreset(preset)
  }, [preset, customFrom, customTo])

  const nombrePorId = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of clientes.data ?? []) map.set(c.id, c.nombre)
    return map
  }, [clientes.data])

  const estadoEfectivo = (m: Movimiento): Estado | 'Pizarra' => {
    if (m.tipo === 'Pizarra' && !m.pagado) return 'Pizarra'
    return estadoMovimiento(m)
  }

  const filtradas = useMemo(() => {
    const qLower = q.trim().toLowerCase()
    const lista = (movs.data ?? []).filter(m => {
      // tipo
      if (fTipo !== 'todos' && m.tipo !== fTipo) return false
      // signo
      const imp = Number(m.importe)
      if (fSigno === 'cargos' && imp < 0) return false
      if (fSigno === 'abonos' && imp >= 0) return false
      // rango fechas (sobre fecha_factura, ISO comparable lexicográficamente)
      if (rangoFrom && m.fecha_factura < rangoFrom) return false
      if (rangoTo && m.fecha_factura > rangoTo) return false
      // estado
      const est = estadoEfectivo(m)
      if (fEstado !== 'todos' && est !== fEstado) return false
      // buscador
      if (qLower) {
        const cliente = (nombrePorId.get(m.cliente_id) ?? '').toLowerCase()
        const num = (m.numero_factura ?? '').toLowerCase()
        const concepto = (m.concepto ?? '').toLowerCase()
        if (!cliente.includes(qLower) && !num.includes(qLower) && !concepto.includes(qLower)) return false
      }
      return true
    })

    const sorted = lista.slice().sort((a, b) => {
      let va: string | number = 0
      let vb: string | number = 0
      switch (sortKey) {
        case 'fecha':     va = a.fecha_factura; vb = b.fecha_factura; break
        case 'cliente':   va = nombrePorId.get(a.cliente_id) ?? ''; vb = nombrePorId.get(b.cliente_id) ?? ''; break
        case 'importe':   va = Number(a.importe); vb = Number(b.importe); break
        case 'pendiente': va = importePendiente(a); vb = importePendiente(b); break
        case 'estado':    va = estadoEfectivo(a); vb = estadoEfectivo(b); break
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [movs.data, q, fEstado, fTipo, fSigno, rangoFrom, rangoTo, sortKey, sortDir, nombrePorId])

  const totales = useMemo(() => {
    let imp = 0, pend = 0, num = 0
    for (const m of filtradas) {
      imp += Number(m.importe)
      pend += importePendiente(m)
      num++
    }
    return { imp, pend, num }
  }, [filtradas])

  // IDs visibles tras filtrar — usado para "seleccionar todo" y para podar selección
  const idsVisibles = useMemo(() => new Set(filtradas.map(m => m.id)), [filtradas])

  // Si cambian los filtros, descartar selecciones que ya no se ven
  useEffect(() => {
    setSelected(prev => {
      let cambio = false
      const next = new Set<string>()
      for (const id of prev) {
        if (idsVisibles.has(id)) next.add(id)
        else cambio = true
      }
      return cambio ? next : prev
    })
  }, [idsVisibles])

  const seleccion = useMemo(() => {
    let imp = 0, pend = 0, num = 0
    for (const m of filtradas) {
      if (!selected.has(m.id)) continue
      imp += Number(m.importe)
      pend += importePendiente(m)
      num++
    }
    return { imp, pend, num }
  }, [filtradas, selected])

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected = filtradas.length > 0 && filtradas.every(m => selected.has(m.id))
  const someVisibleSelected = filtradas.some(m => selected.has(m.id))

  const toggleAll = () => {
    setSelected(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const id of idsVisibles) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of idsVisibles) next.add(id)
      return next
    })
  }

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  if (movs.isLoading || clientes.isLoading) {
    return <div className="p-6 text-sm text-[var(--color-ink-3)]">Cargando…</div>
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-ink-3)]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nº factura, cliente, concepto…"
              className="h-9 pl-8"
            />
          </div>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
            title="Rango de fechas"
          >
            <option value="todo">📅 Todas las fechas</option>
            <option value="hoy">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="mes">Este mes</option>
            <option value="mes_anterior">Mes anterior</option>
            <option value="90d">Últimos 90 días</option>
            <option value="anio">Este año</option>
            <option value="custom">Personalizado…</option>
          </select>
          <select
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value as FiltroEstado)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="todos">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Próximo">Próximo (≤7d)</option>
            <option value="Vencido">Vencido</option>
            <option value="Pizarra">Pizarra</option>
            <option value="Cobrado">Cobrado</option>
          </select>
          <select
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value as FiltroTipo)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="todos">Tipo: todos</option>
            <option value="Factura">Solo factura</option>
            <option value="Pizarra">Solo pizarra</option>
          </select>
          <select
            value={fSigno}
            onChange={(e) => setFSigno(e.target.value as FiltroSigno)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="todos">Cargos y abonos</option>
            <option value="cargos">Solo cargos</option>
            <option value="abonos">Solo abonos</option>
          </select>
        </div>
        {preset === 'custom' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-[var(--color-ink-3)]">
              Desde
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[150px]"
              />
            </label>
            <label className="flex items-center gap-1 text-[var(--color-ink-3)]">
              Hasta
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[150px]"
              />
            </label>
            {(customFrom || customTo) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setCustomFrom(''); setCustomTo('') }}
                className="h-7 text-xs"
              >
                Limpiar
              </Button>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-ink-3)]">
          <span><strong>{totales.num}</strong> movimiento{totales.num === 1 ? '' : 's'}</span>
          {(rangoFrom || rangoTo) && (
            <span>
              · rango{' '}
              <strong className="tabular-nums text-[var(--color-ink)]">
                {rangoFrom ? format(parseISO(rangoFrom), 'd LLL', { locale: es }) : '—'}
                {' → '}
                {rangoTo ? format(parseISO(rangoTo), 'd LLL yyyy', { locale: es }) : '—'}
              </strong>
            </span>
          )}
          <span>· importe total <strong className="tabular-nums text-[var(--color-ink)]">{eur(totales.imp)}</strong></span>
          <span>· pendiente <strong className={`tabular-nums ${totales.pend < 0 ? 'text-amber-700' : 'text-[var(--color-ink)]'}`}>{eur(totales.pend)}</strong></span>
        </div>
      </div>

      {/* Barra de selección */}
      {seleccion.num > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-3 py-2 text-sm shadow-sm">
          <span className="font-semibold text-[var(--color-primary-2)]">
            {seleccion.num} seleccionada{seleccion.num === 1 ? '' : 's'}
          </span>
          <span className="text-[var(--color-ink-2)]">
            · importe <strong className="tabular-nums text-[var(--color-ink)]">{eur(seleccion.imp)}</strong>
          </span>
          <span className="text-[var(--color-ink-2)]">
            · pendiente <strong className={`tabular-nums ${seleccion.pend < 0 ? 'text-amber-700' : 'text-[var(--color-ink)]'}`}>{eur(seleccion.pend)}</strong>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            className="ml-auto h-7 text-xs"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead className="bg-[var(--color-surface-2,#f8fafc)]">
            <tr className="text-left">
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected }}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas las visibles"
                  className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                />
              </th>
              <Th onClick={() => sortBy('fecha')} active={sortKey === 'fecha'} dir={sortDir}>Fecha</Th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nº</th>
              <Th onClick={() => sortBy('cliente')} active={sortKey === 'cliente'} dir={sortDir}>Cliente</Th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Concepto</th>
              <Th onClick={() => sortBy('importe')} active={sortKey === 'importe'} dir={sortDir} right>Importe</Th>
              <Th onClick={() => sortBy('pendiente')} active={sortKey === 'pendiente'} dir={sortDir} right>Pendiente</Th>
              <Th onClick={() => sortBy('estado')} active={sortKey === 'estado'} dir={sortDir}>Estado</Th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">
                  Sin movimientos que coincidan.
                </td>
              </tr>
            )}
            {filtradas.map(m => {
              const est = estadoEfectivo(m)
              const pend = importePendiente(m)
              const esAbono = Number(m.importe) < 0
              const isSel = selected.has(m.id)
              return (
                <tr
                  key={m.id}
                  className={`border-t border-[var(--color-border)] ${isSel ? 'bg-[var(--color-primary-soft)]/50' : 'hover:bg-[var(--color-surface-2,#f8fafc)]'}`}
                >
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(m.id)}
                      aria-label="Seleccionar fila"
                      className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--color-ink-2)]">{fmt(m.fecha_factura)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-[var(--color-ink)]">
                    {m.numero_factura ?? <span className="text-[var(--color-ink-3)]">—</span>}
                    {esAbono && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">A</span>}
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate">
                    <button onClick={() => onVerCliente(m.cliente_id)} className="text-left text-[var(--color-ink)] hover:underline">
                      {nombrePorId.get(m.cliente_id) ?? '—'}
                    </button>
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate text-[var(--color-ink-3)]">{m.concepto ?? '—'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${Number(m.importe) < 0 ? 'text-amber-700' : 'text-[var(--color-ink)]'}`}>
                    {eur(Number(m.importe))}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${pend === 0 ? 'text-[var(--color-ink-3)]' : pend < 0 ? 'text-amber-700' : 'text-[var(--color-ink)]'}`}>
                    {eur(pend)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONO_ESTADO[est]}`}>{est}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      {!m.pagado && pend !== 0 && (
                        <Button size="sm" variant="outline" onClick={() => onCobrar(m.id)}>
                          {pend < 0 ? 'Saldar abono' : 'Cobrar'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => eliminar(m, nombrePorId.get(m.cliente_id) ?? '—')}
                        disabled={del.isPending}
                        title="Eliminar"
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, onClick, active, dir, right }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)] ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 ${active ? 'text-[var(--color-ink)]' : ''}`}>
        {children}
        {active && <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}
