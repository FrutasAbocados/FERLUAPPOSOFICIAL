import { useState } from 'react'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCreateMovimiento } from '../lib/queries'
import type { CuentaConSaldo } from '../lib/types'
import { ModalShell, Field } from './CuentaForm'

type Props = {
  cuentas: CuentaConSaldo[]
  defaultCuentaId: string | null
  onClose: () => void
}

export function MovimientoForm({ cuentas, defaultCuentaId, onClose }: Props) {
  const [cuentaId, setCuentaId] = useState(defaultCuentaId ?? cuentas[0]?.id ?? '')
  const [direction, setDirection] = useState<'entrada' | 'salida'>('salida')
  const [importe, setImporte] = useState(0)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState('')
  const create = useCreateMovimiento()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuentaId || !concepto.trim() || importe <= 0) return
    const signed = direction === 'entrada' ? importe : -importe
    await create.mutateAsync({
      cuenta_id: cuentaId,
      fecha,
      importe: signed,
      concepto: concepto.trim(),
      categoria: categoria.trim() || null,
    })
    onClose()
  }

  return (
    <ModalShell title="Nuevo movimiento" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Cuenta">
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-primary)]"
            required
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de movimiento">
          <div className="grid grid-cols-2 gap-2">
            <DirBtn active={direction === 'entrada'} onClick={() => setDirection('entrada')}>
              + Ingreso
            </DirBtn>
            <DirBtn active={direction === 'salida'} onClick={() => setDirection('salida')}>
              − Gasto
            </DirBtn>
          </div>
        </Field>

        <Field label="Importe (€)">
          <Input
            type="number"
            inputMode="decimal"
            step={0.01}
            min={0}
            value={importe}
            onChange={(e) => setImporte(Math.abs(parseFloat(e.target.value) || 0))}
            onFocus={(e) => e.target.select()}
            className="text-right tabular-nums"
            required
          />
        </Field>

        <Field label="Fecha">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </Field>

        <Field label="Concepto">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Pago a Mercabarna 15-abr"
            required
          />
        </Field>

        <Field label="Categoría (opcional)">
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ej. compras, transferencia, sueldo…"
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
            disabled={create.isPending || !cuentaId || importe <= 0 || !concepto.trim()}
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar movimiento
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function DirBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-[var(--radius-md)] border px-3 py-2 text-sm font-bold transition-colors ' +
        (active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]')
      }
    >
      {children}
    </button>
  )
}
