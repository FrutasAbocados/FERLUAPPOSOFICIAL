import { useState } from 'react'
import { Check, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import { toast } from '@/shared/lib/toast'
import { euros } from '@/shared/lib/format'
import {
  useBuscarProductosHolded,
  useComprasSinMapear,
  useComprasAlias,
  useUpsertCompraAlias,
  useDeleteCompraAlias,
  type CompraSinMapear,
  type CompraAlias,
} from '../lib/queries'

/**
 * Mapeo de costes: las compras (Fact Prov PDF) entran sin product_id y con nombres
 * libres. Aquí se vinculan a un producto del catálogo + factor de unidad (caja→kg/pieza)
 * para que su precio alimente el coste real y el margen. Lo que se mapea desaparece de
 * "sin mapear" y corrige el margen al instante.
 */
export function MapeoCostes() {
  const sinMapear = useComprasSinMapear()
  const mapeados = useComprasAlias()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Mapeo de costes</h2>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
          Las facturas de proveedor entran sin producto enlazado. Vincula cada compra a un
          producto + factor de unidad (caja de 4 kg → 4, caja de 12 piezas → 12). El coste real
          alimenta el margen en cuanto guardas.
        </p>
      </div>

      {/* Sin mapear */}
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)]">
          Compras sin mapear
          {(sinMapear.data?.length ?? 0) > 0 && (
            <span className="rounded-full bg-[var(--color-warn-bg,oklch(28%_.08_72_/_0.42))] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-primary)]">
              {sinMapear.data!.length}
            </span>
          )}
        </div>
        <div className="p-3">
          {sinMapear.isLoading ? (
            <Cargando />
          ) : sinMapear.error ? (
            <ErrorBox msg={(sinMapear.error as Error).message} />
          ) : (sinMapear.data?.length ?? 0) === 0 ? (
            <p className="text-xs italic text-[var(--color-ink-3)]">
              ✓ Todas las compras de los últimos 30 días están mapeadas.
            </p>
          ) : (
            <ul className="space-y-2">
              {sinMapear.data!.map(c => (
                <FilaSinMapear key={c.nombre_compra} compra={c} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Mapeados */}
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)]">
          Mapeados ({mapeados.data?.length ?? 0})
        </div>
        <div className="p-3">
          {mapeados.isLoading ? (
            <Cargando />
          ) : mapeados.error ? (
            <ErrorBox msg={(mapeados.error as Error).message} />
          ) : (mapeados.data?.length ?? 0) === 0 ? (
            <p className="text-xs italic text-[var(--color-ink-3)]">Nada mapeado todavía.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {mapeados.data!.map(m => (
                <FilaMapeada key={m.nombre_compra_norm} alias={m} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function FilaSinMapear({ compra }: { compra: CompraSinMapear }) {
  const upsert = useUpsertCompraAlias()
  const [busqueda, setBusqueda] = useState('')
  const [prod, setProd] = useState<{ id: string; nombre: string } | null>(null)
  const [factor, setFactor] = useState('1')
  const [costeFijo, setCosteFijo] = useState('')
  const candidatos = useBuscarProductosHolded(prod ? '' : busqueda)

  const guardar = async () => {
    if (!prod) return
    const fx = Number(factor.replace(',', '.')) || 1
    const fijo = costeFijo.trim() === '' ? null : Number(costeFijo.replace(',', '.'))
    try {
      await upsert.mutateAsync({
        nombre_compra_norm: compra.nombre_compra,
        holded_product_id:  prod.id,
        factor_unidad:      fx,
        coste_fijo:         fijo,
      })
      toast({ title: `"${compra.nombre_compra}" → ${prod.nombre}`, variant: 'success' })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Inesperado', variant: 'error' })
    }
  }

  const costePrevio = costeFijo.trim() !== ''
    ? Number(costeFijo.replace(',', '.'))
    : compra.coste_ud_mediano / (Number(factor.replace(',', '.')) || 1)

  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-[var(--color-ink)]">{compra.nombre_compra}</span>
          <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
            {euros(compra.gasto_eur)} · {compra.coste_ud_mediano.toFixed(3)} €/ud · {compra.lineas} líneas
          </div>
        </div>
      </div>

      {/* Selección de producto */}
      {!prod ? (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto del catálogo…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-6 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
          {candidatos.isFetching && <Cargando />}
          {candidatos.data && candidatos.data.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {candidatos.data.map(c => (
                <li key={c.product_id}>
                  <button
                    type="button"
                    onClick={() => setProd({ id: c.product_id, nombre: c.nombre })}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="font-medium text-[var(--color-ink)]">{c.nombre}</span>
                    <Check className="h-3 w-3 shrink-0 text-[var(--color-primary)]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidatos.data?.length === 0 && busqueda.trim().length >= 1 && !candidatos.isFetching && (
            <p className="text-[11px] italic text-[var(--color-ink-3)]">Sin resultados para "{busqueda}"</p>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-dashed border-[var(--color-border)] p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--color-ink)]">→ {prod.nombre}</span>
            <button
              type="button"
              onClick={() => setProd(null)}
              className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-[var(--color-ink-3)]">
              Factor unidad
              <input
                type="text"
                inputMode="decimal"
                value={factor}
                onChange={e => setFactor(e.target.value)}
                className="mt-0.5 block w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </label>
            <label className="text-[11px] text-[var(--color-ink-3)]">
              Coste fijo (opcional)
              <input
                type="text"
                inputMode="decimal"
                value={costeFijo}
                onChange={e => setCosteFijo(e.target.value)}
                placeholder="—"
                className="mt-0.5 block w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </label>
            <div className="text-[11px] text-[var(--color-ink-3)]">
              Coste resultante:{' '}
              <span className="font-bold tabular-nums text-[var(--color-ink)]">
                {Number.isFinite(costePrevio) ? `${costePrevio.toFixed(3)} €` : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={guardar}
              disabled={upsert.isPending}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function FilaMapeada({ alias }: { alias: CompraAlias }) {
  const upsert = useUpsertCompraAlias()
  const del = useDeleteCompraAlias()
  const [editando, setEditando] = useState(false)
  const [factor, setFactor] = useState(String(alias.factor_unidad))
  const [costeFijo, setCosteFijo] = useState(alias.coste_fijo == null ? '' : String(alias.coste_fijo))

  const guardar = async () => {
    const fx = Number(factor.replace(',', '.')) || 1
    const fijo = costeFijo.trim() === '' ? null : Number(costeFijo.replace(',', '.'))
    try {
      await upsert.mutateAsync({
        nombre_compra_norm: alias.nombre_compra_norm,
        holded_product_id:  alias.holded_product_id,
        factor_unidad:      fx,
        coste_fijo:         fijo,
      })
      toast({ title: 'Actualizado', variant: 'success' })
      setEditando(false)
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Inesperado', variant: 'error' })
    }
  }

  const borrar = async () => {
    try {
      await del.mutateAsync(alias.nombre_compra_norm)
      toast({ title: 'Mapeo eliminado', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Inesperado', variant: 'error' })
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-[var(--color-ink)]">{alias.nombre_compra_norm}</span>
        <span className="text-[var(--color-ink-3)]"> → {alias.producto ?? '¿producto?'}</span>
      </div>

      {!editando ? (
        <>
          <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
            {alias.coste_fijo != null ? `fijo ${alias.coste_fijo}` : `÷${alias.factor_unidad}`}
            {' · '}
            <span className="font-bold text-[var(--color-ink)]">
              {alias.coste_resultante != null ? `${alias.coste_resultante.toFixed(3)} €` : '—'}
            </span>
            {alias.gasto_eur != null && ` · ${euros(alias.gasto_eur)}`}
          </span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={borrar}
            disabled={del.isPending}
            className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--coral)] disabled:opacity-50"
            aria-label="Borrar"
          >
            {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={factor}
            onChange={e => setFactor(e.target.value)}
            title="Factor unidad"
            className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <input
            type="text"
            inputMode="decimal"
            value={costeFijo}
            onChange={e => setCosteFijo(e.target.value)}
            placeholder="fijo"
            title="Coste fijo (opcional)"
            className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  )
}

function Cargando() {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-[oklch(72%_.16_25_/_0.35)] bg-[oklch(30%_.12_25_/_0.12)] p-2 text-xs text-[var(--coral)]">
      Error: {msg}
    </div>
  )
}
