import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Users } from 'lucide-react'
import { useProgresoBBDDClientes } from '../lib/objetivos-queries'

/**
 * Avance del objetivo "BBDD de clientes al día": fichas de preferencias rellenadas
 * sobre los clientes que han comprado en los últimos 90 días.
 */
export function ObjetivoProgresoBBDD({ mesISO }: { mesISO: string }) {
  const { data, isLoading } = useProgresoBBDDClientes(mesISO)

  if (isLoading || !data || data.total === 0) return null

  const pct = Math.min(100, Math.max(0, data.pct))
  const faltan = Math.max(0, data.total - data.con_ficha)

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--color-surface-2)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          <Users className="h-3.5 w-3.5" /> Fichas de cliente rellenadas
        </span>
        <span className="text-sm font-semibold tabular-nums text-[var(--color-ink)]">
          {data.con_ficha} de {data.total}
          <span className="ml-1.5 text-xs font-normal text-[var(--color-ink-2)]">({pct}%)</span>
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Clientes con ficha rellenada"
        />
      </div>

      <p className="mt-2 text-xs text-[var(--color-ink-2)]">
        {faltan > 0
          ? <>Faltan <strong className="text-[var(--color-ink)]">{faltan}</strong> clientes por rellenar.</>
          : <>Todos los clientes activos tienen ficha. 🎉</>}
        {' '}
        <span className="text-[var(--color-ink-3)]">
          {data.fichas_mes} este mes
          {data.ultima_actualizacion && <> · última el {format(new Date(data.ultima_actualizacion), "d 'de' LLLL", { locale: es })}</>}
        </span>
      </p>
    </div>
  )
}
