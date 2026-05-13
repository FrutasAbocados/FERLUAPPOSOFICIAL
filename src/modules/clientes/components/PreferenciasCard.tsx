import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import { type Preferencias, usePreferencias, useSetPreferencias } from '../lib/hooks'

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

type Form = {
  hora_preferida: string
  dia_preferido: string
  en_pausa_hasta: string
  notas: string
  tags: string
}

const empty: Form = { hora_preferida: '', dia_preferido: '', en_pausa_hasta: '', notas: '', tags: '' }

function fromPrefs(p: Preferencias | null | undefined): Form {
  if (!p) return empty
  return {
    hora_preferida: p.hora_preferida ?? '',
    dia_preferido:  p.dia_preferido  ?? '',
    en_pausa_hasta: p.en_pausa_hasta ?? '',
    notas:          p.notas          ?? '',
    tags:           (p.tags ?? []).join(', '),
  }
}

export function PreferenciasCard({ name }: { name: string }) {
  const { data: prefs } = usePreferencias(name)
  const set = useSetPreferencias()
  const [form, setForm] = useState<Form>(empty)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setForm(fromPrefs(prefs))
    setDirty(false)
  }, [name, prefs?.updated_at])

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const guardar = async () => {
    try {
      await set.mutateAsync({
        contact_name_canon: name,
        patch: {
          hora_preferida: form.hora_preferida || null,
          dia_preferido:  form.dia_preferido  || null,
          en_pausa_hasta: form.en_pausa_hasta || null,
          notas:          form.notas          || null,
          tags:           form.tags.split(',').map(t => t.trim()).filter(Boolean),
        },
      })
      toast({ title: 'Preferencias guardadas', variant: 'success' })
      setDirty(false)
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const enPausa = !!form.en_pausa_hasta && form.en_pausa_hasta >= format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Preferencias operativas {enPausa && <span className="ao-chip ao-chip-amber ml-2">EN PAUSA</span>}
        </h3>
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || set.isPending} onClick={guardar}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Guardar
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
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
        <div>
          <Label htmlFor="pausa">En pausa hasta (vacaciones)</Label>
          <Input id="pausa" type="date" value={form.en_pausa_hasta} onChange={(e) => update({ en_pausa_hasta: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="tags">Tags (separados por coma)</Label>
          <Input id="tags" value={form.tags} onChange={(e) => update({ tags: e.target.value })} placeholder="hostelería, terraza, exigente…" />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="notas">Notas operativas</Label>
          <Input id="notas" value={form.notas} onChange={(e) => update({ notas: e.target.value })} placeholder="Sin tomate verde, no llamar mañanas, llave en escalera…" />
        </div>
      </div>
    </div>
  )
}
