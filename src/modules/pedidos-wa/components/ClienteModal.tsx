import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_LABEL,
  type ClientePedido,
  type Repartidor,
  type Salida,
  type TipoDocHolded,
  type TipoFactura,
} from '../lib/types'
import {
  useActualizarClientePedido,
  useCrearClientePedido,
  type ClienteInput,
} from '../lib/queries'

const REPARTIDORES: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']
const TIPOS_FACTURA: TipoFactura[] = ['HOLDED', 'DRIVE', 'NINGUNA']

type Props = {
  cliente: ClientePedido | null
  onClose: () => void
  onSaved?: (c: ClientePedido) => void
  /** Nombre prefilled cuando se crea un cliente nuevo desde captura rápida. */
  nombreInicial?: string
}

const EMPTY: ClienteInput = {
  nombre: '',
  repartidor: 'TORRES',
  horario: null,
  tipo_factura: 'HOLDED',
  salida: null,
  subseccion_default: null,
  notas: null,
  holded_contact_id: null,
  holded_doc_type: 'invoice',
  activo: true,
}

function fromCliente(c: ClientePedido | null): ClienteInput {
  if (!c) return EMPTY
  return {
    nombre:             c.nombre,
    repartidor:         c.repartidor,
    horario:            c.horario,
    tipo_factura:       c.tipo_factura,
    salida:             c.salida,
    subseccion_default: c.subseccion_default,
    notas:              c.notas,
    holded_contact_id:  c.holded_contact_id,
    holded_doc_type:    c.holded_doc_type,
    activo:             c.activo,
  }
}

