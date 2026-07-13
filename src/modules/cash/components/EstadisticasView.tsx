import { useMemo, useState } from 'react'
import { addDays, addWeeks, endOfMonth, format, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart3, Banknote, Clock, CreditCard, Loader2, Receipt, ReceiptText, TrendingUp, Wallet } from 'lucide-react'
import { useCashStatsSemanas, type StatsSemana } from '../lib/repartos-queries'
import { euros } from '../lib/format'
import { cn } from '@/shared/lib/utils'

const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

type Preset = 'last4w' | 'mes' | 'mes_prev' | 'custom'

const PRESETS: Array<{ k: Preset; label: string }> = [
  { k: 'last4w',   label: 'Últimas 4 sem' },
  { k: 'mes',      label: 'Mes actual' },
  { k: 'mes_prev', label: 'Mes anterior' },
  { k: 'custom',   label: 'Personalizado' },
]

function rangeForPreset(p: Preset, from: string, to: string): { from: string; to: string } {
  const today = new Date()
  if (p === 'last4w') {
    const start = startOfWeek(addWeeks(today, -3), { weekStartsOn: 1 })
    return { from: isoDate(start), to: isoDate(today) }
  }
  if (p === 'mes') {
    return { from: isoDate(startOfMonth(today)), to: isoDate(endOfMonth(today)) }
  }
  if (p === 'mes_prev') {
    const ref = subMonths(today, 1)
    return { from: isoDate(startOfMonth(ref)), to: isoDate(endOfMonth(ref)) }
  }
  return { from, to }
}

