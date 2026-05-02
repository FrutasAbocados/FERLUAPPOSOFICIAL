import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarOff, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'

interface Props {
  empleadoId: string
  empleadoNombre: string
  diasAnuales: number
  onClose: () => void
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
  pendiente:  'bg-amber-100 text-amber-800',
  aprobado:   'bg-blue-100 text-blue-800',
  disfrutado: 'bg-emerald-100 text-emerald-800',
}

export function SolicitarVacacionesModal({ empleadoId, empleadoNombre, diasAnuales, onClose }: Props) {
  const qc = useQueryClient()
  const anio = new Date().getFullYear()

  const periodosQ = useQuery({
    queryKey: ['mis-vacaciones', empleadoId, anio] as const,
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

  const [inicio, setInicio] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fin, setFin] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [nota, setNota] = useState('')

  const dias = useMemo(() => {
    if (!inicio || !fin) return 0
    const a = new Date(inicio).getTime()
    const b = new Date(fin).getTime()
    if (b < a) return 0
    return Math.round((b - a) / (24 * 3600 * 1000)) + 1
  }, [inicio, fin])

  const ya = useMemo(() => {
    const sumar = (e: Periodo['estado']) => (periodosQ.data ?? []).filter(p => p.estado === e).reduce((s, p) => s + p.dias, 0)
    return { disfrutado: sumar('disfrutado'), aprobado: sumar('aprobado'), pendiente: sumar('pendiente') }
  }, [periodosQ.data])

  const restantes = diasAnuales - ya.disfrutado - ya.aprobado

  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('trabajadores_vacaciones').insert({
        empleado_id: empleadoId,
        fecha_inicio: inicio,
        fecha_fin: fin,
        nota: nota.trim() || null,
        estado: 'pendiente',
        creado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-vacaciones'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      qc.invalidateQueries({ queryKey: ['dash-trab-vac'] })
      setNota('')
    },
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_vacaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-vacaciones'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen'] })
      qc.invalidateQueries({ queryKey: ['dash-trab-vac'] })
    },
  })

  const guardar = async () => {
    if (dias <= 0) {
      toast({ title: 'Selecciona un rango de fechas válido', variant: 'error' })
      return
    }
    try {
      await solicitar.mutateAsync()
    } catch (e) {
      toast({ title: 'No se pudo crear la solicitud', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
              <CalendarOff className="h-4 w-4 text-[var(--color-primary-2)]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Mis vacaciones {anio}</h2>
              <p className="text-xs text-[var(--color-ink-3)]">{empleadoNombre}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-md border border-[var(--color-border)] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-ink-3)]">Días disponibles este año</span>
              <span className="font-display text-lg font-bold tabular-nums text-[var(--color-ink)]">{restantes} / {diasAnuales}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--color-ink-3)]">
              <span>disfrutados {ya.disfrutado}</span>
              <span>aprobados {ya.aprobado}</span>
              <span>pendientes {ya.pendiente}</span>
            </div>
          </div>

          {/* Form */}
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Solicitar nuevo periodo</h3>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_80px]">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Inicio</label>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fin</label>
                <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Días</label>
                <div className="flex h-9 items-center justify-end rounded-md border border-[var(--color-border)] bg-slate-50 px-3 font-display text-base font-bold tabular-nums">
                  {dias}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. semana santa con la familia" className="h-9" />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={guardar} disabled={dias <= 0 || solicitar.isPending}>
                {solicitar.isPending ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </div>
          </section>

          {/* Mis periodos */}
          <section className="rounded-lg border border-[var(--color-border)]">
            <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
              Mis periodos
            </div>
            {periodosQ.isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
            {periodosQ.data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Aún no has solicitado vacaciones este año.</p>}
            <ul className="divide-y divide-[var(--color-border)]">
              {periodosQ.data?.map(p => (
                <li key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2 text-sm">
                  <div>
                    <div className="text-[var(--color-ink)]">{fmt(p.fecha_inicio)} → {fmt(p.fecha_fin)}</div>
                    <div className="text-xs text-[var(--color-ink-3)]">
                      {p.dias} día{p.dias === 1 ? '' : 's'}
                      {p.nota && <span> · {p.nota}</span>}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TONO[p.estado]}`}>{p.estado}</span>
                  {p.estado === 'pendiente' && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const ok = await confirm({ title: '¿Anular esta solicitud?', confirmLabel: 'Anular', variant: 'danger' })
                      if (!ok) return
                      try { await borrar.mutateAsync(p.id) }
                      catch (e) { toast({ title: 'No se pudo anular', description: e instanceof Error ? e.message : '', variant: 'error' }) }
                    }} title="Anular">
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
