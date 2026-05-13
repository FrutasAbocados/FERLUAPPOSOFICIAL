import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import {
  type Fijo,
  type FijoFormInput,
  useFijoCreate,
  useFijoDelete,
  useFijoUpdate,
} from '../lib/hooks'
import { CategoriaPicker } from './CategoriaPicker'
import { ProveedorPicker, type ProveedorValue } from './ProveedorPicker'
import { METODOS_GASTO } from '../lib/constants'

type Props = {
  fijo?: Fijo | null
  onClose: () => void
}

const empty: FijoFormInput = {
  nombre: '',
  importe: 0,
  iva_pct: 21,
  dia_cargo: 1,
  categoria_id: null,
  proveedor_holded_id: null,
  proveedor_manual_id: null,
  metodo_pago: null,
  notas: null,
  activo: true,
}

export function FijoModal({ fijo, onClose }: Props) {
  const create = useFijoCreate()
  const update = useFijoUpdate()
  const del    = useFijoDelete()

  const [form, setForm] = useState<FijoFormInput>(() => {
    if (!fijo) return empty
    const { id: _ignore, ...rest } = fijo
    void _ignore
    return rest
  })

  // Reset si cambia el fijo
  useEffect(() => {
    if (fijo) {
      const { id: _ignore, ...rest } = fijo
      void _ignore
      setForm(rest)
    } else {
      setForm(empty)
    }
  }, [fijo?.id])

  const isEdit = !!fijo
  const total = Math.round(Number(form.importe || 0) * (1 + Number(form.iva_pct || 0) / 100) * 100) / 100

  const proveedorValue: ProveedorValue = {
    holded_id: form.proveedor_holded_id,
    manual_id: form.proveedor_manual_id,
    libre: null,
  }

  const setProveedor = (v: ProveedorValue) => {
    setForm((f) => ({
      ...f,
      proveedor_holded_id: v.holded_id,
      proveedor_manual_id: v.manual_id,
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) {
      toast({ title: 'Falta el nombre', variant: 'error' })
      return
    }
    if (form.importe <= 0) {
      toast({ title: 'Importe debe ser > 0', variant: 'error' })
      return
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: fijo!.id, patch: form })
        toast({ title: 'Fijo actualizado', variant: 'success' })
      } else {
        await create.mutateAsync(form)
        toast({ title: 'Fijo creado', variant: 'success' })
      }
      onClose()
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e?.message, variant: 'error' })
    }
  }

  const onDelete = async () => {
    if (!fijo) return
    const ok = await confirm({
      title: `¿Eliminar “${fijo.nombre}”?`,
      description: 'Se borrará el fijo y todo su historial de pagos.',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    try {
      await del.mutateAsync(fijo.id)
      toast({ title: 'Fijo eliminado', variant: 'success' })
      onClose()
    } catch (e: any) {
      toast({ title: 'Error al eliminar', description: e?.message, variant: 'error' })
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal onClose={onClose} size="lg">
      <form onSubmit={submit} className="flex flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            {isEdit ? 'Editar fijo' : 'Nuevo gasto fijo'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              autoFocus
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Alquiler nave, Leasing furgoneta…"
            />
          </div>

          <div>
            <Label htmlFor="importe">Subtotal (sin IVA)</Label>
            <Input
              id="importe"
              type="number"
              step="0.01"
              value={form.importe}
              onChange={(e) => setForm((f) => ({ ...f, importe: Number(e.target.value) }))}
            />
          </div>

          <div>
            <Label htmlFor="iva">IVA %</Label>
            <Input
              id="iva"
              type="number"
              step="0.5"
              value={form.iva_pct}
              onChange={(e) => setForm((f) => ({ ...f, iva_pct: Number(e.target.value) }))}
            />
          </div>

          <div>
            <Label>Total con IVA</Label>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-semibold tabular-nums text-[var(--color-primary-2)]">
              {total.toFixed(2)} €
            </div>
          </div>

          <div>
            <Label htmlFor="dia">Día del mes (1-31)</Label>
            <Input
              id="dia"
              type="number"
              min={1}
              max={31}
              value={form.dia_cargo}
              onChange={(e) => setForm((f) => ({ ...f, dia_cargo: Math.min(31, Math.max(1, Number(e.target.value))) }))}
            />
          </div>

          <div>
            <Label>Categoría</Label>
            <CategoriaPicker value={form.categoria_id} onChange={(id) => setForm((f) => ({ ...f, categoria_id: id }))} />
          </div>

          <div>
            <Label>Método de pago</Label>
            <select
              value={form.metodo_pago ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value || null }))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="">— Sin especificar —</option>
              {METODOS_GASTO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>Proveedor</Label>
            <ProveedorPicker value={proveedorValue} onChange={setProveedor} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notas">Notas</Label>
            <Input
              id="notas"
              value={form.notas ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value || null }))}
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2 text-sm">
            <input
              id="activo"
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="h-4 w-4"
            />
            <label htmlFor="activo" className="text-[var(--color-ink-2)]">
              Activo (genera alertas y aparece en calendario)
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <div>
            {isEdit && (
              <Button type="button" variant="ghost" onClick={onDelete} disabled={del.isPending} className="text-[#dc2626] hover:bg-[#fee2e2]">
                <Trash2 className="mr-1 h-4 w-4" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{isEdit ? 'Guardar' : 'Crear'}</Button>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
