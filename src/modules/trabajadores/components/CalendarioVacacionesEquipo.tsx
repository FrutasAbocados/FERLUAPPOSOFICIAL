import { useQuery } from '@tanstack/react-query'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'

interface PeriodoEquipo {
  id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'pendiente' | 'aprobado' | 'disfrutado'
  empleados: { nombre: string } | null
}

const COLORES = [
  'bg-emerald-100 text-emerald-950 border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-blue-100 text-blue-950 border-blue-500 dark:bg-blue-950 dark:text-blue-200',
  'bg-violet-100 text-violet-950 border-violet-500 dark:bg-violet-950 dark:text-violet-200',
  'bg-amber-100 text-amber-950 border-amber-500 dark:bg-amber-950 dark:text-amber-200',
  'bg-rose-100 text-rose-950 border-rose-500 dark:bg-rose-950 dark:text-rose-200',
  'bg-cyan-100 text-cyan-950 border-cyan-500 dark:bg-cyan-950 dark:text-cyan-200',
  'bg-orange-100 text-orange-950 border-orange-500 dark:bg-orange-950 dark:text-orange-200',
  'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-500 dark:bg-fuchsia-950 dark:text-fuchsia-200',
]

export function CalendarioVacacionesEquipo({ anio, mes, onMesChange }: {
  anio: number
  mes: number
  onMesChange: (fecha: Date) => void
}) {
  const fecha = new Date(anio, mes, 1)
  const inicio = format(startOfWeek(startOfMonth(fecha), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const fin = format(endOfWeek(endOfMonth(fecha), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['trabajadores', 'vacaciones-calendario', inicio, fin] as const,
    queryFn: async () => {
      const [periodos, empleados, socios] = await Promise.all([
        supabase.from('trabajadores_vacaciones')
          .select('id, empleado_id, fecha_inicio, fecha_fin, estado, empleados(nombre)')
          .lte('fecha_inicio', fin).gte('fecha_fin', inicio).order('fecha_inicio'),
        supabase.from('empleados').select('id, nombre').order('id'),
        supabase.from('socios_vacaciones').select('id, socio, fecha_inicio, fecha_fin')
          .lte('fecha_inicio', fin).gte('fecha_fin', inicio).order('fecha_inicio'),
      ])
      if (periodos.error) throw periodos.error
      if (empleados.error) throw empleados.error
      if (socios.error) throw socios.error
      const periodosSocios: PeriodoEquipo[] = socios.data.map(p => ({
        id: `socio-${p.id}`,
        empleado_id: `socio-${p.socio}`,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        estado: 'aprobado',
        empleados: { nombre: `${p.socio} · Socio` },
      }))
      return {
        periodos: [...periodos.data as unknown as PeriodoEquipo[], ...periodosSocios],
        empleados: [...empleados.data, { id: 'socio-Luis', nombre: 'Luis · Socio' }, { id: 'socio-Álvaro', nombre: 'Álvaro · Socio' }],
      }
    },
  })
  const colores = new Map(data?.empleados.map((e, i) => [e.id, COLORES[i % COLORES.length]]))
  colores.set('socio-Luis', 'bg-lime-100 text-lime-950 border-lime-500 dark:bg-lime-950 dark:text-lime-200')
  colores.set('socio-Álvaro', 'bg-sky-100 text-sky-950 border-sky-500 dark:bg-sky-950 dark:text-sky-200')
  const dias = eachDayOfInterval({
    start: startOfWeek(startOfMonth(fecha), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(fecha), { weekStartsOn: 1 }),
  })
  const periodosMes = data?.periodos.filter(p => p.fecha_inicio <= format(endOfMonth(fecha), 'yyyy-MM-dd') && p.fecha_fin >= format(fecha, 'yyyy-MM-dd')) ?? []

  return (
    <section aria-label="Calendario de vacaciones del equipo" className="ao-card mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] p-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Vacaciones del equipo y socios</h2>
          <p aria-live="polite" className="text-lg font-bold capitalize text-[var(--color-ink)]">{format(fecha, 'LLLL yyyy', { locale: es })}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" aria-label="Mes anterior" onClick={() => onMesChange(addMonths(fecha, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => onMesChange(new Date())}>Hoy</Button>
          <Button size="sm" variant="outline" aria-label="Mes siguiente" onClick={() => onMesChange(addMonths(fecha, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {isPending ? <p role="status" className="p-4 text-sm text-[var(--color-ink-3)]">Cargando vacaciones…</p> : isError ? (
        <div role="alert" className="p-4 text-sm text-[var(--color-ink)]">No se pudieron cargar las vacaciones. <Button size="sm" variant="outline" onClick={() => void refetch()}>Reintentar</Button></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 p-3">
            {data?.empleados.filter(e => periodosMes.some(p => p.empleado_id === e.id)).map(e => (
              <span key={e.id} className={`rounded border-l-4 px-2 py-1 text-xs font-medium ${colores.get(e.id)}`}>{e.nombre}</span>
            ))}
            <span className="self-center text-xs text-[var(--color-ink-3)]">Borde discontinuo: pendiente · ✓: disfrutado · Resto: aprobado</span>
          </div>
          {periodosMes.length === 0 && <p className="px-3 pb-3 text-sm text-[var(--color-ink-3)]">Sin vacaciones registradas este mes.</p>}
          <div className="overflow-x-auto" tabIndex={0} aria-label="Calendario mensual; desplaza horizontalmente en pantallas pequeñas">
            <div className="min-w-[630px]">
              <div className="grid grid-cols-7 bg-[var(--color-surface-2)] text-center text-xs font-semibold text-[var(--color-ink-3)]">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {dias.map(d => {
                  const iso = format(d, 'yyyy-MM-dd')
                  const periodos = data?.periodos.filter(p => p.fecha_inicio <= iso && p.fecha_fin >= iso) ?? []
                  return (
                    <div key={iso} className={`min-h-24 min-w-0 border-t border-r border-[var(--color-border)] p-1 ${!isSameMonth(d, fecha) ? 'bg-[var(--color-surface-2)]' : ''}`}>
                      <time dateTime={iso} aria-current={isToday(d) ? 'date' : undefined} className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${isToday(d) ? 'bg-[var(--color-primary)] font-bold text-white' : 'text-[var(--color-ink-3)]'}`}>{d.getDate()}</time>
                      <div className="space-y-1">
                        {periodos.map(p => (
                          <div key={p.id} title={`${p.empleados?.nombre ?? 'Trabajador'} · ${p.estado} · ${p.fecha_inicio} → ${p.fecha_fin}`} className={`rounded border px-1 py-0.5 text-[11px] font-medium ${colores.get(p.empleado_id) ?? COLORES[0]} ${p.estado === 'pendiente' ? 'border-dashed' : 'border-solid'}`}>
                            <span className="break-words">{p.estado === 'disfrutado' ? '✓ ' : ''}{p.empleados?.nombre ?? 'Trabajador'}</span>
                            <span className="sr-only"> · {p.estado}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
