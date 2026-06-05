import { useState } from 'react'
import { X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import type { ProductoListItem } from '../lib/types'
import { useSetCosteManual, useSetCosteManualNombre } from '../lib/queries'

type Props = {
  producto: ProductoListItem
  onClose: () => void
}

/** Modal mínimo para asignar coste manual desde la lista, sin abrir el detalle completo. */
export function CosteManualQuickFix({ producto, onClose }: Props) {
  const byName = !producto.product_id
  const productNombre = producto.nombre
  const today = new Date().toISOString().slice(0, 10)
  const [valor, setValor] = useState<string>(producto.coste_unidad != null ? String(producto.coste_unidad) : '')
  const [nota, setNota] = useState('')
  const [fechaDesde, setFechaDesde] = useState(today)
  const setId = useSetCosteManual()
  const setNombre = useSetCosteManualNombre()
  const pending = setId.isPending || setNombre.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Coste inválido', variant: 'error' })
      return
    }
    try {
      if (byName) {
        await setNombre.mutateAsync({ nombre: productNombre, coste_eur: n, nota: nota || null })
      } else {
        await setId.mutateAsync({ product_id: producto.product_id!, fecha_desde: fechaDesde, coste_eur: n, nota: nota || null })
      }
      toast({ title: 'Coste asignado', variant: 'success' })
      onClose()
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-display text-sm font-bold text-[var(--color-ink)]">Asignar coste manual</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <div className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-ink-2)]">
            <div className="font-semibold text-[var(--color-ink)]">{productNombre}</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">
              {byName
                ? 'Producto sin enlace a Holded (factura PDF). Se fija el coste por nombre y manda sobre el cálculo automático.'
                : 'Anula el cálculo automático (media 4 últimas compras). De aquí en adelante el sistema usa este coste.'}
            </div>
          </div>
          {!byName && (
            <div>
              <Label htmlFor="fecha_desde">Vigente desde</Label>
              <Input
                id="fecha_desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="coste">Coste por unidad (€)</Label>
            <Input
              id="coste"
              type="number"
              step="0.01"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej: 1.85"
            />
          </div>
          <div>
            <Label htmlFor="nota">Nota (opcional)</Label>
            <Input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Origen, contexto, etc." />
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={pending}>Guardar</Button>
        </footer>
      </form>
    </Modal>
  )
}
