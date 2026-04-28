import { useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCreatePago } from '../lib/queries'
import type { CuentaConSaldo } from '../lib/types'
import { ModalShell, Field } from './CuentaForm'

type Props = {
  cuentas: CuentaConSaldo[]
  onClose: () => void
}

export function PagoForm({ cuentas, onClose }: Props) {
  const [proveedor, setProveedor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState(0)
  const [vencimiento, setVencimiento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [cuentaId, setCuentaId] = useState<string>('')
  const [notas, setNotas] = useState('')
  const create = useCreatePago()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = proveedor.trim()
    if (!p || importe <= 0) return
    await create.mutateAsync({
      proveedor: p,
      concepto: concepto.trim() || null,
      importe,
      fecha_vencimiento: vencimiento,
      cuenta_id: cuentaId || null,
      notas: notas.trim() || null,
    })
    onClose()
  }

  return (
    <ModalShell title="Nuevo pago a proveedor" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Proveedor">
          <Input
            autoFocus
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Ej. Mercabarna - Frutas Carmen"
            required
          />
        </Field>

        <Field label="Concepto (opcional)">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Factura 0125-2026"
          />
        </Field>

        <Field label="Importe (€)">
          <Input
            type="number"
            inputMode="decimal"
            step={0.01}
            min={0.01}
            value={importe}
            onChange={(e) => setImporte(parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="text-right tabular-nums"
            required
          />
        </Field>

        <Field label="Fecha de vencimiento">
          <Input
            type="date"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            required
          />
        </Field>

        <Field label="Cuenta (opcional)">
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-primary)]"
          >
            <option value="">— Sin asignar —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition-colors focus-visible:border-[var(--color-primary)]"
          />
        </Field>

        {create.error && (
          <p className="text-xs text-[var(--color-danger)]">
            {(create.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={create.isPending || !proveedor.trim() || importe <= 0}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear pago
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
