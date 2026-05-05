import { useState } from 'react'
import { X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import { useSetCosteManual } from '../lib/queries'

type Props = {
  productId: string
  productNombre: string
  costeActual?: number | null
  onClose: () => void
}

/** Modal mínimo para asignar coste manual desde la lista, sin abrir el detalle completo. */
export function CosteManualQuickFix({ productId, productNombre, costeActual, onClose }: Props) {
  const [valor, setValor] = useState<string>(costeActual != null ? String(costeActual) : '')
  const [nota, setNota] = useState('')
  const set = useSetCosteManual()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(valor)
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Coste inválido', variant: 'error' })
      return
    }
    try {
      await set.mutateAsync({ product_id: productId, coste_eur: n, nota: nota || null })
      toast({ title: 'Coste asignado', variant: 'success' })
      onClose()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
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
              Anula el cálculo automático (media 4 últimas compras). De aquí en adelante el sistema usa este coste.
            </div>
          </div>
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
          <Button type="submit" disabled={set.isPending}>Guardar</Button>
        </footer>
      </form>
    </Modal>
  )
}
