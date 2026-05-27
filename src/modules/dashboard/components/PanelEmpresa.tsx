import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { numFormat, numCompact } from '@/shared/lib/format'
import { useKpisHoy, useKpisSerie, useTopDeudoresCobros, useClientesRiesgoFuga } from '../lib/queries'

const MINT  = 'oklch(78% 0.14 158)'
const CORAL = 'oklch(70% 0.18 25)'
const SKY   = 'oklch(76% 0.12 235)'
const AMBER = 'oklch(78% 0.16 70)'

export function PanelEmpresa() {
  const { data: kpi, isLoading } = useKpisHoy()
  const { data: serie }          = useKpisSerie(7)
  const { data: deudores = [] }  = useTopDeudoresCobros()
  const { data: riesgo = [] }    = useClientesRiesgoFuga()

  // Margen 7d acumulado (excluye hoy si compras_hoy=0 — las compras llegan a Holded con retraso)
  // El margen diario es inútil: ventas y compras del mismo día no se corresponden en una mayorista.
  const margen7d = (() => {
    if (!serie || serie.length === 0) return null
    const todayIso = new Date().toISOString().slice(0, 10)
    const dias = serie.filter(p => p.fecha !== todayIso || Number(p.compras ?? 0) > 0)
    const v = dias.reduce((s, p) => s + Number(p.ventas ?? 0), 0)
    const c = dias.reduce((s, p) => s + Number(p.compras ?? 0), 0)
    return v > 0 ? ((v - c) / v) * 100 : null
  })()
  const margenBruto7d = (() => {
    if (!serie || serie.length === 0) return 0
    const todayIso = new Date().toISOString().slice(0, 10)
    const dias = serie.filter(p => p.fecha !== todayIso || Number(p.compras ?? 0) > 0)
    const v = dias.reduce((s, p) => s + Number(p.ventas ?? 0), 0)
    const c = dias.reduce((s, p) => s + Number(p.compras ?? 0), 0)
    return v - c
  })()
  const margenColor = margen7d == null ? 'var(--ink-mute)' : margen7d >= 20 ? MINT : margen7d >= 10 ? AMBER : CORAL

  const totalDeuda   = deudores.reduce((s, d) => s + d.pendiente, 0)
  const totalVencido = deudores.reduce((s, d) => s + d.vencido, 0)
  const deudaColor   = totalVencido > 0 ? CORAL : totalDeuda > 0 ? AMBER : MINT

  const numRiesgo  = riesgo.length
  const numCrit    = riesgo.filter(c => c.severidad === 'critica').length
  const riesgoColor = numCrit > 0 ? CORAL : numRiesgo > 0 ? AMBER : MINT

  // Sparkline
  const chart    = (serie ?? []).map((p, i) => ({ i, v: Number(p.ventas ?? 0) }))
  const hasChart = chart.some(d => d.v > 0)

  // Trend ventas vs media 7d
  const media7d = serie?.length ? serie.reduce((s, p) => s + Number(p.ventas ?? 0), 0) / serie.length : null
  const trendV  = media7d && media7d > 0 && kpi ? ((kpi.ventas_hoy - media7d) / media7d) * 100 : null

  const syncOk = kpi?.ultimo_sync_ok && (kpi.minutos_desde_sync ?? 999) < 70
  const dow    = format(new Date(), 'EEE', { locale: es }).toUpperCase()
  const fecha  = format(new Date(), 'd MMM', { locale: es }).toUpperCase()
  const hora   = format(new Date(), 'HH:mm')

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line-2)]"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1px',
        background: 'rgba(140,200,170,0.10)',
      }}
    >
      {/* ── A: Header strip ── full width */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ gridColumn: '1 / -1', background: 'rgba(16,24,22,.97)' }}
      >
        <span className="mono text-[9.5px] uppercase tracking-[0.24em] text-[var(--ink-mute)]">
          {dow} · {fecha} · {hora}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: syncOk ? MINT : AMBER, boxShadow: `0 0 6px ${syncOk ? MINT : AMBER}` }}
          />
          <span className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
            {kpi ? (syncOk ? `sync ${kpi.minutos_desde_sync}m` : 'sync falló') : '—'}
          </span>
        </div>
      </div>

      {/* ── B: VENTAS — spans 2 rows, hero principal ── */}
      <div
        className="flex flex-col gap-3 p-5"
        style={{ gridRow: 'span 2', background: 'rgba(12,20,17,.96)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-mute)]">
          Ventas hoy · EUR
        </p>

        {isLoading ? (
          <div className="h-12 w-3/4 animate-pulse rounded-lg bg-[rgba(255,255,255,.04)]" />
        ) : (
          <div>
            <div
              className="mono font-semibold leading-none text-[var(--ink)]"
              style={{ fontSize: 'clamp(34px,9vw,50px)', letterSpacing: '-0.055em' }}
            >
              {kpi ? numFormat(kpi.ventas_hoy) : '—'}
            </div>
            <div className="mono mt-1 text-[9px] uppercase tracking-[0.16em] text-[var(--ink-mute)]">EUR</div>
          </div>
        )}

        {trendV != null && (
          <div className="flex items-baseline gap-1.5">
            <span
              className="mono font-bold leading-none tabular-nums"
              style={{ fontSize: 'clamp(18px,5vw,24px)', color: trendV >= 0 ? MINT : CORAL, letterSpacing: '-0.03em' }}
            >
              {trendV >= 0 ? '+' : '−'}{Math.abs(trendV).toFixed(0)}%
            </span>
            <span className="mono text-[9px] text-[var(--ink-mute)]">vs media 7d</span>
          </div>
        )}

        {/* Sparkline */}
        <div className="mt-auto h-10 w-full">
          {hasChart && (
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={chart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="empresa-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={MINT} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={MINT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="v"
                  stroke={MINT} strokeWidth={1.5}
                  fill="url(#empresa-spark)"
                  isAnimationActive={false} dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── C: MARGEN BRUTO ── */}
      <div
        className="flex flex-col justify-between p-4"
        style={{ background: 'rgba(10,16,14,.97)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
          Margen bruto · 7d
        </p>
        {!serie ? (
          <div className="h-7 w-16 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
        ) : (
          <div>
            <div
              className="mono font-semibold leading-none tabular-nums"
              style={{ fontSize: 'clamp(20px,5vw,26px)', color: margenColor, letterSpacing: '-0.04em' }}
            >
              {numCompact(margenBruto7d)}
            </div>
            <div className="mono mt-1 text-[9px]" style={{ color: margenColor }}>
              {margen7d != null ? `${margen7d.toFixed(0)}% sobre ventas` : '—'}
            </div>
          </div>
        )}
      </div>

      {/* ── D: COMPRAS + DOCS (subdividida en 2 col) ── */}
      <div
        className="grid grid-cols-2 divide-x"
        style={{ background: 'rgba(9,14,12,.97)', borderColor: 'rgba(140,200,170,0.10)' }}
      >
        <div className="flex flex-col justify-between p-4">
          <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">Compras</p>
          {isLoading ? (
            <div className="h-6 w-12 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
          ) : (
            <div
              className="mono font-semibold leading-none tabular-nums"
              style={{ fontSize: 'clamp(16px,4vw,20px)', color: SKY, letterSpacing: '-0.04em' }}
            >
              {kpi ? numCompact(kpi.compras_hoy) : '—'}
            </div>
          )}
          <p className="mono text-[9px] text-[var(--ink-mute)]">eur</p>
        </div>
        <div className="flex flex-col justify-between p-4">
          <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">Docs hoy</p>
          {isLoading ? (
            <div className="h-6 w-8 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
          ) : (
            <div
              className="mono font-semibold leading-none tabular-nums"
              style={{ fontSize: 'clamp(16px,4vw,20px)', color: 'var(--ink)', letterSpacing: '-0.04em' }}
            >
              {kpi ? String(kpi.docs_hoy) : '—'}
            </div>
          )}
          <p className="mono text-[9px] text-[var(--ink-mute)]">sync</p>
        </div>
      </div>

      {/* ── E: COBROS PENDIENTE ── */}
      <div
        className="flex flex-col justify-between p-4"
        style={{ background: 'rgba(10,15,13,.97)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
          Cobros pendiente
        </p>
        <div>
          <div
            className="mono font-semibold leading-none tabular-nums"
            style={{ fontSize: 'clamp(16px,4vw,20px)', color: deudaColor, letterSpacing: '-0.04em' }}
          >
            {totalDeuda > 0 ? numCompact(totalDeuda) : '—'}
          </div>
          {totalVencido > 0 && (
            <div className="mono mt-0.5 text-[9px] tabular-nums" style={{ color: CORAL }}>
              {numCompact(totalVencido)} vencido
            </div>
          )}
        </div>
        <p className="mono text-[9px] text-[var(--ink-mute)]">
          {deudores.length > 0
            ? `${deudores.length} cliente${deudores.length === 1 ? '' : 's'}`
            : 'al corriente'}
        </p>
      </div>

      {/* ── F: CLIENTES RIESGO FUGA ── */}
      <div
        className="flex flex-col justify-between p-4"
        style={{ background: 'rgba(9,14,12,.97)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
          Clientes riesgo
        </p>
        <div>
          <div
            className="mono font-semibold leading-none tabular-nums"
            style={{ fontSize: 'clamp(16px,4vw,20px)', color: riesgoColor, letterSpacing: '-0.04em' }}
          >
            {numRiesgo > 0 ? String(numRiesgo) : '—'}
          </div>
          {numCrit > 0 && (
            <div className="mono mt-0.5 text-[9px]" style={{ color: CORAL }}>
              {numCrit} crítico{numCrit === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <p className="mono text-[9px] text-[var(--ink-mute)]">
          {numRiesgo === 0 ? 'sin riesgo hoy' : 'inactivos / ralentizan'}
        </p>
      </div>
    </div>
  )
}
