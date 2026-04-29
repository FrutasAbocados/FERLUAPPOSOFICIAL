import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'

interface FilaDia {
  empleado_id: string
  nombre: string
  fila_id: string | null
  puntualidad: number
  reparto: number
  responsabilidad: number
  total: number
  nota: string | null
}

interface ResumenMes {
  empleado_id: string
  nombre: string
  dias_puntuados: number
  total_puntos: number
  pts_puntualidad: number
  pts_reparto: number
  pts_responsabilidad: number
  euros: number
}

interface DetalleDia {
  fecha: string
  puntualidad: number
  reparto: number
  responsabilidad: number
  total: number
  nota: string | null
}

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)

const fmtFechaCorta = (s: string) => format(parseISO(s), "d 'de' LLLL", { locale: es })

function usePuntosDia(fecha: string) {
  return useQuery({
    queryKey: ['puntos-dia', fecha] as const,
    queryFn: async (): Promise<FilaDia[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_dia', { p_fecha: fecha })
      if (error) throw error
      return (data ?? []).map((r: FilaDia) => ({
        ...r,
        puntualidad: Number(r.puntualidad),
        reparto: Number(r.reparto),
        responsabilidad: Number(r.responsabilidad),
        total: Number(r.total),
      }))
    },
  })
}

function useResumenMes(mesISO: string) {
  return useQuery({
    queryKey: ['puntos-resumen', mesISO] as const,
    queryFn: async (): Promise<ResumenMes[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: ResumenMes) => ({
        ...r,
        dias_puntuados: Number(r.dias_puntuados),
        total_puntos: Number(r.total_puntos),
        pts_puntualidad: Number(r.pts_puntualidad),
        pts_reparto: Number(r.pts_reparto),
        pts_responsabilidad: Number(r.pts_responsabilidad),
        euros: Number(r.euros),
      }))
    },
  })
}

function useDetalleMes(empleadoId: string | null, mesISO: string) {
  return useQuery({
    queryKey: ['puntos-detalle', empleadoId, mesISO] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<DetalleDia[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_detalle_mes', {
        p_empleado_id: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []) as DetalleDia[]
    },
  })
}

function useUpsertPunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      empleado_id: string
      fecha: string
      puntualidad: number
      reparto: number
      responsabilidad: number
      nota: string | null
    }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('trabajadores_puntos_dias')
        .upsert(
          {
            empleado_id: input.empleado_id,
            fecha: input.fecha,
            puntualidad: input.puntualidad,
            reparto: input.reparto,
            responsabilidad: input.responsabilidad,
            nota: input.nota,
            creado_por: u.user?.id ?? null,
          },
          { onConflict: 'empleado_id,fecha' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puntos-dia'] })
      qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
      qc.invalidateQueries({ queryKey: ['puntos-detalle'] })
    },
  })
}

function useDeletePunto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; fecha: string }) => {
      const { error } = await supabase
        .from('trabajadores_puntos_dias')
        .delete()
        .eq('empleado_id', input.empleado_id)
        .eq('fecha', input.fecha)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puntos-dia'] })
      qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
      qc.invalidateQueries({ queryKey: ['puntos-detalle'] })
    },
  })
}

export function PuntosView() {
  const [modo, setModo] = useState<'dia' | 'mes'>('dia')

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Puntos</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            0-2 puntos diarios en puntualidad / reparto / responsabilidad. Solo pack 1. Canje a fin de mes (50€ a partir de 30 pts, 100€ con 150 pts).
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
          <Button size="sm" variant={modo === 'dia' ? 'primary' : 'ghost'} onClick={() => setModo('dia')}>Día</Button>
          <Button size="sm" variant={modo === 'mes' ? 'primary' : 'ghost'} onClick={() => setModo('mes')}>Mes</Button>
        </div>
      </header>

      {modo === 'dia' ? <ModoDia /> : <ModoMes />}
    </div>
  )
}

