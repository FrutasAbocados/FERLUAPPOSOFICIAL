import { useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, Phone, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import type { ClientePrograma } from '@/shared/lib/clientes-segmentacion'
import {
  type ClienteProgramaRow,
  useClientePrograma,
  useMarcarClienteContacto,
  useSetClientePrograma,
} from '../lib/hooks'

type ProgramaClienteInput = {
  contact_name_canon: string
  programa: ClientePrograma
  programaLabel: string
  accionSugerida: string
  loyaltyScore: number
}

const PROGRAMA_OPTIONS: Array<{ value: '' | ClientePrograma; label: string }> = [
  { value: '', label: 'Automatico' },
  { value: 'vip', label: 'VIP Oro' },
  { value: 'riesgo', label: 'A Riesgo' },
  { value: 'deuda', label: 'A Deuda' },
  { value: 'potencial', label: 'B Potencial' },
  { value: 'rentable', label: 'C Rentable' },
  { value: 'estandar', label: 'Estandar' },
]

type Form = {
  programa_manual: '' | ClientePrograma
  estado: ClienteProgramaRow['estado']
  prioridad: ClienteProgramaRow['prioridad']
  proxima_accion: string
  proxima_accion_fecha: string
  notas: string
}

const empty: Form = {
  programa_manual: '',
  estado: 'activo',
  prioridad: 'media',
  proxima_accion: '',
  proxima_accion_fecha: '',
  notas: '',
}

function toForm(row: ClienteProgramaRow | null | undefined): Form {
  if (!row) return empty
  return {
    programa_manual: row.programa_manual ?? '',
    estado: row.estado,
    prioridad: row.prioridad,
    proxima_accion: row.proxima_accion ?? '',
    proxima_accion_fecha: row.proxima_accion_fecha ?? '',
    notas: row.notas ?? '',
  }
}

export function ProgramaFidelizacionCard({ cliente }: { cliente: ProgramaClienteInput }) {
  const { data: programa } = useClientePrograma(cliente.contact_name_canon)
  const setPrograma = useSetClientePrograma()
  const marcarContacto = useMarcarClienteContacto()
  const [form, setForm] = useState<Form>(empty)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setForm(toForm(programa))
    setDirty(false)
  }, [cliente.contact_name_canon, programa?.updated_at])

  const programaFinal = form.programa_manual || cliente.programa
  const proximaRapida = useMemo(() => format(addDays(new Date(), 7), 'yyyy-MM-dd'), [])

  const update = (patch: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const guardar = async () => {
    try {
      await setPrograma.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        patch: {
          programa_manual: form.programa_manual || null,
          estado: form.estado,
          prioridad: form.prioridad,
          proxima_accion: form.proxima_accion || null,
          proxima_accion_fecha: form.proxima_accion_fecha || null,
          notas: form.notas || null,
        },
      })
      toast({ title: 'Programa guardado', variant: 'success' })
      setDirty(false)
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const registrarLlamada = async () => {
    try {
      await marcarContacto.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        tipo: 'llamada',
        proxima_accion: form.proxima_accion || 'Revisar evolucion del cliente',
        proxima_accion_fecha: form.proxima_accion_fecha || proximaRapida,
      })
      toast({ title: 'Llamada registrada', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo registrar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const posponer = async () => {
    update({ proxima_accion_fecha: proximaRapida, estado: 'seguimiento' })
    try {
      await setPrograma.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        patch: {
          estado: 'seguimiento',
          proxima_accion: form.proxima_accion || 'Seguimiento comercial',
          proxima_accion_fecha: proximaRapida,
          programa_manual: form.programa_manual || null,
          prioridad: form.prioridad,
          notas: form.notas || null,
        },
      })
      toast({ title: 'Seguimiento pospuesto 7 dias', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo posponer', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const ultimoContacto = programa?.ultimo_contacto_at
    ? format(parseISO(programa.ultimo_contacto_at), "d LLL 'a las' HH:mm", { locale: es })
    : 'Sin contacto registrado'

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Programa fidelizacion</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-3)]">
            <span className="ao-chip ao-chip-mint">{labelPrograma(programaFinal)}</span>
            <span>Auto: {cliente.programaLabel}</span>
            <span>Score {cliente.loyaltyScore}/100</span>
          </div>
        </div>
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || setPrograma.isPending} onClick={guardar}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Guardar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-4">
        <div>
          <Label htmlFor="programa_manual">Programa</Label>
          <select
            id="programa_manual"
            value={form.programa_manual}
            onChange={(e) => update({ programa_manual: e.target.value as Form['programa_manual'] })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            {PROGRAMA_OPTIONS.map((p) => <option key={p.value || 'auto'} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="estado_programa">Estado</Label>
          <select
            id="estado_programa"
            value={form.estado}
            onChange={(e) => update({ estado: e.target.value as Form['estado'] })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="activo">Activo</option>
            <option value="seguimiento">Seguimiento</option>
            <option value="pausado">Pausado</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>
        <div>
          <Label htmlFor="prioridad_programa">Prioridad</Label>
          <select
            id="prioridad_programa"
            value={form.prioridad}
            onChange={(e) => update({ prioridad: e.target.value as Form['prioridad'] })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </div>
        <div>
          <Label htmlFor="proxima_accion_fecha">Proxima accion</Label>
          <Input id="proxima_accion_fecha" type="date" value={form.proxima_accion_fecha} onChange={(e) => update({ proxima_accion_fecha: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="proxima_accion">Accion concreta</Label>
          <Input id="proxima_accion" value={form.proxima_accion} onChange={(e) => update({ proxima_accion: e.target.value })} placeholder={cliente.accionSugerida} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="notas_programa">Notas de programa</Label>
          <Input id="notas_programa" value={form.notas} onChange={(e) => update({ notas: e.target.value })} placeholder="Condiciones, trato, oferta o riesgo a vigilar" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-3 py-2">
        <Button size="sm" onClick={registrarLlamada} disabled={marcarContacto.isPending}>
          <Phone className="mr-1 h-3.5 w-3.5" />
          Llamada hecha
        </Button>
        <Button size="sm" variant="outline" onClick={posponer} disabled={setPrograma.isPending}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          +7 dias
        </Button>
        <Button size="sm" variant="ghost" onClick={() => update({ programa_manual: '', estado: 'activo', prioridad: 'media' })}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Auto
        </Button>
        <span className="ml-auto text-xs text-[var(--color-ink-3)]">{ultimoContacto}</span>
      </div>
    </div>
  )
}

function labelPrograma(programa: ClientePrograma): string {
  return PROGRAMA_OPTIONS.find((p) => p.value === programa)?.label ?? 'Estandar'
}
