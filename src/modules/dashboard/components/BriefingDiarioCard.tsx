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
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-primary-2)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            Briefing del día
          </h2>
          {data?.fuente && (
            <span className={
              'rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ' +
              (data.fuente === 'cron'
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-sky-500/15 text-sky-700')
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
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="prose prose-sm max-w-none text-[var(--color-ink)] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:text-[var(--color-ink)] [&_strong]:font-semibold [&_em]:text-[var(--color-ink-2)] [&_ul]:my-2 [&_ul]:pl-5 [&_li]:my-0.5">
              <ReactMarkdown>{data.contenido_md}</ReactMarkdown>
            </div>
            <p className="mt-3 text-[10px] text-[var(--color-ink-3)] tabular-nums">
              Generado {format(parseISO(data.generated_at), "d LLL 'a las' HH:mm", { locale: es })}
              {data.modelo ? ` · ${data.modelo.replace('claude-', '')}` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {briefingActions.map(({ title, sub, to }) => (
              <Link
                key={title}
                to={to}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 transition hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--color-ink)]">{title}</div>
                  <div className="truncate text-xs text-[var(--color-ink-3)]">{sub}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
