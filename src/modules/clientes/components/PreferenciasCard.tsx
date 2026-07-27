import { useState } from 'react'
import { ClipboardList, MapPin, Pencil, Phone, Plus, Save, Trash2, Truck, X } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { enPausa, type Preferencias, usePreferencias, useSetPreferencias } from '../lib/hooks'

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

type Form = {
  hora_preferida: string
  dia_preferido: string
  telefono: string
  direccion: string
  en_pausa_desde: string
  en_pausa_hasta: string
  notas: string
  notas_reparto: string
}

const empty: Form = {
  hora_preferida: '', dia_preferido: '', telefono: '', direccion: '',
  en_pausa_desde: '', en_pausa_hasta: '', notas: '', notas_reparto: '',
}

function fromPrefs(p: Preferencias | null | undefined): Form {
  if (!p) return empty
  return {
    hora_preferida: p.hora_preferida ?? '',
    dia_preferido:  p.dia_preferido  ?? '',
    telefono:       p.telefono       ?? '',
    direccion:      p.direccion      ?? '',
    en_pausa_desde: p.en_pausa_desde ?? '',
    en_pausa_hasta: p.en_pausa_hasta ?? '',
    notas:          p.notas          ?? '',
    notas_reparto:  (p.tags ?? []).join('\n'),
  }
}

const lineasArray = (s: string) => s
  .split(/\r?\n/)
  .map(linea => linea.trim().replace(/^[-•]\s*/, ''))
  .filter(Boolean)

export function PreferenciasCard({ name }: { name: string }) {
  const { data: prefs } = usePreferencias(name)
  return <PreferenciasCardInner key={`${name}-${prefs?.updated_at ?? 'empty'}`} name={name} prefs={prefs} />
}

