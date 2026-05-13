import { useMemo, useState } from 'react'
import { ArrowUpRight, EyeOff, TrendingUp } from 'lucide-react'
import { eurosOrDash } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { usePvpSugerido, type PvpSugerido } from '../lib/queries'
import { useAlertasDescartadas, useDescartarAlerta } from '../lib/dismiss'

const eur = eurosOrDash

export function PvpSugeridoCard() {
  const [margenObjetivo, setMargenObjetivo] = useState<number>(25)
  const { data, isLoading } = usePvpSugerido(margenObjetivo)
  const { isDescartada } = useAlertasDescartadas()
  const descartar = useDescartarAlerta()

  const visibles = useMemo<PvpSugerido[]>(() => {
    return (data ?? [])
      .filter((p) => p.delta_pvp_pct != null && p.delta_pvp_pct > 0)
      .filter((p) => !isDescartada('pvp_sugerido', p.product_id))
      .sort((a, b) => (b.delta_pvp_pct ?? 0) - (a.delta_pvp_pct ?? 0))
  }, [data, isDescartada])

  const handleDescartar = async (p: PvpSugerido) => {
    const ok = await confirm({
      title: '¿Marcar como revisado?',
      description: `${p.nombre} desaparecerá de esta lista. Volverá si el coste sigue subiendo.`,
      confirmLabel: 'Marcar revisado',
    })
    if (!ok) return
    try {
      await descartar.mutateAsync({ alert_type: 'pvp_sugerido', entity_id: p.product_id, motivo: 'revisado' })
      toast({ title: 'Producto descartado', description: p.nombre, variant: 'success' })
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'error' })
    }
  }

  if (!isLoading && visibles.length === 0) return null

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-600" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            PVP a revisar
          </h2>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            {visibles.length}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-[var(--color-ink-3)]">Margen objetivo:</span>
          {[20, 25, 30].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMargenObjetivo(m)}
              className={
                'rounded-md px-2 py-0.5 font-semibold transition ' +
                (margenObjetivo === m
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]')
              }
            >
              {m}%
            </button>
          ))}
        </div>
      </header>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

      <ul className="divide-y divide-[var(--color-border)]">
        {visibles.slice(0, 8).map((p) => {
          const delta = p.delta_pvp_pct ?? 0
          const tonoDelta = delta > 20 ? 'text-rose-700' : delta > 10 ? 'text-amber-700' : 'text-[var(--color-ink-2)]'
          const margenActual = p.margen_actual_pct
          return (
            <li key={p.product_id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-medium text-[var(--color-ink)]">{p.nombre}</span>
                  <span className="text-[10px] text-[var(--color-ink-3)] tabular-nums">
                    coste +{p.coste_variacion_pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink-3)] tabular-nums">
                  <span>
                    PVP{' '}
                    <span className="text-[var(--color-ink-2)]">{eur(p.pvp_actual ?? 0)}</span>
                    <ArrowUpRight className="mx-0.5 inline h-3 w-3 text-[var(--color-ink-3)]" />
                    <span className="font-semibold text-[var(--color-ink)]">{eur(p.pvp_sugerido)}</span>
                    <span className={`ml-1 ${tonoDelta}`}>(+{delta.toFixed(0)}%)</span>
                  </span>
                  <span>
                    margen{' '}
                    <span className={
                      margenActual != null && margenActual < 10 ? 'font-semibold text-rose-700'
                      : margenActual != null && margenActual < 20 ? 'font-semibold text-amber-700'
                      : 'text-[var(--color-ink-2)]'
                    }>
                      {margenActual == null ? '—' : `${margenActual.toFixed(0)}%`}
                    </span>
                  </span>
                  {p.ultimas_ventas_dias > 0 && (
                    <span>· {p.ultimas_ventas_dias}d con ventas (30d)</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDescartar(p)}
                className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                title="Marcar como revisado"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>

      {visibles.length > 8 && (
        <p className="mt-2 text-xs text-[var(--color-ink-3)]">
          {visibles.length - 8} productos más con margen bajo y coste subido. Mostrados los 8 con mayor delta.
        </p>
      )}

      <p className="mt-3 text-[10px] text-[var(--color-ink-3)]">
        PVP sugerido = coste actual / (1 − margen objetivo). Solo aparecen productos cuyo coste subió ≥15% en 14d
        y donde tu PVP medio actual no llega al margen objetivo. La cifra es una guía, no toca tarifas Holded automáticamente.
      </p>
    </section>
  )
}
