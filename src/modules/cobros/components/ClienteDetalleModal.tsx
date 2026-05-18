import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckSquare, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { confirm } from '@/shared/lib/confirm'
import { Modal } from './Modal'
import {
  useCobrar,
  useClientes,
  useDeleteMovimiento,
  useMovimientosCliente,
  useUpsertCliente,
} from '../lib/queries'
import { eur, estadoMovimiento, importePendiente, isoDate } from '../lib/utils'
import { METODOS_COBRO } from '../lib/constants'
import { FORMA_PAGO_LABEL } from '../lib/types'
import type { Cliente, FormaPago, MetodoCobro } from '../lib/types'

type Props = {
  clienteId: string | null
  onClose: () => void
  onCobrar: (movId: string) => void
}

export function ClienteDetalleModal({ clienteId, onClose, onCobrar }: Props) {
  const clientes = useClientes()
  const cliente = clientes.data?.find((c) => c.id === clienteId) ?? null

  if (!clienteId || !cliente) {
    return <Modal open={false} onClose={onClose} title="" children={null} />
  }

  return (
    <Modal open={true} onClose={onClose} title={cliente.nombre} maxWidth="max-w-3xl">
      <ClienteDetalleContent
        key={cliente.id}
        cliente={cliente}
        onCobrar={onCobrar}
      />
    </Modal>
  )
}

type ContentProps = {
  cliente: Cliente
  onCobrar: (movId: string) => void
}

