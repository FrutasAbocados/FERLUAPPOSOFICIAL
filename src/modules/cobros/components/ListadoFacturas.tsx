import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays, startOfYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { useCobrar, useClientes, useMovimientos, useDeleteMovimiento } from '../lib/queries'
import { eur, estadoMovimiento, importePendiente, isoDate } from '../lib/utils'
import { METODOS_COBRO } from '../lib/constants'
import type { Estado, MetodoCobro, Movimiento } from '../lib/types'

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
  Cobrado:    'ao-chip',
  Pendiente:  'ao-chip ao-chip-mint',
  Próximo:    'ao-chip ao-chip-amber',
  Vencido:    'ao-chip ao-chip-coral',
  Pizarra:    'ao-chip ao-chip-sky',
}

export function ListadoFacturas({ onCobrar, onVerCliente }: Props) {
  const movs = useMovimientos()
  const clientes = useClientes()
  const del = useDeleteMovimiento()
  const cobrar = useCobrar()

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

  // Multi-cobro
  const [multiOpen, setMultiOpen] = useState(false)
  const [multiDate, setMultiDate] = useState(isoDate(new Date()))
  const [multiMetodo, setMultiMetodo] = useState<MetodoCobro>('Transferencia')
  const [multiLoading, setMultiLoading] = useState(false)

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

  // IDs visibles tras filtrar — usado para "seleccionar todo".
  const idsVisibles = useMemo(() => new Set(filtradas.map(m => m.id)), [filtradas])

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

  // Solo facturas pendientes de cobro positivas (excluye abonos y ya cobradas)
  const cobrablesSeleccionadas = useMemo(
    () => filtradas.filter((m) => selected.has(m.id) && !m.pagado && importePendiente(m) > 0),
    [filtradas, selected],
  )
  const totalMultiPend = cobrablesSeleccionadas.reduce((s, m) => s + importePendiente(m), 0)

  const cobrarMulti = async () => {
    setMultiLoading(true)
    for (const m of cobrablesSeleccionadas) {
      const pend = importePendiente(m)
      await cobrar.mutateAsync({
        id: m.id,
        fecha_cobro: multiDate,
        importe_cobrado: Number(m.importe_cobrado ?? 0) + pend,
        metodo_cobro: multiMetodo,
        importe_total: Number(m.importe),
      })
    }
    setMultiLoading(false)
    setSelected(new Set())
    setMultiOpen(false)
    toast({ title: `${cobrablesSeleccionadas.length} facturas cobradas`, variant: 'success' })
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
      <div className="ao-panel p-3">
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
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
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
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
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
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
          >
            <option value="todos">Tipo: todos</option>
            <option value="Factura">Solo factura</option>
            <option value="Pizarra">Solo pizarra</option>
          </select>
          <select
            value={fSigno}
            onChange={(e) => setFSigno(e.target.value as FiltroSigno)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
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
          <span>· pendiente <strong className={`mono tabular-nums ${totales.pend < 0 ? 'text-[var(--amber)]' : 'text-[var(--color-ink)]'}`}>{eur(totales.pend)}</strong></span>
        </div>
      </div>

      {/* Barra de selección */}
      {seleccion.num > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-[var(--mint)] bg-[var(--mint-glow)] px-3 py-2 text-sm shadow-sm">
          {!multiOpen ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-[var(--color-primary-2)]">
                {seleccion.num} seleccionada{seleccion.num === 1 ? '' : 's'}
              </span>
              <span className="text-[var(--color-ink-2)]">
                · importe <strong className="tabular-nums text-[var(--color-ink)]">{eur(seleccion.imp)}</strong>
              </span>
              <span className="text-[var(--color-ink-2)]">
                · pendiente <strong className={`mono tabular-nums ${seleccion.pend < 0 ? 'text-[var(--amber)]' : 'text-[var(--color-ink)]'}`}>{eur(seleccion.pend)}</strong>
              </span>
              <div className="ml-auto flex items-center gap-2">
                {cobrablesSeleccionadas.length > 0 && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setMultiOpen(true)}>
                    Cobrar {cobrablesSeleccionadas.length} {cobrablesSeleccionadas.length === 1 ? 'factura' : 'facturas'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 text-xs">
                  <X className="h-3.5 w-3.5" /> Limpiar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Cobrar {cobrablesSeleccionadas.length} {cobrablesSeleccionadas.length === 1 ? 'factura' : 'facturas'}{' '}
                · <span className="mono tabular-nums text-[var(--mint)]">{eur(totalMultiPend)}</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="lf-multi-fecha">Fecha de cobro</Label>
                  <Input
                    id="lf-multi-fecha"
                    type="date"
                    value={multiDate}
                    onChange={(e) => setMultiDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lf-multi-metodo">Método</Label>
                  <select
                    id="lf-multi-metodo"
                    value={multiMetodo}
                    onChange={(e) => setMultiMetodo(e.target.value as MetodoCobro)}
                    className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                  >
                    {METODOS_COBRO.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-ink-3)]">
                Cada factura se marcará cobrada por su importe pendiente completo.
                {seleccion.num !== cobrablesSeleccionadas.length && (
                  <> Las ya cobradas y abonos ({seleccion.num - cobrablesSeleccionadas.length}) se ignorarán.</>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setMultiOpen(false)} disabled={multiLoading}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={cobrarMulti} disabled={multiLoading}>
                  {multiLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Confirmar cobro
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="ao-card overflow-x-auto p-0">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead className="bg-[rgba(255,255,255,.025)]">
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
                  className={`border-t border-[var(--color-border)] ${isSel ? 'bg-[var(--mint-glow)]' : 'hover:bg-[rgba(255,255,255,.025)]'}`}
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
                    {esAbono && <span className="ao-chip ao-chip-amber ml-1 px-1.5 py-0.5 text-[9px]">A</span>}
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate">
                    <button onClick={() => onVerCliente(m.cliente_id)} className="text-left text-[var(--color-ink)] hover:underline">
                      {nombrePorId.get(m.cliente_id) ?? '—'}
                    </button>
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate text-[var(--color-ink-3)]">{m.concepto ?? '—'}</td>
                  <td className={`mono px-3 py-2 text-right tabular-nums font-medium ${Number(m.importe) < 0 ? 'text-[var(--amber)]' : 'text-[var(--color-ink)]'}`}>
                    {eur(Number(m.importe))}
                  </td>
                  <td className={`mono px-3 py-2 text-right tabular-nums ${pend === 0 ? 'text-[var(--color-ink-3)]' : pend < 0 ? 'text-[var(--amber)]' : 'text-[var(--color-ink)]'}`}>
                    {eur(pend)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={TONO_ESTADO[est]}>{est}</span>
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
                        className="text-[var(--coral)] hover:bg-[var(--color-danger-soft)]"
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
