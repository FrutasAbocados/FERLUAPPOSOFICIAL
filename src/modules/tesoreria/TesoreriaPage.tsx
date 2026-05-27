import { useState } from 'react'
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { confirm } from '@/shared/lib/confirm'
import { euros } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  useDeleteMovimiento,
  useInsertMovimiento,
  useTesoreriaKpis,
  useTesoreriaLista,
  useUpdateMovimiento,
} from './lib/queries'
import {
  CATEGORIA_LABEL,
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SALIDA,
  type Movimiento,
  type TipoMovimiento,
} from './lib/types'

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  movimiento: Movimiento | null
  defaultTipo?: TipoMovimiento
  onClose: () => void
}

function MovimientoModal({ movimiento, defaultTipo = 'entrada', onClose }: ModalProps) {
  const insert = useInsertMovimiento()
  const update = useUpdateMovimiento()

  const [fecha,     setFecha]     = useState(movimiento?.fecha     ?? format(new Date(), 'yyyy-MM-dd'))
  const [tipo,      setTipo]      = useState<TipoMovimiento>(movimiento?.tipo ?? defaultTipo)
  const [concepto,  setConcepto]  = useState(movimiento?.concepto  ?? '')
  const [importe,   setImporte]   = useState(movimiento ? String(movimiento.importe) : '')
  const [categoria, setCategoria] = useState(movimiento?.categoria ?? '')
  const [notas,     setNotas]     = useState(movimiento?.notas     ?? '')

  const cats = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SALIDA
  const isPending = insert.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const imp = parseFloat(importe.replace(',', '.'))
    if (!concepto.trim() || isNaN(imp) || imp <= 0) return

    const payload = {
      fecha,
      tipo,
      concepto: concepto.trim(),
      importe:  imp,
      categoria: categoria || null,
      notas:    notas.trim() || null,
    }

    if (movimiento) {
      await update.mutateAsync({
        ...payload,
        id:        movimiento.id,
        cierre_id: movimiento.cierre_id,
        fuente:    movimiento.fuente,
      })
    } else {
      await insert.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-2 md:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ao-panel w-full max-w-md mt-10 p-5">
        <h3 className="mb-4 text-base font-semibold text-[var(--ink)]">
          {movimiento ? 'Editar movimiento' : tipo === 'entrada' ? 'Nueva entrada' : 'Nueva salida'}
          {movimiento?.fuente === 'cierre' && (
            <span className="ml-2 text-xs font-normal text-[var(--ink-mute)]">Auto-cierre</span>
          )}
        </h3>

        <form onSubmit={e => { void handleSubmit(e) }} className="grid gap-3">
          {/* Tipo */}
          {!movimiento && (
            <div className="flex gap-2">
              {(['entrada', 'salida'] as TipoMovimiento[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTipo(t); setCategoria('') }}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-sm font-medium capitalize transition-colors',
                    tipo === t
                      ? t === 'entrada'
                        ? 'border-[var(--mint)] bg-[var(--mint)]/15 text-[var(--mint)]'
                        : 'border-[var(--coral)] bg-[var(--coral)]/15 text-[var(--coral)]'
                      : 'border-[var(--border)] text-[var(--ink-mute)]',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Fecha */}
          <div className="grid gap-1">
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
          </div>

          {/* Concepto */}
          <div className="grid gap-1">
            <Label className="text-xs">Concepto</Label>
            <Input
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder={tipo === 'entrada' ? 'Ej: Efectivo ruta Alex' : 'Ej: Gasoil furgo'}
              required
            />
          </div>

          {/* Importe */}
          <div className="grid gap-1">
            <Label className="text-xs">Importe (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={importe}
              onChange={e => setImporte(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>

          {/* Categoría */}
          <div className="grid gap-1">
            <Label className="text-xs">Categoría</Label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--mint)]"
            >
              <option value="">— Sin categoría —</option>
              {cats.map(c => (
                <option key={c} value={c}>{CATEGORIA_LABEL[c] ?? c}</option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div className="grid gap-1">
            <Label className="text-xs">Notas</Label>
            <Input
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Guardando…' : movimiento ? 'Guardar' : 'Añadir'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  const color = tone === 'positive' ? 'var(--mint)' : tone === 'negative' ? 'var(--coral)' : 'var(--ink)'
  return (
    <div className="ao-panel flex flex-col gap-0.5 px-4 py-3">
      <span className="label-caps text-[10px]">{label}</span>
      <span className="tabular-nums text-lg font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function TesoreriaPage() {
  const deleteMov = useDeleteMovimiento()

  const [anchor,  setAnchor]  = useState(new Date())
  const [editing, setEditing] = useState<Movimiento | 'entrada' | 'salida' | null>(null)

  const desde = format(startOfMonth(anchor), 'yyyy-MM-dd')
  const hasta = format(endOfMonth(anchor),   'yyyy-MM-dd')

  const kpis  = useTesoreriaKpis(desde, hasta)
  const lista = useTesoreriaLista(desde, hasta)

  const mesLabel = format(anchor, 'MMMM yyyy', { locale: es })

  async function handleDelete(m: Movimiento) {
    const ok = await confirm({
      title:       'Eliminar movimiento',
      description: `¿Eliminar "${m.concepto}" (${euros(m.importe)})?`,
      variant:     'danger',
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    await deleteMov.mutateAsync(m.id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopbar title="Tesorería" subtitle="Caja física" />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3 md:p-4">

        {/* Navegación mes */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setAnchor(d => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize text-[var(--ink)]">
            {mesLabel}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setAnchor(d => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile
            label="Saldo en caja"
            value={euros(kpis.data?.saldo_total)}
            tone={
              kpis.data == null ? 'neutral'
              : kpis.data.saldo_total >= 0 ? 'positive' : 'negative'
            }
          />
          <Tile label="Entradas mes"   value={euros(kpis.data?.entradas_periodo)} tone="positive" />
          <Tile label="Salidas mes"    value={euros(kpis.data?.salidas_periodo)}  tone="negative" />
          <Tile label="Movimientos"    value={String(kpis.data?.count_periodo ?? '—')} tone="neutral" />
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing('entrada')} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Entrada
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing('salida')} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Salida
          </Button>
        </div>

        {/* Tabla */}
        <div className="ao-panel overflow-hidden">
          {lista.isLoading ? (
            <div className="p-6 text-center text-sm text-[var(--ink-mute)]">Cargando…</div>
          ) : (lista.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--ink-mute)]">
              Sin movimientos en {mesLabel}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]">Fecha</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]">Tipo</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]">Concepto</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]">Categoría</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]">Importe</th>
                    <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-mute)]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(lista.data ?? []).map(m => (
                    <tr key={m.id} className="bg-[var(--panel-2)] hover:bg-[var(--panel-3)] transition-colors">
                      <td className="px-3 py-2 tabular-nums text-[var(--ink-mute)]">
                        {format(parseISO(m.fecha), 'dd/MM')}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          m.tipo === 'entrada'
                            ? 'bg-[var(--mint)]/15 text-[var(--mint)]'
                            : 'bg-[var(--coral)]/15 text-[var(--coral)]',
                        )}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--ink)]">
                        <div className="flex items-center gap-1.5">
                          {m.concepto}
                          {m.fuente === 'cierre' && !m.ajuste && (
                            <span className="rounded bg-[var(--ink-mute)]/20 px-1 py-0.5 text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">Auto</span>
                          )}
                          {m.ajuste && (
                            <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] uppercase tracking-wider text-amber-400">Ajustado</span>
                          )}
                        </div>
                        {m.notas && (
                          <div className="mt-0.5 text-[11px] text-[var(--ink-mute)]">{m.notas}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--ink-mute)]">
                        {m.categoria ? (CATEGORIA_LABEL[m.categoria] ?? m.categoria) : '—'}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right tabular-nums font-medium',
                        m.tipo === 'entrada' ? 'text-[var(--mint)]' : 'text-[var(--coral)]',
                      )}>
                        {m.tipo === 'salida' ? '−' : '+'}{euros(m.importe)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(m)}
                            className="rounded p-1 text-[var(--ink-mute)] hover:text-[var(--ink)] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDelete(m) }}
                            className="rounded p-1 text-[var(--ink-mute)] hover:text-[var(--coral)] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {editing !== null && (
        <MovimientoModal
          key={editing === 'entrada' || editing === 'salida' ? editing : editing.id}
          movimiento={editing === 'entrada' || editing === 'salida' ? null : editing}
          defaultTipo={editing === 'entrada' || editing === 'salida' ? editing : editing.tipo}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
