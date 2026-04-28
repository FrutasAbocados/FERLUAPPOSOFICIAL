import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { KpiBar } from './components/KpiBar'
import { CuentasList } from './components/CuentasList'
import { PagosList } from './components/PagosList'
import { CuentaForm } from './components/CuentaForm'
import { MovimientoForm } from './components/MovimientoForm'
import { PagoForm } from './components/PagoForm'
import {
  mesActual,
  proximos7Dias,
  useCuentas,
  useDeletePago,
  usePagos,
  useUpdatePagoEstado,
} from './lib/queries'
import type { Pago, PagoEstado } from './lib/types'

export function TesoreriaPage() {
  const { profile } = useAuth()
  const isAdminFull = profile?.role === 'admin_full'

  const cuentas = useCuentas()
  const [pagosFiltro, setPagosFiltro] = useState<PagoEstado | 'todos'>('pendiente')
  const pagos = usePagos(pagosFiltro)
  const todosPagos = usePagos('todos') // para KPIs

  const updateEstado = useUpdatePagoEstado()
  const deletePago = useDeletePago()

  const [showCuenta, setShowCuenta] = useState(false)
  const [showPago, setShowPago] = useState(false)
  const [movCuentaId, setMovCuentaId] = useState<string | null>(null)

  const kpis = useMemo(() => {
    const list = todosPagos.data ?? []
    const r7 = proximos7Dias()
    const mes = mesActual()
    const totalDisponible = (cuentas.data ?? []).reduce(
      (s, c) => s + Number(c.saldo_actual),
      0,
    )
    const pendientes = list.filter((p) => p.estado === 'pendiente')
    const pagosProximos7d = pendientes
      .filter((p) => p.fecha_vencimiento >= r7.from && p.fecha_vencimiento <= r7.to)
      .reduce((s, p) => s + Number(p.importe), 0)
    const pagosMesActual = pendientes
      .filter((p) => p.fecha_vencimiento >= mes.from && p.fecha_vencimiento <= mes.to)
      .reduce((s, p) => s + Number(p.importe), 0)
    const totalPendiente = pendientes.reduce((s, p) => s + Number(p.importe), 0)
    return { totalDisponible, pagosProximos7d, pagosMesActual, totalPendiente }
  }, [cuentas.data, todosPagos.data])

  const onMarcarPagado = (p: Pago) => {
    updateEstado.mutate({
      id: p.id,
      estado: 'pagado',
      fecha_pago: format(new Date(), 'yyyy-MM-dd'),
    })
  }
  const onCancelar = (p: Pago) => {
    updateEstado.mutate({ id: p.id, estado: 'cancelado', fecha_pago: null })
  }
  const onDelete = (p: Pago) => {
    if (!confirm(`¿Borrar pago a ${p.proveedor}?`)) return
    deletePago.mutate(p.id)
  }

  const loading = cuentas.isLoading || pagos.isLoading
  const error = cuentas.error || pagos.error

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Módulo
        </p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">
          Tesorería
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Cuentas, movimientos y pagos a proveedores.{' '}
          {!isAdminFull && (
            <span className="text-[var(--color-ink-3)]">(Solo lectura)</span>
          )}
        </p>
      </header>

      <div className="mb-6">
        <KpiBar {...kpis} />
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          Error: {(error as Error).message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando tesorería…
        </div>
      ) : (
        <div className="space-y-8">
          <CuentasList
            cuentas={cuentas.data ?? []}
            isAdminFull={isAdminFull}
            onAddCuenta={() => setShowCuenta(true)}
            onAddMovimiento={(cuentaId) => setMovCuentaId(cuentaId)}
          />

          <PagosList
            pagos={pagos.data ?? []}
            estado={pagosFiltro}
            isAdminFull={isAdminFull}
            onChangeEstado={setPagosFiltro}
            onAddPago={() => setShowPago(true)}
            onMarcarPagado={onMarcarPagado}
            onCancelar={onCancelar}
            onDelete={onDelete}
          />
        </div>
      )}

      {isAdminFull && showCuenta && <CuentaForm onClose={() => setShowCuenta(false)} />}
      {isAdminFull && showPago && (
        <PagoForm cuentas={cuentas.data ?? []} onClose={() => setShowPago(false)} />
      )}
      {isAdminFull && movCuentaId && (
        <MovimientoForm
          cuentas={cuentas.data ?? []}
          defaultCuentaId={movCuentaId}
          onClose={() => setMovCuentaId(null)}
        />
      )}
    </div>
  )
}
