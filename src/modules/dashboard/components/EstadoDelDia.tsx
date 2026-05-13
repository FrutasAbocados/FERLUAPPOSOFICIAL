import { Activity, Banknote, Package, ShoppingCart, type LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { eurosShort } from '@/shared/lib/format'
import { useKpisHoy, useKpisSerie, type KpiPunto } from '../lib/queries'

const eur = eurosShort

type Tone = 'positive' | 'warning' | 'neutral'
type SerieKey = 'ventas' | 'compras' | 'docs' | 'pendiente'

const TONE_STYLES: Record<Tone, { value: string; iconBg: string; iconText: string; sparkColor: string }> = {
  positive: {
    value: 'text-emerald-700',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    sparkColor: '#047857',
  },
  warning: {
    value: 'text-amber-700',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    sparkColor: '#b45309',
  },
  neutral: {
    value: 'text-[var(--color-ink)]',
    iconBg: 'bg-[var(--color-primary-soft)]',
    iconText: 'text-[var(--color-primary-2)]',
    sparkColor: '#3b6944',
  },
}

export function EstadoDelDia() {
  const { data, isLoading } = useKpisHoy()
  const { data: serie } = useKpisSerie(7)
  const today = format(new Date(), "EEEE d 'de' LLLL", { locale: es })
  const syncOk = data?.ultimo_sync_ok && data.minutos_desde_sync != null && data.minutos_desde_sync < 70

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Estado del día</h2>
          <p className="text-xs capitalize text-[var(--color-ink-3)]">{today} · últimos 7 días</p>
        </div>
        {data && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`inline-block h-2 w-2 rounded-full ${syncOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[var(--color-ink-3)]">
              {data.ultimo_sync_at
                ? (data.ultimo_sync_ok ? `sync hace ${data.minutos_desde_sync}m` : `sync falló · ${data.minutos_desde_sync}m`)
                : 'sin sync'}
            </span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          Icon={Banknote}
          label="Ventas hoy"
          value={data ? eur(data.ventas_hoy) : '—'}
          loading={isLoading}
          tone="positive"
          serie={serie}
          serieKey="ventas"
        />
        <Tile
          Icon={ShoppingCart}
          label="Compras hoy"
          value={data ? eur(data.compras_hoy) : '—'}
          loading={isLoading}
          tone="neutral"
          serie={serie}
          serieKey="compras"
        />
        <Tile
          Icon={Package}
          label="Docs hoy"
          value={data ? String(data.docs_hoy) : '—'}
          loading={isLoading}
          tone="neutral"
          serie={serie}
          serieKey="docs"
        />
        <Tile
          Icon={Activity}
          label="Pendiente albaranes"
          value={data ? eur(data.pendiente_mes) : '—'}
          loading={isLoading}
          tone="warning"
          serie={serie}
          serieKey="pendiente"
        />
      </div>
    </section>
  )
}

function Tile({ Icon, label, value, loading, tone, serie, serieKey }: {
  Icon: LucideIcon
  label: string
  value: string
  loading?: boolean
  tone: Tone
  serie?: KpiPunto[]
  serieKey: SerieKey
}) {
  const t = TONE_STYLES[tone]
  const datos = (serie ?? []).map(p => ({ v: p[serieKey] }))
  const hayDatos = datos.some(d => d.v > 0)
  const gradId = `spark-${tone}-${serieKey}`

  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2,_#fafaf7)]/40 p-4 transition hover:border-[var(--color-primary)]/30">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          {label}
        </span>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
          <Icon className={`h-4 w-4 ${t.iconText}`} />
        </div>
      </div>
      <div className={`mt-3 font-display text-3xl font-bold tabular-nums leading-none md:text-4xl ${t.value}`}>
        {loading ? '…' : value}
      </div>
      <div className="mt-3 h-9">
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
