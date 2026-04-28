import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCreateTarea, useEmpleadosList, useUpdateTarea } from '../lib/queries'
import { PRIORIDAD_LABEL, type Tarea, type TareaInput, type TareaPrioridad } from '../lib/types'

type Props = {
  tarea: Tarea | null
  onClose: () => void
}

export function TareaForm({ tarea, onClose }: Props) {
  const empleados = useEmpleadosList()
  const create = useCreateTarea()
  const update = useUpdateTarea()
  const isEdit = tarea !== null

  const [form, setForm] = useState<TareaInput>(() =>
    tarea
      ? {
          titulo: tarea.titulo,
          descripcion: tarea.descripcion,
          prioridad: tarea.prioridad,
          asignado_a: tarea.asignado_a,
          categoria: tarea.categoria,
          fecha_vencimiento: tarea.fecha_vencimiento,
        }
      : {
          titulo: '',
          descripcion: null,
          prioridad: 'media',
          asignado_a: null,
          categoria: null,
          fecha_vencimiento: null,
        },
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = form.titulo.trim()
    if (!t) return
    const payload = { ...form, titulo: t }
    if (isEdit && tarea) {
      await update.mutateAsync({ id: tarea.id, patch: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  const pending = create.isPending || update.isPending
  const error = create.error || update.error

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--color-bg)] shadow-2xl md:rounded-[var(--radius-xl)]">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <Field label="Título">
              <Input
                autoFocus
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej. Llamar proveedor de cajas"
                required
              />
            </Field>

            <Field label="Descripción (opcional)">
              <textarea
                value={form.descripcion ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcion: e.target.value || null }))
                }
                rows={3}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition-colors focus-visible:border-[var(--color-primary)]"
                placeholder="Detalles, contexto, links…"
              />
            </Field>

            <Field label="Prioridad">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PRIORIDAD_LABEL) as TareaPrioridad[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, prioridad: p }))}
                    className={
                      'rounded-[var(--radius-md)] border px-3 py-2 text-xs font-bold transition-colors ' +
                      (form.prioridad === p
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]')
                    }
                  >
                    {PRIORIDAD_LABEL[p]}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Asignado a (opcional)">
              <select
                value={form.asignado_a ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, asignado_a: e.target.value || null }))
                }
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-primary)]"
              >
                <option value="">— Sin asignar —</option>
                {(empleados.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.alias ? ` (${e.alias})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría (opcional)">
                <Input
                  value={form.categoria ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoria: e.target.value || null }))
                  }
                  placeholder="proveedores, almacén…"
                />
              </Field>
              <Field label="Vencimiento (opcional)">
                <Input
                  type="date"
                  value={form.fecha_vencimiento ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_vencimiento: e.target.value || null }))
                  }
                />
              </Field>
            </div>

            {error && (
              <p className="text-xs text-[var(--color-danger)]">
                {(error as Error).message}
              </p>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !form.titulo.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar' : 'Crear tarea'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
