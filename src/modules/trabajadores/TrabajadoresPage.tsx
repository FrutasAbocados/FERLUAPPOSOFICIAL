import { useMemo, useState } from 'react'
import { Modal } from '@/shared/components/Modal'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Save, UserCog, UserPlus, Users, X } from 'lucide-react'
import { eurosOrDash } from '@/shared/lib/format'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'

interface Trabajador {
  id: string
  nombre: string
  user_id: string | null
  puesto: string | null
  fecha_alta: string | null
  sueldo_base: number | null
  plus_transporte: number | null
  plus_responsabilidad: number | null
  plus_otros: number | null
  plus_otros_concepto: string | null
  notas: string | null
  activo: boolean
  pack: 1 | 2 | 3
  limite_credito_mensual: number | null
  tarifa_sabado: number | null
  jornada_factor: number
}

const eur = eurosOrDash

function useTrabajadores() {
  return useQuery({
    queryKey: ['trabajadores'] as const,
    queryFn: async (): Promise<Trabajador[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, nombre, user_id, puesto, fecha_alta, sueldo_base, plus_transporte, plus_responsabilidad, plus_otros, plus_otros_concepto, notas, activo, pack, limite_credito_mensual, tarifa_sabado, jornada_factor')
        .order('nombre')
      if (error) throw error
      return (data ?? []) as Trabajador[]
    },
  })
}

interface Condiciones {
  empleado_id: string
  jornada_horas_semana: number | null
  jornada_dias_semana: number | null
  horario_entrada: string | null
  horario_salida: string | null
  dias_descanso: string | null
  contrato_tipo: 'indefinido' | 'temporal' | 'practicas' | 'autonomo' | 'otro' | null
  fecha_inicio_contrato: string | null
  fecha_fin_contrato: string | null
  vacaciones_dias_anuales: number | null
  texto_libre: string | null
}

const CONDICIONES_VACIAS = (empleadoId: string): Condiciones => ({
  empleado_id: empleadoId,
  jornada_horas_semana: null,
  jornada_dias_semana: null,
  horario_entrada: null,
  horario_salida: null,
  dias_descanso: null,
  contrato_tipo: null,
  fecha_inicio_contrato: null,
  fecha_fin_contrato: null,
  vacaciones_dias_anuales: null,
  texto_libre: null,
})

function useCondiciones(empleadoId: string | null) {
  return useQuery({
    queryKey: ['trab-condiciones', empleadoId] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<Condiciones | null> => {
      if (!empleadoId) return null
      const { data, error } = await supabase
        .from('trabajadores_condiciones')
        .select('empleado_id, jornada_horas_semana, jornada_dias_semana, horario_entrada, horario_salida, dias_descanso, contrato_tipo, fecha_inicio_contrato, fecha_fin_contrato, vacaciones_dias_anuales, texto_libre')
        .eq('empleado_id', empleadoId)
        .maybeSingle()
      if (error) throw error
      return (data as Condiciones | null) ?? null
    },
  })
}

function useGuardarCondiciones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Condiciones) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('trabajadores_condiciones')
        .upsert({ ...c, updated_by: u.user?.id ?? null }, { onConflict: 'empleado_id' })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['trab-condiciones', vars.empleado_id] })
    },
  })
}

function useCrearTrabajador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Trabajador) => {
      const { error } = await supabase
        .from('empleados')
        .insert({
          nombre: t.nombre.trim(),
          puesto: t.puesto,
          fecha_alta: t.fecha_alta,
          sueldo_base: t.sueldo_base,
          plus_transporte: t.plus_transporte,
          plus_responsabilidad: t.plus_responsabilidad,
          plus_otros: t.plus_otros,
          plus_otros_concepto: t.plus_otros_concepto,
          notas: t.notas,
          activo: t.activo,
          pack: t.pack,
          limite_credito_mensual: t.limite_credito_mensual,
          tarifa_sabado: t.tarifa_sabado,
          jornada_factor: t.jornada_factor,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores'] }),
  })
}

