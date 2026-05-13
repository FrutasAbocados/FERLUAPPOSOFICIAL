import { useMemo, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useQuery } from '@tanstack/react-query'
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, BarChart3, CalendarClock, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { FijosView } from './components/FijosView'
import { CalendarioFijosMes } from './components/CalendarioFijosMes'
import { VariablesView } from './components/VariablesView'
import { StatsView } from './components/StatsView'

type SubTab = 'fijos' | 'variables' | 'stats'

type Resumen = {
  total_fijos: number
  total_variables: number
  total: number
  num_fijos_pagados: number
  num_variables: number
}

type AlertaProx = {
  fijo_id: string
  nombre: string
  total: number
  fecha_cargo: string
  dias_para: number
  estado: 'vencido' | 'proximo'
}

function useResumenMes(anchor: Date) {
  const from = format(startOfMonth(anchor), 'yyyy-MM-dd')
  const to   = format(endOfMonth(anchor),   'yyyy-MM-dd')
  return useQuery({
    queryKey: ['gastos', 'resumen', from, to] as const,
    queryFn: async (): Promise<Resumen> => {
      const { data, error } = await supabase.rpc('gastos_resumen_periodo', { p_from: from, p_to: to })
      if (error) throw error
      const row = (data?.[0] ?? {}) as Partial<Resumen>
      return {
        total_fijos:       Number(row.total_fijos ?? 0),
        total_variables:   Number(row.total_variables ?? 0),
        total:             Number(row.total ?? 0),
        num_fijos_pagados: Number(row.num_fijos_pagados ?? 0),
        num_variables:     Number(row.num_variables ?? 0),
      }
    },
  })
}

function useAlertasProximas() {
  return useQuery({
    queryKey: ['gastos', 'alertas-proximas'] as const,
    queryFn: async (): Promise<AlertaProx[]> => {
      const { data, error } = await supabase.rpc('gastos_alertas_proximos_pagos')
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        fijo_id: r.fijo_id,
        nombre: r.nombre,
        total: Number(r.total ?? 0),
        fecha_cargo: r.fecha_cargo,
        dias_para: Number(r.dias_para ?? 0),
        estado: r.estado,
      }))
    },
  })
}

const TABS: { key: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'fijos',     label: 'Fijos',         icon: CalendarClock },
  { key: 'variables', label: 'Variables',     icon: ListChecks },
  { key: 'stats',     label: 'Estadísticas',  icon: BarChart3 },
]

export function GastosPage() {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [tab, setTab] = useState<SubTab>('fijos')

  const titulo = useMemo(() => format(anchor, "LLLL yyyy", { locale: es }), [anchor])
  const { data: resumen } = useResumenMes(anchor)
  const { data: alertas } = useAlertasProximas()

  const totalAlertas = alertas?.length ?? 0
  const sumaAlertas  = (alertas ?? []).reduce((acc, a) => acc + a.total, 0)

  const anio = anchor.getFullYear()
  const mes  = anchor.getMonth() + 1

  return (
    <div>
      <PageTopbar
        breadcrumb="OPERACIONES · GASTOS"
        title="Gastos"
        subtitle="Fijos recurrentes, gastos variables y estadísticas"
        actions={
          <div className="flex items-center gap-1" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 4 }}>
            <button type="button" onClick={() => setAnchor((d) => subMonths(d, 1))} className="rounded p-1.5 transition hover:bg-[rgba(255,255,255,.04)]" style={{ color: 'var(--ink-dim)' }} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="mono px-3 py-1 text-sm font-medium capitalize" style={{ color: 'var(--ink)', minWidth: 120, textAlign: 'center' }}>
              {titulo}
            </div>
            <button type="button" onClick={() => setAnchor((d) => addMonths(d, 1))} className="rounded p-1.5 transition hover:bg-[rgba(255,255,255,.04)]" style={{ color: 'var(--ink-dim)' }} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">

      {/* KPIs hero row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Total mes"
          value={euros(resumen?.total ?? 0)}
          hint={`${resumen?.num_fijos_pagados ?? 0} fijos · ${resumen?.num_variables ?? 0} var.`}
          tone="primary"
        />
        <KpiTile
          label="Fijos pagados"
          value={euros(resumen?.total_fijos ?? 0)}
          hint={`${resumen?.num_fijos_pagados ?? 0} cargo${resumen?.num_fijos_pagados === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Variables"
          value={euros(resumen?.total_variables ?? 0)}
          hint={`${resumen?.num_variables ?? 0} apunte${resumen?.num_variables === 1 ? '' : 's'}`}
        />
        <KpiTile
          label="Próximos pagos"
          value={totalAlertas > 0 ? euros(sumaAlertas) : '—'}
          hint={totalAlertas > 0 ? `${totalAlertas} en ≤7 días o vencido${totalAlertas === 1 ? '' : 's'}` : 'sin alertas'}
          tone={totalAlertas > 0 ? 'warn' : 'muted'}
          icon={totalAlertas > 0 ? AlertTriangle : undefined}
        />
      </section>

      {/* Sub-nav */}
      <nav className="flex gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      <section>
        {tab === 'fijos'     && <FijosView anio={anio} mes={mes} CalendarioComp={CalendarioFijosMes} />}
        {tab === 'variables' && <VariablesView anchor={anchor} />}
        {tab === 'stats'     && <StatsView anchor={anchor} />}
      </section>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function KpiTile(props: {
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'warn' | 'muted' | 'default'
  icon?: React.ComponentType<{ className?: string }>
}) {
  const { label, value, hint, tone = 'default', icon: Icon } = props
  const valueColor =
    tone === 'primary' ? 'text-[var(--color-primary-2)]' :
    tone === 'warn'    ? 'text-[#dc2626]' :
    tone === 'muted'   ? 'text-[var(--color-ink-3)]' :
                         'text-[var(--color-ink)]'
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className={cn('mt-1 font-display text-xl font-bold tabular-nums md:text-2xl', valueColor)}>
        {value}
      </div>
      {hint ? <div className="text-[11px] text-[var(--color-ink-3)]">{hint}</div> : null}
    </div>
  )
}

