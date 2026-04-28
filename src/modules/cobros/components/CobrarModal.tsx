import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Modal } from './Modal'
import { useCobrar, useMovimientos } from '../lib/queries'
import { eur, importePendiente, isoDate } from '../lib/utils'
import type { MetodoCobro, Movimiento } from '../lib/types'

type Props = {
  movimientoId: string | null
  onClose: () => void
}

const METODOS: MetodoCobro[] = ['Efectivo', 'Transferencia', 'Bizum', 'Otro']

export function CobrarModal({ movimientoId, onClose }: Props) {
  const movs = useMovimientos()
  const m = movs.data?.find((x) => x.id === movimientoId) ?? null

  if (!movimientoId || !m) {
    return <Modal open={false} onClose={onClose} title="" children={null} />
  }

  return (
    <Modal open={true} onClose={onClose} title="Marcar cobrado">
      <CobrarForm key={m.id} movimiento={m} onClose={onClose} />
    </Modal>
  )
}

type FormProps = {
  movimiento: Movimiento
  onClose: () => void
}

function CobrarForm({ movimiento: m, onClose }: FormProps) {
  const cobrar = useCobrar()
  const pend = importePendiente(m)

  const [fecha, setFecha] = useState(isoDate(new Date()))
  const [importe, setImporte] = useState(pend.toFixed(2))
  const [metodo, setMetodo] = useState<MetodoCobro>(
    (m.metodo_cobro ?? 'Transferencia') as MetodoCobro,
  )
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const imp = parseFloat(importe.replace(',', '.'))
    if (!Number.isFinite(imp) || imp <= 0) {
      setError('El importe debe ser mayor que 0.')
      return
    }
    if (imp - pend > 0.005) {
      setError(`No puedes cobrar más de lo pendiente (${eur(pend)}).`)
      return
    }
    setError(null)
    await cobrar.mutateAsync({
      id: m.id,
      fecha_cobro: fecha,
      importe_cobrado: Number(m.importe_cobrado ?? 0) + imp,
      metodo_cobro: metodo,
      importe_total: Number(m.importe),
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3 text-sm">
        <div className="text-xs text-[var(--color-ink-3)]">
          {m.numero_factura ?? (m.tipo === 'Pizarra' ? 'Deuda de pizarra' : 'Sin nº')}
        </div>
        <div className="font-display text-lg font-bold">{eur(pend)}</div>
        <div className="text-[11px] text-[var(--color-ink-3)]">pendiente de {eur(Number(m.importe))}</div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="fecha">Fecha de cobro</Label>
        <Input
          id="fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp">Importe cobrado (€)</Label>
        <Input
          id="imp"
          inputMode="decimal"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          required
        />
        <p className="text-[11px] text-[var(--color-ink-3)]">
          Si es menor que el pendiente queda como cobro parcial.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="met">Método</Label>
        <select
          id="met"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoCobro)}
          className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        >
          {METODOS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={cobrar.isPending}>
          {cobrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirmar cobro
        </Button>
      </div>
    </form>
  )
}