function useGuardarTrabajador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Trabajador) => {
      const { error } = await supabase
        .from('empleados')
        .update({
          nombre: t.nombre,
          puesto: t.puesto,
          fecha_alta: t.fecha_alta,
          sueldo_base: t.sueldo_base,
          plus_transporte: t.plus_transporte,
          plus_responsabilidad: t.plus_responsabilidad,
          plus_otros: t.plus_otros,
          plus_otros_concepto: t.plus_otros_concepto,
          notas: t.notas,
          activo: t.activo,
          pack: t.pack,
          limite_credito_mensual: t.limite_credito_mensual,
          tarifa_sabado: t.tarifa_sabado,
          jornada_factor: t.jornada_factor,
        })
        .eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores'] }),
  })
}

const totalMensual = (t: Trabajador) => {
  const base = Number(t.sueldo_base ?? 0)
  // pack 2 (sueldo neto sin pluses) y pack 3 (prácticas, sueldo fijo)
  if (t.pack === 2 || t.pack === 3) return base
  return base +
    Number(t.plus_transporte ?? 0) +
    Number(t.plus_responsabilidad ?? 0) +
    Number(t.plus_otros ?? 0)
}

const trabajadorNuevo = (): Trabajador => ({
  id: '',
  nombre: '',
  user_id: null,
  puesto: null,
  fecha_alta: new Date().toISOString().slice(0, 10),
  sueldo_base: null,
  plus_transporte: null,
  plus_responsabilidad: null,
  plus_otros: null,
  plus_otros_concepto: null,
  notas: null,
  activo: true,
  pack: 1,
  limite_credito_mensual: 100,
  tarifa_sabado: 70,
  jornada_factor: 1,
})

export function TrabajadoresPage() {
  const { data, isLoading } = useTrabajadores()
  const [editing, setEditing] = useState<Trabajador | null>(null)
  const [creating, setCreating] = useState(false)

  const totalNomina = useMemo(() =>
    (data ?? []).filter(t => t.activo).reduce((s, t) => s + totalMensual(t), 0),
    [data])

  return (
    <div>
      <PageTopbar
        breadcrumb="EQUIPO · BBDD TRABAJADORES"
        title="Trabajadores"
        subtitle="Plantilla, condiciones y pluses individualizados."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Nuevo trabajador
          </Button>
        }
      />
      <div className="ao-page max-w-5xl py-6 md:py-8">

      <section className="ao-card mb-4 p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-ink-3)]" />
          <span className="text-sm text-[var(--color-ink-3)]">Coste mensual nómina (activos)</span>
          <span className="ml-auto font-display text-2xl font-bold text-[var(--color-ink)] tabular-nums">{eur(totalNomina)}</span>
        </div>
      </section>

      <div className="ao-card overflow-hidden p-0">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin trabajadores</p>}
        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(t => (
            <li key={t.id}>
              <button
                onClick={() => setEditing(t)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-ink)]">{t.nombre}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      t.pack === 1 ? 'bg-[var(--mint-glow)] text-[var(--mint)]' :
                      t.pack === 2 ? 'bg-[oklch(92%_.08_82_/_0.85)] text-[var(--color-primary)] dark:bg-[oklch(28%_.08_72_/_0.42)]' :
                      'bg-[oklch(93%_.06_295_/_0.75)] text-[oklch(40%_.12_295)] dark:bg-[oklch(30%_.08_295_/_0.42)] dark:text-[oklch(78%_.11_295)]'
                    }`}>
                      {t.pack === 3 ? 'Prácticas' : `Pack ${t.pack}`}
                    </span>
                    {!t.activo && <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">baja</span>}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">{t.puesto ?? 'sin puesto'} {t.fecha_alta ? `· desde ${t.fecha_alta}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums text-[var(--color-ink)]">{eur(totalMensual(t))}</div>
                  <div className="text-xs text-[var(--color-ink-3)]">total/mes</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <EditorTrabajador trabajador={editing} onClose={() => setEditing(null)} />
      )}
      {creating && (
        <EditorTrabajador trabajador={trabajadorNuevo()} modo="crear" onClose={() => setCreating(false)} />
      )}
      </div>
    </div>
  )
}

