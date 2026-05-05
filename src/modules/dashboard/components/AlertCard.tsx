import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

type Severidad = 'critica' | 'aviso' | 'info' | 'ok'

interface Props {
  titulo: string
  subtitulo?: string
  Icon: LucideIcon
  severidad: Severidad
  count?: number
  total?: string
  to?: string
  loading?: boolean
  empty?: string
  preview?: React.ReactNode      // top N para tarjeta compacta
  full?: React.ReactNode         // lista completa para modal "Ver todos"
}

const TONOS: Record<Severidad, { iconBg: string; iconText: string; countText: string; ring: string }> = {
  critica: { iconBg: 'bg-red-100',     iconText: 'text-red-700',     countText: 'text-red-700',     ring: 'hover:border-red-300' },
  aviso:   { iconBg: 'bg-amber-100',   iconText: 'text-amber-700',   countText: 'text-amber-700',   ring: 'hover:border-amber-300' },
  info:    { iconBg: 'bg-blue-100',    iconText: 'text-blue-700',    countText: 'text-blue-700',    ring: 'hover:border-blue-300' },
  ok:      { iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', countText: 'text-emerald-700', ring: 'hover:border-emerald-300' },
}

export function AlertCard({ titulo, subtitulo, Icon, severidad, count, total, to, loading, empty, preview, full }: Props) {
  const t = TONOS[severidad]
  const [expanded, setExpanded] = useState(false)
  const tieneFull = !!full && (count ?? 0) > 0
  const hasCount = (count ?? 0) > 0
  const isInteractive = !!to || tieneFull

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <>
      <section
        className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition ${
          isInteractive ? `${t.ring} hover:shadow-sm` : ''
        }`}
      >
        <header className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.iconBg}`}>
            <Icon className={`h-5 w-5 ${t.iconText}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-bold leading-tight text-[var(--color-ink)]">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 text-xs leading-snug text-[var(--color-ink-3)]">{subtitulo}</p>}
          </div>
          {hasCount && (
            <span className={`shrink-0 font-display text-3xl font-bold tabular-nums leading-none ${t.countText}`}>
              {count}
            </span>
          )}
          {!hasCount && total && (
            <span className="shrink-0 font-display text-base font-bold tabular-nums text-[var(--color-ink)]">
              {total}
            </span>
          )}
        </header>
        {hasCount && total && (
          <p className="px-4 pb-1 text-right text-[11px] font-semibold tabular-nums text-[var(--color-ink-2)]">
            total {total}
          </p>
        )}
        <div className="flex-1 px-4 pb-3">
          {loading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
          {!loading && !hasCount && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-3)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600/80" />
              {empty ?? 'Todo OK'}
            </p>
          )}
          {!loading && hasCount && preview}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border)]/60 px-4 py-2 text-xs">
          {tieneFull && (
            <button onClick={() => setExpanded(true)} className="font-medium text-[var(--color-primary)] hover:underline">
              Ver todos ({count})
            </button>
          )}
          {to && (
            <Link to={to} className="flex items-center gap-1 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-primary)]">
              Abrir <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </footer>
      </section>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false) }}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
                  <Icon className={`h-5 w-5 ${t.iconText}`} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{titulo}</h2>
                  {subtitulo && <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">{subtitulo}</p>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="px-5 py-4">
              {full}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
