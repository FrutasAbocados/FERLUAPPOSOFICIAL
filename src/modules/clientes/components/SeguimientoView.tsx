import { useMemo, useState } from 'react'
import { format, isToday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Phone, Check, X, RotateCcw, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  useClientesSeguimientoV2,
  useClientesSeguimientoExcluidos,
  useSeguimientoExcluir,
  useSeguimientoRestaurar,
  useSeguimientoLlamado,
  type SeguimientoFilaV2,
  type ExcluidoFila,
} from '../lib/hooks'

// ─── Clasificación ────────────────────────────────────────────────────────────

type Bucket = 'manana' | 'urgente' | 'riesgo' | 'atencion'

function clasificar(r: SeguimientoFilaV2): Bucket | null {
  const d = r.dias_sin_pedir
  const c = r.cadencia_dias
  // "Pedirá mañana": en ventana de cadencia, mínimo 1 día sin pedir (no llamar a quien ya pidió hoy)
  if (c != null && d >= 1) {
    const cf = Math.floor(c)
    if (d >= cf - 1 && d <= cf && d < 14) return 'manana'
  }
  if (d >= 14) return 'urgente'
  if (d >= 7)  return 'riesgo'
  if (d >= 3)  return 'atencion'
  return null
}

function esLlamadoHoy(at: string | null): boolean {
  if (!at) return false
  try { return isToday(parseISO(at)) } catch { return false }
}

// ─── Config visual por bucket ──────────────────────────────────────────────

const CFG: Record<Bucket, {
  label: string
  sublabel: string
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  dotColor: string
}> = {
  manana: {
    label: 'Llama hoy',
    sublabel: 'pedirán mañana',
    headerBg:   'bg-[oklch(28%_.12_160)]',
    headerText: 'text-[var(--mint)]',
    badgeBg:    'bg-[var(--mint)]/15',
    badgeText:  'text-[var(--mint)]',
    dotColor:   'bg-[var(--mint)]',
  },
  urgente: {
    label: '+14 días',
    sublabel: 'urgente — contactar',
    headerBg:   'bg-[oklch(22%_.1_15)]',
    headerText: 'text-[var(--coral)]',
    badgeBg:    'bg-[var(--coral)]/15',
    badgeText:  'text-[var(--coral)]',
    dotColor:   'bg-[var(--coral)]',
  },
  riesgo: {
    label: '+7 días',
    sublabel: 'en riesgo',
    headerBg:   'bg-[oklch(24%_.09_45)]',
    headerText: 'text-[oklch(75%_.16_45)]',
    badgeBg:    'bg-[oklch(75%_.16_45)]/15',
    badgeText:  'text-[oklch(75%_.16_45)]',
    dotColor:   'bg-[oklch(75%_.16_45)]',
  },
  atencion: {
    label: '+3 días',
    sublabel: 'vigilar',
    headerBg:   'bg-[oklch(26%_.1_85)]',
    headerText: 'text-[var(--amber)]',
    badgeBg:    'bg-[var(--amber)]/15',
    badgeText:  'text-[var(--amber)]',
    dotColor:   'bg-[var(--amber)]',
  },
}

// ─── Fila compacta ────────────────────────────────────────────────────────────

const MOTIVOS_QUICK = [
  { value: 'no_cliente',  label: 'Ya no es cliente' },
  { value: 'pausa_larga', label: 'Pausa larga' },
]

