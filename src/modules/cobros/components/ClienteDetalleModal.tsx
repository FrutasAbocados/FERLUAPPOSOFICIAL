import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { confirm } from '@/shared/lib/confirm'
import { Modal } from './Modal'
import {
  useClientes,
  useDeleteMovimiento,
  useMovimientosCliente,
  useUpsertCliente,
} from '../lib/queries'
import { eur, estadoMovimiento, importePendiente } from '../lib/utils'
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

  const [editando, setEditando] = useState(false)
  const [forma, setForma] = useState<FormaPago>(cliente.forma_pago)
  const [metodo, setMetodo] = useState<MetodoCobro | ''>(
    cliente.metodo_cobro_preferido ?? '',
  )
  const [notas, setNotas] = useState(cliente.notas ?? '')
  const [activo, setActivo] = useState(cliente.activo)

  const ordenados = useMemo(() => {
    return [...(movs.data ?? [])].sort((a, b) =>
      a.fecha_factura > b.fecha_factura ? -1 : 1,
    )
  }, [movs.data])

  const totalPend = ordenados
    .filter((m) => !m.pagado)
    .reduce((s, m) => s + importePendiente(m), 0)

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
      <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
            Deuda total
          </div>
          <div className="font-display text-2xl font-bold text-[var(--color-ink)]">
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
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
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
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
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
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
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
        <div className="max-h-80 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-2)]">
              <tr>
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
                    ? 'text-red-700'
                    : e === 'Próximo'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                const cobrable = !m.pagado && Number(m.importe) >= 0
                return (
                  <tr
                    key={m.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-2 py-1.5">
                      {format(parseISO(m.fecha_factura), 'dd/MM/yy')}
                    </td>
                    <td className="px-2 py-1.5">{m.tipo}</td>
                    <td className="px-2 py-1.5">
                      {m.numero_factura ?? m.concepto ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right">{eur(Number(m.importe))}</td>
                    <td className="px-2 py-1.5 text-right">
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
                          className="ml-2 text-[var(--color-ink-3)] hover:text-red-600"
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
      </div>
    </div>
  )
}