function EditorTrabajador({ trabajador, onClose, modo = 'editar' }: { trabajador: Trabajador; onClose: () => void; modo?: 'crear' | 'editar' }) {
  const guardar = useGuardarTrabajador()
  const crear = useCrearTrabajador()
  const [t, setT] = useState<Trabajador>(trabajador)
  const pending = guardar.isPending || crear.isPending

  const set = <K extends keyof Trabajador>(k: K, v: Trabajador[K]) => setT(prev => ({ ...prev, [k]: v }))
  const setNum = (k: keyof Trabajador, v: string) =>
    setT(prev => ({ ...prev, [k]: v === '' ? null : Number(v.replace(',', '.')) }))

  const submit = async () => {
    if (modo === 'crear' && !t.nombre.trim()) {
      toast({ title: 'Falta el nombre', description: 'El nombre del trabajador es obligatorio.', variant: 'error' })
      return
    }
    try {
      if (modo === 'crear') await crear.mutateAsync(t)
      else await guardar.mutateAsync(t)
      onClose()
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
              <UserCog className="h-5 w-5 text-[var(--color-primary-2)]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                {modo === 'crear' ? (t.nombre.trim() || 'Nuevo trabajador') : trabajador.nombre}
              </h2>
              <p className="text-xs text-[var(--color-ink-3)]">{modo === 'crear' ? 'Alta de empleado' : 'Editar condiciones'}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <Input value={t.nombre} onChange={(e) => set('nombre', e.target.value)} className="h-9" />
            </Field>
            <Field label="Puesto">
              <Input value={t.puesto ?? ''} onChange={(e) => set('puesto', e.target.value || null)} className="h-9" placeholder="Mozo / Comercial / ..." />
            </Field>
            <Field label="Fecha alta">
              <Input type="date" value={t.fecha_alta ?? ''} onChange={(e) => set('fecha_alta', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Estado">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={t.activo} onChange={(e) => set('activo', e.target.checked)} />
                {t.activo ? 'Activo' : 'Baja'}
              </label>
            </Field>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Pack contractual</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${t.pack === 1 ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}>
                <input type="radio" name="pack" checked={t.pack === 1} onChange={() => set('pack', 1)} className="mt-0.5" />
                <div>
                  <div className="font-semibold">Pack 1</div>
                  <div className="text-xs text-[var(--color-ink-3)]">60d vac · desayuno · objetivos · productividad · crédito · 5% nuevos</div>
                </div>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${t.pack === 2 ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}>
                <input type="radio" name="pack" checked={t.pack === 2} onChange={() => set('pack', 2)} className="mt-0.5" />
                <div>
                  <div className="font-semibold">Pack 2</div>
                  <div className="text-xs text-[var(--color-ink-3)]">48d vac · sueldo neto · 70€/sábado · 5% nuevos · sin pluses</div>
                </div>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${t.pack === 3 ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}>
                <input type="radio" name="pack" checked={t.pack === 3} onChange={() => set('pack', 3)} className="mt-0.5" />
                <div>
                  <div className="font-semibold">Pack 3</div>
                  <div className="text-xs text-[var(--color-ink-3)]">Prácticas 4h · sueldo fijo · crédito frutas · sin más</div>
                </div>
              </label>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Field label="Jornada">
                <select
                  value={String(t.jornada_factor)}
                  onChange={(e) => set('jornada_factor', Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                >
                  <option value="1">Completa</option>
                  <option value="0.5">Media jornada (×0,5)</option>
                  <option value="0.75">Reducida 75% (×0,75)</option>
                </select>
              </Field>
              <div className="flex items-end">
                <p className="text-xs text-[var(--color-ink-3)]">
                  Vacaciones prorrateadas:{' '}
                  <strong className="text-[var(--color-ink)] tabular-nums">
                    {Math.round((t.pack === 1 ? 60 : t.pack === 2 ? 48 : 0) * (t.jornada_factor ?? 1))} días/año
                  </strong>
                  {t.jornada_factor !== 1 && <span> · pluses se ajustan a mano</span>}
                </p>
              </div>
            </div>
            {(t.pack === 1 || t.pack === 3) && (
              <div className="mt-3">
                <Field label="Crédito frutas mensual (€)">
                  <Input
                    type="number"
                    step="1"
                    value={t.limite_credito_mensual ?? ''}
                    onChange={(e) => setNum('limite_credito_mensual', e.target.value)}
                    className="h-9 tabular-nums text-right"
                    placeholder="100"
                  />
                </Field>
              </div>
            )}
            {t.pack === 2 && (
              <div className="mt-3">
                <Field label="Tarifa por sábado trabajado (€)">
                  <Input
                    type="number"
                    step="1"
                    value={t.tarifa_sabado ?? ''}
                    onChange={(e) => setNum('tarifa_sabado', e.target.value)}
                    className="h-9 tabular-nums text-right"
                    placeholder="70"
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
              {t.pack === 3 ? 'Condiciones económicas (sueldo fijo €/mes)' : 'Condiciones económicas (mensuales €)'}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t.pack === 2 ? 'Sueldo neto' : 'Sueldo base'}>
                <Input type="number" step="0.01" value={t.sueldo_base ?? ''} onChange={(e) => setNum('sueldo_base', e.target.value)} className="h-9 tabular-nums text-right" />
              </Field>
              {t.pack === 1 && (
                <>
                  <Field label="Plus desayuno">
                    <Input type="number" step="0.01" value={t.plus_transporte ?? ''} onChange={(e) => setNum('plus_transporte', e.target.value)} className="h-9 tabular-nums text-right" />
                  </Field>
                  <Field label="Plus objetivos">
                    <Input type="number" step="0.01" value={t.plus_responsabilidad ?? ''} onChange={(e) => setNum('plus_responsabilidad', e.target.value)} className="h-9 tabular-nums text-right" />
                  </Field>
                  <Field label="Plus productividad">
                    <Input type="number" step="0.01" value={t.plus_otros ?? ''} onChange={(e) => setNum('plus_otros', e.target.value)} className="h-9 tabular-nums text-right" />
                  </Field>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <span className="text-sm text-[var(--color-ink-3)]">
                {t.pack === 2 ? 'Sueldo neto + sábados se calculan en pestaña Sábados'
                  : t.pack === 3 ? 'Sueldo fijo + crédito frutas'
                  : 'Total mensual base + pluses'}
              </span>
              <span className="ao-text-success font-display text-xl font-bold tabular-nums">{eur(totalMensual(t))}</span>
            </div>
          </div>

          <Field label="Notas">
            <textarea
              value={t.notas ?? ''}
              onChange={(e) => set('notas', e.target.value || null)}
              className="min-h-[80px] w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="Acuerdos especiales, observaciones…"
            />
          </Field>

          {modo === 'editar' ? (
            <CondicionesSection empleadoId={t.id} />
          ) : (
            <p className="rounded-md border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-ink-3)]">
              Las condiciones de contrato (jornada, horario, vacaciones…) se añaden tras crear el trabajador, abriendo su ficha.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={pending}>
              <Save className="mr-1 h-4 w-4" /> {pending ? 'Guardando…' : modo === 'crear' ? 'Crear trabajador' : 'Guardar'}
            </Button>
          </div>
        </div>
    </Modal>
  )
}

function CondicionesSection({ empleadoId }: { empleadoId: string }) {
  const { data, isLoading } = useCondiciones(empleadoId)
  if (isLoading) {
    return (
      <section className="rounded-md border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-3)]">
        Cargando condiciones…
      </section>
    )
  }
  const initial = data ?? CONDICIONES_VACIAS(empleadoId)
  return <CondicionesSectionForm key={`${empleadoId}-${JSON.stringify(initial)}`} initial={initial} />
}

function CondicionesSectionForm({ initial }: { initial: Condiciones }) {
  const guardar = useGuardarCondiciones()
  const [c, setC] = useState<Condiciones>(initial)
  const [dirty, setDirty] = useState(false)

  const set = <K extends keyof Condiciones>(k: K, v: Condiciones[K]) => {
    setC(prev => ({ ...prev, [k]: v }))
    setDirty(true)
  }
  const setNum = (k: keyof Condiciones, v: string) =>
    set(k, (v === '' ? null : Number(v.replace(',', '.'))) as Condiciones[typeof k])

  const submit = async () => {
    try {
      await guardar.mutateAsync(c)
      setDirty(false)
      toast({ title: 'Condiciones guardadas', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--color-primary-2)]" />
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">Condiciones / Contrato</h3>
        {dirty && <span className="ao-text-warning ml-auto text-[10px] uppercase tracking-wider">sin guardar</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tipo de contrato">
              <select
                value={c.contrato_tipo ?? ''}
                onChange={(e) => set('contrato_tipo', (e.target.value || null) as Condiciones['contrato_tipo'])}
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              >
                <option value="">—</option>
                <option value="indefinido">Indefinido</option>
                <option value="temporal">Temporal</option>
                <option value="practicas">Prácticas</option>
                <option value="autonomo">Autónomo</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
            <Field label="Vacaciones (días/año)">
              <Input type="number" step="1" value={c.vacaciones_dias_anuales ?? ''}
                onChange={(e) => setNum('vacaciones_dias_anuales', e.target.value)}
                className="h-9 tabular-nums text-right" placeholder={`Default pack: ${'-'}`} />
            </Field>
            <Field label="Inicio contrato">
              <Input type="date" value={c.fecha_inicio_contrato ?? ''} onChange={(e) => set('fecha_inicio_contrato', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Fin contrato">
              <Input type="date" value={c.fecha_fin_contrato ?? ''} onChange={(e) => set('fecha_fin_contrato', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Jornada (h/sem)">
              <Input type="number" step="1" value={c.jornada_horas_semana ?? ''} onChange={(e) => setNum('jornada_horas_semana', e.target.value)} className="h-9 tabular-nums text-right" placeholder="40" />
            </Field>
            <Field label="Días/sem trabajados">
              <Input type="number" step="1" min={1} max={7} value={c.jornada_dias_semana ?? ''} onChange={(e) => setNum('jornada_dias_semana', e.target.value)} className="h-9 tabular-nums text-right" placeholder="6" />
            </Field>
            <Field label="Horario entrada">
              <Input type="time" value={c.horario_entrada ?? ''} onChange={(e) => set('horario_entrada', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Horario salida">
              <Input type="time" value={c.horario_salida ?? ''} onChange={(e) => set('horario_salida', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Días de descanso" full>
              <Input value={c.dias_descanso ?? ''} onChange={(e) => set('dias_descanso', e.target.value || null)} className="h-9" placeholder="Ej: domingo · lunes y domingo" />
            </Field>
      </div>

      <Field label="Cláusulas / observaciones (texto libre)">
        <textarea
          value={c.texto_libre ?? ''}
          onChange={(e) => set('texto_libre', e.target.value || null)}
          className="min-h-[100px] w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          placeholder="Acuerdos económicos pactados, condiciones especiales, etc."
        />
      </Field>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={submit} disabled={guardar.isPending || !dirty}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {guardar.isPending ? 'Guardando…' : 'Guardar condiciones'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</label>
      {children}
    </div>
  )
}
