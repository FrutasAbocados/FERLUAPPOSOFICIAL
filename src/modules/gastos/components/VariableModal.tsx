import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import {
  type Variable,
  type VariableFormInput,
  useVariableCreate,
  useVariableDelete,
  useVariableUpdate,
} from '../lib/hooks'
import { CategoriaPicker } from './CategoriaPicker'
import { ProveedorPicker, type ProveedorValue } from './ProveedorPicker'

type Props = {
  variable?: Variable | null
  onClose: () => void
}

const METODOS = ['domiciliado', 'transferencia', 'tarjeta', 'efectivo']

const empty = (): VariableFormInput => ({
  fecha: format(new Date(), 'yyyy-MM-dd'),
  categoria_id: null,
  proveedor_holded_id: null,
  proveedor_manual_id: null,
  proveedor_libre: null,
  subtotal: 0,
  iva_pct: 21,
  descripcion: null,
  metodo_pago: null,
})

export function VariableModal({ variable, onClose }: Props) {
  const create = useVariableCreate()
  const update = useVariableUpdate()
  const del    = useVariableDelete()

  const [form, setForm] = useState<VariableFormInput>(() => {
    if (!variable) return empty()
    const { id: _id, total: _t, ...rest } = variable
    void _id; void _t
    return rest
  })

  useEffect(() => {
    if (variable) {
      const { id: _id, total: _t, ...rest } = variable
      void _id; void _t
      setForm(rest)
    } else {
      setForm(empty())
    }
  }, [variable?.id])

  const isEdit = !!variable
  const total = Math.round(Number(form.subtotal || 0) * (1 + Number(form.iva_pct || 0) / 100) * 100) / 100

  const proveedorValue: ProveedorValue = {
    holded_id: form.proveedor_holded_id,
    manual_id: form.proveedor_manual_id,
    libre: form.proveedor_libre,
  }
  const setProveedor = (v: ProveedorValue) => {
    setForm((f) => ({
      ...f,
      proveedor_holded_id: v.holded_id,
      proveedor_manual_id: v.manual_id,
      proveedor_libre: v.libre,
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.fecha) {
      toast({ title: 'Falta la fecha', variant: 'error' })
      return
    }
    if (form.subtotal < 0) {
      toast({ title: 'Subtotal inválido', variant: 'error' })
      return
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: variable!.id, patch: form })
        toast({ title: 'Gasto actualizado', variant: 'success' })
      } else {
        await create.mutateAsync(form)
        toast({ title: 'Gasto creado', variant: 'success' })
      }
      onClose()
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e?.message, variant: 'error' })
    }
  }

  const onDelete = async () => {
    if (!variable) return
    const ok = await confirm({ title: '¿Eliminar este gasto?', variant: 'danger', confirmLabel: 'Eliminar' })
    if (!ok) return
    try {
      await del.mutateAsync(variable.id)
      toast({ title: 'Gasto eliminado', variant: 'success' })
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
            {isEdit ? 'Editar gasto' : 'Nuevo gasto variable'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
          </div>

          <div>
            <Label>Categoría</Label>
            <CategoriaPicker value={form.categoria_id} onChange={(id) => setForm((f) => ({ ...f, categoria_id: id }))} />
          </div>

          <div>
            <Label htmlFor="subtotal">Subtotal (sin IVA)</Label>
            <Input
              id="subtotal"
              type="number"
              step="0.01"
              autoFocus={!isEdit}
              value={form.subtotal}
              onChange={(e) => setForm((f) => ({ ...f, subtotal: Number(e.target.value) }))}
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
            <Label>Método de pago</Label>
            <select
              value={form.metodo_pago ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value || null }))}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="">— Sin especificar —</option>
              {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>Proveedor (Holded / manual / libre)</Label>
            <ProveedorPicker value={proveedorValue} onChange={setProveedor} allowLibre />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="desc">Descripción</Label>
            <Input
              id="desc"
              value={form.descripcion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value || null }))}
              placeholder="Detalle del gasto"
            />
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
