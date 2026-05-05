import { useMemo, useState } from 'react'
import { CheckCircle2, Pause, TrendingDown, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useClientesSeguimiento } from '../lib/hooks'

type Props = {
  onSelect?: (name: string) => void
}

const UMBRALES = [
  { key: 7,  label: '≥7d' },
  { key: 14, label: '≥14d' },
  { key: 30, label: '≥30d' },
] as const

export function SeguimientoView({ onSelect }: Props) {
  const [umbral, setUmbral] = useState<7 | 14 | 30>(7)
  const { data: rows = [], isLoading } = useClientesSeguimiento(umbral, 90)

  const pidiendo = useMemo(() => rows.filter(r => r.estado === 'pidiendo'), [rows])
  const sinPedir = useMemo(() => rows.filter(r => r.estado === 'sin_pedir'), [rows])
  const pausa    = useMemo(() => rows.filter(r => r.estado === 'pausa'), [rows])
  const total    = rows.length
  const cobertura = total > 0 ? (pidiendo.length / total) * 100 : 0

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Activos 90d" value={total.toString()} icon={Users} />
        <Kpi label={`Pidiendo (≤${umbral}d)`} value={pidiendo.length.toString()} icon={CheckCircle2} tone="ok" />
        <Kpi label={`Sin pedir (>${umbral}d)`} value={sinPedir.length.toString()} icon={TrendingDown} tone={sinPedir.length > 0 ? 'warn' : 'muted'} />
        <Kpi label="Cobertura semanal" value={`${cobertura.toFixed(0)}%`} hint={pausa.length > 0 ? `${pausa.length} en pausa` : undefined} />
      </div>

      {/* Toolbar umbral */}
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <span className="text-xs text-[var(--color-ink-3)]">Umbral alerta:</span>
        {UMBRALES.map(u => (
          <button
            key={u.key}
            type="button"
            onClick={() => setUmbral(u.key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              umbral === u.key
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
            )}
          >
            {u.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--color-ink-3)]">
          Cliente activo = pidió en últimos 90 días
        </span>
      </div>

      {/* 2 columnas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Columna
          titulo="Pidiendo"
          subtitulo={`≤ ${umbral} días`}
          icon={CheckCircle2}
          tone="ok"
          rows={pidiendo}
          empty="Nadie en este umbral"
          isLoading={isLoading}
          onSelect={onSelect}
        />
        <Columna
          titulo="Sin pedir — ALERTA"
          subtitulo={`> ${umbral} días sin pedido`}
          icon={TrendingDown}
          tone="warn"
          rows={sinPedir}
          empty="Todos los clientes están pidiendo"
          isLoading={isLoading}
          onSelect={onSelect}
        />
      </div>

      {pausa.length > 0 && (
        <details className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-ink-2)]">
            <Pause className="h-4 w-4" />
            {pausa.length} cliente{pausa.length === 1 ? '' : 's'} en pausa (vacaciones)
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {pausa.map(c => (
              <li key={c.contact_name_canon} className="flex items-center justify-between gap-2 text-[var(--color-ink-2)]">
                <button onClick={() => onSelect?.(c.contact_name_canon)} className="truncate text-left hover:text-[var(--color-primary-2)]">
                  {c.contact_name_canon}
                </button>
                <span className="text-xs text-[var(--color-ink-3)] tabular-nums">
                  hasta {c.en_pausa_hasta ? format(parseISO(c.en_pausa_hasta), 'd LLL', { locale: es }) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Kpi({
  label, value, hint, tone = 'default', icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'ok' | 'warn' | 'muted'
  icon?: React.ComponentType<{ className?: string }>
}) {
  const valueColor =
    tone === 'ok'    ? 'text-[#047857]' :
    tone === 'warn'  ? 'text-[#dc2626]' :
    tone === 'muted' ? 'text-[var(--color-ink-3)]' :
                       'text-[var(--color-ink)]'
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className={cn('mt-1 font-display text-xl font-bold tabular-nums md:text-2xl', valueColor)}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

function Columna({
  titulo, subtitulo, icon: Icon, tone, rows, empty, isLoading, onSelect,
}: {
  titulo: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'ok' | 'warn'
  rows: Array<{
    contact_name_canon: string
    ult_pedido: string
    dias_sin_pedir: number
    cadencia_dias: number | null
    pedidos_activo: number
    ventas_activo: number
  }>
  empty: string
  isLoading: boolean
  onSelect?: (name: string) => void
}) {
  const headerCls = tone === 'ok' ? 'text-[#047857] bg-[#10b98111]' : 'text-[#b91c1c] bg-[#ef444411]'
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className={cn('flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2', headerCls)}>
        <Icon className="h-4 w-4" />
        <h3 className="text-sm font-bold">{titulo}</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider opacity-70">{subtitulo}</span>
        <span className="rounded-full bg-white/40 px-2 py-0.5 text-xs font-semibold tabular-nums">{rows.length}</span>
      </div>
      {isLoading ? (
        <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-[var(--color-ink-3)]">{empty}</div>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-[var(--color-border)] overflow-y-auto">
          {rows.map(r => (
            <li key={r.contact_name_canon}>
              <button
                type="button"
                onClick={() => onSelect?.(r.contact_name_canon)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[var(--color-ink)]">{r.contact_name_canon}</div>
                  <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
                    {r.cadencia_dias != null ? `cad. ${r.cadencia_dias.toFixed(0)}d` : 'cad. —'} ·
                    {' '}{r.pedidos_activo}p · {euros(r.ventas_activo)}
                  </div>
                </div>
                <div className="text-right text-[11px] tabular-nums">
                  <div className={cn('font-semibold', tone === 'ok' ? 'text-[#047857]' : 'text-[#b91c1c]')}>
                    {r.dias_sin_pedir === 0 ? 'hoy' : `${r.dias_sin_pedir}d`}
                  </div>
                  <div className="text-[10px] text-[var(--color-ink-3)]">
                    {format(parseISO(r.ult_pedido), 'd LLL', { locale: es })}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
