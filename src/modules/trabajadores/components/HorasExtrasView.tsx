import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Banknote, CalendarOff, Check, Clock4, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'

type Modo = 'pago' | 'horas' | 'dias_vac'
type Estado = 'pendiente' | 'liquidado'

type Resumen = {
  empleado_id: string
  nombre: string
  horas_pago_pendientes: number
  horas_pago_liquidadas: number
  importe_pago_pendiente: number
  importe_pago_liquidado: number
  horas_compensadas_pend: number
  horas_compensadas_liq: number
  dias_vac_pendientes: number
  dias_vac_liquidados: number
}

type Item = {
  id: string
  empleado_id: string
  empleado_nombre: string
  fecha: string
  horas: number
  modo: Modo
  estado: Estado
  motivo: string | null
  fecha_liquidado: string | null
  importe_eur: number
  dias_vac_eq: number
  created_at: string
}

type EmpleadoOpt = { id: string; nombre: string }

const eur = euros
const fmtFechaCorta = (s: string) => format(parseISO(s), "d 'de' LLL", { locale: es })

const MODO_LABEL: Record<Modo, string> = {
  pago: 'Pago 10€/h',
  horas: 'Horas compensadas',
  dias_vac: 'Días de vacaciones',
}

function num(v: unknown) { return Number(v ?? 0) }

function useEmpleados() {
  return useQuery({
    queryKey: ['he-empleados'] as const,
    queryFn: async (): Promise<EmpleadoOpt[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, nombre, activo')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []).map((r) => ({ id: String(r.id), nombre: String(r.nombre) }))
    },
  })
}

function useResumen(mesISO: string) {
  return useQuery({
    queryKey: ['he-resumen', mesISO] as const,
    queryFn: async (): Promise<Resumen[]> => {
      const { data, error } = await supabase.rpc('trabajadores_horas_extras_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: Resumen) => ({
        ...r,
        horas_pago_pendientes: num(r.horas_pago_pendientes),
        horas_pago_liquidadas: num(r.horas_pago_liquidadas),
        importe_pago_pendiente: num(r.importe_pago_pendiente),
        importe_pago_liquidado: num(r.importe_pago_liquidado),
        horas_compensadas_pend: num(r.horas_compensadas_pend),
        horas_compensadas_liq: num(r.horas_compensadas_liq),
        dias_vac_pendientes: num(r.dias_vac_pendientes),
        dias_vac_liquidados: num(r.dias_vac_liquidados),
      }))
    },
  })
}

function useLista(mesISO: string, empleadoId: string | null) {
  return useQuery({
    queryKey: ['he-lista', mesISO, empleadoId] as const,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase.rpc('trabajadores_horas_extras_lista_mes', {
        p_mes: mesISO,
        p_empleado: empleadoId,
      })
      if (error) throw error
      return (data ?? []).map((r: Item) => ({
        ...r,
        horas: num(r.horas),
        importe_eur: num(r.importe_eur),
        dias_vac_eq: num(r.dias_vac_eq),
      }))
    },
  })
}

function useCrear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; fecha: string; horas: number; modo: Modo; motivo: string | null }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('trabajadores_horas_extras').insert({
        empleado_id: input.empleado_id,
        fecha: input.fecha,
        horas: input.horas,
        modo: input.modo,
        motivo: input.motivo,
        creado_por: u.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['he-'] }); qc.invalidateQueries({ queryKey: ['he-resumen'] }); qc.invalidateQueries({ queryKey: ['he-lista'] }) },
  })
}

function useTogglEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; estado: Estado }) => {
      const { error } = await supabase
        .from('trabajadores_horas_extras')
        .update({
          estado: input.estado,
          fecha_liquidado: input.estado === 'liquidado' ? format(new Date(), 'yyyy-MM-dd') : null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['he-resumen'] }); qc.invalidateQueries({ queryKey: ['he-lista'] }) },
  })
}

function useBorrar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_horas_extras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['he-resumen'] }); qc.invalidateQueries({ queryKey: ['he-lista'] }) },
  })
}

