import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Link2, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/lib/toast'
import {
  useSugerenciasMapeo,
  useUpsertProductoHolded,
  useBuscarProductosHolded,
  type SugerenciaMapeo,
} from '../lib/queries'

export function UnificacionProductos() {
  const [open, setOpen] = useState(false)
  const sugerencias = useSugerenciasMapeo()
  const total = sugerencias.data?.length ?? 0

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
      >
        <span className="inline-flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Unificación de productos
          {total > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              {total} sin mapear
            </span>
          )}
          {total === 0 && sugerencias.isFetching === false && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              ✓ Todo unificado
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] p-3">
          <p className="mb-3 text-[11px] text-[var(--color-ink-3)]">
            Productos que aparecen en pedidos o inventario sin estar vinculados al catálogo Holded.
            Sin vínculo, el cotejo no los agrupa correctamente.
          </p>

          {sugerencias.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </div>
          ) : sugerencias.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30">
              Error: {(sugerencias.error as Error).message}
            </div>
          ) : total === 0 ? (
            <p className="text-xs italic text-[var(--color-ink-3)]">
              Todos los productos están unificados — el cotejo agrega correctamente.
            </p>
          ) : (
            <ul className="space-y-2">
              {sugerencias.data!.map(s => (
                <FilaMapeo key={`${s.producto_raw}|${s.fuente}`} sugerencia={s} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function FilaMapeo({ sugerencia: s }: { sugerencia: SugerenciaMapeo }) {
  const upsert = useUpsertProductoHolded()
  const [modo, setModo] = useState<'idle' | 'buscar'>('idle')
  const [busqueda, setBusqueda] = useState('')
  const candidatos = useBuscarProductosHolded(modo === 'buscar' ? busqueda : '')

  const confirmar = async (holdedId: string, holdedName: string) => {
    try {
      await upsert.mutateAsync({
        producto_normalizado: s.producto_raw,
        holded_product_id: holdedId,
        holded_product_name: holdedName,
      })
      toast({ title: `"${s.producto_raw}" vinculado a ${holdedName}`, variant: 'success' })
      setModo('idle')
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Inesperado', variant: 'error' })
    }
  }

  const confianzaColor =
    s.confianza == null      ? 'text-[var(--color-ink-3)]'
    : s.confianza >= 0.6     ? 'text-emerald-600 dark:text-emerald-400'
    : s.confianza >= 0.35    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-500'

  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 space-y-2">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-[var(--color-ink)]">{s.producto_raw}</span>
          <span className={cn(
            'ml-2 rounded-full px-1.5 py-0.5 text-[10px]',
            s.fuente === 'pedido'
              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
          )}>
            {s.fuente} · {s.veces}×
          </span>
        </div>
        {modo === 'idle' && (
          <button
            type="button"
            onClick={() => { setModo('buscar'); setBusqueda(s.producto_raw) }}
            className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink-2)]"
          >
            Buscar manual
          </button>
        )}
      </div>

      {/* Sugerencia automática */}
      {modo === 'idle' && s.sugerencia_holded_id && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1.5">
          <div className="min-w-0">
            <span className="text-[11px] text-[var(--color-ink-3)]">Sugerencia: </span>
            <span className="text-xs font-medium text-[var(--color-ink)]">{s.sugerencia_nombre}</span>
            <span className={cn('ml-1.5 text-[10px] font-bold', confianzaColor)}>
              {s.confianza != null ? `${Math.round(s.confianza * 100)}%` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => confirmar(s.sugerencia_holded_id!, s.sugerencia_nombre!)}
            disabled={upsert.isPending}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {upsert.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Check className="h-3 w-3" />}
            Confirmar
          </button>
        </div>
      )}

      {/* Buscador manual */}
      {modo === 'buscar' && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-ink-3)]" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar en catálogo Holded…"
                autoFocus
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-6 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setModo('idle')}
              className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {candidatos.isFetching && (
            <div className="flex items-center gap-1 text-[11px] text-[var(--color-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
            </div>
          )}
          {candidatos.data && candidatos.data.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {candidatos.data.map(c => (
                <li key={c.product_id}>
                  <button
                    type="button"
                    onClick={() => confirmar(c.product_id, c.nombre)}
                    disabled={upsert.isPending}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                  >
                    <span className="font-medium text-[var(--color-ink)]">{c.nombre}</span>
                    <Check className="h-3 w-3 shrink-0 text-[var(--color-primary)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidatos.data?.length === 0 && busqueda.length >= 2 && !candidatos.isFetching && (
            <p className="text-[11px] italic text-[var(--color-ink-3)]">Sin resultados para "{busqueda}"</p>
          )}
        </div>
      )}
    </li>
  )
}
