import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X, type LucideIcon } from 'lucide-react'
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

const TONOS: Record<Severidad, { iconBg: string; iconText: string; badge: string; accent: string }> = {
  critica: { iconBg: 'bg-red-100',     iconText: 'text-red-700',     badge: 'bg-red-100 text-red-800',         accent: 'border-l-red-500' },
  aviso:   { iconBg: 'bg-amber-100',   iconText: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800',     accent: 'border-l-amber-500' },
  info:    { iconBg: 'bg-blue-100',    iconText: 'text-blue-700',    badge: 'bg-blue-100 text-blue-800',       accent: 'border-l-blue-500' },
  ok:      { iconBg: 'bg-emerald-100', iconText: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', accent: 'border-l-emerald-500' },
}

export function AlertCard({ titulo, subtitulo, Icon, severidad, count, total, to, loading, empty, preview, full }: Props) {
  const t = TONOS[severidad]
  const [expanded, setExpanded] = useState(false)
  const tieneFull = !!full && (count ?? 0) > 0

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <>
      <section className={`flex flex-col rounded-xl border border-[var(--color-border)] border-l-4 ${t.accent} bg-[var(--color-surface)]`}>
        <header className="flex items-start gap-3 px-4 py-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.iconBg}`}>
            <Icon className={`h-5 w-5 ${t.iconText}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display text-base font-bold text-[var(--color-ink)]">{titulo}</h3>
              {count != null && count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.badge}`}>{count}</span>
              )}
            </div>
            {subtitulo && <p className="mt-0.5 text-xs text-[var(--color-ink-3)]">{subtitulo}</p>}
          </div>
          {total && <span className="font-display text-base font-bold tabular-nums text-[var(--color-ink)]">{total}</span>}
        </header>
        <div className="flex-1 px-4 pb-3">
          {loading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
          {!loading && (count ?? 0) === 0 && <p className="text-sm text-[var(--color-ink-3)]">{empty ?? 'Todo OK'}</p>}
          {!loading && (count ?? 0) > 0 && preview}
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
