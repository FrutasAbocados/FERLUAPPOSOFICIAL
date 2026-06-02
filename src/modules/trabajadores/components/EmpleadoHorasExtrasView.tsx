import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock4, Trash2 } from 'lucide-react'
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

  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [horas, setHoras] = useState<number>(1)
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
      setHoras(1)
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

  const kpis = useMemo(() => {
    const list = items ?? []
    const solicitadas = list.filter((i) => i.aprobacion === 'solicitado')
    const aprobadas = list.filter((i) => i.aprobacion === 'aprobado')
    const liquidadas = aprobadas.filter((i) => i.estado === 'liquidado')
    const horasPend = solicitadas.reduce((s, i) => s + i.horas, 0)
    const horasAprob = aprobadas.reduce((s, i) => s + i.horas, 0)
    const horasLiq = liquidadas.reduce((s, i) => s + i.horas, 0)
    return {
      nSolicitadas: solicitadas.length,
      horasPend,
      horasAprob,
      horasLiq,
    }
  }, [items])

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

      {/* KPIs propios */}
      <div className="emp-hero-card mb-4 ao-fade-in-up" style={{ animationDelay: '.06s' }}>
        <div className="relative z-10 grid grid-cols-3 gap-2 text-center">
          <div className="emp-kpi-tile">
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Pendientes</div>
            <div className="font-display text-2xl font-bold tabular-nums text-amber-400">{kpis.horasPend}<span className="ml-0.5 text-xs font-normal text-[var(--ink-mute)]">h</span></div>
            <div className="text-[10px] text-[var(--ink-mute)]">{kpis.nSolicitadas} petición(es)</div>
          </div>
          <div className="emp-kpi-tile">
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Aprobadas</div>
            <div className="font-display text-2xl font-bold tabular-nums text-blue-400">{kpis.horasAprob}<span className="ml-0.5 text-xs font-normal text-[var(--ink-mute)]">h</span></div>
            <div className="text-[10px] text-[var(--ink-mute)]">este mes</div>
          </div>
          <div className="emp-kpi-tile">
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Liquidadas</div>
            <div className="font-display text-2xl font-bold tabular-nums text-emerald-500">{kpis.horasLiq}<span className="ml-0.5 text-xs font-normal text-[var(--ink-mute)]">h</span></div>
            <div className="text-[10px] text-[var(--ink-mute)]">ya saldadas</div>
          </div>
        </div>
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
            <Input type="number" min={0.5} max={24} step={0.5} value={horas} onChange={(e) => setHoras(Number(e.target.value))} className="h-9" />
          </div>
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
