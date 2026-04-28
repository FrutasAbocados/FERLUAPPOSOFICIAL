import { Activity, Banknote, Package, ShoppingCart } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useKpisHoy } from '../lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function EstadoDelDia() {
  const { data, isLoading } = useKpisHoy()
  const today = format(new Date(), "EEEE d 'de' LLLL", { locale: es })

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Estado del día</h2>
          <p className="text-xs capitalize text-[var(--color-ink-3)]">{today}</p>
        </div>
        {data && (
          <div className="flex items-center gap-1 text-xs">
            <span className={`inline-block h-2 w-2 rounded-full ${data.minutos_desde_sync != null && data.minutos_desde_sync < 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[var(--color-ink-3)]">
              {data.ultimo_sync_at ? `sync hace ${data.minutos_desde_sync}m` : 'sin sync'}
            </span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile Icon={Banknote}       label="Ventas hoy"   value={data ? eur(data.ventas_hoy)    : '—'} loading={isLoading} tone="positive" />
        <Tile Icon={ShoppingCart}   label="Compras hoy"  value={data ? eur(data.compras_hoy)   : '—'} loading={isLoading} />
        <Tile Icon={Package}        label="Docs hoy"     value={data ? String(data.docs_hoy)   : '—'} loading={isLoading} />
        <Tile Icon={Activity}       label="Pendiente mes (albaranes)" value={data ? eur(data.pendiente_mes) : '—'} loading={isLoading} tone="warning" />
      </div>
    </section>
  )
}

function Tile({ Icon, label, value, loading, tone = 'neutral' }: {
  Icon: typeof Banknote; label: string; value: string; loading?: boolean; tone?: 'positive' | 'warning' | 'neutral'
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--color-ink-3)]" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</span>
      </div>
      <div className={`mt-1 font-display text-xl font-bold ${
        tone === 'positive' ? 'text-emerald-700'
        : tone === 'warning' ? 'text-amber-700'
        : 'text-[var(--color-ink)]'
      }`}>
        {loading ? '…' : value}
      </div>
    </div>
  )
}
