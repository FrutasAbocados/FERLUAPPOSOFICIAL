import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileClock,
  Loader2,
  LockKeyhole,
  LockOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  TestTube2,
  Trash2,
  X,
} from 'lucide-react'
import { FiscalCard } from '@/modules/clientes/components/FiscalCard'
import { Modal } from '@/shared/components/Modal'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  useAnadirLinea,
  useBorradorLineas,
  useCerrarRevisionSombra,
  useEliminarLinea,
  useFacturacionBandeja,
  useGenerarVerifactuXml,
  useGenerarVerifactuSimulacion,
  useGuardarLineas,
  useHoldedLineas,
  useReabrirRevisionSombra,
  useRecalcularBorrador,
  obtenerVerifactuXml,
} from './lib/queries'
import type {
  BorradorLinea,
  BorradorResumen,
  EstadoBorrador,
  LineaEditable,
  TipoDocumentoPrevisto,
} from './lib/types'

type EstadoFiltro = 'todos' | EstadoBorrador
type TipoFiltro = 'todos' | TipoDocumentoPrevisto

const inputClass = 'h-8 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--mint)]'
const selectClass = cn(inputClass, 'w-full')

function fechaCorta(value: string | null): string {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year.slice(2)}` : value
}

function fechaHora(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(value))
}

function normalizar(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function EstadoBadge({ estado }: { estado: EstadoBorrador }) {
  const data = {
    blocked: ['BLOQUEADO', 'border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]'],
    ready: ['LISTO', 'border-[var(--mint)]/40 bg-[var(--mint-glow)] text-[var(--mint)]'],
    draft: ['BORRADOR', 'ao-chip-amber'],
    emitting: ['EMITIENDO', 'border-sky-400/40 bg-sky-400/10 text-sky-300'],
    cancelled: ['CANCELADO', 'border-[var(--line)] bg-white/[.02] text-[var(--ink-mute)]'],
  }[estado]
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold', data[1])}>{data[0]}</span>
}

function FiscalBadge({ estado }: { estado: BorradorResumen['cliente_estado'] }) {
  const ok = estado === 'validado'
  return (
    <span className={cn('text-[9px] font-semibold uppercase', ok ? 'text-[var(--mint)]' : 'text-[var(--amber)]')}>
      Fiscal {ok ? 'validado' : estado.replace('_', ' ')}
    </span>
  )
}

function RevisionBadge({ row }: { row: BorradorResumen }) {
  const revision = row.revision_sombra
  if (!revision || revision.accion === 'reabierto') {
    return <span className="text-[9px] font-semibold uppercase text-[var(--ink-mute)]">Revisión abierta</span>
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold',
        revision.vigente
          ? 'border-[var(--mint)]/40 bg-[var(--mint-glow)] text-[var(--mint)]'
          : 'ao-chip-amber',
      )}>
        {revision.vigente ? 'REVISIÓN CERRADA' : 'CIERRE OBSOLETO'}
      </span>
      {row.verifactu_simulacion && (
        <span className={cn(
          'font-mono text-[9px] font-semibold',
          row.verifactu_simulacion.vigente ? 'text-sky-300' : 'text-[var(--ink-mute)]',
        )}>
          {row.verifactu_simulacion.numero_simulado}
        </span>
      )}
      {row.verifactu_xml && (
        <span className={cn(
          'text-[9px] font-semibold uppercase',
          row.verifactu_xml.vigente ? 'text-violet-300' : 'text-[var(--ink-mute)]',
        )}>
          XML A8 · XSD {row.verifactu_xml.xsd_version}
        </span>
      )}
    </div>
  )
}

function Diferencia({ value, holdedTotal }: { value: number | null; holdedTotal: number | null }) {
  if (holdedTotal == null || value == null) return <span className="text-[var(--ink-mute)]">Sin total Holded</span>
  const squared = Math.abs(value) <= 0.01
  return (
    <span className={cn('font-semibold tabular-nums', squared ? 'text-[var(--mint)]' : 'text-[var(--coral)]')}>
      {squared ? 'Cuadra' : `${value > 0 ? '+' : ''}${euros(value)}`}
    </span>
  )
}

function Kpi({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'good' | 'warn' }) {
  return (
    <div className="ao-panel px-3 py-2.5">
      <div className="micro-caps text-[var(--ink-mute)]">{label}</div>
      <div className={cn(
        'mt-1 text-xl font-semibold tabular-nums',
        tone === 'good' ? 'text-[var(--mint)]' : tone === 'warn' ? 'text-[var(--coral)]' : 'text-[var(--ink)]',
      )}>
        {value}
      </div>
    </div>
  )
}

export function FacturacionPage() {
  const query = useFacturacionBandeja()
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [tipo, setTipo] = useState<TipoFiltro>('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const needle = normalizar(search)
    return (query.data ?? []).filter((row) => {
      if (estado !== 'todos' && row.estado !== estado) return false
      if (tipo !== 'todos' && row.tipo_documento !== tipo) return false
      if (desde && row.fecha_operacion < desde) return false
      if (hasta && row.fecha_operacion > hasta) return false
      if (!needle) return true
      return normalizar([
        row.cliente_nombre,
        row.cliente_comercial,
        row.pedido_cliente_nombre,
        row.holded_documento_numero,
        row.numero_interno,
      ].filter(Boolean).join(' ')).includes(needle)
    })
  }, [query.data, search, estado, tipo, desde, hasta])

  const kpis = useMemo(() => ({
    total: rows.length,
    listos: rows.filter((row) => row.estado === 'ready').length,
    bloqueados: rows.filter((row) => row.estado === 'blocked').length,
    pendientes: rows.reduce((sum, row) => sum + row.lineas_pendientes, 0),
    cerrados: rows.filter((row) => row.revision_sombra?.accion === 'cerrado' && row.revision_sombra.vigente).length,
    simulados: rows.filter((row) => row.verifactu_simulacion?.vigente).length,
    xmls: rows.filter((row) => row.verifactu_xml?.vigente).length,
    importe: rows.reduce((sum, row) => sum + row.total_provisional, 0),
  }), [rows])

  const selected = (query.data ?? []).find((row) => row.borrador_id === selectedId) ?? null

  return (
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · FACTURACIÓN PROPIA"
        title="Facturación"
        subtitle="Borradores en sombra, revisión fiscal y contraste con Holded"
        actions={(
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
            Actualizar
          </Button>
        )}
      />

      <div className="ao-page max-w-[1600px] space-y-3 py-4 md:py-6">
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[var(--amber)]/10 px-3 py-2 text-xs text-[var(--ink-dim)]">
          <FileClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
          <div>
            <strong className="text-[var(--amber)]">MODO SOMBRA.</strong>{' '}
            Aquí no se emite ni se reserva numeración fiscal. Holded sigue siendo el documento activo mientras validamos cantidades, precios e impuestos.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-8">
          <Kpi label="Documentos" value={String(kpis.total)} />
          <Kpi label="Listos" value={String(kpis.listos)} tone="good" />
          <Kpi label="Bloqueados" value={String(kpis.bloqueados)} tone="warn" />
          <Kpi label="Líneas sin precio" value={String(kpis.pendientes)} tone={kpis.pendientes > 0 ? 'warn' : 'good'} />
          <Kpi label="Revisiones cerradas" value={String(kpis.cerrados)} tone={kpis.cerrados > 0 ? 'good' : 'normal'} />
          <Kpi label="Simulaciones A7" value={String(kpis.simulados)} />
          <Kpi label="XML A8" value={String(kpis.xmls)} />
          <Kpi label="Total provisional" value={euros(kpis.importe)} />
        </div>

        <div className="ao-panel grid grid-cols-2 gap-2 p-2 md:grid-cols-[minmax(220px,1fr)_150px_150px_145px_145px]">
          <label className="relative col-span-2 md:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-[var(--ink-mute)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, pedido o documento…" className="h-8 pl-8 text-xs" />
          </label>
          <select value={estado} onChange={(event) => setEstado(event.target.value as EstadoFiltro)} className={selectClass} aria-label="Filtrar estado">
            <option value="todos">Todos los estados</option>
            <option value="blocked">Bloqueados</option>
            <option value="ready">Listos</option>
            <option value="draft">Borrador</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <select value={tipo} onChange={(event) => setTipo(event.target.value as TipoFiltro)} className={selectClass} aria-label="Filtrar tipo">
            <option value="todos">Factura + albarán</option>
            <option value="factura">Facturas</option>
            <option value="albaran">Albaranes</option>
          </select>
          <Input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} className="h-8 text-xs" aria-label="Desde" />
          <Input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} className="h-8 text-xs" aria-label="Hasta" />
        </div>

        <div className="ao-panel overflow-hidden">
          {query.isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-[var(--ink-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando borradores…
            </div>
          ) : query.error ? (
            <div className="p-4 text-sm text-[var(--coral)]">No se pudo cargar la bandeja: {errorMessage(query.error)}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ink-mute)]">No hay borradores con estos filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-xs">
                <thead className="border-b border-[var(--line)] bg-white/[.018] text-left text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">
                  <tr>
                    <th className="px-3 py-2">Ref.</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Tipo / estado</th>
                    <th className="px-3 py-2 text-right">Líneas</th>
                    <th className="px-3 py-2 text-right">Propio</th>
                    <th className="px-3 py-2 text-right">Holded</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                    <th className="px-3 py-2">Revisión</th>
                    <th className="px-3 py-2">Bloqueo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((row) => (
                    <tr
                      key={row.borrador_id}
                      onClick={() => setSelectedId(row.borrador_id)}
                      className="cursor-pointer text-[var(--ink-dim)] transition-colors hover:bg-white/[.025]"
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-[var(--ink)]">B-{row.numero_interno}</td>
                      <td className="px-3 py-2 tabular-nums">{fechaCorta(row.fecha_operacion)}</td>
                      <td className="max-w-[260px] px-3 py-2">
                        <div className="truncate font-medium text-[var(--ink)]">{row.pedido_cliente_nombre ?? row.cliente_comercial ?? row.cliente_nombre}</div>
                        <FiscalBadge estado={row.cliente_estado} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="mb-1 capitalize">{row.tipo_documento}</div>
                        <EstadoBadge estado={row.estado} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.lineas}
                        {row.lineas_pendientes > 0 && <span className="ml-1 text-[var(--coral)]">({row.lineas_pendientes})</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-[var(--ink)]">{euros(row.total_provisional)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div>{row.holded_total == null ? '—' : euros(row.holded_total)}</div>
                        <div className="font-mono text-[9px] text-[var(--ink-mute)]">{row.holded_documento_numero || (row.holded_documento_id ? 'BORRADOR' : 'PENDIENTE')}</div>
                      </td>
                      <td className="px-3 py-2 text-right"><Diferencia value={row.diferencia_holded} holdedTotal={row.holded_total} /></td>
                      <td className="px-3 py-2"><RevisionBadge row={row} /></td>
                      <td className="max-w-[280px] px-3 py-2 text-[10px] text-[var(--ink-mute)]">{row.motivo_bloqueo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && <BorradorModal row={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function toEditable(linea: BorradorLinea): LineaEditable {
  return {
    id: linea.id,
    borrador_id: linea.borrador_id,
    descripcion: linea.descripcion,
    cantidad: String(linea.cantidad),
    unidad: linea.unidad,
    precio_unitario: linea.precio_unitario == null ? '' : String(linea.precio_unitario),
    descuento_pct: String(linea.descuento_pct),
    iva_pct: String(linea.iva_pct),
    recargo_equivalencia_pct: String(linea.recargo_equivalencia_pct),
  }
}

function totalEditable(linea: LineaEditable): number | null {
  if (linea.precio_unitario.trim() === '') return null
  const cantidad = Number(linea.cantidad)
  const precio = Number(linea.precio_unitario)
  const descuento = Number(linea.descuento_pct)
  const iva = Number(linea.iva_pct)
  const recargo = Number(linea.recargo_equivalencia_pct)
  if (![cantidad, precio, descuento, iva, recargo].every(Number.isFinite)) return null
  const base = Math.round(cantidad * precio * (1 - descuento / 100) * 100) / 100
  return base + Math.round(base * iva) / 100 + Math.round(base * recargo) / 100
}

function validarLinea(linea: LineaEditable): string | null {
  if (!linea.descripcion.trim()) return 'La descripción no puede estar vacía.'
  if (!linea.unidad.trim()) return `Falta la unidad en ${linea.descripcion}.`
  if (!Number.isFinite(Number(linea.cantidad)) || Number(linea.cantidad) <= 0) return `Cantidad inválida en ${linea.descripcion}.`
  if (linea.precio_unitario.trim() !== '' && (!Number.isFinite(Number(linea.precio_unitario)) || Number(linea.precio_unitario) < 0)) return `Precio inválido en ${linea.descripcion}.`
  for (const [label, value] of [['descuento', linea.descuento_pct], ['IVA', linea.iva_pct], ['recargo', linea.recargo_equivalencia_pct]]) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) return `${label} inválido en ${linea.descripcion}.`
  }
  return null
}

function BorradorModal({ row, onClose }: { row: BorradorResumen; onClose: () => void }) {
  const lineasQuery = useBorradorLineas(row.borrador_id)

  if (lineasQuery.isLoading) {
    return (
      <Modal onClose={onClose} size="3xl" ariaLabel={`Borrador B-${row.numero_interno}`}>
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-[var(--ink-mute)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--mint)]" /> Cargando borrador…
        </div>
      </Modal>
    )
  }

  if (lineasQuery.error) {
    return (
      <Modal onClose={onClose} size="3xl" ariaLabel={`Borrador B-${row.numero_interno}`}>
        <div className="p-4 text-sm text-[var(--coral)]">No se pudo cargar el borrador: {errorMessage(lineasQuery.error)}</div>
      </Modal>
    )
  }

  const initialLineas = lineasQuery.data ?? []
  const version = initialLineas.map((linea) => `${linea.id}:${linea.updated_at}`).join('|')
  return <BorradorModalContent key={version} row={row} initialLineas={initialLineas} onClose={onClose} />
}

function BorradorModalContent({
  row,
  initialLineas,
  onClose,
}: {
  row: BorradorResumen
  initialLineas: BorradorLinea[]
  onClose: () => void
}) {
  const holdedQuery = useHoldedLineas(row.holded_documento_id)
  const guardar = useGuardarLineas()
  const anadir = useAnadirLinea()
  const eliminar = useEliminarLinea()
  const recalcular = useRecalcularBorrador()
  const cerrarRevision = useCerrarRevisionSombra()
  const reabrirRevision = useReabrirRevisionSombra()
  const generarSimulacion = useGenerarVerifactuSimulacion()
  const generarXml = useGenerarVerifactuXml()
  const [lineas, setLineas] = useState<LineaEditable[]>(() => initialLineas.map(toEditable))
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [mostrarReapertura, setMostrarReapertura] = useState(false)
  const [motivoReapertura, setMotivoReapertura] = useState('')
  const [descargandoXml, setDescargandoXml] = useState(false)
  const revisionSombra = row.revision_sombra
  const simulacionVerifactu = row.verifactu_simulacion
  const xmlVerifactu = row.verifactu_xml
  const bloqueadoPorCierre = revisionSombra?.accion === 'cerrado'

  const update = (id: string, patch: Partial<LineaEditable>) => {
    setLineas((current) => current.map((linea) => linea.id === id ? { ...linea, ...patch } : linea))
    setDirty((current) => new Set(current).add(id))
  }

  const totalVivo = lineas.reduce((sum, linea) => sum + (totalEditable(linea) ?? 0), 0)
  const pendientesVivos = lineas.filter((linea) => linea.precio_unitario.trim() === '').length
  const diferenciaViva = row.holded_total == null ? null : Math.round((totalVivo - row.holded_total) * 100) / 100
  const motivoNoCerrable = dirty.size > 0
    ? 'Guarda primero los cambios pendientes.'
    : row.estado !== 'ready'
      ? row.motivo_bloqueo ?? 'El borrador todavía no está listo.'
      : row.cliente_estado !== 'validado'
        ? 'La ficha fiscal debe estar validada.'
        : row.holded_total == null
          ? 'Falta el documento de contraste en Holded.'
          : diferenciaViva == null || Math.abs(diferenciaViva) > 0.01
            ? 'El total propio debe cuadrar con Holded al céntimo.'
            : null

  const save = async () => {
    const error = lineas.map(validarLinea).find(Boolean)
    if (error) {
      toast({ title: 'Revisa las líneas', description: error, variant: 'error' })
      return
    }
    const changed = lineas.filter((linea) => dirty.has(linea.id))
    if (changed.length === 0) return
    try {
      await guardar.mutateAsync({ borradorId: row.borrador_id, lineas: changed })
      setDirty(new Set())
      toast({ title: 'Borrador actualizado', description: `${changed.length} línea(s) guardadas y estado recalculado.`, variant: 'success' })
    } catch (errorSave) {
      toast({ title: 'No se pudo guardar', description: errorMessage(errorSave), variant: 'error' })
    }
  }

  const copyHolded = () => {
    const sources = holdedQuery.data ?? []
    const originals = new Map(initialLineas.map((linea) => [linea.id, linea]))
    const used = new Set<string>()
    const matchedIds = new Set<string>()
    const next = lineas.map((linea) => {
      const original = originals.get(linea.id)
      const match = sources.find((source) => !used.has(source.id) && (
        (!!original?.producto_referencia && original.producto_referencia === source.product_id)
        || normalizar(original?.descripcion ?? linea.descripcion) === normalizar(source.nombre)
      ))
      if (!match) return linea
      used.add(match.id)
      matchedIds.add(linea.id)
      return {
        ...linea,
        cantidad: String(match.units),
        precio_unitario: String(match.price),
        iva_pct: String(match.tax_rate),
      }
    })

    if (matchedIds.size > 0) {
      setLineas(next)
      setDirty((current) => new Set([...current, ...matchedIds]))
      toast({ title: 'Datos Holded preparados', description: `${matchedIds.size} línea(s) emparejadas. Revisa y pulsa Guardar.`, variant: 'success' })
    } else {
      toast({ title: 'Sin coincidencias automáticas', description: 'Compara las tablas y corrige las líneas manualmente.', variant: 'error' })
    }
  }

  const requestClose = async () => {
    if (dirty.size > 0) {
      const ok = await confirm({
        title: '¿Cerrar sin guardar los cambios?',
        description: `${dirty.size} línea(s) editadas volverán a sus valores anteriores.`,
        confirmLabel: 'Cerrar sin guardar',
        variant: 'danger',
      })
      if (!ok) return
    }
    onClose()
  }

  const addLine = async () => {
    try {
      await anadir.mutateAsync({
        borradorId: row.borrador_id,
        orden: Math.max(0, ...initialLineas.map((linea) => linea.orden)) + 1,
      })
      toast({ title: 'Línea añadida', description: 'Completa sus datos antes de dejar el borrador listo.', variant: 'success' })
    } catch (errorAdd) {
      toast({ title: 'No se pudo añadir', description: errorMessage(errorAdd), variant: 'error' })
    }
  }

  const deleteLine = async (linea: LineaEditable) => {
    const ok = await confirm({
      title: '¿Eliminar esta línea del borrador?',
      description: linea.descripcion,
      confirmLabel: 'Eliminar línea',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await eliminar.mutateAsync({ borradorId: row.borrador_id, lineaId: linea.id })
      setDirty((current) => {
        const next = new Set(current)
        next.delete(linea.id)
        return next
      })
      toast({ title: 'Línea eliminada', variant: 'success' })
    } catch (errorDelete) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(errorDelete), variant: 'error' })
    }
  }

  const closeRevision = async () => {
    if (motivoNoCerrable || bloqueadoPorCierre) return
    const ok = await confirm({
      title: '¿Cerrar esta revisión sombra?',
      description: 'Se congelará una instantánea interna de cliente, líneas y contraste Holded. No se emitirá ninguna factura.',
      confirmLabel: 'Cerrar revisión',
    })
    if (!ok) return
    try {
      await cerrarRevision.mutateAsync(row.borrador_id)
      toast({ title: 'Revisión sombra cerrada', description: 'Instantánea interna guardada. No se ha emitido ni numerado ninguna factura.', variant: 'success' })
    } catch (errorClose) {
      toast({ title: 'No se pudo cerrar', description: errorMessage(errorClose), variant: 'error' })
    }
  }

  const reopenRevision = async () => {
    const motivo = motivoReapertura.trim()
    if (motivo.length < 8) {
      toast({ title: 'Motivo demasiado corto', description: 'Escribe al menos 8 caracteres.', variant: 'error' })
      return
    }
    try {
      await reabrirRevision.mutateAsync({ borradorId: row.borrador_id, motivo })
      setMotivoReapertura('')
      setMostrarReapertura(false)
      toast({ title: 'Revisión reabierta', description: 'Las líneas vuelven a estar editables y la reapertura queda registrada.', variant: 'success' })
    } catch (errorReopen) {
      toast({ title: 'No se pudo reabrir', description: errorMessage(errorReopen), variant: 'error' })
    }
  }

  const generateSimulation = async () => {
    const ok = await confirm({
      title: '¿Generar simulación técnica A7?',
      description: 'Se calculará una huella con el algoritmo AEAT y numeración SIM-A7. No se emitirá una factura ni se enviará información a la AEAT.',
      confirmLabel: 'Generar simulación',
    })
    if (!ok) return
    try {
      await generarSimulacion.mutateAsync(row.borrador_id)
      toast({ title: 'Simulación A7 generada', description: 'Cadena técnica registrada. No se ha emitido ni enviado ninguna factura.', variant: 'success' })
    } catch (errorSimulation) {
      toast({ title: 'No se pudo simular', description: errorMessage(errorSimulation), variant: 'error' })
    }
  }

  const generateXml = async () => {
    const ok = await confirm({
      title: '¿Generar XML técnico A8?',
      description: 'Se materializará el registro simulado A7 con la estructura XSD oficial. No se enviará a la AEAT ni se emitirá una factura.',
      confirmLabel: 'Generar XML',
    })
    if (!ok) return
    try {
      await generarXml.mutateAsync(row.borrador_id)
      toast({ title: 'XML A8 generado', description: 'Payload técnico guardado y disponible para descarga. No se ha remitido a la AEAT.', variant: 'success' })
    } catch (errorXml) {
      toast({ title: 'No se pudo generar el XML', description: errorMessage(errorXml), variant: 'error' })
    }
  }

  const downloadXml = async () => {
    setDescargandoXml(true)
    try {
      const xml = await obtenerVerifactuXml(row.borrador_id)
      const url = URL.createObjectURL(new Blob([xml.contenidoXml], { type: 'application/xml;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = xml.nombreArchivo
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'XML A8 descargado', description: `SHA-256 ${xml.sha256.slice(0, 16)}…`, variant: 'success' })
    } catch (errorXml) {
      toast({ title: 'No se pudo descargar el XML', description: errorMessage(errorXml), variant: 'error' })
    } finally {
      setDescargandoXml(false)
    }
  }

  const busy = guardar.isPending || anadir.isPending || eliminar.isPending || recalcular.isPending || cerrarRevision.isPending || reabrirRevision.isPending || generarSimulacion.isPending || generarXml.isPending || descargandoXml

  return (
    <Modal onClose={() => void requestClose()} size="3xl" closeOnOverlay={!dirty.size} ariaLabel={`Borrador B-${row.numero_interno}`}>
      <div className="sticky top-0 z-20 flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">B-{row.numero_interno} · {row.pedido_cliente_nombre ?? row.cliente_nombre}</h2>
            <EstadoBadge estado={row.estado} />
            <RevisionBadge row={row} />
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--ink-mute)]">
            {row.tipo_documento.toUpperCase()} · operación {fechaCorta(row.fecha_operacion)} · revisión {row.revision}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {bloqueadoPorCierre ? (
            <>
              {revisionSombra?.vigente && row.tipo_documento === 'factura' && !simulacionVerifactu?.vigente && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void generateSimulation()}>
                  {generarSimulacion.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
                  Simular A7
                </Button>
              )}
              {simulacionVerifactu?.vigente && !xmlVerifactu?.vigente && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void generateXml()}>
                  {generarXml.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                  Generar XML A8
                </Button>
              )}
              {xmlVerifactu && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void downloadXml()}>
                  {descargandoXml ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Descargar XML
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setMostrarReapertura((current) => !current)}>
                <LockOpen className="h-3.5 w-3.5" /> Reabrir
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={busy || !!motivoNoCerrable} title={motivoNoCerrable ?? undefined} onClick={() => void closeRevision()}>
              {cerrarRevision.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockKeyhole className="h-3.5 w-3.5" />}
              Cerrar revisión
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy || dirty.size > 0 || bloqueadoPorCierre} onClick={async () => {
            try {
              await recalcular.mutateAsync(row.borrador_id)
              toast({ title: 'Estado recalculado', variant: 'success' })
            } catch (errorRecalc) {
              toast({ title: 'No se pudo recalcular', description: errorMessage(errorRecalc), variant: 'error' })
            }
          }}>
            <RefreshCw className={cn('h-3.5 w-3.5', recalcular.isPending && 'animate-spin')} />
            Recalcular
          </Button>
          <button type="button" onClick={() => void requestClose()} className="rounded-md p-2 text-[var(--ink-mute)] hover:bg-white/[.04] hover:text-[var(--ink)]" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {bloqueadoPorCierre && revisionSombra && (
          <div className={cn(
            'rounded-md border px-3 py-2 text-xs',
            revisionSombra.vigente
              ? 'border-[var(--mint)]/35 bg-[var(--mint-glow)] text-[var(--mint)]'
              : 'border-[var(--amber)]/35 bg-[var(--amber)]/10 text-[var(--amber)]',
          )}>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">{revisionSombra.vigente ? 'Revisión sombra cerrada y vigente' : 'Cierre sombra pendiente de reapertura'}</div>
                <div className="mt-0.5 text-[10px] opacity-80">
                  {fechaHora(revisionSombra.ocurrido_at)} · secuencia {revisionSombra.secuencia}
                  {revisionSombra.snapshot_sha256 && <> · SHA-256 interno {revisionSombra.snapshot_sha256.slice(0, 12)}…</>}
                </div>
                <div className="mt-1 text-[10px] opacity-80">
                  {revisionSombra.motivo_invalidez ?? 'Instantánea de control interno; no es una huella ni un registro fiscal VERI*FACTU.'}
                </div>
                {simulacionVerifactu && (
                  <div className={cn(
                    'mt-2 rounded border px-2 py-1.5 text-[10px]',
                    simulacionVerifactu.vigente
                      ? 'border-sky-300/30 bg-sky-300/10 text-sky-200'
                      : 'border-current/20 text-current opacity-75',
                  )}>
                    <div className="flex items-center gap-1 font-semibold">
                      <TestTube2 className="h-3.5 w-3.5" />
                      {simulacionVerifactu.numero_simulado} · simulación técnica A7
                    </div>
                    <div className="mt-0.5 font-mono">Huella AEAT simulada {simulacionVerifactu.huella.slice(0, 16)}…</div>
                    <div className="mt-0.5">No es factura, numeración fiscal ni registro remitido a la AEAT.</div>
                    {xmlVerifactu && (
                      <div className={cn(
                        'mt-1.5 rounded border px-2 py-1.5',
                        xmlVerifactu.vigente
                          ? 'border-violet-300/30 bg-violet-300/10 text-violet-200'
                          : 'border-current/20 opacity-75',
                      )}>
                        <div className="flex items-center gap-1 font-semibold">
                          <FileCheck2 className="h-3.5 w-3.5" />
                          XML A8 · estructura XSD AEAT {xmlVerifactu.xsd_version}
                        </div>
                        <div className="mt-0.5 font-mono">SHA-256 {xmlVerifactu.xml_sha256.slice(0, 16)}…</div>
                        <div className="mt-0.5">Payload técnico descargable; no es un envío SOAP ni una aceptación de la AEAT.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {mostrarReapertura && (
              <div className="mt-2 flex flex-col gap-2 border-t border-current/20 pt-2 sm:flex-row">
                <Input value={motivoReapertura} onChange={(event) => setMotivoReapertura(event.target.value)} placeholder="Motivo de la reapertura…" className="h-8 flex-1 text-xs" />
                <Button size="sm" disabled={busy || motivoReapertura.trim().length < 8} onClick={() => void reopenRevision()}>
                  {reabrirRevision.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirmar reapertura
                </Button>
              </div>
            )}
          </div>
        )}

        {!bloqueadoPorCierre && motivoNoCerrable && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--line)] bg-white/[.012] px-3 py-2 text-[10px] text-[var(--ink-mute)]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Para cerrar la revisión: {motivoNoCerrable}
          </div>
        )}

        {row.motivo_bloqueo && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-xs text-[var(--coral)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {row.motivo_bloqueo}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Kpi label="Líneas propias" value={String(lineas.length)} />
          <Kpi label="Sin precio" value={String(pendientesVivos)} tone={pendientesVivos ? 'warn' : 'good'} />
          <Kpi label="Total propio" value={euros(totalVivo)} />
          <Kpi label="Total Holded" value={row.holded_total == null ? '—' : euros(row.holded_total)} />
          <Kpi label="Diferencia" value={row.holded_total == null ? '—' : euros(totalVivo - row.holded_total)} tone={row.holded_total != null && Math.abs(totalVivo - row.holded_total) > 0.01 ? 'warn' : 'good'} />
        </div>

        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-white/[.012]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Borrador propio editable</h3>
              <p className="text-[10px] text-[var(--ink-mute)]">Ajusta aquí los pesos finales y precios que sustituirán el trabajo manual de Holded.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={!holdedQuery.data?.length || busy || bloqueadoPorCierre} onClick={copyHolded}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Copiar coincidencias Holded
              </Button>
              <Button variant="outline" size="sm" disabled={busy || dirty.size > 0 || bloqueadoPorCierre} onClick={() => void addLine()}>
                <Plus className="h-3.5 w-3.5" /> Línea
              </Button>
              <Button size="sm" disabled={dirty.size === 0 || busy || bloqueadoPorCierre} onClick={() => void save()}>
                {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar {dirty.size > 0 ? `(${dirty.size})` : ''}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full min-w-[1030px] text-xs">
                <thead className="border-b border-[var(--line)] text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">
                  <tr>
                    <th className="w-10 px-2 py-2 text-right">#</th>
                    <th className="min-w-[230px] px-2 py-2 text-left">Descripción</th>
                    <th className="w-24 px-2 py-2 text-right">Cantidad</th>
                    <th className="w-24 px-2 py-2 text-left">Unidad</th>
                    <th className="w-24 px-2 py-2 text-right">Precio</th>
                    <th className="w-20 px-2 py-2 text-right">Dto.</th>
                    <th className="w-20 px-2 py-2 text-right">IVA</th>
                    <th className="w-20 px-2 py-2 text-right">RE</th>
                    <th className="w-28 px-2 py-2 text-right">Total</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {lineas.map((linea, index) => {
                    const total = totalEditable(linea)
                    return (
                      <tr key={linea.id} className={cn(dirty.has(linea.id) && 'bg-[var(--amber)]/[.06]')}>
                        <td className="px-2 py-1 text-right font-mono text-[var(--ink-mute)]">{index + 1}</td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} value={linea.descripcion} onChange={(event) => update(linea.id, { descripcion: event.target.value })} className={cn(inputClass, 'w-full disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} type="number" step="0.001" min="0.001" value={linea.cantidad} onChange={(event) => update(linea.id, { cantidad: event.target.value })} className={cn(inputClass, 'w-full text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} value={linea.unidad} onChange={(event) => update(linea.id, { unidad: event.target.value })} className={cn(inputClass, 'w-full disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} type="number" step="0.000001" min="0" value={linea.precio_unitario} placeholder="Pend." onChange={(event) => update(linea.id, { precio_unitario: event.target.value })} className={cn(inputClass, 'w-full text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60', !linea.precio_unitario && 'border-[var(--coral)]/50')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} type="number" step="0.01" min="0" max="100" value={linea.descuento_pct} onChange={(event) => update(linea.id, { descuento_pct: event.target.value })} className={cn(inputClass, 'w-full text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} type="number" step="0.01" min="0" max="100" value={linea.iva_pct} onChange={(event) => update(linea.id, { iva_pct: event.target.value })} className={cn(inputClass, 'w-full text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1"><input disabled={bloqueadoPorCierre || busy} type="number" step="0.01" min="0" max="100" value={linea.recargo_equivalencia_pct} onChange={(event) => update(linea.id, { recargo_equivalencia_pct: event.target.value })} className={cn(inputClass, 'w-full text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-60')} /></td>
                        <td className="px-2 py-1 text-right font-medium tabular-nums text-[var(--ink)]">{total == null ? '—' : euros(total)}</td>
                        <td className="px-2 py-1">
                          <button type="button" onClick={() => void deleteLine(linea)} disabled={busy || dirty.size > 0 || bloqueadoPorCierre} title={dirty.size > 0 ? 'Guarda los cambios antes de eliminar líneas' : bloqueadoPorCierre ? 'Reabre la revisión antes de eliminar líneas' : undefined} className="rounded p-1.5 text-[var(--ink-mute)] hover:bg-[var(--coral)]/10 hover:text-[var(--coral)] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Eliminar ${linea.descripcion}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-white/[.012]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Referencia actual en Holded</h3>
              <p className="font-mono text-[9px] text-[var(--ink-mute)]">{row.holded_documento_numero || row.holded_documento_id || 'Todavía sin documento'}</p>
            </div>
            {row.holded_total != null && Math.abs(totalVivo - row.holded_total) <= 0.01 ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--mint)]"><CheckCircle2 className="h-4 w-4" /> Cuadra al céntimo</span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-[var(--coral)]"><AlertTriangle className="h-4 w-4" /> Revisar diferencia</span>
            )}
          </div>
          {!row.holded_documento_id ? (
            <div className="p-3 text-xs text-[var(--ink-mute)]">Holded aún no ha devuelto documento para este pedido.</div>
          ) : holdedQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-[var(--mint)]" /></div>
          ) : holdedQuery.error ? (
            <div className="p-3 text-xs text-[var(--coral)]">{errorMessage(holdedQuery.error)}</div>
          ) : (
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="sticky top-0 border-b border-[var(--line)] bg-[var(--panel)] text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">
                  <tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Cantidad final</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">IVA</th><th className="px-3 py-2 text-right">Importe</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {(holdedQuery.data ?? []).map((linea) => (
                    <tr key={linea.id} className="text-[var(--ink-dim)]">
                      <td className="px-3 py-1.5 text-[var(--ink)]">{linea.nombre}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{linea.units}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{euros(linea.price)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{linea.tax_rate}%</td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">{euros(linea.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <FileCheck2 className="h-4 w-4 text-[var(--mint)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Identidad fiscal del cliente</h3>
          </div>
          {bloqueadoPorCierre ? (
            <div className="ao-card flex items-start gap-2 p-3 text-xs text-[var(--ink-mute)]">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mint)]" />
              La identidad fiscal incluida en esta revisión está congelada. Reabre la revisión antes de corregirla.
            </div>
          ) : (
            <FiscalCard
              name={row.pedido_cliente_nombre ?? row.cliente_comercial ?? row.cliente_nombre}
              contactIds={row.holded_contact_id ? [row.holded_contact_id] : []}
            />
          )}
        </section>
      </div>
    </Modal>
  )
}
