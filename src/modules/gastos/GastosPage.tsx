import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, BarChart3, CalendarClock, ChevronLeft, ChevronRight, ListChecks, Receipt, TrendingDown } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-primary-2)]">
            <Receipt className="h-5 w-5" />
            <h1 className="font-display text-xl font-bold text-[var(--color-ink)] md:text-2xl">Gastos</h1>
          </div>
          <p className="text-xs text-[var(--color-ink-3)] md:text-sm">
            Fijos recurrentes, gastos variables y estadísticas
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <button
            type="button"
            onClick={() => setAnchor((d) => subMonths(d, 1))}
            className="rounded-md p-1.5 text-[var(--color-ink-2)] transition hover:bg-[var(--color-surface-2)]"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="px-3 py-1 text-sm font-semibold capitalize text-[var(--color-ink)] tabular-nums">
            {titulo}
          </div>
          <button
            type="button"
            onClick={() => setAnchor((d) => addMonths(d, 1))}
            className="rounded-md p-1.5 text-[var(--color-ink-2)] transition hover:bg-[var(--color-surface-2)]"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

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
        {tab === 'fijos'     && <FijosPlaceholder anchor={anchor} />}
        {tab === 'variables' && <VariablesPlaceholder />}
        {tab === 'stats'     && <StatsPlaceholder />}
      </section>
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

// ── Placeholders sesión 1 ────────────────────────────────────────────────────

function FijosPlaceholder({ anchor }: { anchor: Date }) {
  return (
    <PlaceholderCard
      title="Gastos fijos"
      icon={CalendarClock}
      lines={[
        'Aquí vendrá el CRUD de fijos recurrentes (alquiler, leasing, seguros, cuotas…)',
        `Calendario visual del mes (${format(anchor, 'LLLL yyyy', { locale: es })}) con burbujas color por estado: pagado / próximo / vencido / futuro.`,
        'Alta inline + marcar pagado + alerta automática 7 días antes del cargo.',
      ]}
    />
  )
}

function VariablesPlaceholder() {
  return (
    <PlaceholderCard
      title="Gastos variables"
      icon={ListChecks}
      lines={[
        'Tabla con filtros (fecha, categoría, proveedor) + alta inline.',
        'Proveedor: pickeable de Holded (manager_contactos) o manuales (gastos_proveedores_manuales) o texto libre.',
        'Subtotal + IVA → total calculado. Categorías personalizables.',
      ]}
    />
  )
}

function StatsPlaceholder() {
  return (
    <PlaceholderCard
      title="Estadísticas"
      icon={TrendingDown}
      lines={[
        'Tabla dinámica configurable (Mes×Categoría / Mes×Proveedor / Categoría×Proveedor / YoY).',
        '4 gráficos: línea evolución mensual · barras apiladas categoría · top 5 proveedores · donut % categoría.',
        'Filtros de rango de fechas + drill-in por celda.',
      ]}
    />
  )
}

function PlaceholderCard({
  title,
  icon: Icon,
  lines,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  lines: string[]
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2,#f8fafc)] p-6">
      <div className="flex items-center gap-2 text-[var(--color-primary-2)]">
        <Icon className="h-5 w-5" />
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">{title}</h2>
        <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary-2)]">
          Sesión 2
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-[var(--color-ink-2)]">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[var(--color-ink-3)]">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
