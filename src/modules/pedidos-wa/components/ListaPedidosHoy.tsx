import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Gift,
  Loader2,
  Package,
  Trash2,
  Truck,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_COLOR,
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type EstadoPedido,
  type Pedido,
} from '../lib/types'
import {
  useActualizarPedido,
  useEliminarPedido,
  usePedidosDelDia,
} from '../lib/queries'
import { BadgeMetodo } from './BadgeMetodo'

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente:  'Pendiente',
  preparado:  'Preparado',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
}

const ESTADO_STYLE: Record<EstadoPedido, string> = {
  pendiente:  'bg-amber-50 text-amber-700 border-amber-200',
  preparado:  'bg-sky-50 text-sky-700 border-sky-200',
  entregado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelado:  'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pendiente: 'preparado',
  preparado: 'entregado',
}

export function ListaPedidosHoy() {
  const fecha = format(new Date(), 'yyyy-MM-dd')
  const { data: pedidos, isLoading, error } = usePedidosDelDia(fecha)

  const titulo = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pedidos…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error cargando pedidos: {(error as Error).message}
      </div>
    )
  }

  const lista = pedidos ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] capitalize">
          {titulo}
        </h2>
        <span className="text-xs text-[var(--color-ink-3)]">
          {lista.length} {lista.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          Hoy aún no hay pedidos. Crea el primero en la pestaña “Nuevo pedido”.
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map(p => <PedidoCard key={p.id} pedido={p} />)}
        </ul>
      )}
    </div>
  )
}

function PedidoCard({ pedido }: { pedido: Pedido }) {
  const [open, setOpen] = useState(false)
  const cliente = pedido.cliente
  const lineas = useMemo(() => pedido.lineas ?? [], [pedido.lineas])
  const fecha = pedido.fecha

  const actualizar = useActualizarPedido()
  const eliminar = useEliminarPedido()

  const repColor = cliente
    ? REPARTIDOR_COLOR[cliente.repartidor]
    : 'bg-zinc-50 border-zinc-200'

  const cantidades = useMemo(() => {
    const totals = new Map<string, number>()
    for (const l of lineas) {
      const key = UNIDAD_LABEL[l.unidad] ?? l.unidad
      totals.set(key, (totals.get(key) ?? 0) + Number(l.cantidad))
    }
    return [...totals.entries()].map(([u, n]) => `${formatN(n)} ${u}`).join(' · ')
  }, [lineas])

  const siguiente = SIGUIENTE_ESTADO[pedido.estado]

  const onAvanzar = () => {
    if (!siguiente) return
    actualizar.mutate(
      { id: pedido.id, fecha, patch: { estado: siguiente } },
      {
        onSuccess: () => toast({ title: `Marcado como ${ESTADO_LABEL[siguiente]}`, variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const onEliminar = () => {
    if (!confirm(`Eliminar el pedido de ${cliente?.nombre ?? 'cliente'}?`)) return
    eliminar.mutate(
      { id: pedido.id, fecha },
      {
        onSuccess: () => toast({ title: 'Pedido eliminado', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <li className={cn('rounded-[var(--radius-lg)] border p-3', repColor)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen(o => !o)}
        >
          {open
            ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate">
              <span className="truncate font-semibold text-[var(--color-ink)]">
                {cliente?.nombre ?? '—'}
              </span>
              {cliente?.subseccion_default && (
                <span className="text-xs text-[var(--color-ink-3)]">
                  ({cliente.subseccion_default})
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink-2)]">
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {cliente ? REPARTIDOR_LABEL[cliente.repartidor] : '—'}
              </span>
              {cliente?.horario && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {cliente.horario}
                </span>
              )}
              {lineas.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3" /> {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
                </span>
              )}
              {cantidades && (
                <span className="text-[var(--color-ink-3)]">{cantidades}</span>
              )}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            ESTADO_STYLE[pedido.estado],
          )}>
            {ESTADO_LABEL[pedido.estado]}
          </span>
          {siguiente && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onAvanzar}
              disabled={actualizar.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {ESTADO_LABEL[siguiente]}
            </Button>
          )}
          <button
            type="button"
            onClick={onEliminar}
            disabled={eliminar.isPending}
            className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Eliminar pedido"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {cliente?.notas && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {cliente.notas}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--color-border)]/40 pt-3">
          {pedido.notas_admin && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Notas del día:</strong> {pedido.notas_admin}
            </div>
          )}

          {lineas.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-3)]">Sin líneas.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {lineas.map(l => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--color-ink)]">
                    {formatN(Number(l.cantidad))} {UNIDAD_LABEL[l.unidad]}
                  </span>
                  <span className="text-[var(--color-ink-2)]">{l.producto_normalizado}</span>
                  {l.subseccion && (
                    <span className="text-xs text-[var(--color-ink-3)]">— {l.subseccion}</span>
                  )}
                  {l.notas && (
                    <span className="text-xs italic text-[var(--color-ink-3)]">{l.notas}</span>
                  )}
                  {l.es_gratis && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <Gift className="h-3 w-3" /> GRATIS
                    </span>
                  )}
                  <BadgeMetodo metodo={l.metodo} />
                </li>
              ))}
            </ul>
          )}

          {pedido.faltas && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <strong>Faltas:</strong> {pedido.faltas}
            </div>
          )}

          <details className="text-xs text-[var(--color-ink-3)]">
            <summary className="cursor-pointer hover:text-[var(--color-ink-2)]">
              Mensaje original de WhatsApp
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] p-2 font-mono text-[11px] text-[var(--color-ink-2)]">
              {pedido.texto_original}
            </pre>
          </details>
        </div>
      )}
    </li>
  )
}

function formatN(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