export function ClienteModal({ cliente, onClose, onSaved, nombreInicial }: Props) {
  const editando = !!cliente
  const [form, setForm] = useState<ClienteInput>(() => {
    const base = fromCliente(cliente)
    return cliente ? base : { ...base, nombre: nombreInicial?.trim() ?? '' }
  })

  const crear = useCrearClientePedido()
  const actualizar = useActualizarClientePedido()
  const pending = crear.isPending || actualizar.isPending

  const onGuardar = async () => {
    const nombre = form.nombre.trim()
    if (!nombre) {
      toast({ title: 'El nombre es obligatorio', variant: 'error' })
      return
    }
    if ((form.repartidor === 'GERMAN' || form.repartidor === 'RAUL') && !form.salida) {
      toast({ title: 'En Germán/Raúl indica 1ª o 2ª salida', variant: 'error' })
      return
    }
    try {
      const result = editando
        ? await actualizar.mutateAsync({ id: cliente!.id, patch: form })
        : await crear.mutateAsync(form)
      toast({
        title: editando ? 'Cliente actualizado' : 'Cliente creado',
        variant: 'success',
      })
      onSaved?.(result)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      toast({
        title: editando ? 'No se pudo actualizar' : 'No se pudo crear',
        description: /duplicate|unique/i.test(msg) ? 'Ya existe un cliente con ese nombre.' : msg,
        variant: 'error',
      })
    }
  }

  // Cierra con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      onClick={() => { if (!pending) onClose() }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] shadow-xl md:max-w-xl md:rounded-[var(--radius-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            {editando ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Field label="Nombre *">
            <Input
              value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: BAR LA ESQUINA"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Repartidor *">
              <Select
                value={form.repartidor}
                onChange={(v) => setForm(f => ({
                  ...f,
                  repartidor: v as Repartidor,
                  salida: (v === 'GERMAN' || v === 'RAUL') ? (f.salida ?? 'PRIMERA') : null,
                }))}
              >
                {REPARTIDORES.map(r => (
                  <option key={r} value={r}>{REPARTIDOR_LABEL[r]}</option>
                ))}
              </Select>
            </Field>

            <Field label="Horario">
              <Input
                value={form.horario ?? ''}
                onChange={(e) => setForm(f => ({ ...f, horario: e.target.value || null }))}
                placeholder="08:30"
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo factura">
              <Select
                value={form.tipo_factura}
                onChange={(v) => setForm(f => ({ ...f, tipo_factura: v as TipoFactura }))}
              >
                {TIPOS_FACTURA.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>

            <Field label="Salida">
              <Select
                value={form.salida ?? ''}
                onChange={(v) => setForm(f => ({ ...f, salida: (v || null) as Salida }))}
                disabled={form.repartidor !== 'GERMAN' && form.repartidor !== 'RAUL'}
              >
                <option value="">—</option>
                <option value="PRIMERA">1ª salida</option>
                <option value="SEGUNDA">2ª salida</option>
              </Select>
            </Field>
          </div>

          {form.tipo_factura === 'HOLDED' && (
            <Field
              label="Documento Holded"
              hint="Cuando subas el pedido a Holded, se creará este tipo de documento."
            >
              <Select
                value={form.holded_doc_type ?? ''}
                onChange={(v) => setForm(f => ({ ...f, holded_doc_type: (v || null) as TipoDocHolded | null }))}
              >
                <option value="">— Sin decidir —</option>
                <option value="invoice">Factura (invoice)</option>
                <option value="waybill">Albarán (waybill)</option>
              </Select>
            </Field>
          )}

          <Field label="Sub-sección por defecto" hint="Ej. ANDREA en BLACKBERRY (un sub-comprador del local).">
            <Input
              value={form.subseccion_default ?? ''}
              onChange={(e) => setForm(f => ({ ...f, subseccion_default: e.target.value || null }))}
              placeholder="(opcional)"
            />
          </Field>

          <Field label="Notas (banner rojo permanente)" hint="Ej. COBRAR FACT ANTERIOR · HABLAR CON SALVIO. Se mostrará destacado en el formulario.">
            <textarea
              value={form.notas ?? ''}
              onChange={(e) => setForm(f => ({ ...f, notas: e.target.value || null }))}
              rows={2}
              placeholder="(opcional)"
              className="block w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
          </Field>

          <Field
            label="Vincular a Holded"
            hint="Busca por nombre del contacto en Holded y selecciónalo. Imprescindible para subir pedidos a Holded."
          >
            <HoldedContactPicker
              value={form.holded_contact_id}
              onChange={(v) => setForm(f => ({ ...f, holded_contact_id: v }))}
              nombrePedidoWa={form.nombre}
            />
          </Field>

          {editando && (
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium text-[var(--color-ink)]">Cliente activo</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  Si lo desactivas, no aparece al crear un pedido nuevo, pero se conservan los pedidos antiguos.
                </div>
              </div>
            </label>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function HoldedContactPicker({
  value, onChange, nombrePedidoWa,
}: {
  value: string | null
  onChange: (v: string | null) => void
  /** Nombre del cliente WA — se usa como query inicial para sugerir matches. */
  nombrePedidoWa: string
}) {
  // Resuelve el nombre del contacto vinculado (si hay value)
  const vinculado = useQuery({
    queryKey: ['pedidos_wa', 'holded_contact_byid', value] as const,
    enabled: !!value && value.length >= 20,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre')
        .eq('id', value as string)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; nombre: string } | null
    },
  })

  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')

  // Búsqueda por nombre (solo si el modal está "abierto" o el usuario escribió algo)
  const queryActiva = q.trim().length >= 2
    ? q.trim()
    : (open && !value && nombrePedidoWa.trim().length >= 2 ? nombrePedidoWa.trim() : '')

  const sugerencias = useQuery({
    queryKey: ['pedidos_wa', 'holded_contact_search', queryActiva] as const,
    enabled: queryActiva.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre')
        .ilike('nombre', `%${queryActiva}%`)
        .order('nombre')
        .limit(8)
      if (error) throw error
      return (data ?? []) as Array<{ id: string; nombre: string }>
    },
  })

  if (value) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            {vinculado.isFetching ? (
              <span className="text-[var(--color-ink-3)]">Resolviendo…</span>
            ) : vinculado.data ? (
              <>
                <div className="truncate font-medium text-emerald-900">{vinculado.data.nombre}</div>
                <div className="truncate font-mono text-[10px] text-emerald-700/70">{value}</div>
              </>
            ) : (
              <>
                <div className="text-amber-700">⚠ ID no encontrado en manager_contactos</div>
                <div className="truncate font-mono text-[10px] text-[var(--color-ink-3)]">{value}</div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQ(''); setOpen(true) }}
            className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-white hover:text-rose-600"
            title="Desvincular"
            aria-label="Desvincular"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        placeholder={`Buscar contacto Holded… (sugerencia: "${nombrePedidoWa.slice(0, 30)}")`}
      />
      {open && queryActiva.length >= 2 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {sugerencias.isFetching ? (
            <div className="px-2 py-1.5 text-xs text-[var(--color-ink-3)]">Buscando…</div>
          ) : (sugerencias.data ?? []).length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-amber-700">
              Sin coincidencias en Holded. Crea primero el contacto en Holded o cambia el nombre del cliente WA.
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {(sugerencias.data ?? []).map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(s.id); setQ(''); setOpen(false) }}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="truncate">{s.nombre}</span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-3)]">
                      {s.id.slice(-6)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  )
}

function Select({
  value, onChange, disabled, children,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'block h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {children}
    </select>
  )
}
