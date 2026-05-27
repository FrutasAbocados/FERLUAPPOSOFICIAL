import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarOff, CalendarX, Check, ChevronDown, ChevronRight, Clock, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { CalendarioVacaciones } from './CalendarioVacaciones'

type Estado = 'pendiente' | 'aprobado' | 'disfrutado'

interface Resumen {
  empleado_id: string
  nombre: string
  pack: 1 | 2
  dias_anuales: number
  festivos_no_trabajados: number
  dias_descontados_festivos: number
  dias_anuales_efectivos: number
  disfrutados: number
  aprobados: number
  pendientes: number
  restantes: number
}

interface FestivoFila {
  fecha: string
  nombre: string
  ambito: 'nacional' | 'andalucia' | 'malaga'
  empleado_id: string
  empleado_nombre: string
  trabajado: boolean | null
  notas: string | null
  marca_id: string | null
}

interface Periodo {
  id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string
  dias: number
  estado: Estado
  nota: string | null
  created_at: string
}

const fmt = (d: string) => format(parseISO(d), "d 'de' LLLL", { locale: es })

function useResumen(anio: number) {
  return useQuery({
    queryKey: ['vacaciones-resumen', anio] as const,
    queryFn: async (): Promise<Resumen[]> => {
      const { data, error } = await supabase.rpc('trabajadores_vacaciones_resumen_anual', { p_anio: anio })
      if (error) throw error
      return (data ?? []).map((r: Resumen) => ({
        ...r,
        dias_anuales: Number(r.dias_anuales),
        festivos_no_trabajados: Number(r.festivos_no_trabajados ?? 0),
        dias_descontados_festivos: Number(r.dias_descontados_festivos ?? 0),
        dias_anuales_efectivos: Number(r.dias_anuales_efectivos ?? r.dias_anuales),
        disfrutados: Number(r.disfrutados),
        aprobados: Number(r.aprobados),
        pendientes: Number(r.pendientes),
        restantes: Number(r.restantes),
      }))
    },
  })
}

function usePeriodos(empleadoId: string | null, anio: number) {
  return useQuery({
    queryKey: ['vacaciones-periodos', empleadoId, anio] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<Periodo[]> => {
      const inicio = `${anio}-01-01`
      const fin = `${anio + 1}-01-01`
      const { data, error } = await supabase
        .from('trabajadores_vacaciones')
        .select('id, empleado_id, fecha_inicio, fecha_fin, dias, estado, nota, created_at')
        .eq('empleado_id', empleadoId)
        .gte('fecha_inicio', inicio)
        .lt('fecha_inicio', fin)
        .order('fecha_inicio', { ascending: true })
      if (error) throw error
      return (data ?? []) as Periodo[]
    },
  })
}

function useAddPeriodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; fecha_inicio: string; fecha_fin: string; nota: string | null }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('trabajadores_vacaciones').insert({
        empleado_id: input.empleado_id,
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
        nota: input.nota,
        creado_por: u.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-periodos'] })
    },
  })
}

function useUpdateEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: Estado }) => {
      const { error } = await supabase.from('trabajadores_vacaciones').update({ estado }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-periodos'] })
    },
  })
}

function useDeletePeriodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_vacaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-periodos'] })
    },
  })
}

function useFestivosLista(anio: number) {
  return useQuery({
    queryKey: ['festivos-lista', anio] as const,
    queryFn: async (): Promise<FestivoFila[]> => {
      const { data, error } = await supabase.rpc('trabajadores_festivos_lista_anio', { p_anio: anio })
      if (error) throw error
      return (data ?? []) as FestivoFila[]
    },
  })
}

function useUpsertFestivoMarca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; fecha: string; trabajado: boolean }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('trabajadores_festivos_marcados')
        .upsert(
          {
            empleado_id: input.empleado_id,
            fecha: input.fecha,
            trabajado: input.trabajado,
            marcado_por: u.user?.id ?? null,
          },
          { onConflict: 'empleado_id,fecha' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['festivos-lista'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
    },
  })
}

