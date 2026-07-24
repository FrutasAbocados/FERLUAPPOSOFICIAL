import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarOff, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { CalendarioVacaciones } from './CalendarioVacaciones'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

interface Resumen {
  empleado_id: string
  nombre: string
  dias_anuales: number
  dias_anuales_efectivos: number
  disfrutados: number
  aprobados: number
  pendientes: number
  restantes: number
  festivos_no_trabajados: number
  dias_descontados_festivos: number
}

interface Periodo {
  id: string
  fecha_inicio: string
  fecha_fin: string
  dias: number
  estado: 'pendiente' | 'aprobado' | 'disfrutado'
  nota: string | null
}

const fmt = (d: string) => format(parseISO(d), "d 'de' LLLL", { locale: es })

const TONO: Record<Periodo['estado'], string> = {
  pendiente:  'ao-tone-warning',
  aprobado:   'ao-tone-info',
  disfrutado: 'ao-tone-success',
}

function useResumenPropio(empleadoId: string, anio: number) {
  return useQuery({
    queryKey: ['emp-vac-resumen', empleadoId, anio] as const,
    queryFn: async (): Promise<Resumen | null> => {
      const { data, error } = await supabase.rpc('trabajadores_vacaciones_resumen_anual', { p_anio: anio })
      if (error) throw error
      const rows = (data ?? []) as Resumen[]
      const mine = rows.find(r => r.empleado_id === empleadoId)
      if (!mine) return null
      return {
        ...mine,
        dias_anuales: Number(mine.dias_anuales),
        dias_anuales_efectivos: Number(mine.dias_anuales_efectivos ?? mine.dias_anuales),
        disfrutados: Number(mine.disfrutados),
        aprobados: Number(mine.aprobados),
        pendientes: Number(mine.pendientes),
        restantes: Number(mine.restantes),
        festivos_no_trabajados: Number(mine.festivos_no_trabajados ?? 0),
        dias_descontados_festivos: Number(mine.dias_descontados_festivos ?? 0),
      }
    },
  })
}

function usePeriodosPropio(empleadoId: string, anio: number) {
  return useQuery({
    queryKey: ['emp-vac-periodos', empleadoId, anio] as const,
    queryFn: async (): Promise<Periodo[]> => {
      const { data, error } = await supabase
        .from('trabajadores_vacaciones')
        .select('id, fecha_inicio, fecha_fin, dias, estado, nota')
        .eq('empleado_id', empleadoId)
        .gte('fecha_inicio', `${anio}-01-01`)
        .lt('fecha_inicio', `${anio + 1}-01-01`)
        .order('fecha_inicio', { ascending: true })
      if (error) throw error
      return (data ?? []) as Periodo[]
    },
  })
}