function ModoDia() {
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const { data, isLoading } = usePuntosDia(fecha)
  const upsert = useUpsertPunto()
  const del = useDeletePunto()

  const cambiar = (fila: FilaDia, campo: 'puntualidad' | 'reparto' | 'responsabilidad', valor: number) => {
    upsert.mutate({
      empleado_id: fila.empleado_id,
      fecha,
      puntualidad: campo === 'puntualidad' ? valor : fila.puntualidad,
      reparto: campo === 'reparto' ? valor : fila.reparto,
      responsabilidad: campo === 'responsabilidad' ? valor : fila.responsabilidad,
      nota: fila.nota,
    })
  }

  const eliminar = (fila: FilaDia) => {
    if (!confirm(`¿Borrar los ${fila.total} puntos de ${fila.nombre} del día ${format(parseISO(fecha), "d MMM yyyy", { locale: es })}?`)) return
    del.mutate({ empleado_id: fila.empleado_id, fecha }, {
      onError: (e) => alert(`Error: ${e instanceof Error ? e.message : 'No se pudo borrar'}`),
    })
  }

  const totalDia = useMemo(
    () => (data ?? []).reduce((s, f) => s + f.total, 0),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--color-ink-3)]">Total puntos del día</div>
          <div className="font-display text-xl font-bold tabular-nums text-emerald-700">{totalDia}</div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data?.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-ink-3)]">
          No hay trabajadores activos en pack 1.
        </p>
      )}

      <ul className="space-y-2">
        {data?.map(f => (
          <li key={f.empleado_id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
              <div className="font-semibold text-[var(--color-ink)]">{f.nombre}</div>
              <CategoriaSelector label="Puntualidad" value={f.puntualidad} onChange={(v) => cambiar(f, 'puntualidad', v)} />
              <CategoriaSelector label="Reparto" value={f.reparto} onChange={(v) => cambiar(f, 'reparto', v)} />
              <CategoriaSelector label="Responsabilidad" value={f.responsabilidad} onChange={(v) => cambiar(f, 'responsabilidad', v)} />
              <div className="flex items-center justify-end gap-2 md:flex-col md:items-end md:gap-0">
                <span className="text-xs text-[var(--color-ink-3)]">Total</span>
                <div className="flex items-center gap-1">
                  <span className={`font-display text-lg font-bold tabular-nums ${f.total >= 5 ? 'text-emerald-700' : f.total >= 3 ? 'text-[var(--color-ink)]' : 'text-amber-700'}`}>
                    {f.total}
                  </span>
                  {f.total > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => eliminar(f)}
                      disabled={del.isPending}
                      title="Borrar puntos del día"
                      className="ml-1 h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoriaSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`h-9 w-9 rounded-md border text-sm font-bold transition ${
              v === value
                ? v === 0
                  ? 'border-slate-300 bg-slate-200 text-slate-700'
                  : v === 1
                  ? 'border-amber-300 bg-amber-200 text-amber-900'
                  : 'border-emerald-300 bg-emerald-200 text-emerald-900'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-3)] hover:border-[var(--color-primary)]'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

function ModoMes() {
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const mesISO = format(mes, 'yyyy-MM-dd')
  const { data, isLoading } = useResumenMes(mesISO)
  const [selected, setSelected] = useState<ResumenMes | null>(null)

  const totalEuros = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.euros, 0),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>−</Button>
          <span className="font-display text-base font-bold capitalize tabular-nums text-[var(--color-ink)]">
            {format(mes, 'LLLL yyyy', { locale: es })}
          </span>
          <Button size="sm" variant="outline" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>+</Button>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--color-ink-3)]">Total a pagar (canje)</div>
          <div className="font-display text-xl font-bold tabular-nums text-emerald-700">{eur(totalEuros)}</div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map(r => (
          <li key={r.empleado_id}>
            <button
              onClick={() => setSelected(r)}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-primary)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
                <Award className="h-5 w-5 text-[var(--color-primary-2)]" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[var(--color-ink)]">{r.nombre}</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {r.total_puntos} pts · {r.dias_puntuados} día(s) puntuados
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[var(--color-ink-3)]">
                  <span>P {r.pts_puntualidad}</span>
                  <span>R {r.pts_reparto}</span>
                  <span>Rs {r.pts_responsabilidad}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-bold tabular-nums text-emerald-700">{eur(r.euros)}</div>
                <div className="text-xs text-[var(--color-ink-3)]">canje</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <DetalleEmpleadoMes
          empleado={selected}
          mesISO={mesISO}
          mes={mes}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DetalleEmpleadoMes({
  empleado, mesISO, mes, onClose,
}: { empleado: ResumenMes; mesISO: string; mes: Date; onClose: () => void }) {
  const { data: dias } = useDetalleMes(empleado.empleado_id, mesISO)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleado.nombre}</h2>
            <p className="text-xs capitalize text-[var(--color-ink-3)]">
              {format(mes, 'LLLL yyyy', { locale: es })} · {empleado.total_puntos} pts → {eur(empleado.euros)}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="px-5 py-4">
          {dias?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Sin puntuaciones este mes.</p>}
          <ul className="divide-y divide-[var(--color-border)]">
            {dias?.map(d => (
              <li key={d.fecha} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 py-2 text-sm">
                <span className="capitalize text-[var(--color-ink)]">{fmtFechaCorta(d.fecha)}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">P {d.puntualidad}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">R {d.reparto}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">Rs {d.responsabilidad}</span>
                <span className="font-display text-base font-bold tabular-nums text-emerald-700">{d.total}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