function ClienteDetalleContent({ cliente, onCobrar }: ContentProps) {
  const movs = useMovimientosCliente(cliente.id)
  const upsert = useUpsertCliente()
  const del = useDeleteMovimiento()
  const cobrar = useCobrar()

  const [editando, setEditando] = useState(false)
  const [forma, setForma] = useState<FormaPago>(cliente.forma_pago)
  const [metodo, setMetodo] = useState<MetodoCobro | ''>(
    cliente.metodo_cobro_preferido ?? '',
  )
  const [notas, setNotas] = useState(cliente.notas ?? '')
  const [activo, setActivo] = useState(cliente.activo)

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [multiOpen, setMultiOpen] = useState(false)
  const [multiDate, setMultiDate] = useState(isoDate(new Date()))
  const [multiMetodo, setMultiMetodo] = useState<MetodoCobro>(
    (cliente.metodo_cobro_preferido as MetodoCobro) ?? 'Transferencia',
  )
  const [multiLoading, setMultiLoading] = useState(false)

  const ordenados = useMemo(() => {
    return [...(movs.data ?? [])].sort((a, b) =>
      a.fecha_factura > b.fecha_factura ? -1 : 1,
    )
  }, [movs.data])

  const totalPend = ordenados
    .filter((m) => !m.pagado)
    .reduce((s, m) => s + importePendiente(m), 0)

  const cobrables = useMemo(
    () => ordenados.filter((m) => !m.pagado && Number(m.importe) >= 0),
    [ordenados],
  )
  const selectedMovs = cobrables.filter((m) => selectedIds.has(m.id))
  const totalSelected = selectedMovs.reduce((s, m) => s + importePendiente(m), 0)
  const allSelected = cobrables.length > 0 && selectedIds.size === cobrables.length

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setMultiOpen(false)
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(cobrables.map((m) => m.id)))
    setMultiOpen(false)
  }

  const cobrarMulti = async () => {
    setMultiLoading(true)
    for (const m of selectedMovs) {
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
    setSelectedIds(new Set())
    setMultiOpen(false)
  }

  const guardar = async () => {
    await upsert.mutateAsync({
      id: cliente.id,
      nombre: cliente.nombre,
      forma_pago: forma,
      metodo_cobro_preferido: metodo === '' ? null : metodo,
      notas: notas || null,
      activo,
    })
    setEditando(false)
  }

  return (
    <div className="space-y-5">
      <div className="ao-panel flex items-center justify-between p-3">
        <div>
          <div className="label-caps">
            Deuda total
          </div>
          <div className="mono text-2xl font-semibold tabular-nums text-[var(--color-ink)]">
            {eur(totalPend)}
          </div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            {ordenados.filter((m) => !m.pagado).length} pendientes ·{' '}
            {ordenados.filter((m) => m.pagado).length} cobradas
          </div>
        </div>
        <div className="text-right text-xs text-[var(--color-ink-2)]">
          <div>{FORMA_PAGO_LABEL[cliente.forma_pago]}</div>
          <div>{cliente.metodo_cobro_preferido ?? '—'}</div>
        </div>
      </div>

      {/* Datos editables */}
      <div className="ao-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Datos del cliente</h4>
          {!editando ? (
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={guardar} disabled={upsert.isPending}>
                {upsert.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Guardar
              </Button>
            </div>
          )}
        </div>
        {editando ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Forma de pago</Label>
              <select
                value={forma}
                onChange={(e) => setForma(e.target.value as FormaPago)}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
              >
                {(Object.keys(FORMA_PAGO_LABEL) as FormaPago[]).map((k) => (
                  <option key={k} value={k}>
                    {FORMA_PAGO_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Método preferido</Label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoCobro | '')}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
              >
                <option value="">—</option>
                {METODOS_COBRO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Notas</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Activo
            </label>
          </div>
        ) : (
          <div className="text-xs text-[var(--color-ink-2)]">
            {cliente.notas ? cliente.notas : <em>Sin notas</em>}
          </div>
        )}
      </div>

      {/* Histórico */}
      <div>
        <h4 className="mb-2 text-sm font-semibold">
          Histórico ({ordenados.length})
        </h4>
        <div className="max-h-80 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[rgba(255,255,255,.015)]">
          <table className="w-full text-xs">
            <thead className="bg-[rgba(255,255,255,.025)] text-[var(--color-ink-2)]">
              <tr>
                <th className="w-7 px-2 py-1.5 text-center">
                  {cobrables.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="cursor-pointer accent-[var(--mint)]"
                      title="Seleccionar todas las pendientes"
                    />
                  )}
                </th>
                <th className="px-2 py-1.5 text-left">Fecha</th>
                <th className="px-2 py-1.5 text-left">Tipo</th>
                <th className="px-2 py-1.5 text-left">Nº / Concepto</th>
                <th className="px-2 py-1.5 text-right">Importe</th>
                <th className="px-2 py-1.5 text-right">Pendiente</th>
                <th className="px-2 py-1.5 text-left">Estado</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((m) => {
                const e = estadoMovimiento(m)
                const tone = m.pagado
                  ? 'text-[var(--color-ink-3)]'
                  : e === 'Vencido'
                    ? 'text-[var(--coral)]'
                    : e === 'Próximo'
                      ? 'text-[var(--amber)]'
                      : 'text-[var(--mint)]'
                const cobrable = !m.pagado && Number(m.importe) >= 0
                const isSelected = selectedIds.has(m.id)
                return (
                  <tr
                    key={m.id}
                    className={`border-t border-[var(--color-border)] ${isSelected ? 'bg-[rgba(var(--mint-rgb,100,220,160),.08)]' : ''}`}
                  >
                    <td className="px-2 py-1.5 text-center">
                      {cobrable && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(m.id)}
                          className="cursor-pointer accent-[var(--mint)]"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {format(parseISO(m.fecha_factura), 'dd/MM/yy')}
                    </td>
                    <td className="px-2 py-1.5">{m.tipo}</td>
                    <td className="px-2 py-1.5">
                      {m.numero_factura ?? m.concepto ?? '—'}
                    </td>
                    <td className="mono px-2 py-1.5 text-right tabular-nums">{eur(Number(m.importe))}</td>
                    <td className="mono px-2 py-1.5 text-right tabular-nums">
                      {m.pagado ? '—' : eur(importePendiente(m))}
                    </td>
                    <td className={`px-2 py-1.5 ${tone}`}>
                      {Number(m.importe) < 0 ? 'Abono' : e}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {cobrable && (
                        <button
                          onClick={() => onCobrar(m.id)}
                          className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary-2)] hover:underline"
                        >
                          Cobrar
                        </button>
                      )}
                      {m.tipo === 'Pizarra' && !m.pagado && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: '¿Borrar esta deuda de pizarra?',
                              confirmLabel: 'Borrar',
                              variant: 'danger',
                            })
                            if (ok) await del.mutateAsync(m.id)
                          }}
                          className="ml-2 text-[var(--color-ink-3)] hover:text-[var(--coral)]"
                          aria-label="Borrar"
                        >
                          <Trash2 className="inline h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Barra multi-cobro */}
        {selectedIds.size > 0 && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--mint)] bg-[rgba(var(--mint-rgb,100,220,160),.07)] p-3">
            {!multiOpen ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--mint)]">
                  <CheckSquare className="h-4 w-4" />
                  {selectedIds.size} {selectedIds.size === 1 ? 'factura seleccionada' : 'facturas seleccionadas'} ·{' '}
                  <span className="mono tabular-nums">{eur(totalSelected)}</span>
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Deseleccionar
                  </Button>
                  <Button size="sm" onClick={() => setMultiOpen(true)}>
                    Cobrar {selectedIds.size > 1 ? `${selectedIds.size} facturas` : 'factura'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Cobrar {selectedIds.size} {selectedIds.size === 1 ? 'factura' : 'facturas'} ·{' '}
                  <span className="mono tabular-nums text-[var(--mint)]">{eur(totalSelected)}</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="multi-fecha">Fecha de cobro</Label>
                    <Input
                      id="multi-fecha"
                      type="date"
                      value={multiDate}
                      onChange={(e) => setMultiDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="multi-metodo">Método</Label>
                    <select
                      id="multi-metodo"
                      value={multiMetodo}
                      onChange={(e) => setMultiMetodo(e.target.value as MetodoCobro)}
                      className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                    >
                      {METODOS_COBRO.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-ink-3)]">
                  Cada factura se marcará como cobrada por su importe pendiente completo.
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
      </div>
    </div>
  )
}
