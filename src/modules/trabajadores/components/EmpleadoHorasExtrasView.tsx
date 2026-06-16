import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Banknote, CalendarOff, Clock4, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

type Modo = 'pago' | 'horas' | 'dias_vac'
type Aprobacion = 'solicitado' | 'aprobado' | 'rechazado'

interface Item {
  id: string
  fecha: string
  horas: number
  modo: Modo | null
  estado: 'pendiente' | 'liquidado'
  aprobacion: Aprobacion
  motivo: string | null
  motivo_rechazo: string | null
  created_at: string
}

const MODO_LABEL: Record<Modo, string> = {
  pago: 'Pago 10€/h',
  horas: 'Horas libres',
  dias_vac: 'Días de vacaciones',
}

const APROB_TONO: Record<Aprobacion, string> = {
  solicitado: 'bg-amber-100 text-amber-800',
  aprobado: 'bg-blue-100 text-blue-800',
  rechazado: 'bg-red-100 text-red-800',
}

const fmt = (s: string) => format(parseISO(s), "d 'de' LLLL", { locale: es })
const num = (v: unknown) => Number(v ?? 0)

interface ResumenHE {
  horas_pago_pendientes: number
  horas_pago_liquidadas: number
  importe_pago_pendiente: number
  importe_pago_liquidado: number
  horas_compensadas_pend: number
  horas_compensadas_liq: number
  dias_vac_pendientes: number
  dias_vac_liquidados: number
}

// Mismo cálculo que el admin (trabajadores_horas_extras_resumen_mes) pero scoped al
// propio empleado → la vista del empleado y la del admin SIEMPRE cuadran.
function useMiResumen(mesISO: string) {
  return useQuery({
    queryKey: ['emp-he-resumen', mesISO] as const,
    queryFn: async (): Promise<ResumenHE | null> => {
      const { data, error } = await supabase.rpc('trabajadores_horas_extras_resumen_self', { p_mes: mesISO })
      if (error) throw error
      const r = (data ?? [])[0] as ResumenHE | undefined
      if (!r) return null
      return {
        horas_pago_pendientes: num(r.horas_pago_pendientes),
        horas_pago_liquidadas: num(r.horas_pago_liquidadas),
        importe_pago_pendiente: num(r.importe_pago_pendiente),
        importe_pago_liquidado: num(r.importe_pago_liquidado),
        horas_compensadas_pend: num(r.horas_compensadas_pend),
        horas_compensadas_liq: num(r.horas_compensadas_liq),
        dias_vac_pendientes: num(r.dias_vac_pendientes),
        dias_vac_liquidados: num(r.dias_vac_liquidados),
      }
    },
  })
}

function useMisHoras(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-he', empleadoId, mesISO] as const,
    queryFn: async (): Promise<Item[]> => {
      const inicio = mesISO
      const fin = format(new Date(parseISO(mesISO).getFullYear(), parseISO(mesISO).getMonth() + 1, 1), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('trabajadores_horas_extras')
        .select('id, fecha, horas, modo, estado, aprobacion, motivo, motivo_rechazo, created_at')
        .eq('empleado_id', empleadoId)
        .gte('fecha', inicio)
        .lt('fecha', fin)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({ ...r, horas: num((r as Item).horas) })) as Item[]
    },
  })
}