function FilaCliente({
  r, bucket, onLlamado, onExcluir, onSelect,
}: {
  r: SeguimientoFilaV2
  bucket: Bucket
  onLlamado: (n: string) => void
  onExcluir: (n: string, motivo: string) => void
  onSelect?: (n: string) => void
}) {
  const [excl, setExcl] = useState(false)
  const cfg = CFG[bucket]
  const llamado = esLlamadoHoy(r.llamado_seguimiento_at)
  const inicial = r.contact_name_canon.trim()[0]?.toUpperCase() ?? '?'

  if (excl) {
    return (
      <li className="flex flex-wrap items-center gap-1.5 border-t border-white/5 px-3 py-2">
        <span className="mr-1 truncate text-[11px] text-[var(--color-ink-3)]">
          Excluir {r.contact_name_canon.split(' ')[0]}:
        </span>
        {MOTIVOS_QUICK.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onExcluir(r.contact_name_canon, m.value)}
            className="rounded-full border border-[var(--coral)]/40 bg-[var(--color-danger-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--coral)] hover:bg-[var(--coral)]/20"
          >
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExcl(false)}
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          Cancelar
        </button>
      </li>
    )
  }

  return (
    <li className={cn(
      'flex items-center gap-2 border-t border-white/5 px-3 py-2',
      'transition-opacity',
      llamado && 'opacity-40',
    )}>
      {/* Avatar */}
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        cfg.badgeBg, cfg.badgeText,
      )}>
        {inicial}
      </div>

      {/* Nombre */}
      <button
        type="button"
        onClick={() => onSelect?.(r.contact_name_canon)}
        className="flex-1 truncate text-left text-[13px] text-[var(--color-ink)] hover:text-[var(--color-primary-2)]"
      >
        {r.contact_name_canon}
      </button>

      {/* Días badge */}
      <span className={cn('mono shrink-0 text-[11px] font-bold tabular-nums', cfg.badgeText)}>
        {r.dias_sin_pedir === 0 ? 'hoy' : `${r.dias_sin_pedir}d`}
      </span>

      {/* Llamé */}
      <button
        type="button"
        title={llamado ? 'Llamado hoy' : 'Ya llamé'}
        onClick={() => !llamado && onLlamado(r.contact_name_canon)}
        disabled={llamado}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
          llamado
            ? 'bg-[var(--mint)]/20 text-[var(--mint)]'
            : 'bg-white/5 text-[var(--color-ink-3)] hover:bg-[var(--mint)]/20 hover:text-[var(--mint)]',
        )}
      >
        {llamado ? <Check className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
      </button>

      {/* Excluir */}
      <button
        type="button"
        title="Excluir del seguimiento"
        onClick={() => setExcl(true)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[var(--color-ink-3)] transition-colors hover:bg-[var(--coral)]/15 hover:text-[var(--coral)]"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  )
}

// ─── Columna de bucket ────────────────────────────────────────────────────────

function BucketCol({
  bucket, rows, onLlamado, onExcluir, onSelect,
}: {
  bucket: Bucket
  rows: SeguimientoFilaV2[]
  onLlamado: (n: string) => void
  onExcluir: (n: string, motivo: string) => void
  onSelect?: (n: string) => void
}) {
  const cfg = CFG[bucket]

  return (
    <div className="ao-card overflow-hidden p-0">
      {/* Header coloreado */}
      <div className={cn('flex items-center gap-2 px-3 py-2.5', cfg.headerBg)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotColor)} />
        <span className={cn('flex-1 text-xs font-bold uppercase tracking-widest', cfg.headerText)}>
          {cfg.label}
        </span>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
          cfg.badgeBg, cfg.badgeText,
        )}>
          {rows.length}
        </span>
        <span className="text-[10px] text-white/30">{cfg.sublabel}</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-5 text-center text-[11px] text-[var(--color-ink-3)]">
          Sin clientes aquí
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto md:max-h-80">
          {rows.map(r => (
            <FilaCliente
              key={r.contact_name_canon}
              r={r}
              bucket={bucket}
              onLlamado={onLlamado}
              onExcluir={onExcluir}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Vista principal ──────────────────────────────────────────────────────────

export function SeguimientoView({ onSelect }: { onSelect?: (name: string) => void }) {
  const { data: rows = [], isLoading } = useClientesSeguimientoV2()
  const { data: excluidos = [] } = useClientesSeguimientoExcluidos()
  const excluirMut    = useSeguimientoExcluir()
  const restaurarMut  = useSeguimientoRestaurar()
  const llamadoMut    = useSeguimientoLlamado()
  const [showExcl, setShowExcl] = useState(false)

  const buckets = useMemo(() => {
    const out: Record<Bucket, SeguimientoFilaV2[]> = {
      manana: [], urgente: [], riesgo: [], atencion: [],
    }
    for (const r of rows) {
      const b = clasificar(r)
      if (b) out[b].push(r)
    }
    return out
  }, [rows])

  const totalAlertas = buckets.urgente.length + buckets.riesgo.length + buckets.atencion.length
  const totalActivos = rows.length

  function onLlamado(name: string) { llamadoMut.mutate(name) }
  function onExcluir(name: string, motivo: string) {
    excluirMut.mutate({ name, motivo })
  }
  function onRestaurar(name: string) { restaurarMut.mutate(name) }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--color-ink-3)]">
        Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* ─── Barra resumen ─── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <span className="text-xs font-semibold text-[var(--color-ink-2)]">
          {format(new Date(), "EEE d MMM", { locale: es })}
        </span>
        <span className="text-xs text-[var(--color-ink-3)]">·</span>
        <span className="text-xs text-[var(--color-ink-3)]">{totalActivos} activos</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {buckets.manana.length > 0 && (
            <Chip color="mint"   label={`${buckets.manana.length} llama hoy`} />
          )}
          {buckets.urgente.length > 0 && (
            <Chip color="coral"  label={`${buckets.urgente.length} urgente${buckets.urgente.length > 1 ? 's' : ''}`} />
          )}
          {buckets.riesgo.length > 0 && (
            <Chip color="orange" label={`${buckets.riesgo.length} en riesgo`} />
          )}
          {buckets.atencion.length > 0 && (
            <Chip color="amber"  label={`${buckets.atencion.length} atención`} />
          )}
          {totalAlertas === 0 && buckets.manana.length === 0 && (
            <Chip color="mint" label="Todo en orden" />
          )}
        </div>
      </div>

      {/* ─── Grid 2×2 ─── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BucketCol bucket="manana"  rows={buckets.manana}  onLlamado={onLlamado} onExcluir={onExcluir} onSelect={onSelect} />
        <BucketCol bucket="urgente" rows={buckets.urgente} onLlamado={onLlamado} onExcluir={onExcluir} onSelect={onSelect} />
        <BucketCol bucket="riesgo"  rows={buckets.riesgo}  onLlamado={onLlamado} onExcluir={onExcluir} onSelect={onSelect} />
        <BucketCol bucket="atencion" rows={buckets.atencion} onLlamado={onLlamado} onExcluir={onExcluir} onSelect={onSelect} />
      </div>

      {/* ─── Excluidos ─── */}
      {excluidos.length > 0 && (
        <div className="ao-card overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setShowExcl(v => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showExcl && 'rotate-180')} />
            <span>{excluidos.length} excluido{excluidos.length > 1 ? 's' : ''} del seguimiento</span>
          </button>
          {showExcl && (
            <ul className="border-t border-[var(--color-border)]">
              {excluidos.map((e: ExcluidoFila) => (
                <li key={e.contact_name_canon} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1 truncate text-xs text-[var(--color-ink-3)]">
                    {e.contact_name_canon}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestaurar(e.contact_name_canon)}
                    className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-ink-3)] hover:border-[var(--mint)] hover:text-[var(--mint)]"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Chip resumen ─────────────────────────────────────────────────────────────

function Chip({ color, label }: { color: 'mint' | 'coral' | 'orange' | 'amber'; label: string }) {
  const cls = {
    mint:   'border-[var(--mint)]/30 bg-[var(--mint)]/10 text-[var(--mint)]',
    coral:  'border-[var(--coral)]/30 bg-[var(--coral)]/10 text-[var(--coral)]',
    orange: 'border-[oklch(75%_.16_45)]/30 bg-[oklch(75%_.16_45)]/10 text-[oklch(75%_.16_45)]',
    amber:  'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  }[color]
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', cls)}>
      {label}
    </span>
  )
}
