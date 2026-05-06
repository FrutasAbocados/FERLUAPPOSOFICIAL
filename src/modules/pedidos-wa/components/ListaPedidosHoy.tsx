import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Gift,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_COLOR,
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type ClientePedido,
  type EstadoPedido,
  type LineaPedidoDB,
  type Pedido,
  type Unidad,
} from '../lib/types'
import {
  useActualizarClientePedido,
  useActualizarLineaPedido,
  useActualizarPedido,
  useAgregarLineaPedido,
  useEliminarLineaPedido,
  useEliminarPedido,
  usePedidosDelDia,
} from '../lib/queries'
import { BadgeMetodo } from './BadgeMetodo'

const UNIDADES: Unidad[] = [
  'caja', 'caja_pequena', 'kg', 'saco', 'bolsa',
  'manojo', 'bandeja', 'lecho', 'carton', 'unidad',
]

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
          Hoy aún no hay pedidos. Crea el primero en la pestaña “Captura”.
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

  const onEliminar = async () => {
    const ok = await confirm({
      title: `¿Eliminar el pedido de ${cliente?.nombre ?? 'cliente'}?`,
      description: 'No se puede deshacer.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
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

      {cliente && <NotaClienteEditable cliente={cliente} />}

      {open && (
        <div className="mt-3 space-y-3 border-t border-[var(--color-border)]/40 pt-3">
          <NotasAdminEditable pedido={pedido} fecha={fecha} />

          <LineasEditor pedido={pedido} fecha={fecha} />

          <FaltasEditable pedido={pedido} fecha={fecha} />

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

function NotaClienteEditable({ cliente }: { cliente: ClientePedido }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(cliente.notas ?? '')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const actualizar = useActualizarClientePedido()

  useEffect(() => {
    setValor(cliente.notas ?? '')
  }, [cliente.notas])

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  const guardar = async (nuevo: string | null) => {
    try {
      await actualizar.mutateAsync({ id: cliente.id, patch: { notas: nuevo } })
      setEditando(false)
      toast({
        title: nuevo ? 'Nota guardada' : 'Nota eliminada',
        variant: 'success',
      })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'error',
      })
    }
  }

  const onBlur = () => {
    const limpio = valor.trim()
    if (limpio === (cliente.notas ?? '')) {
      setEditando(false)
      return
    }
    guardar(limpio || null)
  }

  if (editando) {
    return (
      <div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <textarea
          ref={inputRef}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setValor(cliente.notas ?? ''); setEditando(false) }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onBlur() }
          }}
          rows={1}
          placeholder="Escribe una nota (vaciar = eliminar)"
          className="min-w-0 flex-1 resize-none border-0 bg-transparent text-xs text-red-700 placeholder:text-red-400 focus:outline-none focus:ring-0"
        />
        {actualizar.isPending && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />}
      </div>
    )
  }

  if (!cliente.notas) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
      >
        <Pencil className="h-3 w-3" /> Añadir nota
      </button>
    )
  }

  return (
    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="text-left underline-offset-2 hover:underline"
        title="Editar nota (afecta a todos los pedidos del cliente)"
      >
        {cliente.notas}
      </button>
      <button
        type="button"
        onClick={() => guardar(null)}
        disabled={actualizar.isPending}
        className="rounded p-0.5 hover:bg-red-100 disabled:opacity-50"
        title="Eliminar nota"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ===== Notas admin (amarillo) inline-editable =====
function NotasAdminEditable({ pedido, fecha }: { pedido: Pedido; fecha: string }) {
  const actualizar = useActualizarPedido()
  return (
    <CampoTextoEditable
      label="Notas del día"
      valor={pedido.notas_admin}
      tonoBg="bg-amber-50"
      tonoText="text-amber-800"
      placeholderEmpty="Añadir notas del día"
      pending={actualizar.isPending}
      onSave={(nuevo) => actualizar.mutateAsync({
        id: pedido.id, fecha, patch: { notas_admin: nuevo },
      })}
    />
  )
}

// ===== Faltas inline-editable =====
function FaltasEditable({ pedido, fecha }: { pedido: Pedido; fecha: string }) {
  const actualizar = useActualizarPedido()
  return (
    <CampoTextoEditable
      label="Faltas"
      valor={pedido.faltas}
      tonoBg="bg-rose-50"
      tonoText="text-rose-700"
      placeholderEmpty="Añadir faltas (lo que no se ha entregado)"
      pending={actualizar.isPending}
      onSave={(nuevo) => actualizar.mutateAsync({
        id: pedido.id, fecha, patch: { faltas: nuevo },
      })}
    />
  )
}

function CampoTextoEditable({
  label, valor, tonoBg, tonoText, placeholderEmpty, onSave, pending,
}: {
  label: string
  valor: string | null
  tonoBg: string
  tonoText: string
  placeholderEmpty: string
  onSave: (nuevo: string | null) => Promise<unknown>
  pending: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(valor ?? '')
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { setV(valor ?? '') }, [valor])
  useEffect(() => { if (editando) ref.current?.focus() }, [editando])

  const guardar = async (nuevo: string | null) => {
    try {
      await onSave(nuevo)
      setEditando(false)
      toast({ title: nuevo ? `${label} guardadas` : `${label} eliminadas`, variant: 'success' })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'error',
      })
    }
  }

  if (editando) {
    return (
      <div className={cn('rounded-md p-2 text-xs', tonoBg, tonoText)}>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
        <textarea
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const limpio = v.trim()
            if (limpio === (valor ?? '')) { setEditando(false); return }
            guardar(limpio || null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setV(valor ?? ''); setEditando(false) }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              const limpio = v.trim()
              guardar(limpio || null)
            }
          }}
          rows={2}
          className="block w-full resize-none rounded border-0 bg-transparent text-xs focus:outline-none focus:ring-0"
        />
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
    )
  }

  if (!valor) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
      >
        <Pencil className="h-3 w-3" /> {placeholderEmpty}
      </button>
    )
  }

  return (
    <div className={cn('group/cte flex items-start gap-2 rounded-md p-2 text-xs', tonoBg, tonoText)}>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="min-w-0 flex-1 text-left"
        title={`Editar ${label.toLowerCase()}`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
        <div className="whitespace-pre-wrap">{valor}</div>
      </button>
      <button
        type="button"
        onClick={() => guardar(null)}
        disabled={pending}
        className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-white/40 group-hover/cte:opacity-100 disabled:opacity-50"
        title={`Borrar ${label.toLowerCase()}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ===== Líneas editables + añadir nueva =====
function LineasEditor({ pedido, fecha }: { pedido: Pedido; fecha: string }) {
  const lineas = pedido.lineas ?? []
  const [agregando, setAgregando] = useState(false)
  const agregar = useAgregarLineaPedido()

  return (
    <div className="space-y-1">
      {lineas.length === 0 && !agregando && (
        <p className="text-xs text-[var(--color-ink-3)]">Sin líneas.</p>
      )}
      {lineas.length > 0 && (
        <ul className="space-y-1 text-sm">
          {lineas.map(l => (
            <LineaRow key={l.id} linea={l} fecha={fecha} />
          ))}
        </ul>
      )}

      {agregando ? (
        <NuevaLineaForm
          onCancel={() => setAgregando(false)}
          onSave={async (nueva) => {
            await agregar.mutateAsync({
              pedido_id: pedido.id,
              fecha,
              linea: nueva,
            })
            setAgregando(false)
            toast({ title: 'Línea añadida', variant: 'success' })
          }}
          pending={agregar.isPending}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
        >
          <Plus className="h-3 w-3" /> Añadir línea
        </button>
      )}
    </div>
  )
}

function LineaRow({ linea, fecha }: { linea: LineaPedidoDB; fecha: string }) {
  const [editando, setEditando] = useState(false)
  const actualizar = useActualizarLineaPedido()
  const eliminar = useEliminarLineaPedido()

  const onEliminar = async () => {
    const ok = await confirm({
      title: '¿Eliminar línea?',
      description: `${formatN(Number(linea.cantidad))} ${UNIDAD_LABEL[linea.unidad]} ${linea.producto_normalizado}`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    eliminar.mutate(
      { id: linea.id, fecha },
      {
        onSuccess: () => toast({ title: 'Línea eliminada', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  if (editando) {
    return (
      <li>
        <LineaForm
          inicial={{
            cantidad:             Number(linea.cantidad),
            unidad:               linea.unidad,
            producto_normalizado: linea.producto_normalizado,
            subseccion:           linea.subseccion,
            notas:                linea.notas,
            es_gratis:            linea.es_gratis,
          }}
          onCancel={() => setEditando(false)}
          onSave={async (patch) => {
            await actualizar.mutateAsync({ id: linea.id, fecha, patch })
            setEditando(false)
            toast({ title: 'Línea actualizada', variant: 'success' })
          }}
          pending={actualizar.isPending}
        />
      </li>
    )
  }

  return (
    <li className="group/lin flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-[var(--color-surface-2)]"
        title="Editar línea"
      >
        <span className="font-medium tabular-nums text-[var(--color-ink)]">
          {formatN(Number(linea.cantidad))} {UNIDAD_LABEL[linea.unidad]}
        </span>
        <span className="text-[var(--color-ink-2)]">{linea.producto_normalizado}</span>
        {linea.subseccion && (
          <span className="text-xs text-[var(--color-ink-3)]">— {linea.subseccion}</span>
        )}
        {linea.notas && (
          <span className="text-xs italic text-[var(--color-ink-3)]">{linea.notas}</span>
        )}
        {linea.es_gratis && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Gift className="h-3 w-3" /> GRATIS
          </span>
        )}
        <BadgeMetodo metodo={linea.metodo} />
      </button>
      <button
        type="button"
        onClick={onEliminar}
        disabled={eliminar.isPending}
        className="rounded p-0.5 text-[var(--color-ink-3)] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 disabled:opacity-50 group-hover/lin:opacity-100"
        title="Eliminar línea"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

type LineaFormValue = {
  cantidad: number
  unidad: Unidad
  producto_normalizado: string
  subseccion: string | null
  notas: string | null
  es_gratis: boolean
}

function LineaForm({
  inicial, onCancel, onSave, pending,
}: {
  inicial: LineaFormValue
  onCancel: () => void
  onSave: (v: LineaFormValue) => Promise<void>
  pending: boolean
}) {
  const [v, setV] = useState<LineaFormValue>(inicial)

  const save = async () => {
    if (!v.producto_normalizado.trim()) {
      toast({ title: 'Producto vacío', variant: 'error' })
      return
    }
    if (v.cantidad <= 0) {
      toast({ title: 'Cantidad debe ser > 0', variant: 'error' })
      return
    }
    try {
      await onSave({
        ...v,
        producto_normalizado: v.producto_normalizado.trim(),
        notas: v.notas?.trim() || null,
        subseccion: v.subseccion?.trim() || null,
      })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'error',
      })
    }
  }

  return (
    <div className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 p-2">
      <div className="grid grid-cols-12 gap-1.5">
        <input
          type="number"
          step="0.01"
          min="0"
          value={v.cantidad}
          onChange={(e) => setV({ ...v, cantidad: Number(e.target.value) })}
          className="col-span-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="0"
        />
        <select
          value={v.unidad}
          onChange={(e) => setV({ ...v, unidad: e.target.value as Unidad })}
          className="col-span-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        >
          {UNIDADES.map(u => <option key={u} value={u}>{UNIDAD_LABEL[u]}</option>)}
        </select>
        <input
          type="text"
          value={v.producto_normalizado}
          onChange={(e) => setV({ ...v, producto_normalizado: e.target.value })}
          className="col-span-6 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="Producto"
        />
        <input
          type="text"
          value={v.notas ?? ''}
          onChange={(e) => setV({ ...v, notas: e.target.value || null })}
          className="col-span-8 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="Notas (opcional)"
        />
        <input
          type="text"
          value={v.subseccion ?? ''}
          onChange={(e) => setV({ ...v, subseccion: e.target.value || null })}
          className="col-span-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="Sub-sección"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-2)]">
          <input
            type="checkbox"
            checked={v.es_gratis}
            onChange={(e) => setV({ ...v, es_gratis: e.target.checked })}
            className="h-3 w-3"
          />
          <Gift className="h-3 w-3" />
          Gratis
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function NuevaLineaForm({
  onCancel, onSave, pending,
}: {
  onCancel: () => void
  onSave: (v: LineaFormValue) => Promise<void>
  pending: boolean
}) {
  return (
    <LineaForm
      inicial={{
        cantidad: 1,
        unidad: 'caja',
        producto_normalizado: '',
        subseccion: null,
        notas: null,
        es_gratis: false,
      }}
      onCancel={onCancel}
      onSave={onSave}
      pending={pending}
    />
  )
}
