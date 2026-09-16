import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import { CalendarioVacacionesEquipo } from '@/modules/trabajadores/components/CalendarioVacacionesEquipo'

interface PeriodoSocio {
  id: string
  socio: 'Luis' | 'Álvaro'
  fecha_inicio: string
  fecha_fin: string
}

export function VacacionesSociosPage() {
  const [mes, setMes] = useState(new Date())
  const qc = useQueryClient()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['socios', 'vacaciones'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('socios_vacaciones')
        .select('id, socio, fecha_inicio, fecha_fin').order('fecha_inicio', { ascending: false })
      if (error) throw error
      return data as PeriodoSocio[]
    },
  })
  const mutation = useMutation({
    mutationFn: async (input: { action: 'guardar'; periodo: Omit<PeriodoSocio, 'id'>; id?: string } | { action: 'borrar'; id: string }) => {
      const query = input.action === 'borrar'
        ? supabase.from('socios_vacaciones').delete().eq('id', input.id)
        : input.id
          ? supabase.from('socios_vacaciones').update(input.periodo).eq('id', input.id)
          : supabase.from('socios_vacaciones').insert(input.periodo)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['socios', 'vacaciones'] }),
        qc.invalidateQueries({ queryKey: ['trabajadores', 'vacaciones-calendario'] }),
      ])
    },
    onError: (error) => toast({ title: 'No se pudieron guardar los cambios', description: error.message, variant: 'error' }),
  })
  const [nuevo, setNuevo] = useState(0)

  return (
    <div>
      <PageTopbar breadcrumb="SOCIOS · VACACIONES" title="Vacaciones de socios" subtitle="Elige las fechas de Luis y Álvaro para verlas junto a las del equipo." />
      <div className="ao-page max-w-5xl space-y-4 py-6 md:py-8">
        <section className="ao-card p-3">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Añadir vacaciones</h2>
          <EditorPeriodo key={nuevo} busy={mutation.isPending} onSave={async periodo => {
            await mutation.mutateAsync({ action: 'guardar', periodo })
            setMes(parseISO(periodo.fecha_inicio))
            setNuevo(n => n + 1)
          }} />
        </section>
        <CalendarioVacacionesEquipo anio={mes.getFullYear()} mes={mes.getMonth()} onMesChange={setMes} />
        <section className="ao-card p-3">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Periodos de vacaciones de socios</h2>
          {isPending && <p role="status">Cargando vacaciones…</p>}
          {isError && <p role="alert">No se pudieron cargar los periodos. <Button size="sm" onClick={() => void refetch()}>Reintentar</Button></p>}
          {data?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Todavía no hay vacaciones registradas.</p>}
          <div className="space-y-3">
            {data?.map(periodo => <EditorPeriodo key={`${periodo.id}-${periodo.socio}-${periodo.fecha_inicio}-${periodo.fecha_fin}`} periodo={periodo} busy={mutation.isPending}
              onSave={async value => {
                await mutation.mutateAsync({ action: 'guardar', id: periodo.id, periodo: value })
                setMes(parseISO(value.fecha_inicio))
              }}
              onDelete={async () => {
                if (await confirm({ title: `¿Borrar las vacaciones de ${periodo.socio}?`, confirmLabel: 'Borrar', variant: 'danger' })) {
                  await mutation.mutateAsync({ action: 'borrar', id: periodo.id })
                }
              }} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

function EditorPeriodo({ periodo, busy, onSave, onDelete }: {
  periodo?: PeriodoSocio
  busy: boolean
  onSave: (value: Omit<PeriodoSocio, 'id'>) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [socio, setSocio] = useState<PeriodoSocio['socio']>(periodo?.socio ?? 'Luis')
  const [inicio, setInicio] = useState(periodo?.fecha_inicio ?? format(new Date(), 'yyyy-MM-dd'))
  const [fin, setFin] = useState(periodo?.fecha_fin ?? format(new Date(), 'yyyy-MM-dd'))
  const valido = !!inicio && !!fin && fin >= inicio
  const dias = valido ? differenceInCalendarDays(parseISO(fin), parseISO(inicio)) + 1 : 0
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] p-2" onSubmit={async e => {
      e.preventDefault()
      if (!valido || busy) return
      try { await onSave({ socio, fecha_inicio: inicio, fecha_fin: fin }) } catch { /* La mutación muestra el error. */ }
    }}>
      <label className="text-xs text-[var(--color-ink-3)]">Socio
        <select aria-label="Socio" value={socio} onChange={e => setSocio(e.target.value as PeriodoSocio['socio'])} className="mt-1 block h-10 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)]">
          <option>Luis</option><option>Álvaro</option>
        </select>
      </label>
      <label className="text-xs text-[var(--color-ink-3)]">Inicio<Input required type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="mt-1" /></label>
      <label className="text-xs text-[var(--color-ink-3)]">Fin<Input required type="date" min={inicio} value={fin} onChange={e => setFin(e.target.value)} className="mt-1" /></label>
      <span className="self-center text-xs tabular-nums text-[var(--color-ink-3)]">{dias} días naturales</span>
      <Button type="submit" disabled={!valido || busy}>{periodo ? 'Guardar' : 'Añadir'}</Button>
      {onDelete && <Button type="button" variant="ghost" disabled={busy} onClick={async () => {
        try { await onDelete() } catch { /* La mutación muestra el error. */ }
      }}>Borrar</Button>}
    </form>
  )
}