export function HorasExtrasView() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const mesISO = format(mes, 'yyyy-MM-dd')
  const [showForm, setShowForm] = useState(false)
  const [empleadoFiltro, setEmpleadoFiltro] = useState<string>('')

  const { data: empleados } = useEmpleados()
  const { data: resumen } = useResumen(mesISO)
  const { data: lista, isLoading } = useLista(mesISO, empleadoFiltro || null)
  const togglEstado = useTogglEstado()
  const borrar = useBorrar()

  const totalImportePend = useMemo(
    () => (resumen ?? []).reduce((s, r) => s + r.importe_pago_pendiente, 0),
    [resumen],
  )

  const handleLiquidar = (it: Item) => {
    togglEstado.mutate(
      { id: it.id, estado: it.estado === 'pendiente' ? 'liquidado' : 'pendiente' },
      { onError: (e) => toast({ title: 'Error', description: e instanceof Error ? e.message : '', variant: 'error' }) },
    )
  }

  const handleBorrar = async (it: Item) => {
    const ok = await confirm({
      title: '¿Borrar registro?',
      description: `${it.empleado_nombre} · ${fmtFechaCorta(it.fecha)} · ${it.horas} h`,
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    borrar.mutate(it.id, { onError: (e) => toast({ title: 'Error', description: e instanceof Error ? e.message : '', variant: 'error' }) })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Horas extras</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
            Compensación a elegir: pago 10€/h · horas libres (1:1) · días vacaciones (1 día = 7 h).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>−</Button>
          <span className="font-display text-base font-bold capitalize tabular-nums text-[var(--color-ink)]">
            {format(mes, 'LLLL yyyy', { locale: es })}
          </span>
          <Button size="sm" variant="outline" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>+</Button>
        </div>
      </header>

      {/* KPIs por trabajador */}
      <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Resumen del mes</h2>
          <span className="text-xs text-[var(--color-ink-3)]">
            Total a pagar pendiente: <strong className="text-emerald-700">{eur(totalImportePend)}</strong>
          </span>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {resumen?.map((r) => (
            <li key={r.empleado_id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="mb-1 font-semibold text-[var(--color-ink)]">{r.nombre}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <KpiMini icon={<Banknote className="h-3.5 w-3.5" />} label="Pago" main={eur(r.importe_pago_pendiente)} sub={`${r.horas_pago_pendientes} h pend`} />
                <KpiMini icon={<Clock4 className="h-3.5 w-3.5" />}   label="Horas" main={`${r.horas_compensadas_pend} h`} sub={`${r.horas_compensadas_liq} h liq`} />
                <KpiMini icon={<CalendarOff className="h-3.5 w-3.5" />} label="Vac"  main={`${r.dias_vac_pendientes} d`} sub={`${r.dias_vac_liquidados} d liq`} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Listado del mes */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={empleadoFiltro}
            onChange={(e) => setEmpleadoFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
          >
            <option value="">Todos los trabajadores</option>
            {empleados?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        {isAdmin && (
          <Button size="sm" variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {lista && lista.length === 0 && !isLoading && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-ink-3)]">
          Sin registros este mes.
        </p>
      )}

      {lista && lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map((it) => (
            <li key={it.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                it.estado === 'liquidado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>{it.estado}</span>
              <div className="min-w-0">
                <div className="truncate text-[var(--color-ink)]"><strong>{it.empleado_nombre}</strong> · {it.horas} h · {MODO_LABEL[it.modo]}</div>
                <div className="text-[11px] text-[var(--color-ink-3)]">
                  <span className="capitalize">{fmtFechaCorta(it.fecha)}</span>
                  {it.modo === 'pago'     && ` → ${eur(it.importe_eur)}`}
                  {it.modo === 'dias_vac' && ` → ${it.dias_vac_eq} día(s) extra`}
                  {it.motivo && ` · ${it.motivo}`}
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant={it.estado === 'pendiente' ? 'outline' : 'ghost'}
                  onClick={() => handleLiquidar(it)}
                  disabled={togglEstado.isPending}
                  title={it.estado === 'pendiente' ? 'Marcar liquidado' : 'Volver a pendiente'}
                  className="h-7"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              )}
              {isAdmin && (
                <Button size="sm" variant="ghost" onClick={() => handleBorrar(it)} disabled={borrar.isPending}
                  title="Borrar" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && empleados && (
        <NuevaModal empleados={empleados} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function KpiMini({ icon, label, main, sub }: { icon: React.ReactNode; label: string; main: string; sub: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {icon}{label}
      </div>
      <div className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">{main}</div>
      <div className="text-[10px] text-[var(--color-ink-3)]">{sub}</div>
    </div>
  )
}

function NuevaModal({ empleados, onClose }: { empleados: EmpleadoOpt[]; onClose: () => void }) {
  const [empleadoId, setEmpleadoId] = useState<string>(empleados[0]?.id ?? '')
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [horas, setHoras] = useState<number>(1)
  const [modo, setModo] = useState<Modo>('pago')
  const [motivo, setMotivo] = useState('')
  const crear = useCrear()

  const submit = () => {
    if (!empleadoId || horas <= 0) {
      toast({ title: 'Faltan datos', variant: 'error' })
      return
    }
    crear.mutate(
      { empleado_id: empleadoId, fecha, horas, modo, motivo: motivo.trim() || null },
      {
        onSuccess: () => { toast({ title: 'Horas extras registradas', variant: 'success' }); onClose() },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' }),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Nuevas horas extras</h2>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajador</label>
            <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm">
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Horas</label>
              <Input type="number" min={0.5} max={24} step={0.5} value={horas} onChange={(e) => setHoras(Number(e.target.value))} className="h-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Compensación</label>
            <div className="grid grid-cols-3 gap-1">
              {(['pago', 'horas', 'dias_vac'] as Modo[]).map((m) => (
                <button key={m} onClick={() => setModo(m)}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                    modo === m
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)]'
                  }`}>
                  {MODO_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">
              {modo === 'pago'     && `→ ${eur(horas * 10)} a pagar`}
              {modo === 'horas'    && `→ ${horas} h libres a compensar (1:1)`}
              {modo === 'dias_vac' && `→ ${(horas / 7).toFixed(2)} día(s) extra de vacaciones`}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Motivo (opcional)</label>
            <Input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: cierre tarde, sustitución, etc." className="h-9" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" variant="primary" disabled={crear.isPending} onClick={submit}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