function PreferenciasCardInner({ name, prefs }: { name: string; prefs: Preferencias | null | undefined }) {
  const set = useSetPreferencias()
  const [form, setForm] = useState<Form>(() => fromPrefs(prefs))
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState<'operativas' | 'reparto' | null>(null)

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const rangoInvalido = !!form.en_pausa_desde && !!form.en_pausa_hasta && form.en_pausa_hasta < form.en_pausa_desde

  const guardar = async () => {
    if (rangoInvalido) {
      toast({ title: 'Las vacaciones acaban antes de empezar', description: 'Revisa las fechas.', variant: 'error' })
      return
    }
    try {
      await set.mutateAsync({
        contact_name_canon: name,
        patch: {
          hora_preferida: form.hora_preferida || null,
          dia_preferido:  form.dia_preferido  || null,
          telefono:       form.telefono.trim() || null,
          direccion:      form.direccion.trim() || null,
          en_pausa_desde: form.en_pausa_desde || null,
          en_pausa_hasta: form.en_pausa_hasta || null,
          notas:          form.notas          || null,
          tags:           lineasArray(form.notas_reparto),
        },
      })
      toast({ title: 'Preferencias guardadas', variant: 'success' })
      setDirty(false)
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const pausaActiva = enPausa(form.en_pausa_desde || null, form.en_pausa_hasta || null, hoy)
  // Vacaciones apuntadas para más adelante: aún no ocultan al cliente del seguimiento.
  const pausaProgramada = !pausaActiva && !!form.en_pausa_desde && form.en_pausa_desde > hoy
  const hayPausa = !!form.en_pausa_desde || !!form.en_pausa_hasta

  const notasOperativas = lineasArray(form.notas)
  const notasReparto = lineasArray(form.notas_reparto)

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Preferencias operativas
          {pausaActiva && <span className="ao-chip ao-chip-amber ml-2">EN PAUSA</span>}
          {pausaProgramada && <span className="ao-chip ml-2">PAUSA PROGRAMADA</span>}
        </h3>
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || set.isPending} onClick={guardar}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Guardar
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
        <div>
          <Label htmlFor="telefono">Teléfono</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input id="telefono" type="tel" inputMode="tel" value={form.telefono} onChange={(e) => update({ telefono: e.target.value })} placeholder="Ej: 622533597" className="pl-8" />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="direccion">Dirección</Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input id="direccion" value={form.direccion} onChange={(e) => update({ direccion: e.target.value })} placeholder="Calle, número, población…" className="pl-8" />
          </div>
        </div>
        <div>
          <Label htmlFor="hora">Hora preferida entrega</Label>
          <Input id="hora" value={form.hora_preferida} onChange={(e) => update({ hora_preferida: e.target.value })} placeholder="Ej: 09:30" />
        </div>
        <div>
          <Label htmlFor="dia">Día preferido</Label>
          <select
            id="dia"
            value={form.dia_preferido}
            onChange={(e) => update({ dia_preferido: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="">— sin definir —</option>
            {DIAS.filter(Boolean).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label htmlFor="pausa-desde">Vacaciones del cliente (no se le llama en esas fechas)</Label>
            {/* Un <input type=date> nativo no se puede vaciar desde móvil: sin este
                botón, quien se equivoca al poner las vacaciones no puede quitarlas. */}
            {hayPausa && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => update({ en_pausa_desde: '', en_pausa_hasta: '' })}
                className="shrink-0 border border-[var(--color-border)] text-[var(--coral)] hover:border-[var(--coral)]"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Quitar vacaciones
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-[var(--color-ink-3)]">Desde</span>
              <Input
                id="pausa-desde"
                type="date"
                value={form.en_pausa_desde}
                onChange={(e) => update({ en_pausa_desde: e.target.value })}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-[var(--color-ink-3)]">Hasta</span>
              <Input
                id="pausa-hasta"
                type="date"
                value={form.en_pausa_hasta}
                min={form.en_pausa_desde || undefined}
                onChange={(e) => update({ en_pausa_hasta: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          {rangoInvalido && (
            <p className="mt-1 text-xs text-[var(--coral)]">
              La fecha de fin es anterior a la de inicio.
            </p>
          )}
          {!rangoInvalido && hayPausa && !form.en_pausa_hasta && (
            <p className="mt-1 text-xs text-[var(--color-ink-3)]">
              Sin fecha de fin, el cliente queda en pausa indefinidamente.
            </p>
          )}
        </div>

        {/* Información práctica separada por uso */}
        <div className="grid grid-cols-1 gap-3 md:col-span-3 lg:grid-cols-2">
          <NotasResumen
            title="Notas operativas"
            description="Montaje, producto, cobro y horarios"
            icon={ClipboardList}
            lines={notasOperativas}
            empty="Sin indicaciones operativas."
            onEdit={() => setEditing('operativas')}
          />
          <NotasResumen
            title="Notas de reparto"
            description="Acceso, alarma y lugar de entrega"
            icon={Truck}
            lines={notasReparto}
            empty="Sin instrucciones especiales de reparto."
            onEdit={() => setEditing('reparto')}
            tone="delivery"
          />
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} size="lg">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
              {editing === 'operativas'
                ? <><ClipboardList className="h-4 w-4 text-[var(--color-primary)]" />Notas operativas</>
                : <><Truck className="h-4 w-4 text-[var(--color-primary)]" />Notas de reparto</>}
            </h3>
            <button type="button" onClick={() => setEditing(null)} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            {editing === 'operativas' ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--color-ink-3)]">
                  Una indicación por línea. Aquí van especificaciones del producto, montaje, forma de cobro y horarios.
                </p>
                <textarea
                  autoFocus
                  value={form.notas}
                  onChange={(e) => update({ notas: e.target.value })}
                  rows={9}
                  placeholder={"Ejemplos:\nMontar las cajas por tamaños\nCobro por transferencia a final de mes\nPreparar el tomate sin piezas verdes\nNo entregar antes de las 08:30"}
                  className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            ) : (
              <NotasRepartoEditor value={form.notas_reparto} onChange={(v) => update({ notas_reparto: v })} />
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cerrar</Button>
            <Button variant="primary" disabled={set.isPending} onClick={async () => { await guardar(); setEditing(null) }}>
              <Save className="mr-1 h-3.5 w-3.5" />
              Guardar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Bloques de información práctica ───────────────────────────────────────────

function NotasResumen({
  title,
  description,
  icon: Icon,
  lines,
  empty,
  onEdit,
  tone = 'default',
}: {
  title: string
  description: string
  icon: typeof ClipboardList
  lines: string[]
  empty: string
  onEdit: () => void
  tone?: 'default' | 'delivery'
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
        <span className={tone === 'delivery'
          ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-warn-soft)] text-[var(--amber)]'
          : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
        }>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h4>
          <p className="truncate text-[10px] text-[var(--color-ink-3)]">{description}</p>
        </div>
        {lines.length > 0 && <span className="mono text-[10px] text-[var(--color-ink-3)]">{lines.length}</span>}
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs font-medium text-[var(--color-ink-2)] hover:border-[var(--color-primary)] hover:text-[var(--color-ink)]"
          aria-label={`Editar ${title.toLowerCase()}`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
      {lines.length === 0 ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full px-3 py-5 text-left text-xs text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
        >
          {empty} Pulsa para añadir.
        </button>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {lines.map((line, index) => (
            <li key={`${line}-${index}`} className="flex items-start gap-2 px-3 py-2 text-sm">
              <span className={tone === 'delivery'
                ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]'
                : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]'
              } />
              <span className="min-w-0 leading-5 text-[var(--color-ink-2)]">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NotasRepartoEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const notas = lineasArray(value)
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const nuevas = lineasArray(raw)
    if (nuevas.length === 0) return
    const merged = Array.from(new Set([...notas, ...nuevas]))
    onChange(merged.join('\n'))
    setDraft('')
  }

  const remove = (nota: string) => onChange(notas.filter(n => n !== nota).join('\n'))

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-ink-3)]">
        Instrucciones que debe ver el repartidor al llegar. Cada indicación se guarda por separado.
      </p>
      {notas.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-5 text-center text-sm text-[var(--color-ink-3)]">
          Todavía no hay notas de reparto.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)]">
          {notas.map((nota, index) => (
            <li key={`${nota}-${index}`} className="flex items-start gap-2 bg-[var(--color-surface)] px-3 py-2.5">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
              <span className="min-w-0 flex-1 text-sm leading-5 text-[var(--color-ink)]">{nota}</span>
              <button
                type="button"
                onClick={() => remove(nota)}
                className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--coral)]"
                aria-label={`Quitar nota: ${nota}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft) }
          }}
          placeholder="Ej: Si no hay nadie, dejar el pedido en el patio"
        />
        <Button variant="outline" disabled={!draft.trim()} onClick={() => commit(draft)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Añadir
        </Button>
      </div>
      <div className="rounded-md bg-[var(--color-warn-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-ink-2)]">
        Ejemplos: “A partir de las 09:00 se puede quitar la alarma” o “Si no hay nadie, dejar el pedido junto a la puerta lateral”.
      </div>
    </div>
  )
}