export function EmpleadoHorasExtrasView({ empleado }: { empleado: EmpleadoPropio }) {
  const qc = useQueryClient()
  const [mes, setMes] = useState<Date>(startOfMonth(new Date()))
  const mesISO = format(mes, 'yyyy-MM-dd')

  const { data: items, isLoading } = useMisHoras(empleado.id, mesISO)
  const { data: resumen } = useMiResumen(mesISO)

  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [horasStr, setHorasStr] = useState('1')
  const horas = useMemo(() => {
    const n = Number(horasStr.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [horasStr])
  const [motivo, setMotivo] = useState('')

  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('trabajadores_horas_extras_solicitar', {
        p_fecha: fecha,
        p_horas: horas,
        p_motivo: motivo.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emp-he'] })
      setMotivo('')
      setHorasStr('1')
      toast({ title: 'Petición enviada', description: 'El responsable la revisará pronto.', variant: 'success' })
    },
    onError: (e) => toast({ title: 'No se pudo enviar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const anular = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('trabajadores_horas_extras_cancelar_propia', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emp-he'] }),
    onError: (e) => toast({ title: 'No se pudo anular', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const nSolicitadas = useMemo(
    () => (items ?? []).filter((i) => i.aprobacion === 'solicitado').length,
    [items],
  )

  const enviar = () => {
    if (horas <= 0) {
      toast({ title: 'Indica las horas', variant: 'error' })
      return
    }
    solicitar.mutate()
  }

  return (
    <div className="ao-page py-5 md:py-7">
      {/* Header */}
      <header className="mb-5 ao-fade-in-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Clock4 className="h-5 w-5 text-[var(--color-primary-2)]" />
            <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mis horas extras</h1>
          </div>
          <p className="text-xs text-[var(--ink-mute)]">
            Pide tus horas extra con una nota. El responsable decide la compensación (pago, horas libres o vacaciones).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>−</Button>
          <span className="font-display text-base font-bold capitalize tabular-nums text-[var(--ink)]">
            {format(mes, 'LLLL yyyy', { locale: es })}
          </span>
          <Button size="sm" variant="outline" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>+</Button>
        </div>
      </header>

      {/* KPIs propios — mismo desglose (y mismos datos) que ve el responsable */}
      <div className="emp-hero-card mb-4 ao-fade-in-up" style={{ animationDelay: '.06s' }}>
        <div className="relative z-10 grid grid-cols-3 gap-2 text-center">
          <div className="emp-kpi-tile">
            <div className="mb-0.5 flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
              <Banknote className="h-3 w-3" /> Pago
            </div>
            <div className="font-display text-2xl font-bold tabular-nums text-amber-400">{euros(resumen?.importe_pago_pendiente ?? 0)}</div>
            <div className="text-[10px] text-[var(--ink-mute)]">{resumen?.horas_pago_pendientes ?? 0} h pendientes</div>
          </div>
          <div className="emp-kpi-tile">
            <div className="mb-0.5 flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
              <Clock4 className="h-3 w-3" /> Horas libres
            </div>
            <div className="font-display text-2xl font-bold tabular-nums text-blue-400">{resumen?.horas_compensadas_pend ?? 0}<span className="ml-0.5 text-xs font-normal text-[var(--ink-mute)]">h</span></div>
            <div className="text-[10px] text-[var(--ink-mute)]">{resumen?.horas_compensadas_liq ?? 0} h ya saldadas</div>
          </div>
          <div className="emp-kpi-tile">
            <div className="mb-0.5 flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
              <CalendarOff className="h-3 w-3" /> Vacaciones
            </div>
            <div className="font-display text-2xl font-bold tabular-nums text-emerald-500">{resumen?.dias_vac_pendientes ?? 0}<span className="ml-0.5 text-xs font-normal text-[var(--ink-mute)]">d</span></div>
            <div className="text-[10px] text-[var(--ink-mute)]">{resumen?.dias_vac_liquidados ?? 0} d ya saldados</div>
          </div>
        </div>
        {nSolicitadas > 0 && (
          <div className="relative z-10 mt-2 text-center text-[11px] text-amber-400">
            {nSolicitadas} petición(es) esperando aprobación del responsable
          </div>
        )}
      </div>

      {/* Formulario solicitar */}
      <div className="ao-card mb-4 p-4 ao-fade-in-up" style={{ animationDelay: '.1s' }}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Pedir horas extra</h2>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Día</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Horas</label>
            <Input
              type="text"
              inputMode="decimal"
              value={horasStr}
              onChange={(e) => setHorasStr(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="1,5"
              className="h-9 text-right tabular-nums"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['0,5', '1', '1,5', '2', '3', '4'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setHorasStr(v)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                horasStr === v
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'border-[var(--line)] text-[var(--ink-mute)] hover:border-[var(--color-primary)]'
              }`}
            >
              {v} h
            </button>
          ))}
          <span className="self-center text-[11px] text-[var(--ink-mute)]">Puedes poner medias horas (0,5).</span>
        </div>
        <div className="mt-2">
          <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Observaciones</label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. cierre tarde, reparto extra, sustitución…" className="h-9" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={enviar} disabled={horas <= 0 || solicitar.isPending}>
            {solicitar.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </div>
      </div>

      {/* Lista de peticiones propias */}
      <div className="ao-card mb-4 overflow-hidden p-0 ao-fade-in-up" style={{ animationDelay: '.14s' }}>
        <div className="border-b border-[var(--line)] px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Mis peticiones del mes</h2>
        </div>
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--ink-mute)]">Cargando…</p>}
        {!isLoading && items?.length === 0 && (
          <p className="px-4 py-4 text-sm text-[var(--ink-mute)]">Aún no has pedido horas extra este mes.</p>
        )}
        <ul className="divide-y divide-[var(--line)]">
          {items?.map((it) => (
            <li key={it.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="text-[var(--ink)]">
                  <span className="capitalize">{fmt(it.fecha)}</span> · <strong className="tabular-nums">{it.horas} h</strong>
                  {it.aprobacion === 'aprobado' && it.modo && <span className="text-[var(--ink-mute)]"> · {MODO_LABEL[it.modo]}</span>}
                  {it.aprobacion === 'aprobado' && it.modo === 'pago' && <span className="text-[var(--ink-mute)]"> · {euros(it.horas * 10)}</span>}
                </div>
                <div className="text-xs text-[var(--ink-mute)]">
                  {it.motivo && <span>{it.motivo}</span>}
                  {it.aprobacion === 'rechazado' && it.motivo_rechazo && <span className="text-red-500"> · {it.motivo_rechazo}</span>}
                  {it.aprobacion === 'aprobado' && it.estado === 'liquidado' && <span className="text-emerald-500"> · liquidada</span>}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${APROB_TONO[it.aprobacion]}`}>
                {it.aprobacion}
              </span>
              {it.aprobacion === 'solicitado' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Anular petición"
                  onClick={async () => {
                    const ok = await confirm({ title: '¿Anular esta petición?', confirmLabel: 'Anular', variant: 'danger' })
                    if (ok) anular.mutate(it.id)
                  }}
                  disabled={anular.isPending}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              ) : (
                <span className="w-7" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