export function EstadisticasView() {
  const initial = rangeForPreset('last4w', '', '')
  const [preset, setPreset] = useState<Preset>('last4w')
  const [from, setFrom] = useState<string>(initial.from)
  const [to, setTo]     = useState<string>(initial.to)

  const stats = useCashStatsSemanas(from, to)
  const rows = useMemo(() => stats.data ?? [], [stats.data])

  const totals = useMemo(() => {
    const acc = { horas: 0, total: 0, efectivo: 0, gastos: 0, efectivoNeto: 0, tarjeta: 0, deuda: 0, jornadas: 0 }
    for (const r of rows) {
      acc.horas        += r.horas
      acc.total        += r.total
      acc.efectivo     += r.efectivo
      acc.gastos       += r.gastos
      acc.efectivoNeto += r.efectivoNeto
      acc.tarjeta      += r.tarjeta
      acc.deuda        += r.deuda
      acc.jornadas     += r.jornadas
    }
    return acc
  }, [rows])

  const productividadMedia = totals.horas > 0 ? totals.total / totals.horas : 0

  // Agrupar por semana → empleados
  const semanas = useMemo(() => {
    const m = new Map<string, StatsSemana[]>()
    for (const r of rows) {
      const list = m.get(r.semana_inicio) ?? []
      list.push(r)
      m.set(r.semana_inicio, list)
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))  // semana más reciente arriba
      .map(([semana, lista]) => {
        const sub = lista.reduce(
          (s, r) => ({
            horas: s.horas + r.horas,
            total: s.total + r.total,
            efectivo: s.efectivo + r.efectivo,
            gastos: s.gastos + r.gastos,
            efectivoNeto: s.efectivoNeto + r.efectivoNeto,
            tarjeta: s.tarjeta + r.tarjeta,
            deuda: s.deuda + r.deuda,
            jornadas: s.jornadas + r.jornadas,
          }),
          { horas: 0, total: 0, efectivo: 0, gastos: 0, efectivoNeto: 0, tarjeta: 0, deuda: 0, jornadas: 0 },
        )
        return { semana, lista: lista.sort((a, b) => a.empleado_nombre.localeCompare(b.empleado_nombre)), sub }
      })
  }, [rows])

  const handlePreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') {
      const { from: f, to: t } = rangeForPreset(p, from, to)
      setFrom(f)
      setTo(t)
    }
  }

  const handleFromChange = (v: string) => {
    setPreset('custom')
    setFrom(v)
  }
  const handleToChange = (v: string) => {
    setPreset('custom')
    setTo(v)
  }

  return (
    <div>
      {/* Filtros */}
      <div className="ao-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.k}
              type="button"
              onClick={() => handlePreset(p.k)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                preset === p.k
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-2)]">
          <label className="flex items-center gap-1.5">
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => handleFromChange(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-ink)]"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-ink)]"
            />
          </label>
        </div>
      </div>

      {/* KPIs globales */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Banknote className="h-4 w-4" />}     label="Efectivo bruto" value={euros(totals.efectivo)}         tone="neutral" />
        <Kpi icon={<Receipt className="h-4 w-4" />}      label="Gastos"         value={totals.gastos > 0 ? `−${euros(totals.gastos)}` : euros(0)} tone="warn" />
        <Kpi icon={<Wallet className="h-4 w-4" />}       label="Efectivo neto"  value={euros(totals.efectivoNeto)}     tone="success" />
        <Kpi icon={<CreditCard className="h-4 w-4" />}   label="Tarjeta"        value={euros(totals.tarjeta)}          tone="neutral" />
        <Kpi icon={<ReceiptText className="h-4 w-4" />}  label="Deuda"          value={euros(totals.deuda)}            tone="warn" />
        <Kpi icon={<BarChart3 className="h-4 w-4" />}    label="Total reparto"  value={euros(totals.total)}            tone="primary" />
        <Kpi icon={<Clock className="h-4 w-4" />}        label="Horas totales"  value={`${totals.horas.toFixed(1)} h`} tone="primary" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />}   label="Productividad"  value={`${productividadMedia.toFixed(1)} €/h`} tone={productividadMedia >= 80 ? 'success' : 'warn'} />
      </div>

      {stats.error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          Error: {(stats.error as Error).message}
        </div>
      )}

      {stats.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando estadísticas…
        </div>
      ) : semanas.length === 0 ? (
        <div className="ao-card border-dashed p-10 text-center">
          <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
            Sin datos en este rango
          </h2>
          <p className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-2)]">
            No hay jornadas registradas entre las fechas seleccionadas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {semanas.map(({ semana, lista, sub }) => {
            const finSemana = format(addDays(parseISO(semana), 6), "d 'de' MMM", { locale: es })
            const inicio = format(parseISO(semana), "d 'de' MMM", { locale: es })
            const productividadSem = sub.horas > 0 ? sub.total / sub.horas : 0
            return (
              <div
                key={semana}
                className="ao-card overflow-hidden p-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
                  <div className="text-sm font-semibold text-[var(--color-ink)]">
                    Sem. del {inicio} al {finSemana}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-2)]">
                    <span><span className="text-[var(--color-ink-3)]">Horas:</span> <strong>{sub.horas.toFixed(1)} h</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Efect. bruto:</span> <strong>{euros(sub.efectivo)}</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Gastos:</span> <strong className="text-[var(--coral)]">{sub.gastos > 0 ? `−${euros(sub.gastos)}` : euros(0)}</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Efect. neto:</span> <strong className="text-[var(--mint)]">{euros(sub.efectivoNeto)}</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Tarj:</span> <strong>{euros(sub.tarjeta)}</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Deuda:</span> <strong>{euros(sub.deuda)}</strong></span>
                    <span><span className="text-[var(--color-ink-3)]">Total:</span> <strong>{euros(sub.total)}</strong></span>
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 font-semibold text-[var(--color-primary-2)]">
                      {productividadSem.toFixed(1)} €/h
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                        <th className="px-4 py-2">Trabajador</th>
                        <th className="px-3 py-2 text-right">Horas</th>
                        <th className="px-3 py-2 text-right">Jornadas</th>
                        <th className="px-3 py-2 text-right">Efect. bruto</th>
                        <th className="px-3 py-2 text-right">Gastos</th>
                        <th className="px-3 py-2 text-right">Efect. neto</th>
                        <th className="px-3 py-2 text-right">Tarjeta</th>
                        <th className="px-3 py-2 text-right">Deuda</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">€/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((r) => {
                        const ph = r.horas > 0 ? r.total / r.horas : 0
                        return (
                          <tr key={r.empleado_id} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="px-4 py-2 font-medium text-[var(--color-ink)]">{r.empleado_nombre}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.horas.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">{r.jornadas}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">{euros(r.efectivo)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--coral)]">{r.gastos > 0 ? `−${euros(r.gastos)}` : euros(0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-success)]">{euros(r.efectivoNeto)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">{euros(r.tarjeta)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-warn)]">{euros(r.deuda)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--color-ink)]">{euros(r.total)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--color-primary-2)]">{ph.toFixed(1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type KpiProps = {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'primary' | 'warn' | 'success' | 'danger' | 'neutral'
}

const TONE: Record<KpiProps['tone'], string> = {
  primary: 'text-[var(--color-primary)]',
  warn: 'text-[var(--color-warn)]',
  success: 'text-[var(--color-success)]',
  danger: 'text-[var(--color-danger)]',
  neutral: 'text-[var(--color-ink-2)]',
}

function Kpi({ label, value, icon, tone }: KpiProps) {
  return (
    <div className="ao-card p-3">
      <div className="label-caps flex items-center gap-1.5">
        <span className={cn(TONE[tone])}>{icon}</span>
        {label}
      </div>
      <div className={cn('mono mt-1 text-xl font-semibold tabular-nums md:text-2xl', TONE[tone])}>
        {value}
      </div>
    </div>
  )
}
