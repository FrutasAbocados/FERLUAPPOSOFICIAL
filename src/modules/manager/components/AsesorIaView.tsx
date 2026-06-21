import { useMemo, useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Brain, ChevronLeft, ChevronRight, RefreshCw, TrendingUp, AlertTriangle, BadgeEuro, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useAsesorIaDia, useGenerarAsesorIa } from '../lib/queries'
import type { AsesorAccion, AsesorCliente } from '../lib/types'

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const sevClasses: Record<string, string> = {
  alta: 'border-l-rose-500/70 bg-rose-500/5',
  media: 'border-l-amber-500/70 bg-amber-500/5',
  baja: 'border-l-[var(--mint)]/60 bg-[var(--mint)]/5',
}

function AccionIcon({ tipo }: { tipo: string }) {
  if (tipo === 'coste') return <BadgeEuro className="h-3.5 w-3.5 text-amber-500" />
  if (tipo === 'alerta') return <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
  return <TrendingUp className="h-3.5 w-3.5 text-[var(--mint)]" />
}

function AccionRow({ a }: { a: AsesorAccion }) {
  return (
    <li className={`flex items-start gap-2 border-l-2 ${sevClasses[a.severidad] ?? sevClasses.baja} rounded-r px-2.5 py-1.5`}>
      <span className="mt-0.5 shrink-0"><AccionIcon tipo={a.tipo} /></span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--ink)]">
        <span className="font-semibold">{a.producto}</span>
        <span className="text-[var(--ink-dim)]"> — {a.detalle}</span>
      </span>
      {a.impacto_eur > 0 && (
        <span className="shrink-0 rounded bg-[var(--mint)]/15 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--mint)]">
          +{euros(a.impacto_eur)}
        </span>
      )}
    </li>
  )
}

function ClienteCard({ c }: { c: AsesorCliente }) {
  const impacto = (c.acciones ?? []).reduce((s, a) => s + (Number(a.impacto_eur) || 0), 0)
  return (
    <div className="ao-card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">{c.cliente}</p>
          {c.nota && <p className="truncate text-[12px] text-[var(--ink-dim)]">{c.nota}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-dim)]">venta día</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--ink)]">{euros(c.venta)}</p>
        </div>
      </div>
      <ul className="space-y-1 p-2">
        {(c.acciones ?? []).map((a, i) => <AccionRow key={i} a={a} />)}
      </ul>
      {impacto > 0 && (
        <div className="border-t border-[var(--border)] px-3 py-1.5 text-right text-[12px] text-[var(--ink-dim)]">
          potencial cliente: <span className="font-semibold tabular-nums text-[var(--mint)]">+{euros(impacto)}</span>
        </div>
      )}
    </div>
  )
}

export function AsesorIaView() {
  const [fecha, setFecha] = useState<string>(hoyMadrid())
  const { data, isLoading } = useAsesorIaDia(fecha)
  const generar = useGenerarAsesorIa(fecha)

  const cambiarDia = (delta: number) => {
    const next = format(addDays(parseISO(fecha), delta), 'yyyy-MM-dd')
    if (next <= hoyMadrid()) setFecha(next)
  }

  const onGenerar = () => {
    generar.mutate(undefined, {
      onSuccess: (r) => {
        if (r.vacio) toast({ title: 'No hay ventas registradas ese día' })
        else toast({ variant: 'success', title: 'Análisis listo', description: `${r.clientes?.length ?? 0} clientes · ${euros(r.oportunidad_eur)} de oportunidad` })
      },
      onError: (e) => toast({ variant: 'error', title: 'Error generando análisis', description: e instanceof Error ? e.message : undefined }),
    })
  }

  const clientes = useMemo(
    () => (data?.clientes ?? []).slice().sort((a, b) => {
      const ia = (a.acciones ?? []).reduce((s, x) => s + (Number(x.impacto_eur) || 0), 0)
      const ib = (b.acciones ?? []).reduce((s, x) => s + (Number(x.impacto_eur) || 0), 0)
      return ib - ia
    }),
    [data],
  )

  const generando = generar.isPending
  const fechaLabel = format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="space-y-4">
      {/* Cabecera + controles */}
      <div className="ao-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--mint)]/15 text-[var(--mint)]">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Asesor IA comercial</p>
            <p className="text-[12px] capitalize text-[var(--ink-dim)]">{fechaLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[var(--border)]">
            <button type="button" onClick={() => cambiarDia(-1)} className="px-2 py-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)]" aria-label="Día anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date" value={fecha} max={hoyMadrid()}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              className="bg-transparent px-1 py-1.5 text-sm text-[var(--ink)] outline-none [color-scheme:dark]"
            />
            <button type="button" onClick={() => cambiarDia(1)} disabled={fecha >= hoyMadrid()} className="px-2 py-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-30" aria-label="Día siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={onGenerar} disabled={generando} className="gap-1.5">
            {generando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generando ? 'Analizando…' : data ? 'Re-analizar' : 'Analizar día'}
          </Button>
        </div>
      </div>

      {/* Estado generando */}
      {generando && (
        <div className="ao-card flex items-center gap-3 p-4 text-sm text-[var(--ink-dim)]">
          <RefreshCw className="h-4 w-4 animate-spin text-[var(--mint)]" />
          Analizando factura por factura y comparando con el histórico de cada cliente… (≈40 s)
        </div>
      )}

      {/* Resumen + KPIs */}
      {!generando && data && !data.vacio && (
        <>
          <div className="ao-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-[var(--mint)]/15 px-3 py-1.5 text-sm font-semibold tabular-nums text-[var(--mint)]">
                Oportunidad: +{euros(data.oportunidad_eur)}
              </span>
              <span className="text-[12px] text-[var(--ink-dim)]">
                {clientes.length} clientes con mejoras{data.modelo ? ` · ${data.modelo.replace('claude-', '').replace(/-\d+$/, '')}` : ''}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--ink)]">{data.resumen}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {clientes.map((c) => <ClienteCard key={c.cliente} c={c} />)}
          </div>
        </>
      )}

      {/* Vacío / sin datos */}
      {!generando && data?.vacio && (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-dim)]">No hay ventas registradas ese día.</div>
      )}
      {!generando && !data && !isLoading && (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-dim)]">
          Aún no hay análisis para este día. Pulsa <span className="font-semibold text-[var(--ink)]">Analizar día</span> para que la IA revise las facturas cliente por cliente.
        </div>
      )}
    </div>
  )
}
