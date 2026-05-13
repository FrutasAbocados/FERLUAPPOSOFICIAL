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
    <section className="ao-card">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--amber)]" />
          <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">
            PVP a revisar
          </h2>
          <span className="ao-chip ao-chip-amber">
            {visibles.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--ink-mute)]">Margen objetivo</span>
          <div className="ao-tabbar">
            {[20, 25, 30].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMargenObjetivo(m)}
                className="ao-tab"
                data-active={margenObjetivo === m}
              >
                {m}%
              </button>
            ))}
          </div>
        </div>
      </header>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

      <ul>
        {visibles.slice(0, 8).map((p) => {
          const delta = p.delta_pvp_pct ?? 0
          const tonoDelta = delta > 20 ? 'text-[var(--mint)]' : delta > 10 ? 'text-[var(--amber)]' : 'text-[var(--ink-dim)]'
          const margenActual = p.margen_actual_pct
          const marginPct = margenActual == null ? 0 : Math.max(0, Math.min(100, (margenActual / margenObjetivo) * 100))
          return (
            <li key={p.product_id} className="ao-table-row grid grid-cols-[minmax(0,1.35fr)_0.6fr_0.9fr_0.8fr_1fr_auto] items-center gap-4 py-3 text-sm max-lg:grid-cols-[1fr_auto] max-lg:gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1 truncate">
                  <span className="truncate font-medium uppercase text-[var(--ink)]">{p.nombre}</span>
                  <span className="text-[10px] text-[var(--ink-mute)]">· kg</span>
                </div>
                <div className="mono mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">
                  {p.ultimas_ventas_dias > 0 ? `${p.ultimas_ventas_dias}d con ventas (30d)` : 'sin ventas 30d'}
                </div>
              </div>
              <div className="mono text-xs text-[var(--coral)] max-lg:hidden">coste +{p.coste_variacion_pct.toFixed(0)}%</div>
              <div className="mono tabular-nums max-lg:hidden">
                <span className="text-[var(--ink-mute)] line-through">{eur(p.pvp_actual ?? 0)}</span>
                <ArrowUpRight className="mx-1 inline h-3 w-3 text-[var(--mint)]" />
                <span className="font-semibold text-[var(--ink)]">{eur(p.pvp_sugerido)}</span>
              </div>
              <div className={`mono text-xs font-medium tabular-nums max-lg:hidden ${tonoDelta}`}>+{delta.toFixed(0)}%</div>
              <div className="max-lg:hidden">
                <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,.04)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--coral)] to-[var(--amber)]"
                    style={{ width: `${marginPct}%` }}
                  />
                </div>
                <div className="mono mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--ink-mute)]">
                  margen actual <span className={margenActual != null && margenActual < 10 ? 'text-[var(--coral)]' : 'text-[var(--amber)]'}>{margenActual == null ? '—' : `${margenActual.toFixed(0)}%`}</span> · objetivo {margenObjetivo}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDescartar(p)}
                className="rounded-md p-1.5 text-[var(--ink-mute)] hover:bg-[rgba(255,255,255,.04)] hover:text-[var(--ink)]"
                title="Marcar como revisado"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>

      {visibles.length > 8 && (
        <p className="mt-3 text-xs text-[var(--ink-mute)]">
          {visibles.length - 8} productos más con margen bajo y coste subido. Mostrados los 8 con mayor delta.
        </p>
      )}

      <p className="mono mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">
        PVP sugerido = coste actual / (1 − margen objetivo). Solo aparecen productos cuyo coste subió ≥15% en 14d
        y donde tu PVP medio actual no llega al margen objetivo. La cifra es una guía, no toca tarifas Holded automáticamente.
      </p>
    </section>
  )
}
