import { useMemo } from 'react'
import { differenceInCalendarDays, isBefore, parseISO, startOfMonth, subMonths } from 'date-fns'
import {
  AlertTriangle,
  Clock,
  HandCoins,
  PiggyBank,
  Receipt,
  TrendingUp,
} from 'lucide-react'
import { useClientesResumen, useMovimientos } from '../lib/queries'
import { eur, estadoMovimiento, importePendiente } from '../lib/utils'
import { Card } from '@/shared/components/ui/card'

export function Dashboard() {
  const { resumen, isLoading } = useClientesResumen()
  const movs = useMovimientos()

  const kpis = useMemo(() => {
    const all = movs.data ?? []
    const today = new Date()
    const monthStart = startOfMonth(today)
    const pendientes = all.filter((m) => !m.pagado)
    const totalPendiente = pendientes.reduce((s, m) => s + importePendiente(m), 0)
    const vencidos = pendientes.filter((m) => estadoMovimiento(m) === 'Vencido')
    const totalVencido = vencidos.reduce((s, m) => s + importePendiente(m), 0)
    const proximos = pendientes.filter((m) => estadoMovimiento(m) === 'Próximo')
    const totalProximo = proximos.reduce((s, m) => s + importePendiente(m), 0)
    const cobradoMes = all
      .filter((m) => m.fecha_cobro && !isBefore(parseISO(m.fecha_cobro), monthStart))
      .reduce((s, m) => s + Number(m.importe_cobrado ?? 0), 0)
    const antMedia =
      pendientes.length === 0
        ? 0
        : Math.round(
            pendientes.reduce(
              (s, m) => s + Math.max(0, differenceInCalendarDays(today, parseISO(m.fecha_factura))),
              0,
            ) / pendientes.length,
          )

    // Aging
    const agingBuckets = { '0-7': 0, '8-30': 0, '31-60': 0, '61+': 0 }
    for (const m of pendientes) {
      const d = Math.max(0, differenceInCalendarDays(today, parseISO(m.fecha_factura)))
      const imp = importePendiente(m)
      if (d <= 7) agingBuckets['0-7'] += imp
      else if (d <= 30) agingBuckets['8-30'] += imp
      else if (d <= 60) agingBuckets['31-60'] += imp
      else agingBuckets['61+'] += imp
    }

    return {
      totalPendiente,
      totalVencido,
      totalProximo,
      cobradoMes,
      numPendientes: pendientes.length,
      numVencidas: vencidos.length,
      antMedia,
      agingBuckets,
    }
  }, [movs.data])

  const topClientes = useMemo(() => {
    return [...resumen]
      .filter((c) => c.total_pendiente > 0)
      .sort((a, b) => b.total_pendiente - a.total_pendiente)
      .slice(0, 10)
  }, [resumen])

  const ventas6m = useMemo(() => {
    const all = movs.data ?? []
    const buckets = new Map<string, { facturado: number; cobrado: number }>()
    const today = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(today, i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, { facturado: 0, cobrado: 0 })
    }
    for (const m of all) {
      const fk = m.fecha_factura.slice(0, 7)
      if (buckets.has(fk)) buckets.get(fk)!.facturado += Number(m.importe)
      if (m.fecha_cobro) {
        const ck = m.fecha_cobro.slice(0, 7)
        if (buckets.has(ck)) buckets.get(ck)!.cobrado += Number(m.importe_cobrado ?? m.importe)
      }
    }
    return Array.from(buckets.entries()).map(([k, v]) => ({ mes: k.slice(2), ...v }))
  }, [movs.data])

  if (isLoading || movs.isLoading) {
    return <div className="p-6 text-sm text-[var(--color-ink-3)]">Cargando…</div>
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total pendiente"
          value={eur(kpis.totalPendiente)}
          sub={`${kpis.numPendientes} facturas`}
          Icon={HandCoins}
          tone="primary"
        />
        <KpiCard
          label="Vencido"
          value={eur(kpis.totalVencido)}
          sub={`${kpis.numVencidas} facturas`}
          Icon={AlertTriangle}
          tone="danger"
        />
        <KpiCard
          label="Próximo (≤7 d)"
          value={eur(kpis.totalProximo)}
          sub="A vencer"
          Icon={Clock}
          tone="warn"
        />
        <KpiCard
          label="Cobrado este mes"
          value={eur(kpis.cobradoMes)}
          sub={`Antig. media ${kpis.antMedia}d`}
          Icon={PiggyBank}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[var(--mint)]" />
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Top 10 clientes con deuda</h3>
            </div>
            <span className="ao-chip ao-chip-coral">riesgo</span>
          </div>
          {topClientes.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-3)]">Sin deuda pendiente.</p>
          ) : (
            <ul className="space-y-2.5">
              {topClientes.map((c) => {
                const max = topClientes[0].total_pendiente
                const pct = (c.total_pendiente / max) * 100
                return (
                  <li key={c.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="min-w-0 truncate pr-3 font-medium text-[var(--color-ink)]">{c.nombre}</span>
                      <span className="mono shrink-0 text-[var(--color-ink-2)]">{eur(c.total_pendiente)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.035)]">
                      <div
                        className="h-full rounded-full bg-[var(--coral)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--amber)]" />
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Antigüedad de la deuda</h3>
            </div>
            <span className="ao-chip ao-chip-amber">aging</span>
          </div>
          <ul className="space-y-3">
            {Object.entries(kpis.agingBuckets).map(([bucket, imp]) => {
              const max = Math.max(...Object.values(kpis.agingBuckets), 1)
              const pct = (imp / max) * 100
              const tone =
                bucket === '0-7'
                  ? 'bg-[var(--mint)]'
                  : bucket === '8-30'
                    ? 'bg-[var(--amber)]'
                    : bucket === '31-60'
                      ? 'bg-[oklch(72%_.16_48)]'
                      : 'bg-[var(--coral)]'
              return (
                <li key={bucket}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-[var(--color-ink)]">
                      {bucket} días
                    </span>
                    <span className="mono text-[var(--color-ink-2)]">{eur(imp)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.035)]">
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--sky)]" />
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Facturado vs cobrado · últimos 6 meses</h3>
            </div>
            <span className="ao-chip ao-chip-sky">cash-in</span>
          </div>
          <div className="grid grid-cols-6 items-end gap-3 pt-2">
            {ventas6m.map((m) => {
              const max = Math.max(...ventas6m.map((x) => Math.max(x.facturado, x.cobrado)), 1)
              const fH = (m.facturado / max) * 100
              const cH = (m.cobrado / max) * 100
              return (
                <div key={m.mes} className="flex flex-col items-center gap-1">
                  <div className="flex h-32 items-end gap-1">
                    <div
                      className="w-4 rounded-t bg-[var(--mint)]"
                      style={{ height: `${fH}%` }}
                      title={`Facturado ${eur(m.facturado)}`}
                    />
                    <div
                      className="w-4 rounded-t bg-[var(--sky)]"
                      style={{ height: `${cH}%` }}
                      title={`Cobrado ${eur(m.cobrado)}`}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--color-ink-3)]">{m.mes}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex justify-center gap-4 text-[10px] text-[var(--color-ink-3)]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-[var(--mint)]" /> Facturado
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-[var(--sky)]" /> Cobrado
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  Icon,
  tone,
}: {
  label: string
  value: string
  sub?: string
  Icon: React.ComponentType<{ className?: string }>
  tone: 'primary' | 'danger' | 'warn' | 'success'
}) {
  const toneClass = {
    primary: 'bg-[var(--mint-glow)] text-[var(--mint)]',
    danger: 'bg-[var(--color-danger-soft)] text-[var(--coral)]',
    warn: 'bg-[var(--color-warn-soft)] text-[var(--amber)]',
    success: 'bg-[var(--mint-glow)] text-[var(--mint)]',
  }[tone]
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">
            {label}
          </div>
          <div className="mono mt-1 text-xl font-semibold tabular-nums text-[var(--color-ink)] sm:text-2xl">
            {value}
          </div>
          {sub && (
            <div className="mt-1 text-[11px] text-[var(--color-ink-3)]">{sub}</div>
          )}
        </div>
        <div className={`hidden h-9 w-9 items-center justify-center rounded-md sm:flex ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  )
}
