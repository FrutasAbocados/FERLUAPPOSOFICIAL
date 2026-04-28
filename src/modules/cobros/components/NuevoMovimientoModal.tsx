import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Modal } from './Modal'
import { useClientes, useCreateMovimiento, useUpsertCliente } from '../lib/queries'
import { isoDate, calcVencimiento } from '../lib/utils'
import { FORMA_PAGO_LABEL } from '../lib/types'
import type { FormaPago, TipoMovimiento } from '../lib/types'

type Props = {
  open: boolean
  tipo: TipoMovimiento
  clienteId: string | null // null = autocomplete con creación
  onClose: () => void
}

export function NuevoMovimientoModal({ open, tipo, clienteId, onClose }: Props) {
  const title = tipo === 'Factura' ? 'Nueva factura' : 'Nueva deuda de pizarra'
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <NuevoMovimientoForm tipo={tipo} clienteId={clienteId} onClose={onClose} />
    </Modal>
  )
}

type FormProps = {
  tipo: TipoMovimiento
  clienteId: string | null
  onClose: () => void
}

function NuevoMovimientoForm({ tipo, clienteId, onClose }: FormProps) {
  const clientes = useClientes()
  const create = useCreateMovimiento()
  const upsertCliente = useUpsertCliente()

  const [clienteSel, setClienteSel] = useState<string>(clienteId ?? '')
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoForma, setNuevoForma] = useState<FormaPago>('Contado')

  const [numFactura, setNumFactura] = useState('')
  const [fechaFactura, setFechaFactura] = useState(isoDate(new Date()))
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')

  const cliente = clientes.data?.find((c) => c.id === clienteSel) ?? null
  const formaActiva: FormaPago = nuevoCliente ? nuevoForma : (cliente?.forma_pago ?? 'Contado')
  const fechaVencimiento = calcVencimiento(new Date(fechaFactura), formaActiva)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importe.replace(',', '.'))
    if (!Number.isFinite(imp) || imp <= 0) return

    let cid = clienteSel
    if (nuevoCliente) {
      if (!nuevoNombre.trim()) return
      const c = await upsertCliente.mutateAsync({
        nombre: nuevoNombre,
        forma_pago: nuevoForma,
      })
      cid = c.id
    }
    if (!cid) return

    await create.mutateAsync({
      cliente_id: cid,
      forma_pago_cliente: formaActiva,
      tipo,
      numero_factura: tipo === 'Factura' ? numFactura.trim() || null : null,
      fecha_factura: fechaFactura,
      importe: imp,
      fecha_vencimiento: fechaVencimiento,
      concepto: concepto.trim() || null,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Cliente */}
      <div className="space-y-1">
        <Label>Cliente</Label>
        {nuevoCliente ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Nombre del cliente nuevo"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              required
            />
            <select
              value={nuevoForma}
              onChange={(e) => setNuevoForma(e.target.value as FormaPago)}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
            >
              {(Object.keys(FORMA_PAGO_LABEL) as FormaPago[]).map((k) => (
                <option key={k} value={k}>
                  {FORMA_PAGO_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="col-span-full text-left text-xs text-[var(--color-primary-2)] underline"
              onClick={() => setNuevoCliente(false)}
            >
              ← Elegir cliente existente
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={clienteSel}
              onChange={(e) => setClienteSel(e.target.value)}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
              required
            >
              <option value="">Selecciona…</option>
              {(clientes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {FORMA_PAGO_LABEL[c.forma_pago]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setNuevoCliente(true)}
            >
              + Nuevo
            </Button>
          </div>
        )}
      </div>

      {tipo === 'Factura' && (
        <div className="space-y-1">
          <Label htmlFor="num">Nº factura</Label>
          <Input
            id="num"
            value={numFactura}
            onChange={(e) => setNumFactura(e.target.value)}
            placeholder="F261707"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ff">Fecha</Label>
          <Input
            id="ff"
            type="date"
            value={fechaFactura}
            onChange={(e) => setFechaFactura(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp">Importe (€)</Label>
          <Input
            id="imp"
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-2 text-[11px] text-[var(--color-ink-2)]">
        Forma de pago: <strong>{FORMA_PAGO_LABEL[formaActiva]}</strong> · vence{' '}
        <strong>{isoDate(fechaVencimiento)}</strong>
      </div>

      {tipo === 'Pizarra' && (
        <div className="space-y-1">
          <Label htmlFor="con">Concepto</Label>
          <Input
            id="con"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Cajas + bandejas"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending || upsertCliente.isPending}>
          {(create.isPending || upsertCliente.isPending) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Guardar
        </Button>
      </div>
    </form>
  )
}
