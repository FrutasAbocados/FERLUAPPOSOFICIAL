import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { eurosShort } from '@/shared/lib/format'
import { useKpisHoy, useKpisSerie, type KpiPunto } from '../lib/queries'

const eur = eurosShort

type Tone = 'mint' | 'amber' | 'ink' | 'sky'
type SerieKey = 'ventas' | 'compras' | 'docs' | 'pendiente'

const TONE_STYLES: Record<Tone, { value: string; sparkColor: string; hint: string }> = {
  mint:  { value: 'var(--mint)',  sparkColor: 'oklch(78% 0.14 158)', hint: 'sin operaciones' },
  amber: { value: 'var(--amber)', sparkColor: 'oklch(78% 0.16 70)',  hint: 'facturas abiertas' },
  ink:   { value: 'var(--ink)',   sparkColor: '#a4b3ad',             hint: 'cero documentos' },
  sky:   { value: 'var(--sky)',   sparkColor: 'oklch(76% 0.12 235)', hint: 'sin operaciones' },
}

export function EstadoDelDia() {
  const { data, isLoading } = useKpisHoy()
  const { data: serie } = useKpisSerie(7)
  const today = format(new Date(), "EEEE d 'de' LLLL", { locale: es })
  const syncOk = data?.ultimo_sync_ok && data.minutos_desde_sync != null && data.minutos_desde_sync < 70

  return (
    <section className="ao-card overflow-hidden p-0">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">Estado del día</h2>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">{format(new Date(), "d LLL", { locale: es })} · 7D</p>
        </div>
        {data && (
          <div className="ao-pill py-1.5 text-[11px]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: syncOk ? 'var(--mint)' : 'var(--amber)',
                boxShadow: `0 0 8px ${syncOk ? 'var(--mint)' : 'var(--amber)'}`,
              }}
            />
            <span className="text-[var(--ink-dim)]">
              {data.ultimo_sync_at
                ? (data.ultimo_sync_ok ? `sync hace ${data.minutos_desde_sync}m` : `sync falló · ${data.minutos_desde_sync}m`)
                : 'sin sync'}
            </span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4">
        <Tile
          label="Ventas hoy"
          value={data ? eur(data.ventas_hoy) : '—'}
          loading={isLoading}
          tone="mint"
          serie={serie}
          serieKey="ventas"
          hint={today}
        />
        <Tile
          label="Compras hoy"
          value={data ? eur(data.compras_hoy) : '—'}
          loading={isLoading}
          tone="mint"
          serie={serie}
          serieKey="compras"
          hint="compras del día"
        />
        <Tile
          label="Docs hoy"
          value={data ? String(data.docs_hoy) : '—'}
          loading={isLoading}
          tone="ink"
          serie={serie}
          serieKey="docs"
          hint="documentos sincronizados"
        />
        <Tile
          label="Pendiente albaranes"
          value={data ? eur(data.pendiente_mes) : '—'}
          loading={isLoading}
          tone="amber"
          serie={serie}
          serieKey="pendiente"
          hint="albaranes abiertos"
        />
      </div>
    </section>
  )
}

function Tile({ label, value, loading, tone, serie, serieKey, hint }: {
  label: string
  value: string
  loading?: boolean
  tone: Tone
  serie?: KpiPunto[]
  serieKey: SerieKey
  hint: string
}) {
  const t = TONE_STYLES[tone]
  const datos = (serie ?? []).map(p => ({ v: p[serieKey] }))
  const hayDatos = datos.some(d => d.v > 0)
  const gradId = `spark-${tone}-${serieKey}`

  return (
    <div className="min-h-[196px] border-b border-[var(--line)] p-6 md:border-b-0 md:border-r last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
          {label}
        </span>
      </div>
      <div
        className="mono mt-6 text-[38px] font-medium leading-none tracking-[-0.04em]"
        style={{ color: t.value }}
      >
        {loading ? '…' : value}
      </div>
      <div className="mt-3 text-[11.5px] text-[var(--ink-mute)]">{hint || t.hint}</div>
      <div className="mt-4 h-9 max-w-[150px]">
        {hayDatos && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.sparkColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={t.sparkColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={t.sparkColor}
                strokeWidth={1.6}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
