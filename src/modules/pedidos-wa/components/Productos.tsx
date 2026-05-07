import { useMemo, useState } from 'react'
import { Check, Loader2, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import {
  useBuscarProductosHolded,
  useDeleteProductoHolded,
  useProductosWa,
  useUpsertProductoHolded,
  type ProductoWaConMapeo,
} from '../lib/queries'

type Filtro = 'todos' | 'sin_mapear' | 'mapeados'

export function Productos() {
  const { data, isLoading } = useProductosWa()
  const [filtro, setFiltro] = useState<Filtro>('sin_mapear')
  const [q, setQ] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const lista = useMemo(() => {
    const base = data ?? []
    let filtrada = base
    if (filtro === 'sin_mapear') filtrada = base.filter(p => !p.holded_product_id)
    if (filtro === 'mapeados')   filtrada = base.filter(p => p.holded_product_id)
    if (q.trim()) {
      const ql = q.trim().toLowerCase()
      filtrada = filtrada.filter(p => p.producto_normalizado.includes(ql))
    }
    return filtrada
  }, [data, filtro, q])

  const conteo = useMemo(() => ({
    total:      data?.length ?? 0,
    mapeados:   (data ?? []).filter(p => p.holded_product_id).length,
    sin_mapear: (data ?? []).filter(p => !p.holded_product_id).length,
  }), [data])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Vinculación productos Holded</h2>
          <p className="text-xs text-[var(--color-ink-3)]">
            {conteo.mapeados} de {conteo.total} mapeados · {conteo.sin_mapear} sin vincular
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
            <FiltroBtn active={filtro === 'sin_mapear'} onClick={() => setFiltro('sin_mapear')}>
              Sin vincular ({conteo.sin_mapear})
            </FiltroBtn>
            <FiltroBtn active={filtro === 'mapeados'} onClick={() => setFiltro('mapeados')}>
              Mapeados ({conteo.mapeados})
            </FiltroBtn>
            <FiltroBtn active={filtro === 'todos'} onClick={() => setFiltro('todos')}>
              Todos
            </FiltroBtn>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-ink-3)]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar…"
              className="h-9 w-[180px] pl-8"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <ul>
          {lista.length === 0 && (
            <li className="p-6 text-center text-sm text-[var(--color-ink-3)]">
              {filtro === 'sin_mapear' ? '¡Todos los productos están vinculados!' : 'No hay productos.'}
            </li>
          )}
          {lista.map(p => (
            <FilaProducto
              key={p.producto_normalizado}
              producto={p}
              editando={editandoId === p.producto_normalizado}
              onEditar={() => setEditandoId(p.producto_normalizado)}
              onCerrar={() => setEditandoId(null)}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

function FiltroBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
          : 'text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {children}
    </button>
  )
}

function FilaProducto({
  producto, editando, onEditar, onCerrar,
}: {
  producto: ProductoWaConMapeo
  editando: boolean
  onEditar: () => void
  onCerrar: () => void
}) {
  const upsert = useUpsertProductoHolded()
  const del = useDeleteProductoHolded()
  const [busqueda, setBusqueda] = useState(producto.primer_uso)
  const { data: candidatos, isFetching } = useBuscarProductosHolded(editando ? busqueda : '')

  const desvincular = async () => {
    del.mutate(producto.producto_normalizado, {
      onSuccess: () => toast({ title: 'Desvinculado', variant: 'success' }),
      onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
    })
  }

  const elegir = (id: string, nombre: string) => {
    upsert.mutate(
      { producto_normalizado: producto.producto_normalizado, holded_product_id: id, holded_product_name: nombre },
      {
        onSuccess: () => {
          toast({ title: 'Vinculado', description: nombre, variant: 'success' })
          onCerrar()
        },
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <li className="border-b border-[var(--color-border)] last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-[180px] flex-1">
          <div className="font-medium text-[var(--color-ink)]">{producto.primer_uso}</div>
          <div className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
            usado {producto.veces_usado} {producto.veces_usado === 1 ? 'vez' : 'veces'}
          </div>
        </div>
        <div className="min-w-[200px] flex-1">
          {producto.holded_product_id ? (
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                producto.source === 'auto_match'
                  ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
              )}>
                <Check className="h-3 w-3" />
                {producto.source === 'auto_match' ? 'auto' : 'manual'}
              </span>
              <span className="text-sm text-[var(--color-ink)]">{producto.holded_product_name}</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
              <X className="h-3 w-3" /> sin vincular
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!editando && (
            <Button size="sm" variant="outline" onClick={onEditar}>
              {producto.holded_product_id ? 'Cambiar' : 'Vincular'}
            </Button>
          )}
          {producto.holded_product_id && !editando && (
            <Button
              size="sm"
              variant="ghost"
              onClick={desvincular}
              disabled={del.isPending}
              title="Desvincular"
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {editando && (
            <Button size="sm" variant="ghost" onClick={onCerrar}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {editando && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2,#f8fafc)] px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-ink-3)]" />
            <Input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto en Holded…"
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            {isFetching && (
              <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-ink-3)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
              </div>
            )}
            {!isFetching && (candidatos ?? []).length === 0 && busqueda.trim().length >= 1 && (
              <div className="p-3 text-xs text-[var(--color-ink-3)]">Sin resultados.</div>
            )}
            {!isFetching && (candidatos ?? []).map(c => (
              <button
                key={c.product_id}
                type="button"
                onClick={() => elegir(c.product_id, c.nombre)}
                disabled={upsert.isPending}
                className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--color-surface-2,#f8fafc)] disabled:opacity-50"
              >
                <span className="text-[var(--color-ink)]">{c.nombre}</span>
                <span className="text-[10px] text-[var(--color-ink-3)]">{c.veces_visto}× visto</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}
