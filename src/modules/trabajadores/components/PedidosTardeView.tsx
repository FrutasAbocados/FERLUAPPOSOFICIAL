import { useMemo, useState, type ReactNode } from 'react'
import { addMonths, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  HandCoins,
  Loader2,
  Plus,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { euros } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import {
  calcularPedidosTardeKpis,
  type PedidoTardeFactura,
  useActualizarEstadoPedidosTarde,
  useCambiarMetodoPedidoTarde,
  usePedidosTardeFacturaIds,
  usePedidosTardeFacturas,
} from '../lib/pedidos-tarde-queries'
import { PedidosTardeCrearModal } from './PedidosTardeCrearModal'

const monthStart = (month: string) => `${month}-01`
const nextMonthStart = (month: string) => format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM-dd')

export function PedidosTardeView() {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [crearOpen, setCrearOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const facturas = usePedidosTardeFacturas(monthStart(month), nextMonthStart(month))
  const facturaIds = usePedidosTardeFacturaIds()
  const actualizarEstado = useActualizarEstadoPedidosTarde()
  const cambiarMetodo = useCambiarMetodoPedidoTarde()
  const rows = useMemo(() => facturas.data ?? [], [facturas.data])
  const kpis = useMemo(() => calcularPedidosTardeKpis(rows), [rows])
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  )
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))
  const isMutating = actualizarEstado.isPending || cambiarMetodo.isPending
  const currentMonth = format(new Date(), 'yyyy-MM')
  const monthDate = parseISO(`${month}-01`)
  const isCurrentMonth = month === currentMonth
  const monthLabel = format(monthDate, 'LLLL yyyy', { locale: es })
  const cobradasCount = rows.filter((row) => row.cobrada_cliente).length
  const pendientesLiquidacion = rows.filter((row) => row.cobrada_cliente && !row.liquidada_empresa).length

  const moveMonth = (offset: number) => {
    const next = format(addMonths(monthDate, offset), 'yyyy-MM')
    if (next > currentMonth) return
    setMonth(next)
    setSelectedIds(new Set())
  }

  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds((current) => {
      if (allSelected) return new Set()
      const next = new Set(current)
      rows.forEach((row) => next.add(row.id))
      return next
    })
  }

  const updateStatus = async (
    ids: string[],
    campo: 'cobrada' | 'liquidada',
    valor: boolean,
    successMessage: string,
  ) => {
    try {
      await actualizarEstado.mutateAsync({ ids, campo, valor })
      toast({ title: successMessage, variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo actualizar', description: errorMessage(error), variant: 'error' })
    }
  }

  const handleMetodo = async (row: PedidoTardeFactura) => {
    const next = row.metodo_cobro === 'tarjeta' ? 'efectivo' : 'tarjeta'
    try {
      await cambiarMetodo.mutateAsync({ id: row.id, metodoCobro: next })
      toast({ title: `Método cambiado a ${next}`, variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo cambiar el método', description: errorMessage(error), variant: 'error' })
    }
  }

  const batchCount = selectedRows.length
  const canLiquidateBatch = batchCount > 0 && selectedRows.every((row) => row.cobrada_cliente)

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-3 py-4 pb-28 md:px-6 md:py-6">
      <section className="ao-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-lg)] bg-[var(--mint-glow)] text-[var(--mint)]">
              <WalletCards className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mint)]">Liquidación comercial</p>
              <h1 className="font-display text-xl font-bold text-[var(--ink)]">Pedidos de tarde</h1>
              <p className="text-xs text-[var(--ink-dim)]">Seguimiento de facturación, cobros y saldos con la empresa.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCrearOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Incorporar factura
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white/[.015] px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-mute)] sm:flex">
              <CalendarRange className="h-3.5 w-3.5" /> Periodo
            </span>
            <Button size="sm" variant="ghost" onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[132px] text-center font-display text-sm font-bold capitalize text-[var(--ink)] md:min-w-[155px]">
              {monthLabel}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => moveMonth(1)}
              disabled={isCurrentMonth}
              aria-label="Mes siguiente"
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentMonth && (
              <Button size="sm" variant="outline" onClick={() => { setMonth(currentMonth); setSelectedIds(new Set()) }}>
                Este mes
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-[var(--ink-dim)]">
            <span className="rounded-full border border-[var(--line)] px-2 py-1 tabular-nums">{rows.length} facturas</span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-400 tabular-nums">{cobradasCount} cobradas</span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-amber-400 tabular-nums">{pendientesLiquidacion} por liquidar</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Kpi icon={<CircleDollarSign />} label="Facturación gestionada" value={euros(kpis.generado)} />
        <Kpi icon={<UserRound />} label="Resultado para Raúl" value={euros(kpis.beneficioRaul)} tone="mint" />
        <Kpi icon={<Building2 />} label="Participación empresa" value={euros(kpis.beneficioEmpresa)} />
        <Kpi icon={<Banknote />} label="Raúl → empresa" value={euros(kpis.pendienteRaulEmpresa)} tone="warning" />
        <Kpi icon={<CreditCard />} label="Empresa → Raúl" value={euros(kpis.pendienteEmpresaRaul)} tone="info" />
        <Kpi
          icon={<ArrowLeftRight />}
          label="Balance pendiente"
          value={euros(Math.abs(kpis.balance))}
          detail={kpis.balance > 0 ? 'Empresa → Raúl' : kpis.balance < 0 ? 'Raúl → empresa' : 'Al día'}
          tone={kpis.balance === 0 ? 'mint' : 'warning'}
        />
      </div>

      <div className="ao-panel grid gap-2 px-3 py-2.5 text-xs text-[var(--ink-dim)] md:grid-cols-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 shrink-0 text-sky-400" />
          <span><strong className="text-[var(--ink)]">Tarjeta:</strong> cobra la empresa y queda pendiente la parte de Raúl.</span>
        </div>
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 shrink-0 text-amber-400" />
          <span><strong className="text-[var(--ink)]">Efectivo:</strong> cobra Raúl y queda pendiente la liquidación con la empresa.</span>
        </div>
      </div>

      {batchCount > 0 && (
        <div className="ao-panel flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="mr-1 text-xs font-semibold text-[var(--ink)] tabular-nums">{batchCount} seleccionadas</span>
          <Button
            size="sm"
            variant="outline"
            disabled={isMutating}
            onClick={() => updateStatus([...selectedIds], 'cobrada', true, 'Facturas marcadas como cobradas')}
          >
            Marcar cobradas
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isMutating}
            onClick={() => updateStatus([...selectedIds], 'cobrada', false, 'Facturas devueltas a pendientes')}
          >
            Deshacer cobro
          </Button>
          <Button
            size="sm"
            disabled={isMutating || !canLiquidateBatch}
            title={canLiquidateBatch ? undefined : 'Primero marca todas como cobradas'}
            onClick={() => updateStatus([...selectedIds], 'liquidada', true, 'Facturas liquidadas con la empresa')}
          >
            Liquidar con empresa
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isMutating}
            onClick={() => updateStatus([...selectedIds], 'liquidada', false, 'Liquidación deshecha')}
          >
            Deshacer liquidación
          </Button>
        </div>
      )}

      <div className="ao-card overflow-hidden p-0">
        {facturas.isLoading && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[var(--ink-dim)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando facturas…
          </div>
        )}
        {facturas.isError && (
          <p className="px-4 py-8 text-center text-sm text-red-400">No se pudieron cargar las facturas.</p>
        )}
        {!facturas.isLoading && !facturas.isError && rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <WalletCards className="mx-auto mb-2 h-7 w-7 text-[var(--ink-mute)]" />
            <p className="text-sm font-semibold text-[var(--ink)]">Sin facturas en este mes</p>
            <p className="mt-1 text-xs text-[var(--ink-mute)]">Añade la primera desde las facturas ya sincronizadas en Manager.</p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-dim)]">Facturas del periodo</h2>
                <p className="text-[10px] text-[var(--ink-mute)]">Selecciona varias para actualizar su situación conjuntamente.</p>
              </div>
              <span className="text-xs tabular-nums text-[var(--ink-mute)]">{rows.length} registros</span>
            </div>
            <div className="hidden grid-cols-[28px_90px_90px_minmax(150px,1fr)_90px_96px_104px_116px] items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-mute)] md:grid">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" aria-label="Seleccionar todas" />
              <span>Fecha</span>
              <span>Factura</span>
              <span>Cliente</span>
              <span>Método</span>
              <span className="text-right">Total</span>
              <span className="text-right">Beneficio</span>
              <span>Estados</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {rows.map((row) => (
                <FacturaRow
                  key={row.id}
                  row={row}
                  checked={selectedIds.has(row.id)}
                  disabled={isMutating}
                  onToggle={() => toggleOne(row.id)}
                  onMetodo={() => handleMetodo(row)}
                  onCobro={() => updateStatus([row.id], 'cobrada', !row.cobrada_cliente, row.cobrada_cliente ? 'Cobro deshecho' : 'Factura cobrada')}
                  onLiquidacion={() => updateStatus([row.id], 'liquidada', !row.liquidada_empresa, row.liquidada_empresa ? 'Liquidación deshecha' : 'Factura liquidada')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {crearOpen && (
        <PedidosTardeCrearModal
          existingFacturaIds={facturaIds.data ?? new Set<string>()}
          onClose={() => setCrearOpen(false)}
        />
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  tone?: 'default' | 'mint' | 'warning' | 'info'
}) {
  const toneClass = {
    default: 'text-[var(--ink-dim)]',
    mint: 'text-[var(--mint)]',
    warning: 'text-amber-400',
    info: 'text-sky-400',
  }[tone]
  return (
    <div className="ao-card min-w-0 p-3">
      <div className={`mb-1 flex items-center gap-1.5 ${toneClass}`}>
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="truncate font-display text-lg font-bold tabular-nums text-[var(--ink)]">{value}</p>
      {detail && <p className={`mt-0.5 text-[10px] font-semibold ${toneClass}`}>{detail}</p>}
    </div>
  )
}

function FacturaRow({
  row,
  checked,
  disabled,
  onToggle,
  onMetodo,
  onCobro,
  onLiquidacion,
}: {
  row: PedidoTardeFactura
  checked: boolean
  disabled: boolean
  onToggle: () => void
  onMetodo: () => void
  onCobro: () => void
  onLiquidacion: () => void
}) {
  const parteRaul = row.beneficio * 0.8
  const liquidacion = row.metodo_cobro === 'tarjeta' ? parteRaul : row.importe_total - parteRaul
  return (
    <div className="p-3 md:grid md:grid-cols-[28px_90px_90px_minmax(150px,1fr)_90px_96px_104px_116px] md:items-center md:gap-2">
      <div className="flex items-start gap-3 md:contents">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-4 w-4 md:mt-0" aria-label={`Seleccionar ${row.numero_factura}`} />
        <div className="min-w-0 flex-1 md:contents">
          <span className="hidden text-xs text-[var(--ink-dim)] md:block">
            {format(parseISO(row.fecha), 'd MMM yy', { locale: es })}
          </span>
          <div>
            <span className="font-semibold text-[var(--mint)]">{row.numero_factura}</span>
            <span className="ml-2 text-xs text-[var(--ink-mute)] md:hidden">
              {format(parseISO(row.fecha), 'd MMM yyyy', { locale: es })}
            </span>
          </div>
          <div className="truncate text-sm text-[var(--ink)]">{row.cliente}</div>
          <button
            type="button"
            onClick={onMetodo}
            disabled={disabled}
            className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold md:mt-0 ${
              row.metodo_cobro === 'tarjeta'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}
            title="Cambiar método de cobro"
          >
            {row.metodo_cobro === 'tarjeta' ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
            {row.metodo_cobro === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2 md:contents">
            <div className="md:text-right">
              <span className="block text-[10px] text-[var(--ink-mute)] md:hidden">Total</span>
              <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">{euros(row.importe_total)}</span>
            </div>
            <div className="md:text-right">
              <span className="block text-[10px] text-[var(--ink-mute)] md:hidden">Beneficio</span>
              <span className="text-sm font-semibold tabular-nums text-[var(--mint)]">{euros(row.beneficio)}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 md:mt-0 md:block md:space-y-1">
            <StatusButton active={row.cobrada_cliente} onClick={onCobro} disabled={disabled}>
              {row.cobrada_cliente ? 'Cobrada' : 'Sin cobrar'}
            </StatusButton>
            <StatusButton
              active={row.liquidada_empresa}
              onClick={onLiquidacion}
              disabled={disabled || !row.cobrada_cliente}
            >
              {row.liquidada_empresa ? 'Liquidada' : 'Sin liquidar'}
            </StatusButton>
            {row.cobrada_cliente && !row.liquidada_empresa && (
              <span className="block text-[9px] tabular-nums text-[var(--ink-mute)]" title="Importe pendiente de liquidación">
                {row.metodo_cobro === 'tarjeta' ? 'Empresa → Raúl' : 'Raúl → empresa'} {euros(liquidacion)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-[var(--line)] bg-white/[.02] text-[var(--ink-mute)] hover:border-[var(--line-2)]'
      }`}
    >
      {active ? <CheckCircle2 className="h-3 w-3" /> : <HandCoins className="h-3 w-3" />}
      {children}
    </button>
  )
}
