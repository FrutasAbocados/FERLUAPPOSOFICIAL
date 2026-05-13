import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Pause, TrendingDown, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useClientesSeguimiento } from '../lib/hooks'

type Props = {
  onSelect?: (name: string) => void
}

const UMBRALES = [
  { key: 3,  label: '3d' },
  { key: 7,  label: '7d' },
  { key: 14, label: '14d' },
  { key: 30, label: '30d' },
] as const

export function SeguimientoView({ onSelect }: Props) {
  const [umbral, setUmbral] = useState<number>(3)
  const [customVal, setCustomVal] = useState('')
  const { data: rows = [], isLoading } = useClientesSeguimiento(umbral, 90)

  const handleCustom = (v: string) => {
    setCustomVal(v)
    const n = parseInt(v, 10)
    if (n >= 1 && n <= 90) setUmbral(n)
  }

  const pidiendo = useMemo(() => rows.filter(r => r.estado === 'pidiendo'), [rows])
  const sinPedir = useMemo(() => rows.filter(r => r.estado === 'sin_pedir'), [rows])
  const pausa    = useMemo(() => rows.filter(r => r.estado === 'pausa'), [rows])
  const total    = rows.length
  const cobertura = total > 0 ? (pidiendo.length / total) * 100 : 0
  const criticos  = useMemo(() => sinPedir.filter(r => r.dias_sin_pedir >= 7), [sinPedir])

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Activos 90d" value={total.toString()} icon={Users} />
        <Kpi label={`Pidiendo (≤${umbral}d)`} value={pidiendo.length.toString()} icon={CheckCircle2} tone="ok" />
        <Kpi label={`Sin pedir (>${umbral}d)`} value={sinPedir.length.toString()} icon={TrendingDown} tone={sinPedir.length > 0 ? 'warn' : 'muted'} hint={criticos.length > 0 ? `⚡ ${criticos.length} críticos >7d` : undefined} />
        <Kpi label="Cobertura" value={`${cobertura.toFixed(0)}%`} hint={pausa.length > 0 ? `${pausa.length} en pausa` : undefined} />
      </div>

      {/* Toolbar umbral */}
      <div className="ao-panel flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs text-[var(--color-ink-3)]">Umbral alerta:</span>
        <div className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          {UMBRALES.map(u => (
            <button
              key={u.key}
              type="button"
              onClick={() => { setUmbral(u.key); setCustomVal('') }}
              className={cn(
                'px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-[var(--radius-sm)] last:rounded-r-[var(--radius-sm)]',
                umbral === u.key && !customVal
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
          <span>o</span>
          <input
            type="number"
            min={1}
            max={90}
            value={customVal}
            onChange={(e) => handleCustom(e.target.value)}
            placeholder="—"
            className={cn(
              'w-14 rounded-md border px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
              customVal ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]' : 'border-[var(--color-border)] bg-transparent text-[var(--color-ink)]',
            )}
          />
          <span>días</span>
        </div>
        <span className="ml-auto text-xs text-[var(--color-ink-3)]">
          Cliente activo = pidió en últimos 90 días
        </span>
      </div>

      {/* Banner alerta activa */}
      {sinPedir.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[oklch(70%_.18_25_/_0.28)] bg-[var(--color-danger-soft)] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--coral)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--coral)]">
                {sinPedir.length} cliente{sinPedir.length !== 1 ? 's' : ''} llevan más de {umbral} días sin pedir
              </p>
              {criticos.length > 0 && (
                <p className="text-xs text-[var(--coral)]/80">
                  {criticos.length} de ellos superan 7 días — riesgo de fuga elevado
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="mono tabular-nums text-2xl font-semibold text-[var(--coral)]">{sinPedir.length}</div>
            <div className="text-[10px] text-[var(--coral)]">sin pedir &gt;{umbral}d</div>
          </div>
        </div>
      )}

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
          umbralBase={umbral}
          umbralCritico={7}
          empty="Todos los clientes están pidiendo"
          isLoading={isLoading}
          onSelect={onSelect}
        />
      </div>

      {pausa.length > 0 && (
        <details className="ao-card p-3">
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
    tone === 'ok'    ? 'text-[var(--mint)]' :
    tone === 'warn'  ? 'text-[var(--coral)]' :
    tone === 'muted' ? 'text-[var(--color-ink-3)]' :
                       'text-[var(--color-ink)]'
  return (
    <div className="ao-card p-3">
      <div className="label-caps flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className={cn('mono mt-1 text-xl font-semibold tabular-nums md:text-2xl', valueColor)}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

type FilaRow = {
  contact_name_canon: string
  ult_pedido: string
  dias_sin_pedir: number
  cadencia_dias: number | null
  pedidos_activo: number
  ventas_activo: number
}

function FilaCliente({ r, tone, onSelect }: { r: FilaRow; tone: 'ok' | 'warn' | 'amber' | 'crit'; onSelect?: (n: string) => void }) {
  const dayColor =
    tone === 'ok'    ? 'text-[var(--mint)]' :
    tone === 'amber' ? 'text-[var(--amber)]' :
                       'text-[var(--coral)]'
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(r.contact_name_canon)}
        className="grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-2 text-left text-sm transition hover:bg-[rgba(255,255,255,.035)]"
      >
        <div className="min-w-0">
          <div className="truncate text-[var(--color-ink)]">{r.contact_name_canon}</div>
          <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
            {r.cadencia_dias != null ? `cad. ${r.cadencia_dias.toFixed(0)}d` : 'cad. —'} ·
            {' '}{r.pedidos_activo}p · {euros(r.ventas_activo)}
          </div>
        </div>
        <div className="mono text-right text-[11px] tabular-nums">
          <div className={cn('font-semibold', dayColor)}>
            {r.dias_sin_pedir === 0 ? 'hoy' : `${r.dias_sin_pedir}d`}
          </div>
          <div className="text-[10px] text-[var(--color-ink-3)]">
            {format(parseISO(r.ult_pedido), 'd LLL', { locale: es })}
          </div>
        </div>
      </button>
    </li>
  )
}

function Columna({
  titulo, subtitulo, icon: Icon, tone, rows, umbralBase, umbralCritico, empty, isLoading, onSelect,
}: {
  titulo: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'ok' | 'warn'
  rows: FilaRow[]
  umbralBase?: number
  umbralCritico?: number
  empty: string
  isLoading: boolean
  onSelect?: (name: string) => void
}) {
  const headerCls = tone === 'ok' ? 'text-[var(--mint)] bg-[var(--mint-glow)]' : 'text-[var(--coral)] bg-[var(--color-danger-soft)]'

  const atencion = umbralCritico ? rows.filter(r => r.dias_sin_pedir < umbralCritico) : rows
  const criticos = umbralCritico ? rows.filter(r => r.dias_sin_pedir >= umbralCritico) : []

  return (
    <div className="ao-card overflow-hidden p-0">
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
          {umbralCritico ? (
            <>
              {atencion.length > 0 && (
                <>
                  {criticos.length > 0 && (
                    <li className="flex items-center gap-2 bg-[rgba(255,255,255,.025)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--amber)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
                      Atención — {umbralBase != null ? `${umbralBase + 1}d` : ''}–{umbralCritico != null ? `${umbralCritico - 1}d` : ''}
                    </li>
                  )}
                  {atencion.map(r => <FilaCliente key={r.contact_name_canon} r={r} tone="amber" onSelect={onSelect} />)}
                </>
              )}
              {criticos.length > 0 && (
                <>
                  <li className="flex items-center gap-2 bg-[rgba(255,255,255,.025)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--coral)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--coral)]" />
                    Crítico — más de {umbralCritico} días sin pedir
                  </li>
                  {criticos.map(r => <FilaCliente key={r.contact_name_canon} r={r} tone="crit" onSelect={onSelect} />)}
                </>
              )}
            </>
          ) : (
            rows.map(r => <FilaCliente key={r.contact_name_canon} r={r} tone={tone === 'ok' ? 'ok' : 'amber'} onSelect={onSelect} />)
          )}
        </ul>
      )}
    </div>
  )
}
