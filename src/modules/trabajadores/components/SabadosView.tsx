import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, Download, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'

interface Resumen {
  empleado_id: string
  nombre: string
  tarifa: number
  num_sabados: number
  importe: number
}

interface SabadoFila {
  id: string
  fecha: string
  nota: string | null
}

const eur = euros

const fmtMes = (d: Date) => format(d, "LLLL yyyy", { locale: es })

function useResumenMes(mesISO: string) {
  return useQuery({
    queryKey: ['sabados-resumen', mesISO] as const,
    queryFn: async (): Promise<Resumen[]> => {
      const { data, error } = await supabase.rpc('trabajadores_sabados_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: Resumen) => ({
        ...r,
        tarifa: Number(r.tarifa),
        num_sabados: Number(r.num_sabados),
        importe: Number(r.importe),
      }))
    },
  })
}

function useSabadosEmpleado(empleadoId: string | null, mesISO: string) {
  return useQuery({
    queryKey: ['sabados-empleado', empleadoId, mesISO] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<SabadoFila[]> => {
      const inicio = format(startOfMonth(parseISO(mesISO)), 'yyyy-MM-dd')
      const fin = format(new Date(parseISO(mesISO).getFullYear(), parseISO(mesISO).getMonth() + 1, 1), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('trabajadores_sabados_trabajados')
        .select('id, fecha, nota')
        .eq('empleado_id', empleadoId)
        .gte('fecha', inicio)
        .lt('fecha', fin)
        .order('fecha', { ascending: true })
      if (error) throw error
      return (data ?? []) as SabadoFila[]
    },
  })
}

function useToggleSabado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empleado_id, fecha, marcar }: { empleado_id: string; fecha: string; marcar: boolean }) => {
      if (marcar) {
        const { data: u } = await supabase.auth.getUser()
        const { error } = await supabase
          .from('trabajadores_sabados_trabajados')
          .insert({ empleado_id, fecha, creado_por: u.user?.id ?? null })
        if (error && !error.message.includes('duplicate')) throw error
      } else {
        const { error } = await supabase
          .from('trabajadores_sabados_trabajados')
          .delete()
          .eq('empleado_id', empleado_id)
          .eq('fecha', fecha)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sabados-resumen'] })
      qc.invalidateQueries({ queryKey: ['sabados-empleado'] })
    },
  })
}

function useImportarTurnos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mesISO: string): Promise<number> => {
      const { data, error } = await supabase.rpc('trabajadores_sabados_importar_turnos', { p_mes: mesISO })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sabados-resumen'] })
      qc.invalidateQueries({ queryKey: ['sabados-empleado'] })
    },
  })
}

export function SabadosView() {
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const mesISO = format(mes, 'yyyy-MM-dd')
  const { data, isLoading } = useResumenMes(mesISO)
  const importar = useImportarTurnos()
  const [selected, setSelected] = useState<Resumen | null>(null)

  const totalImporte = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.importe, 0),
    [data]
  )

  const importarHandler = async () => {
    try {
      const n = await importar.mutateAsync(mesISO)
      toast({
        title: n > 0 ? `Importados ${n} sábado(s) desde Turnos` : 'Sin sábados nuevos para importar',
        variant: n > 0 ? 'success' : 'default',
      })
    } catch (e) {
      toast({ title: 'No se pudo importar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Sábados (Pack 2)</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Cobro por sábado trabajado para trabajadores pack 2. Tarifa configurable por trabajador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>−</Button>
          <span className="font-display text-base font-bold capitalize tabular-nums text-[var(--color-ink)]">{fmtMes(mes)}</span>
          <Button size="sm" variant="outline" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>+</Button>
        </div>
      </header>

      <div className="ao-panel mb-3 flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <span className="text-sm text-[var(--color-ink-3)]">Total mensual a pagar</span>
          <span className="ml-2 font-display text-xl font-bold tabular-nums text-[var(--mint)]">{eur(totalImporte)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={importarHandler} disabled={importar.isPending}>
          <Download className="mr-1 h-3 w-3" />
          {importar.isPending ? 'Importando…' : 'Importar de Turnos'}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data?.length === 0 && (
        <p className="ao-card px-4 py-6 text-sm text-[var(--color-ink-3)]">
          No hay trabajadores activos en pack 2.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map(r => (
          <li key={r.empleado_id}>
            <button
              onClick={() => setSelected(r)}
              className="ao-card grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left transition hover:border-[var(--color-primary)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(92%_.08_82_/_0.85)] dark:bg-[oklch(28%_.08_72_/_0.42)]">
                <CalendarDays className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[var(--color-ink)]">{r.nombre}</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {r.num_sabados} sábado{r.num_sabados === 1 ? '' : 's'} · {eur(r.tarifa)}/sáb
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-bold tabular-nums text-[var(--mint)]">{eur(r.importe)}</div>
                <div className="text-xs text-[var(--color-ink-3)]">a pagar</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <DetalleEmpleado
          empleado={selected}
          mes={mes}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DetalleEmpleado({ empleado, mes, onClose }: { empleado: Resumen; mes: Date; onClose: () => void }) {
  const mesISO = format(mes, 'yyyy-MM-dd')
  const { data: marcados } = useSabadosEmpleado(empleado.empleado_id, mesISO)
  const toggle = useToggleSabado()

  const sabadosDelMes = useMemo(() => {
    const todosDias = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) })
    return todosDias.filter(d => d.getDay() === 6) // sábados
  }, [mes])

  const marcadosSet = useMemo(() => new Set((marcados ?? []).map(m => m.fecha)), [marcados])

  const handleToggle = (fecha: string) => {
    toggle.mutate({
      empleado_id: empleado.empleado_id,
      fecha,
      marcar: !marcadosSet.has(fecha),
    })
  }

  const numMarcados = marcadosSet.size
  const importe = numMarcados * empleado.tarifa

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleado.nombre}</h2>
            <p className="text-xs capitalize text-[var(--color-ink-3)]">{fmtMes(mes)} · {eur(empleado.tarifa)}/sábado</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-[var(--color-ink-3)]">Sábados marcados</div>
              <div className="text-right">
                <div className="font-display text-xl font-bold tabular-nums text-[var(--color-ink)]">{numMarcados} / {sabadosDelMes.length}</div>
                <div className="text-xs text-emerald-700 tabular-nums">{eur(importe)}</div>
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Sábados del mes (click para marcar)</h3>
            <ul className="grid gap-2">
              {sabadosDelMes.map(d => {
                const fechaISO = format(d, 'yyyy-MM-dd')
                const marcado = marcadosSet.has(fechaISO)
                return (
                  <li key={fechaISO}>
                    <button
                      onClick={() => handleToggle(fechaISO)}
                      disabled={toggle.isPending}
                      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${marcado ? 'border-emerald-300 bg-emerald-50' : 'border-[var(--color-border)] bg-[var(--color-surface)]'} hover:border-[var(--color-primary)]`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold ${marcado ? 'bg-emerald-500 text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'}`}>
                        {d.getDate()}
                      </div>
                      <span className="text-sm capitalize text-[var(--color-ink)]">
                        {format(d, "EEEE d 'de' LLLL", { locale: es })}
                      </span>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${marcado ? 'text-emerald-700' : 'text-[var(--color-ink-3)]'}`}>
                        {marcado ? 'trabajado' : '—'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
