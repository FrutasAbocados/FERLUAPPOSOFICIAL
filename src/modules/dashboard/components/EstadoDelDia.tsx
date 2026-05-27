import { useMemo } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { useKpisHoy, useKpisSerie, type KpiPunto } from '../lib/queries'

const MINT  = 'oklch(78% 0.14 158)'
const CORAL = 'oklch(70% 0.18 25)'
const SKY   = 'oklch(76% 0.12 235)'
const AMBER = 'oklch(78% 0.16 70)'

const fmtNum = (n: number) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)

const fmtK = (n: number) =>
  n >= 1000
    ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n / 1000)}K`
    : fmtNum(n)

function calcTrend(serie: KpiPunto[], val: number, key: 'ventas' | 'compras') {
  if (!serie.length) return null
  const avg = serie.reduce((s, p) => s + Number(p[key] ?? 0), 0) / serie.length
  return avg > 0 ? ((val - avg) / avg) * 100 : null
}

export function EstadoDelDia() {
  const { data, isLoading } = useKpisHoy()
  const { data: serie } = useKpisSerie(7)

  const syncOk  = data?.ultimo_sync_ok && (data.minutos_desde_sync ?? 999) < 70
  const chart   = (serie ?? []).map((p, i) => ({ i, v: Number(p.ventas ?? 0) }))
  const hasChart = chart.some(d => d.v > 0)

  const tV = useMemo(() => serie && data ? calcTrend(serie, data.ventas_hoy,  'ventas')  : null, [serie, data])
  const tC = useMemo(() => serie && data ? calcTrend(serie, data.compras_hoy, 'compras') : null, [serie, data])

  const dow   = format(new Date(), 'EEE', { locale: es }).toUpperCase()
  const fecha = format(new Date(), "d MMM", { locale: es }).toUpperCase()
  const hora  = format(new Date(), 'HH:mm')

  return (
    /*
     * BENTO GRID — estructura asimétrica, no cards apiladas
     *
     *   mobile (2 col):
     *   ┌─────────────────────────┐  header strip
     *   ├──────────────┬──────────┤
     *   │              │  DOCS    │
     *   │  VENTAS      ├──────────┤
     *   │  hero        │  COMPRAS │
     *   ├──────────────┴──────────┤
     *   │  PENDIENTE  wide strip  │
     *   └─────────────────────────┘
     *
     *   desktop (md): 4 col equal
     */
    <div
      className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line-2)]"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'auto',
        gap: '1px',
        background: 'rgba(140,200,170,0.10)',
      }}
    >
      {/* ── A: header strip — full width ─────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ gridColumn: '1 / -1', background: 'rgba(16,24,22,.96)' }}
      >
        <span className="mono text-[9.5px] uppercase tracking-[0.24em] text-[var(--ink-mute)]">
          {dow} · {fecha} · {hora}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: syncOk ? MINT : AMBER,
              boxShadow: `0 0 6px ${syncOk ? MINT : AMBER}`,
            }}
          />
          <span className="mono text-[9.5px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
            {data ? (syncOk ? `sync ${data.minutos_desde_sync}m` : 'falló') : '—'}
          </span>
        </div>
      </div>

      {/* ── B: VENTAS hero — left col, spans 2 rows ──── */}
      <div
        className="flex flex-col gap-4 p-4"
        style={{
          gridRow: 'span 2',
          background: 'rgba(12,20,17,.95)',
          backgroundImage: `radial-gradient(ellipse 140% 80% at 0% 100%, oklch(78% 0.14 158 / 0.08) 0%, transparent 70%)`,
        }}
      >
        <div>
          <p className="mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-mute)]">
            Ventas hoy
          </p>
          {isLoading ? (
            <div
              className="mt-2 animate-pulse rounded-lg bg-[rgba(255,255,255,.04)]"
              style={{ height: 52, width: '80%' }}
            />
          ) : (
            <div
              className="mono mt-1 font-semibold leading-none tabular-nums"
              style={{ fontSize: 'clamp(38px,10vw,52px)', letterSpacing: '-0.055em', color: MINT }}
            >
              {data ? fmtNum(data.ventas_hoy) : '—'}
            </div>
          )}
          <p className="mono mt-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
            EUR
          </p>
        </div>

        {tV != null && (
          <div>
            <span
              className="mono text-[22px] font-bold leading-none tabular-nums"
              style={{ color: tV >= 0 ? MINT : CORAL, letterSpacing: '-0.03em' }}
            >
              {tV >= 0 ? '+' : '−'}{Math.abs(tV).toFixed(0)}%
            </span>
            <span className="mono ml-1.5 text-[9px] text-[var(--ink-mute)]">vs 7d</span>
          </div>
        )}

        {/* Sparkline inside the hero cell */}
        <div className="mt-auto h-10 w-full">
          {hasChart && (
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={chart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bento-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={MINT} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={MINT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="v"
                  stroke={MINT} strokeWidth={1.5}
                  fill="url(#bento-spark)"
                  isAnimationActive={false} dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── C: DOCS — right top ──────────────────────── */}
      <div
        className="flex flex-col justify-between p-4"
        style={{ background: 'rgba(10,16,14,.96)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
          Docs hoy
        </p>
        {isLoading ? (
          <div className="h-8 w-10 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
        ) : (
          <div
            className="mono font-semibold leading-none text-[var(--ink)]"
            style={{ fontSize: 'clamp(28px,8vw,36px)', letterSpacing: '-0.04em' }}
          >
            {data ? String(data.docs_hoy) : '—'}
          </div>
        )}
        <p className="mono text-[9px] text-[var(--ink-mute)]">sync</p>
      </div>

      {/* ── D: COMPRAS — right bottom ────────────────── */}
      <div
        className="flex flex-col justify-between p-4"
        style={{ background: 'rgba(9,14,12,.97)' }}
      >
        <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
          Compras
        </p>
        {isLoading ? (
          <div className="h-7 w-14 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
        ) : (
          <div>
            <span
              className="mono font-semibold leading-none tabular-nums"
              style={{ fontSize: 'clamp(22px,6vw,28px)', color: SKY, letterSpacing: '-0.04em' }}
            >
              {data ? fmtK(data.compras_hoy) : '—'}
            </span>
            <span className="mono ml-0.5 text-[9px] text-[var(--ink-mute)]">eur</span>
          </div>
        )}
        {tC != null && (
          <span className={`mono text-[9px] tabular-nums ${tC >= 0 ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>
            {tC >= 0 ? '↑' : '↓'} {Math.abs(tC).toFixed(0)}%
          </span>
        )}
      </div>

      {/* ── E: PENDIENTE — full-width bottom strip ───── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ gridColumn: '1 / -1', background: 'rgba(11,17,15,.95)' }}
      >
        <div>
          <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-mute)]">
            Pendiente albaranes
          </p>
          {isLoading ? (
            <div className="mt-1 h-5 w-20 animate-pulse rounded bg-[rgba(255,255,255,.04)]" />
          ) : (
            <div className="mt-0.5 flex items-baseline gap-1">
              <span
                className="mono font-semibold leading-none tabular-nums"
                style={{ fontSize: 20, color: AMBER, letterSpacing: '-0.03em' }}
              >
                {data ? fmtK(data.pendiente_mes) : '—'}
              </span>
              <span className="mono text-[9px] text-[var(--ink-mute)]">EUR</span>
            </div>
          )}
        </div>
        <div
          className="rounded-lg px-2.5 py-1.5"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}
        >
          <span className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-mute)]">
            por facturar
          </span>
        </div>
      </div>
    </div>
  )
}
