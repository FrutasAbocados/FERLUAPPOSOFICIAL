import { useState } from 'react'
import { MapPin, Phone, Save, StickyNote, Tag, X } from 'lucide-react'
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
  tags: string
}

const empty: Form = {
  hora_preferida: '', dia_preferido: '', telefono: '', direccion: '',
  en_pausa_desde: '', en_pausa_hasta: '', notas: '', tags: '',
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
    tags:           (p.tags ?? []).join(', '),
  }
}

const tagsArray = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)

export function PreferenciasCard({ name }: { name: string }) {
  const { data: prefs } = usePreferencias(name)
  return <PreferenciasCardInner key={`${name}-${prefs?.updated_at ?? 'empty'}`} name={name} prefs={prefs} />
}

function PreferenciasCardInner({ name, prefs }: { name: string; prefs: Preferencias | null | undefined }) {
  const set = useSetPreferencias()
  const [form, setForm] = useState<Form>(() => fromPrefs(prefs))
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState<'notas' | 'tags' | null>(null)

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
          tags:           tagsArray(form.tags),
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

  const tagsChips = tagsArray(form.tags)

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

        {/* Tags → botón que abre ventana con líneas de información */}
        <div className="md:col-span-3">
          <Label>Tags</Label>
          <button
            type="button"
            onClick={() => setEditing('tags')}
            className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm hover:border-[var(--color-primary)]"
          >
            <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)]" />
            {tagsChips.length === 0 ? (
              <span className="text-[var(--color-ink-3)]">Añadir tags…</span>
            ) : (
              tagsChips.map((t, i) => (
                <span key={i} className="ao-chip">{t}</span>
              ))
            )}
          </button>
        </div>

        {/* Notas operativas → botón que abre ventana con líneas de información */}
        <div className="md:col-span-3">
          <Label>Notas operativas</Label>
          <button
            type="button"
            onClick={() => setEditing('notas')}
            className="flex min-h-[42px] w-full items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm hover:border-[var(--color-primary)]"
          >
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)]" />
            {form.notas.trim() === '' ? (
              <span className="text-[var(--color-ink-3)]">Añadir notas (sin tomate verde, no llamar mañanas, llave en escalera…)</span>
            ) : (
              <span className="whitespace-pre-wrap text-[var(--color-ink)]">{form.notas}</span>
            )}
          </button>
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} size="lg">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
              {editing === 'notas'
                ? <><StickyNote className="h-4 w-4 text-[var(--color-primary)]" />Notas operativas</>
                : <><Tag className="h-4 w-4 text-[var(--color-primary)]" />Tags del cliente</>}
            </h3>
            <button type="button" onClick={() => setEditing(null)} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            {editing === 'notas' ? (
              <textarea
                autoFocus
                value={form.notas}
                onChange={(e) => update({ notas: e.target.value })}
                rows={8}
                placeholder={"Una línea por cosa importante:\n- Sin tomate verde\n- No llamar por las mañanas\n- Llave en el cuadro de la escalera"}
                className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            ) : (
              <TagsEditor value={form.tags} onChange={(v) => update({ tags: v })} />
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

// ── Editor de tags como chips (una etiqueta por línea o Enter) ──────────────────

function TagsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const chips = tagsArray(value)
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const nuevas = raw.split(',').map(t => t.trim()).filter(Boolean)
    if (nuevas.length === 0) return
    const merged = Array.from(new Set([...chips, ...nuevas]))
    onChange(merged.join(', '))
    setDraft('')
  }

  const remove = (t: string) => onChange(chips.filter(c => c !== t).join(', '))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.length === 0 && <span className="text-sm text-[var(--color-ink-3)]">Sin tags todavía.</span>}
        {chips.map((t, i) => (
          <span key={i} className="ao-chip inline-flex items-center gap-1">
            {t}
            <button type="button" onClick={() => remove(t)} className="text-[var(--color-ink-3)] hover:text-[var(--coral)]" aria-label={`Quitar ${t}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft) }
          }}
          placeholder="Escribe una etiqueta y pulsa Enter…"
        />
        <Button variant="outline" disabled={!draft.trim()} onClick={() => commit(draft)}>Añadir</Button>
      </div>
      <p className="text-xs text-[var(--color-ink-3)]">Cada etiqueta es una línea de información (persona de contacto, tipo de local, avisos…).</p>
    </div>
  )
}
