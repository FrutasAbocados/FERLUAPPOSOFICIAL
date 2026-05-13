import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import {
  useCategorias,
  useCategoriaCreate,
  useCategoriaDelete,
  useCategoriaUpdate,
} from '../lib/hooks'

const COLORES = [
  '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7',
  '#06b6d4', '#84cc16', '#f97316', '#dc2626', '#0ea5e9',
  '#7c3aed', '#0891b2', '#b91c1c', '#475569', '#0d9488',
  '#db2777', '#65a30d', '#64748b',
]

export function CategoriasModal({ onClose }: { onClose: () => void }) {
  const { data: categorias = [] } = useCategorias()
  const create = useCategoriaCreate()
  const update = useCategoriaUpdate()
  const del    = useCategoriaDelete()

  const [nuevo, setNuevo] = useState({ nombre: '', color: '#64748b' })

  const handleCreate = async () => {
    if (!nuevo.nombre.trim()) {
      toast({ title: 'Falta el nombre', variant: 'error' })
      return
    }
    try {
      await create.mutateAsync({ nombre: nuevo.nombre.trim(), color: nuevo.color, orden: 50 })
      toast({ title: 'Categoría creada', variant: 'success' })
      setNuevo({ nombre: '', color: '#64748b' })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const handleDelete = async (id: string, nombre: string) => {
    const ok = await confirm({
      title: `¿Eliminar “${nombre}”?`,
      description: 'Si hay gastos con esta categoría se quedarán sin categoría.',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    try {
      await del.mutateAsync(id)
      toast({ title: 'Categoría eliminada', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const handleRename = async (id: string, nombre: string) => {
    const trimmed = nombre.trim()
    if (!trimmed) return
    try {
      await update.mutateAsync({ id, patch: { nombre: trimmed } })
    } catch (e: any) {
      toast({ title: 'Error al renombrar', description: e?.message, variant: 'error' })
    }
  }

  const handleColor = async (id: string, color: string) => {
    try {
      await update.mutateAsync({ id, patch: { color } })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    try {
      await update.mutateAsync({ id, patch: { activo } })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="xl">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Gestionar categorías</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 p-5">
        {/* Alta */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <Input
            placeholder="Nueva categoría (ej: Mantenimiento)"
            value={nuevo.nombre}
            onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
            className="h-9 flex-1 min-w-[200px]"
          />
          <ColorPicker value={nuevo.color} onChange={(c) => setNuevo((n) => ({ ...n, color: c }))} />
          <Button size="sm" onClick={handleCreate} disabled={create.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Crear
          </Button>
        </div>

        {/* Lista */}
        <div className="max-h-[60vh] divide-y divide-[var(--color-border)] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
          {categorias.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-[var(--color-ink-3)]">Sin categorías todavía.</div>
          )}
          {categorias.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <ColorPicker value={c.color ?? '#64748b'} onChange={(color) => handleColor(c.id, color)} />
              <Input
                defaultValue={c.nombre}
                onBlur={(e) => {
                  if (e.target.value !== c.nombre) handleRename(c.id, e.target.value)
                }}
                className="h-8 flex-1 min-w-[180px] text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-2)]">
                <input
                  type="checkbox"
                  checked={c.activo}
                  onChange={(e) => toggleActivo(c.id, e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Activa
              </label>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id, c.nombre)} className="text-[var(--coral)] hover:bg-[var(--color-danger-soft)]">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
        <Button onClick={onClose}>Cerrar</Button>
      </footer>
    </Modal>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 rounded-md border border-[var(--color-border)] shadow-sm"
        style={{ backgroundColor: value }}
        aria-label="Cambiar color"
      />
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 grid grid-cols-6 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              className="h-5 w-5 rounded hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