export function EmpleadoVacacionesView({ empleado }: { empleado: EmpleadoPropio }) {
  const anio = new Date().getFullYear()
  const qc = useQueryClient()

  const { data: resumen, isLoading: loadingResumen } = useResumenPropio(empleado.id, anio)
  const { data: periodos, isLoading: loadingPeriodos } = usePeriodosPropio(empleado.id, anio)

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

  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('trabajadores_vacaciones').insert({
        empleado_id: empleado.id,
        fecha_inicio: inicio,
        fecha_fin: fin,
        nota: nota.trim() || null,
        estado: 'pendiente',
        creado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emp-vac-resumen'] })
      qc.invalidateQueries({ queryKey: ['emp-vac-periodos'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      setNota('')
    },
  })

  const anular = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_vacaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emp-vac-resumen'] })
      qc.invalidateQueries({ queryKey: ['emp-vac-periodos'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
    },
  })

  const guardar = async () => {
    if (diasNuevo <= 0) {
      toast({ title: 'Selecciona un rango de fechas válido', variant: 'error' })
      return
    }
    try {
      await solicitar.mutateAsync()
    } catch (e) {
      toast({ title: 'No se pudo crear la solicitud', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const total = resumen?.dias_anuales_efectivos ?? 0
  const disfrutados = resumen?.disfrutados ?? 0
  const aprobados = resumen?.aprobados ?? 0
  const pendientes = resumen?.pendientes ?? 0
  const restantes = resumen?.restantes ?? 0

  const pctDisf = total > 0 ? Math.min(100, (Math.min(disfrutados, total) / total) * 100) : 0
  const pctApr  = total > 0 ? Math.min(100, (Math.min(aprobados, Math.max(0, total - disfrutados)) / total) * 100) : 0
  const pctPend = total > 0 ? Math.min(100, (Math.min(pendientes, Math.max(0, total - disfrutados - aprobados)) / total) * 100) : 0

  return (
    <div className="ao-page py-5 md:py-7">
      {/* Header */}
      <header className="mb-5 ao-fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <CalendarOff className="h-5 w-5 text-[var(--color-primary-2)]" />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mis vacaciones {anio}</h1>
        </div>
        <p className="text-xs text-[var(--ink-mute)]">
          Consulta tus días, solicita periodos y sigue el estado de tus solicitudes.
        </p>
      </header>

      {/* Resumen hero */}
      {loadingResumen ? (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-mute)] mb-4">Cargando…</div>
      ) : resumen ? (
        <div className="emp-hero-card mb-4 ao-fade-in-up" style={{ animationDelay: '.06s' }}>
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-1">Días restantes</div>
                <div className={`font-display text-5xl font-bold tabular-nums leading-none ${restantes < 0 ? 'text-[var(--coral)]' : 'text-[var(--mint)]'}`}>
                  {restantes}
                  <span className="text-lg ml-1 font-normal text-[var(--ink-mute)]">/ {total}</span>
                </div>
                {resumen.dias_descontados_festivos > 0 && (
                  <div className="mt-1 text-xs text-[var(--ink-mute)]">
                    {resumen.dias_anuales} totales − {resumen.dias_descontados_festivos} por festivos no trabajados
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="emp-kpi-tile">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Disfr.</div>
                  <div className="font-display text-xl font-bold tabular-nums text-emerald-500">{disfrutados}</div>
                </div>
                <div className="emp-kpi-tile">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Aprob.</div>
                  <div className="font-display text-xl font-bold tabular-nums text-blue-400">{aprobados}</div>
                </div>
                <div className="emp-kpi-tile">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Pend.</div>
                  <div className="font-display text-xl font-bold tabular-nums text-amber-400">{pendientes}</div>
                </div>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="flex h-full">
                <div className="bg-emerald-500 transition-all" style={{ width: `${pctDisf}%` }} />
                <div className="bg-blue-400 transition-all" style={{ width: `${pctApr}%` }} />
                <div className="bg-amber-300 transition-all" style={{ width: `${pctPend}%` }} />
              </div>
            </div>
            <div className="mt-1.5 flex gap-x-4 text-[10px] text-[var(--ink-mute)]">
              <span><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle mr-1" />Disfrutados</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-blue-400 align-middle mr-1" />Aprobados</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-amber-300 align-middle mr-1" />Pendientes</span>
              <span><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-surface-2)] border border-[var(--line)] align-middle mr-1" />Disponibles</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-mute)] mb-4">
          No hay datos de vacaciones para este año.
        </div>
      )}

      {/* Formulario solicitar */}
      <div className="ao-card p-4 mb-4 ao-fade-in-up" style={{ animationDelay: '.1s' }}>
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">Solicitar nuevo periodo</h2>
        <div className="grid gap-2 grid-cols-[1fr_1fr_80px]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Inicio</label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Fin</label>
            <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Días</label>
            <div className="flex h-9 items-center justify-end rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 font-display text-base font-bold tabular-nums text-[var(--ink)]">
              {diasNuevo}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-0.5">Nota (opcional)</label>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. semana santa" className="h-9" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={guardar} disabled={diasNuevo <= 0 || solicitar.isPending}>
            {solicitar.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </div>
      </div>

      {/* Lista de periodos */}
      <div className="ao-card p-0 overflow-hidden mb-4 ao-fade-in-up" style={{ animationDelay: '.14s' }}>
        <div className="px-4 py-2.5 border-b border-[var(--line)]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Mis solicitudes {anio}</h2>
        </div>
        {loadingPeriodos && <p className="px-4 py-3 text-sm text-[var(--ink-mute)]">Cargando…</p>}
        {!loadingPeriodos && periodos?.length === 0 && (
          <p className="px-4 py-4 text-sm text-[var(--ink-mute)]">Aún no has solicitado vacaciones este año.</p>
        )}
        <ul className="divide-y divide-[var(--line)]">
          {periodos?.map(p => (
            <li key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 text-sm">
              <div>
                <div className="text-[var(--ink)]">{fmt(p.fecha_inicio)} → {fmt(p.fecha_fin)}</div>
                <div className="text-xs text-[var(--ink-mute)]">
                  {p.dias} día{p.dias === 1 ? '' : 's'}
                  {p.nota && <span> · {p.nota}</span>}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TONO[p.estado]}`}>
                {p.estado}
              </span>
              {p.estado === 'pendiente' && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Anular solicitud"
                  onClick={async () => {
                    const ok = await confirm({ title: '¿Anular esta solicitud?', confirmLabel: 'Anular', variant: 'danger' })
                    if (!ok) return
                    try { await anular.mutateAsync(p.id) }
                    catch (e) { toast({ title: 'No se pudo anular', description: e instanceof Error ? e.message : '', variant: 'error' }) }
                  }}
                >
                  <Trash2 className="ao-text-danger h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Calendario anual */}
      {periodos && periodos.length > 0 && (
        <div className="ao-fade-in-up" style={{ animationDelay: '.18s' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)] mb-2 px-1">Calendario {anio}</h2>
          <CalendarioVacaciones
            anio={anio}
            periodos={periodos.map(p => ({
              fecha_inicio: p.fecha_inicio,
              fecha_fin: p.fecha_fin,
              estado: p.estado,
            }))}
          />
        </div>
      )}
    </div>
  )
}
