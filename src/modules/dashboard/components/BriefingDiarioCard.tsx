import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { useBriefingHoy, useGenerarBriefingAhora } from '../lib/queries'

const briefingActions = [
  { title: 'Revisar deudores', sub: 'Cobros y vencidos', to: '/cobros' },
  { title: 'Ajustar PVP', sub: 'Productos con coste subiendo', to: '/manager' },
  { title: 'Reactivar clientes', sub: 'Cadencia y riesgo de fuga', to: '/clientes' },
]

export function BriefingDiarioCard() {
  const briefing = useBriefingHoy()
  const generar = useGenerarBriefingAhora()
  const [generating, setGenerating] = useState(false)

  const handleGenerar = async () => {
    setGenerating(true)
    try {
      const r = await generar.mutateAsync()
      if (r?.ok) {
        toast({ title: 'Briefing actualizado', variant: 'success' })
      } else {
        toast({ title: 'Error', description: r?.error ?? 'falló', variant: 'error' })
      }
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const data = briefing.data

  return (
    <section className="ao-card">
      <header className="mb-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--mint)]" />
          <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">
            Briefing del día
          </h2>
          {data?.fuente && (
            <span className={
              'ao-chip ' +
              (data.fuente === 'cron'
                ? 'ao-chip-mint'
                : 'ao-chip-sky')
            }>
              {data.fuente}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerar}
          disabled={generating}
          title="Regenerar con datos actuales"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {data ? 'Regenerar' : 'Generar'}
        </Button>
      </header>

      {briefing.isLoading && (
        <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>
      )}

      {!briefing.isLoading && !data && (
        <div className="rounded-xl bg-[var(--color-surface-2)] px-4 py-6 text-center ring-1 ring-[var(--color-border)]">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-[var(--color-ink-3)]" />
          <p className="text-sm text-[var(--color-ink-2)]">
            Aún no hay briefing generado para hoy.
          </p>
          <p className="text-xs text-[var(--color-ink-3)]">
            El cron lo generará cada mañana a las 07:30 UTC. Pulsa "Generar" para tener uno ya.
          </p>
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div>
            <div className="prose prose-sm max-w-none text-[var(--ink)] [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-[var(--mint)] [&_em]:font-serif [&_em]:text-lg [&_em]:leading-snug [&_em]:text-[var(--ink-dim)] [&_ul]:my-2 [&_ul]:pl-5 [&_li]:my-0.5">
              <ReactMarkdown>{data.contenido_md}</ReactMarkdown>
            </div>
            <p className="mono mt-5 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
              Generado {format(parseISO(data.generated_at), "d LLL HH:mm", { locale: es })}
              {data.modelo ? ` · ${data.modelo.replace('claude-', '')}` : ''}
            </p>
          </div>
          <div className="grid gap-2.5 content-start">
            {briefingActions.map(({ title, sub, to }) => (
              <Link key={title} to={to} className="ao-panel ao-card-hover flex items-center gap-3 p-3">
                <div className="ao-icon-tile h-8 w-8 shrink-0">
                  <Sparkles className="h-4 w-4" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--ink)]">{title}</div>
                  <div className="mono truncate text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{sub}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--ink-mute)]" strokeWidth={1.6} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
