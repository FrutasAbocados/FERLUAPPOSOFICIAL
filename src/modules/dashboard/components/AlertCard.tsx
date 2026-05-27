import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
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

const TONOS: Record<Severidad, { icon: string; iconStyle: string; countStyle: string; ring: string }> = {
  critica: { icon: 'text-[var(--coral)]', iconStyle: 'background:oklch(30% .12 25 / .22);border-color:oklch(70% .18 25 / .22)', countStyle: 'text-[var(--coral)]', ring: 'hover:border-[oklch(70%_.18_25_/_0.35)]' },
  aviso:   { icon: 'text-[var(--amber)]', iconStyle: 'background:oklch(30% .10 70 / .25);border-color:oklch(78% .16 70 / .22)', countStyle: 'text-[var(--amber)]', ring: 'hover:border-[oklch(78%_.16_70_/_0.35)]' },
  info:    { icon: 'text-[var(--sky)]',   iconStyle: 'background:oklch(30% .10 235 / .22);border-color:oklch(76% .12 235 / .22)', countStyle: 'text-[var(--sky)]', ring: 'hover:border-[oklch(76%_.12_235_/_0.35)]' },
  ok:      { icon: 'text-[var(--mint)]',  iconStyle: 'background:var(--mint-glow);border-color:var(--mint-glow)', countStyle: 'text-[var(--mint)]', ring: 'hover:border-[var(--line-2)]' },
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
        className={`ao-card-hover flex flex-col rounded-[var(--radius-xl)] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(18,26,24,.48),rgba(14,20,19,.34))] transition ${
          isInteractive ? t.ring : ''
        }`}
      >
        <header className="flex items-start gap-2.5 px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:h-10 sm:w-10 sm:rounded-xl" style={styleToObj(t.iconStyle)}>
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${t.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium leading-tight text-[var(--ink)] sm:text-sm">{titulo}</h3>
            {subtitulo && <p className="mt-0.5 hidden text-xs leading-snug text-[var(--ink-mute)] sm:block">{subtitulo}</p>}
          </div>
          {hasCount && (
            <span className={`mono shrink-0 text-2xl font-medium tabular-nums leading-none sm:text-3xl ${t.countStyle}`}>
              {count}
            </span>
          )}
          {!hasCount && total && (
            <span className="mono shrink-0 text-sm font-medium tabular-nums text-[var(--ink)] sm:text-base">
              {total}
            </span>
          )}
        </header>
        {hasCount && total && (
          <p className="mono px-3 pb-1 text-right text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)] sm:px-4">
            total {total}
          </p>
        )}
        <div className="hidden flex-1 px-3 pb-3 sm:block sm:px-4">
          {loading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
          {!loading && !hasCount && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--ink-mute)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--mint)]" />
              {empty ?? 'Todo OK'}
            </p>
          )}
          {!loading && hasCount && preview}
        </div>
        {/* Mobile: estado ok compacto */}
        <div className="px-3 pb-2 sm:hidden">
          {!loading && !hasCount && (
            <p className="flex items-center gap-1 text-xs text-[var(--ink-mute)]">
              <CheckCircle2 className="h-3 w-3 text-[var(--mint)]" />
              {empty ?? 'OK'}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-3 py-2 text-xs sm:px-4">
          {tieneFull && (
            <button onClick={() => setExpanded(true)} className="font-medium text-[var(--mint)] hover:underline">
              Ver todos ({count})
            </button>
          )}
          {to && (
            <Link to={to} className="flex items-center gap-1 font-medium text-[var(--ink-dim)] hover:text-[var(--mint)]">
              Abrir <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </footer>
      </section>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm md:p-8"
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false) }}
        >
          <div className="ao-card w-full max-w-3xl overflow-hidden p-0">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border" style={styleToObj(t.iconStyle)}>
                  <Icon className={`h-5 w-5 ${t.icon}`} />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[var(--ink)]">{titulo}</h2>
                  {subtitulo && <p className="mt-0.5 text-xs text-[var(--ink-mute)]">{subtitulo}</p>}
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

function styleToObj(style: string): CSSProperties {
  return style.split(';').filter(Boolean).reduce<CSSProperties>((acc, part) => {
    const [rawKey, rawValue] = part.split(':')
    if (!rawKey || !rawValue) return acc
    const key = rawKey.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof React.CSSProperties
    ;(acc as Record<string, string>)[key] = rawValue.trim()
    return acc
  }, {})
}