function useBorrarFestivoMarca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_festivos_marcados').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['festivos-lista'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
    },
  })
}

export function VacacionesView() {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const { data, isLoading } = useResumen(anio)
  const [selected, setSelected] = useState<Resumen | null>(null)
  const [festivosOpen, setFestivosOpen] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex items-end justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Vacaciones</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Pack 1 = 60 días · Pack 2 = 48 días · Año natural · Festivo NO trabajado = −2 días automático.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAnio(a => a - 1)}>−</Button>
          <span className="font-display text-lg font-bold tabular-nums text-[var(--color-ink)]">{anio}</span>
          <Button size="sm" variant="outline" onClick={() => setAnio(a => a + 1)}>+</Button>
        </div>
      </header>

      <div className="mb-4">
        <button
          onClick={() => setFestivosOpen(o => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-primary)]"
        >
          <span className="flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-[var(--color-primary)]" />
            Calendario de festivos {anio}
          </span>
          {festivosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {festivosOpen && <FestivosCalendario anio={anio} />}
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data?.length === 0 && (
        <p className="ao-card px-4 py-6 text-sm text-[var(--color-ink-3)]">
          No hay trabajadores activos.
        </p>
      )}

      <ul className="space-y-3">
        {data?.map(t => {
          const total = t.dias_anuales_efectivos
          const disf = Math.min(t.disfrutados, total)
          const apr = Math.min(t.aprobados, Math.max(0, total - disf))
          const pend = Math.min(t.pendientes, Math.max(0, total - disf - apr))
          const sobrante = Math.max(0, total - disf - apr - pend)
          return (
            <li key={t.empleado_id}>
              <button
                onClick={() => setSelected(t)}
                className="ao-card grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left transition hover:border-[var(--color-primary)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
                  <CalendarOff className="h-5 w-5 text-[var(--color-primary-2)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-[var(--color-ink)]">{t.nombre}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${t.pack === 1 ? 'bg-[var(--mint-glow)] text-[var(--mint)]' : 'bg-[oklch(92%_.08_82_/_0.85)] text-[var(--color-primary)] dark:bg-[oklch(28%_.08_72_/_0.42)]'}`}>
                      Pack {t.pack}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div className="flex h-full">
                      <div className="bg-emerald-500" style={{ width: `${(disf / total) * 100}%` }} title={`Disfrutados: ${t.disfrutados}`} />
                      <div className="bg-blue-400" style={{ width: `${(apr / total) * 100}%` }} title={`Aprobados: ${t.aprobados}`} />
                      <div className="bg-amber-300" style={{ width: `${(pend / total) * 100}%` }} title={`Pendientes: ${t.pendientes}`} />
                      <div className="bg-[var(--color-surface-2)]" style={{ width: `${(sobrante / total) * 100}%` }} />
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--color-ink-3)]">
                    <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" /> {t.disfrutados} disfr.</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-blue-400 align-middle" /> {t.aprobados} aprob.</span>
                    <span><span className="inline-block h-2 w-2 rounded-full bg-amber-300 align-middle" /> {t.pendientes} pend.</span>
                    {t.festivos_no_trabajados > 0 && (
                      <span className="text-[var(--coral)]">−{t.dias_descontados_festivos} festivos ({t.festivos_no_trabajados})</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-display text-2xl font-bold tabular-nums ${t.restantes < 0 ? 'text-[var(--coral)]' : 'text-[var(--color-ink)]'}`}>
                    {t.restantes}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">
                    de {total}
                    {t.dias_descontados_festivos > 0 && <span className="text-[10px]"> ({t.dias_anuales}−{t.dias_descontados_festivos})</span>}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <DetalleVacaciones
          empleado={selected}
          anio={anio}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DetalleVacaciones({ empleado, anio, onClose }: { empleado: Resumen; anio: number; onClose: () => void }) {
  const { data: periodos, isLoading } = usePeriodos(empleado.empleado_id, anio)
  const add = useAddPeriodo()
  const upd = useUpdateEstado()
  const del = useDeletePeriodo()

  const [inicio, setInicio] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fin, setFin] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [nota, setNota] = useState('')

  const diasNuevo = useMemo(() => {
    if (!inicio || !fin) return 0
    const a = new Date(inicio).getTime()
    const b = new Date(fin).getTime()
    if (b < a) return 0
    return Math.round((b - a) / (24 * 3600 * 1000)) + 1
  }, [inicio, fin])

  const guardar = async () => {
    if (!inicio || !fin || diasNuevo <= 0) {
      toast({ title: 'Selecciona un rango de fechas válido', variant: 'error' })
      return
    }
    try {
      await add.mutateAsync({
        empleado_id: empleado.empleado_id,
        fecha_inicio: inicio,
        fecha_fin: fin,
        nota: nota.trim() || null,
      })
      setNota('')
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleado.nombre} · {anio}</h2>
            <p className="text-xs text-[var(--color-ink-3)]">
              {empleado.disfrutados} disfrutados · {empleado.aprobados} aprobados · {empleado.pendientes} pendientes · <strong>{empleado.restantes}</strong> restantes de {empleado.dias_anuales}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Form nuevo periodo */}
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Solicitar nuevo periodo</h3>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Inicio</label>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fin</label>
                <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Días</label>
                <div className="flex h-9 items-center justify-end rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 font-display text-base font-bold tabular-nums text-[var(--color-ink)]">
                  {diasNuevo}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. semana santa" className="h-9" />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={guardar} disabled={diasNuevo <= 0 || add.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                {add.isPending ? 'Guardando…' : 'Crear (pendiente)'}
              </Button>
            </div>
          </section>

          {/* Calendario anual */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Calendario {anio}</h3>
            <CalendarioVacaciones
              anio={anio}
              periodos={(periodos ?? []).map(p => ({
                fecha_inicio: p.fecha_inicio,
                fecha_fin: p.fecha_fin,
                estado: p.estado,
              }))}
            />
          </section>

          {/* Lista periodos */}
          <section className="rounded-lg border border-[var(--color-border)]">
            <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
              Periodos del año {anio}
            </div>
            {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
            {periodos?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin periodos registrados</p>}
            <ul className="divide-y divide-[var(--color-border)]">
              {periodos?.map(p => (
                <PeriodoItem
                  key={p.id}
                  periodo={p}
                  onEstado={(estado) => upd.mutate({ id: p.id, estado })}
                  onDelete={async () => {
                    const ok = await confirm({ title: '¿Borrar este periodo?', confirmLabel: 'Borrar', variant: 'danger' })
                    if (!ok) return
                    try {
                      await del.mutateAsync(p.id)
                    } catch (e) {
                      toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' })
                    }
                  }}
                />
              ))}
            </ul>
          </section>
        </div>
    </Modal>
  )
}

function FestivosCalendario({ anio }: { anio: number }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'
  const { data, isLoading } = useFestivosLista(anio)
  const upsert = useUpsertFestivoMarca()
  const borrar = useBorrarFestivoMarca()

  // Agrupar por fecha
  const porFecha = useMemo(() => {
    const m = new Map<string, { fecha: string; nombre: string; ambito: string; filas: FestivoFila[] }>()
    for (const r of data ?? []) {
      const ent = m.get(r.fecha) ?? { fecha: r.fecha, nombre: r.nombre, ambito: r.ambito, filas: [] }
      ent.filas.push(r)
      m.set(r.fecha, ent)
    }
    return Array.from(m.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [data])

  if (isLoading) return <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>
  if (porFecha.length === 0) {
    return <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin festivos definidos para {anio}.</p>
  }

  const cycle = (fila: FestivoFila) => {
    if (!isAdmin) return
    if (fila.trabajado === null) {
      // sin marcar → trabajado
      upsert.mutate({ empleado_id: fila.empleado_id, fecha: fila.fecha, trabajado: true })
    } else if (fila.trabajado === true) {
      // trabajado → no trabajado
      upsert.mutate({ empleado_id: fila.empleado_id, fecha: fila.fecha, trabajado: false })
    } else if (fila.marca_id) {
      // no trabajado → sin marcar (borrar marca)
      borrar.mutate(fila.marca_id)
    }
  }

  const ambitoLabel = (a: string) =>
    a === 'nacional' ? 'Nacional' : a === 'andalucia' ? 'Andalucía' : 'Málaga'

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-[11px] text-[var(--color-ink-3)]">
        Click en cada celda cicla: sin marcar · trabajado · no trabajado (−2 días).
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {porFecha.map((f) => (
          <li key={f.fecha} className="px-4 py-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-display text-sm font-bold capitalize text-[var(--color-ink)]">
                  {format(parseISO(f.fecha), "EEE d 'de' LLLL", { locale: es })}
                </span>
                <span className="ml-2 text-xs text-[var(--color-ink-3)]">{f.nombre}</span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                f.ambito === 'nacional' ? 'bg-blue-100 text-blue-800' :
                f.ambito === 'andalucia' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>{ambitoLabel(f.ambito)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-4">
              {f.filas.map((fila) => (
                <button
                  key={fila.empleado_id}
                  onClick={() => cycle(fila)}
                  disabled={!isAdmin || upsert.isPending || borrar.isPending}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition ${
                    fila.trabajado === true
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : fila.trabajado === false
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-3)]'
                  } ${isAdmin ? 'hover:border-[var(--color-primary)]' : 'cursor-default'}`}
                >
                  <span className="truncate font-medium">{fila.empleado_nombre}</span>
                  <span className="shrink-0 font-bold">
                    {fila.trabajado === true ? '✓ Trab.' : fila.trabajado === false ? '✗ −2d' : '·'}
                  </span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PeriodoItem({
  periodo,
  onEstado,
  onDelete,
}: {
  periodo: Periodo
  onEstado: (e: Estado) => void
  onDelete: () => void
}) {
  const badge =
    periodo.estado === 'disfrutado' ? 'bg-emerald-100 text-emerald-800' :
    periodo.estado === 'aprobado' ? 'bg-blue-100 text-blue-800' :
    'bg-amber-100 text-amber-800'

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 md:grid-cols-[1fr_auto_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">
            {fmt(periodo.fecha_inicio)} → {fmt(periodo.fecha_fin)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badge}`}>
            {periodo.estado}
          </span>
        </div>
        <div className="text-xs text-[var(--color-ink-3)]">
          {periodo.dias} día{periodo.dias === 1 ? '' : 's'}
          {periodo.nota && <span> · {periodo.nota}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 col-span-2 md:col-span-1">
        {periodo.estado === 'pendiente' && (
          <Button size="sm" variant="outline" onClick={() => onEstado('aprobado')} title="Aprobar">
            <Check className="mr-1 h-3 w-3" /> Aprobar
          </Button>
        )}
        {periodo.estado === 'aprobado' && (
          <>
            <Button size="sm" variant="outline" onClick={() => onEstado('pendiente')} title="Volver a pendiente">
              <Clock className="mr-1 h-3 w-3" /> Pendiente
            </Button>
            <Button size="sm" variant="primary" onClick={() => onEstado('disfrutado')} title="Marcar disfrutado">
              <Check className="mr-1 h-3 w-3" /> Disfrutado
            </Button>
          </>
        )}
        {periodo.estado === 'disfrutado' && (
          <Button size="sm" variant="outline" onClick={() => onEstado('aprobado')} title="Revertir a aprobado">
            <Clock className="mr-1 h-3 w-3" /> Revertir
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete} title="Eliminar">
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </Button>
      </div>
    </li>
  )
}
