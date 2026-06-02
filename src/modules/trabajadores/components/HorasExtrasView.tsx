import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Banknote, CalendarOff, Check, Clock4, Inbox, Trash2, X } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'

type Modo = 'pago' | 'horas' | 'dias_vac'
type Estado = 'pendiente' | 'liquidado'
type Aprobacion = 'solicitado' | 'aprobado' | 'rechazado'

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
  modo: Modo | null
  estado: Estado
  aprobacion: Aprobacion
  motivo: string | null
  motivo_rechazo: string | null
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

function mapItem(r: Item): Item {
  return { ...r, horas: num(r.horas), importe_eur: num(r.importe_eur), dias_vac_eq: num(r.dias_vac_eq) }
}

function useEmpleados() {
  return useQuery({
    queryKey: ['he-empleados'] as const,
    queryFn: async (): Promise<EmpleadoOpt[]> => {
      const { data, error } = await supabase
        .from('empleados_equipo')
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
        p_aprobacion: 'aprobado',
      })
      if (error) throw error
      return (data ?? []).map((r: Item) => mapItem(r))
    },
  })
}

function useSolicitudes(mesISO: string) {
  return useQuery({
    queryKey: ['he-solicitudes', mesISO] as const,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase.rpc('trabajadores_horas_extras_lista_mes', {
        p_mes: mesISO,
        p_empleado: null,
        p_aprobacion: 'solicitado',
      })
      if (error) throw error
      return (data ?? []).map((r: Item) => mapItem(r))
    },
  })
}

function useResolver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; aprobar: boolean; modo?: Modo; motivo_rechazo?: string | null }) => {
      const { error } = await supabase.rpc('trabajadores_horas_extras_resolver', {
        p_id: input.id,
        p_aprobar: input.aprobar,
        p_modo: input.modo ?? null,
        p_motivo_rechazo: input.motivo_rechazo ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['he-solicitudes'] })
      qc.invalidateQueries({ queryKey: ['he-resumen'] })
      qc.invalidateQueries({ queryKey: ['he-lista'] })
    },
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
  const [empleadoFiltro, setEmpleadoFiltro] = useState<string>('')

  const { data: empleados } = useEmpleados()
  const { data: resumen } = useResumen(mesISO)
  const { data: solicitudes } = useSolicitudes(mesISO)
  const { data: lista, isLoading } = useLista(mesISO, empleadoFiltro || null)
  const togglEstado = useTogglEstado()
  const resolver = useResolver()
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
            Las pide cada trabajador. Apruébalas eligiendo compensación: pago 10€/h · horas libres (1:1) · días vacaciones (1 día = 7 h).
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

      {/* Bandeja de solicitudes de los trabajadores */}
      <div className="ao-card mb-5 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
            <Inbox className="h-4 w-4 text-[var(--color-primary-2)]" /> Solicitudes pendientes
          </h2>
          {solicitudes && solicitudes.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800">
              {solicitudes.length}
            </span>
          )}
        </div>
        {(!solicitudes || solicitudes.length === 0) ? (
          <p className="px-4 py-4 text-sm text-[var(--color-ink-3)]">No hay peticiones por revisar este mes.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {solicitudes.map((it) => (
              <SolicitudRow
                key={it.id}
                it={it}
                pending={resolver.isPending}
                onAprobar={(modo) => resolver.mutate(
                  { id: it.id, aprobar: true, modo },
                  { onError: (e) => toast({ title: 'No se pudo aprobar', description: e instanceof Error ? e.message : '', variant: 'error' }) },
                )}
                onRechazar={(motivo) => resolver.mutate(
                  { id: it.id, aprobar: false, motivo_rechazo: motivo },
                  { onError: (e) => toast({ title: 'No se pudo rechazar', description: e instanceof Error ? e.message : '', variant: 'error' }) },
                )}
              />
            ))}
          </ul>
        )}
      </div>

      {/* KPIs por trabajador */}
      <div className="ao-card mb-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Resumen del mes</h2>
          <span className="text-xs text-[var(--color-ink-3)]">
            Total a pagar pendiente: <strong className="text-[var(--mint)]">{eur(totalImportePend)}</strong>
          </span>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {resumen?.map((r) => (
            <li key={r.empleado_id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
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
        <span className="text-xs text-[var(--color-ink-3)]">Horas extras aprobadas</span>
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
                <div className="truncate text-[var(--color-ink)]"><strong>{it.empleado_nombre}</strong> · {it.horas} h{it.modo && ` · ${MODO_LABEL[it.modo]}`}</div>
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
    </div>
  )
}

function SolicitudRow({
  it, pending, onAprobar, onRechazar,
}: {
  it: Item
  pending: boolean
  onAprobar: (modo: Modo) => void
  onRechazar: (motivo: string | null) => void
}) {
  const [modo, setModo] = useState<Modo>('pago')
  const [rechazando, setRechazando] = useState(false)
  const [motivoRech, setMotivoRech] = useState('')

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[var(--color-ink)]"><strong>{it.empleado_nombre}</strong> · {it.horas} h</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            <span className="capitalize">{fmtFechaCorta(it.fecha)}</span>
            {it.motivo && <span> · {it.motivo}</span>}
          </div>
        </div>
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
          solicitado
        </span>
      </div>

      {!rechazando ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 gap-1">
            {(['pago', 'horas', 'dias_vac'] as Modo[]).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                  modo === m
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:border-[var(--color-primary)]'
                }`}>
                {MODO_LABEL[m]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--color-ink-3)]">
            {modo === 'pago'     && `→ ${eur(it.horas * 10)}`}
            {modo === 'horas'    && `→ ${it.horas} h libres`}
            {modo === 'dias_vac' && `→ ${(it.horas / 7).toFixed(2)} día(s)`}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => onAprobar(modo)}>
              <Check className="mr-1 h-3.5 w-3.5" /> Aprobar
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRechazando(true)}
              className="text-red-600 hover:bg-red-50">
              <X className="mr-1 h-3.5 w-3.5" /> Rechazar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input value={motivoRech} onChange={(e) => setMotivoRech(e.target.value)}
            placeholder="Motivo del rechazo (opcional)" className="h-9 min-w-[180px] flex-1" />
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRechazando(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" disabled={pending}
              onClick={() => onRechazar(motivoRech.trim() || null)}
              className="bg-red-600 hover:bg-red-700">
              Confirmar rechazo
            </Button>
          </div>
        </div>
      )}
    </li>
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
