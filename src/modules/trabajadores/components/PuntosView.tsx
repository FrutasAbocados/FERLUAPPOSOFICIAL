import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, MessageSquare, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'

type Categoria = 'puntualidad' | 'reparto' | 'responsabilidad'

interface FilaDia {
  empleado_id: string
  nombre: string
  fila_id: string | null
  puntualidad: number
  reparto: number
  responsabilidad: number
  total: number
  nota_puntualidad: string | null
  nota_reparto: string | null
  nota_responsabilidad: string | null
}

interface ResumenMes {
  empleado_id: string
  nombre: string
  dias_puntuados: number
  pts_base: number
  pts_ajustes: number
  pts_canjeados: number
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
  nota_puntualidad: string | null
  nota_reparto: string | null
  nota_responsabilidad: string | null
}

interface Ajuste {
  id: string
  fecha: string
  delta_pts: number
  motivo: string
  creado_por: string | null
  created_at: string
}

const eur = euros

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
        pts_base: Number(r.pts_base),
        pts_ajustes: Number(r.pts_ajustes),
        pts_canjeados: Number(r.pts_canjeados ?? 0),
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

function useAjustesMes(empleadoId: string | null, mesISO: string) {
  return useQuery({
    queryKey: ['puntos-ajustes', empleadoId, mesISO] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<Ajuste[]> => {
      const { data, error } = await supabase.rpc('trabajadores_puntos_ajustes_mes', {
        p_empleado_id: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []).map((r: Ajuste) => ({ ...r, delta_pts: Number(r.delta_pts) }))
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
      nota_puntualidad: string | null
      nota_reparto: string | null
      nota_responsabilidad: string | null
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
            nota_puntualidad: input.nota_puntualidad,
            nota_reparto: input.nota_reparto,
            nota_responsabilidad: input.nota_responsabilidad,
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

function useCrearAjuste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; fecha: string; delta_pts: number; motivo: string }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('trabajadores_puntos_ajustes').insert({
        empleado_id: input.empleado_id,
        fecha: input.fecha,
        delta_pts: input.delta_pts,
        motivo: input.motivo,
        creado_por: u.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puntos-ajustes'] })
      qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
    },
  })
}

function useBorrarAjuste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_puntos_ajustes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puntos-ajustes'] })
      qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
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
            0-2 pts diarios en puntualidad / reparto / responsabilidad. Solo pack 1. Canje fin de mes: &lt;100→0€ · 100-120→50€ · 120-140→100€ · ≥140→150€.
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
  const [notasFila, setNotasFila] = useState<FilaDia | null>(null)

  const cambiar = (fila: FilaDia, campo: Categoria, valor: number) => {
    upsert.mutate({
      empleado_id: fila.empleado_id,
      fecha,
      puntualidad: campo === 'puntualidad' ? valor : fila.puntualidad,
      reparto: campo === 'reparto' ? valor : fila.reparto,
      responsabilidad: campo === 'responsabilidad' ? valor : fila.responsabilidad,
      nota_puntualidad: fila.nota_puntualidad,
      nota_reparto: fila.nota_reparto,
      nota_responsabilidad: fila.nota_responsabilidad,
    })
  }

  const guardarNotas = (fila: FilaDia, notas: { puntualidad: string; reparto: string; responsabilidad: string }) => {
    upsert.mutate(
      {
        empleado_id: fila.empleado_id,
        fecha,
        puntualidad: fila.puntualidad,
        reparto: fila.reparto,
        responsabilidad: fila.responsabilidad,
        nota_puntualidad: notas.puntualidad.trim() || null,
        nota_reparto: notas.reparto.trim() || null,
        nota_responsabilidad: notas.responsabilidad.trim() || null,
      },
      {
        onSuccess: () => {
          setNotasFila(null)
          toast({ title: 'Notas guardadas', variant: 'success' })
        },
        onError: (e) => toast({ title: 'No se pudieron guardar las notas', description: e instanceof Error ? e.message : '', variant: 'error' }),
      },
    )
  }

  const eliminar = async (fila: FilaDia) => {
    const ok = await confirm({
      title: `¿Borrar los ${fila.total} puntos?`,
      description: `${fila.nombre} · ${format(parseISO(fecha), "d MMM yyyy", { locale: es })}`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    del.mutate({ empleado_id: fila.empleado_id, fecha }, {
      onError: (e) => toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' }),
    })
  }

  const totalDia = useMemo(
    () => (data ?? []).reduce((s, f) => s + f.total, 0),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="ao-panel flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-44" />
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--color-ink-3)]">Total puntos del día</div>
          <div className="font-display text-xl font-bold tabular-nums text-[var(--mint)]">{totalDia}</div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data?.length === 0 && (
        <p className="ao-card px-4 py-6 text-sm text-[var(--color-ink-3)]">
          No hay trabajadores activos en pack 1.
        </p>
      )}

      <ul className="space-y-2">
        {data?.map(f => {
          const algunaNota = !!(f.nota_puntualidad || f.nota_reparto || f.nota_responsabilidad)
          return (
            <li key={f.empleado_id} className="ao-card p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto_auto] md:items-center">
                <div className="font-semibold text-[var(--color-ink)]">{f.nombre}</div>
                <CategoriaSelector label="Puntualidad" value={f.puntualidad} onChange={(v) => cambiar(f, 'puntualidad', v)} />
                <CategoriaSelector label="Reparto" value={f.reparto} onChange={(v) => cambiar(f, 'reparto', v)} />
                <CategoriaSelector label="Responsabilidad" value={f.responsabilidad} onChange={(v) => cambiar(f, 'responsabilidad', v)} />
                <Button
                  size="sm"
                  variant={algunaNota ? 'primary' : 'ghost'}
                  onClick={() => setNotasFila(f)}
                  title="Notas por categoría"
                  className="relative"
                >
                  <MessageSquare className="h-4 w-4" />
                  {algunaNota && <span className="ml-1 text-xs">·</span>}
                </Button>
                <div className="flex items-center justify-end gap-2 md:flex-col md:items-end md:gap-0">
                  <span className="text-xs text-[var(--color-ink-3)]">Total</span>
                  <div className="flex items-center gap-1">
                    <span className={`font-display text-lg font-bold tabular-nums ${f.total >= 5 ? 'text-[var(--mint)]' : f.total >= 3 ? 'text-[var(--color-ink)]' : 'text-[var(--color-primary)]'}`}>
                      {f.total}
                    </span>
                    {f.total > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => eliminar(f)}
                        disabled={del.isPending}
                        title="Borrar puntos del día"
                        className="ml-1 h-7 w-7 p-0 text-[var(--coral)] hover:bg-[oklch(30%_.12_25_/_0.18)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {notasFila && (
        <NotasModal
          fila={notasFila}
          fecha={fecha}
          onClose={() => setNotasFila(null)}
          onSave={(notas) => guardarNotas(notasFila, notas)}
          saving={upsert.isPending}
        />
      )}
    </div>
  )
}

function NotasModal({
  fila, fecha, onClose, onSave, saving,
}: {
  fila: FilaDia
  fecha: string
  onClose: () => void
  onSave: (notas: { puntualidad: string; reparto: string; responsabilidad: string }) => void
  saving: boolean
}) {
  const [pun, setPun] = useState(fila.nota_puntualidad ?? '')
  const [rep, setRep] = useState(fila.nota_reparto ?? '')
  const [res, setRes] = useState(fila.nota_responsabilidad ?? '')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Notas · {fila.nombre}</h2>
            <p className="text-xs text-[var(--color-ink-3)]">{format(parseISO(fecha), "d 'de' LLLL yyyy", { locale: es })}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <NotaCampo label={`Puntualidad (${fila.puntualidad})`} value={pun} onChange={setPun} />
          <NotaCampo label={`Reparto (${fila.reparto})`} value={rep} onChange={setRep} />
          <NotaCampo label={`Responsabilidad (${fila.responsabilidad})`} value={res} onChange={setRes} />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={saving}
            onClick={() => onSave({ puntualidad: pun, reparto: rep, responsabilidad: res })}
          >
            {saving ? 'Guardando…' : 'Guardar notas'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function NotaCampo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Por qué se ha puntuado así…"
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-primary)] focus:outline-none"
      />
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
                  {(r.pts_ajustes !== 0 || r.pts_canjeados !== 0) && (
                    <span className={r.pts_ajustes - r.pts_canjeados >= 0 ? ' text-emerald-700' : ' text-red-700'}>
                      {' '}({r.pts_base} base {r.pts_ajustes >= 0 ? '+' : ''}{r.pts_ajustes} ajuste{r.pts_canjeados ? ` -${r.pts_canjeados} canje` : ''})
                    </span>
                  )}
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
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'
  const { data: dias } = useDetalleMes(empleado.empleado_id, mesISO)
  const { data: ajustes } = useAjustesMes(empleado.empleado_id, mesISO)
  const crearAjuste = useCrearAjuste()
  const borrarAjuste = useBorrarAjuste()

  const [showAjusteForm, setShowAjusteForm] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState(format(mes, 'yyyy-MM-dd'))
  const [nuevaDelta, setNuevaDelta] = useState(1)
  const [nuevoMotivo, setNuevoMotivo] = useState('')

  const submitAjuste = () => {
    if (!nuevoMotivo.trim()) {
      toast({ title: 'Falta el motivo', variant: 'error' })
      return
    }
    if (nuevaDelta === 0) {
      toast({ title: 'El ajuste no puede ser 0', variant: 'error' })
      return
    }
    crearAjuste.mutate(
      { empleado_id: empleado.empleado_id, fecha: nuevaFecha, delta_pts: nuevaDelta, motivo: nuevoMotivo.trim() },
      {
        onSuccess: () => {
          setNuevoMotivo('')
          setNuevaDelta(1)
          setShowAjusteForm(false)
          toast({ title: 'Ajuste guardado', variant: 'success' })
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' }),
      },
    )
  }

  const eliminarAjuste = async (a: Ajuste) => {
    const ok = await confirm({
      title: `¿Borrar ajuste ${a.delta_pts >= 0 ? '+' : ''}${a.delta_pts} pts?`,
      description: `${fmtFechaCorta(a.fecha)} · ${a.motivo}`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    borrarAjuste.mutate(a.id, {
      onError: (e) => toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' }),
    })
  }

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
            {(empleado.pts_ajustes !== 0 || empleado.pts_canjeados !== 0) && (
              <p className="text-[11px] text-[var(--color-ink-3)]">
                {empleado.pts_base} base {empleado.pts_ajustes >= 0 ? '+' : ''}{empleado.pts_ajustes} ajuste{empleado.pts_canjeados ? ` - ${empleado.pts_canjeados} canje ruleta` : ''} = {empleado.total_puntos}
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Días puntuados */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Días puntuados</h3>
            {dias?.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Sin puntuaciones este mes.</p>}
            <ul className="divide-y divide-[var(--color-border)]">
              {dias?.map(d => {
                const algunaNota = !!(d.nota_puntualidad || d.nota_reparto || d.nota_responsabilidad)
                return (
                  <li key={d.fecha} className="py-2 text-sm">
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3">
                      <span className="capitalize text-[var(--color-ink)]">{fmtFechaCorta(d.fecha)}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">P {d.puntualidad}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">R {d.reparto}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">Rs {d.responsabilidad}</span>
                      <span className="font-display text-base font-bold tabular-nums text-emerald-700">{d.total}</span>
                    </div>
                    {algunaNota && (
                      <div className="mt-1 space-y-0.5 pl-2 text-[11px] text-[var(--color-ink-2)]">
                        {d.nota_puntualidad     && <div><span className="text-[var(--color-ink-3)]">P:</span> {d.nota_puntualidad}</div>}
                        {d.nota_reparto         && <div><span className="text-[var(--color-ink-3)]">R:</span> {d.nota_reparto}</div>}
                        {d.nota_responsabilidad && <div><span className="text-[var(--color-ink-3)]">Rs:</span> {d.nota_responsabilidad}</div>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {/* Ajustes manuales */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Ajustes manuales</h3>
              {isAdmin && !showAjusteForm && (
                <Button size="sm" variant="outline" onClick={() => setShowAjusteForm(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo ajuste
                </Button>
              )}
            </div>

            {showAjusteForm && (
              <div className="mb-3 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
                    <Input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className="h-8" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Δ Puntos</label>
                    <Input
                      type="number"
                      step={1}
                      min={-10}
                      max={10}
                      value={nuevaDelta}
                      onChange={(e) => setNuevaDelta(Number(e.target.value))}
                      className="h-8 w-20 text-right tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Motivo</label>
                  <Input
                    type="text"
                    value={nuevoMotivo}
                    onChange={(e) => setNuevoMotivo(e.target.value)}
                    placeholder="Ej: ayudó al cierre fuera de horario"
                    className="h-8"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowAjusteForm(false)}>Cancelar</Button>
                  <Button size="sm" variant="primary" disabled={crearAjuste.isPending} onClick={submitAjuste}>
                    {crearAjuste.isPending ? 'Guardando…' : 'Guardar ajuste'}
                  </Button>
                </div>
              </div>
            )}

            {ajustes?.length === 0 && !showAjusteForm && (
              <p className="text-sm text-[var(--color-ink-3)]">Sin ajustes este mes.</p>
            )}

            {ajustes && ajustes.length > 0 && (
              <ul className="space-y-1">
                {ajustes.map(a => (
                  <li key={a.id} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${a.delta_pts > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {a.delta_pts > 0 ? '+' : ''}{a.delta_pts}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="capitalize text-[var(--color-ink)]">{fmtFechaCorta(a.fecha)}</div>
                      <div className="break-words text-xs text-[var(--color-ink-2)]">{a.motivo}</div>
                    </div>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => eliminarAjuste(a)}
                        disabled={borrarAjuste.isPending}
                        title="Borrar ajuste"
                        className="h-7 w-7 shrink-0 p-0 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
