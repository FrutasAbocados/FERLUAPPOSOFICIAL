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
  CloudUpload,
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
  useConfirmarPedido,
  useEliminarLineaPedido,
  useEliminarPedido,
  useHoldedLastLogs,
  usePedidosDelDia,
  useReemitirBorrador,
  useSubirPedidoAHolded,
  type HoldedLastLog,
  type SubirPedidoDryRun,
} from '../lib/queries'
import { euros } from '@/shared/lib/format'
import { BadgeMetodo } from './BadgeMetodo'

const UNIDADES: Unidad[] = [
  'caja', 'caja_pequena', 'kg', 'saco', 'bolsa',
  'manojo', 'bandeja', 'lecho', 'carton', 'unidad',
]

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  preparado:  'Preparado',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
}

const ESTADO_STYLE: Record<EstadoPedido, string> = {
  pendiente:  'bg-amber-50 text-amber-700 border-amber-200',
  confirmado: 'bg-violet-50 text-violet-700 border-violet-200',
  preparado:  'bg-sky-50 text-sky-700 border-sky-200',
  entregado:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelado:  'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pendiente:  'confirmado',
  confirmado: 'preparado',
  preparado:  'entregado',
}

export function ListaPedidosHoy() {
  const fecha = format(new Date(), 'yyyy-MM-dd')
  const { data: pedidos, isLoading, error } = usePedidosDelDia(fecha)
  const confirmar = useConfirmarPedido()
  const [confirmandoTodos, setConfirmandoTodos] = useState(false)

  const titulo = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const lista = pedidos ?? []
  const idsList = useMemo(() => lista.map(p => p.id), [lista])
  const { data: logsMap } = useHoldedLastLogs(fecha, idsList)

  const confirmables = useMemo(
    () => lista.filter(p =>
      p.estado === 'pendiente'
      && !p.holded_invoice_id
      && p.cliente?.tipo_factura === 'HOLDED'
      && !!p.cliente?.holded_contact_id
      && !!p.cliente?.holded_doc_type,
    ),
    [lista],
  )

  const onConfirmarTodos = async () => {
    if (confirmables.length === 0) return
    const ok = await confirm({
      title: `¿Confirmar ${confirmables.length} pedido${confirmables.length === 1 ? '' : 's'}?`,
      description: 'Se creará un borrador en Holded por cada uno. Los chicos editarán pesos y precios antes de emitir.',
      confirmLabel: 'Confirmar todos',
    })
    if (!ok) return
    setConfirmandoTodos(true)
    let okCount = 0, errCount = 0
    for (const p of confirmables) {
      try {
        await confirmar.mutateAsync({ id: p.id, fecha })
        okCount++
      } catch {
        errCount++
      }
    }
    setConfirmandoTodos(false)
    toast({
      title: `${okCount} confirmado${okCount === 1 ? '' : 's'}`,
      description: errCount > 0 ? `${errCount} fallaron — revisa la app` : 'Generando borradores en Holded…',
      variant: errCount > 0 ? 'error' : 'success',
    })
  }

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-ink)] capitalize">
          {titulo}
        </h2>
        <div className="flex items-center gap-2">
          {confirmables.length > 0 && (
            <Button
              size="sm"
              onClick={onConfirmarTodos}
              disabled={confirmandoTodos}
            >
              {confirmandoTodos ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmando {confirmables.length}…</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Confirmar {confirmables.length} pendiente{confirmables.length === 1 ? '' : 's'}</>
              )}
            </Button>
          )}
          <span className="text-xs text-[var(--color-ink-3)]">
            {lista.length} {lista.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          Hoy aún no hay pedidos. Crea el primero en la pestaña “Captura”.
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map(p => <PedidoCard key={p.id} pedido={p} log={logsMap?.get(p.id) ?? null} />)}
        </ul>
      )}
    </div>
  )
}

function PedidoCard({ pedido, log }: { pedido: Pedido; log: HoldedLastLog | null }) {
  const [open, setOpen] = useState(false)
  const [modalHolded, setModalHolded] = useState<{
    preview: SubirPedidoDryRun | null
    cargando: boolean
    error: string | null
  } | null>(null)
  const cliente = pedido.cliente
  const lineas = useMemo(() => pedido.lineas ?? [], [pedido.lineas])
  const fecha = pedido.fecha

  const actualizar = useActualizarPedido()
  const confirmar = useConfirmarPedido()
  const eliminar = useEliminarPedido()
  const subirHolded = useSubirPedidoAHolded()
  const reemitir = useReemitirBorrador()

  const subirInfo = bloqueoSubir(pedido)
  const yaSubido  = !!pedido.holded_invoice_id
  const noEsHolded = pedido.cliente?.tipo_factura !== undefined && pedido.cliente.tipo_factura !== 'HOLDED'
  const holdedFallo = !yaSubido && log?.ok === false

  const abrirModalHolded = async () => {
    setModalHolded({ preview: null, cargando: true, error: null })
    try {
      const res = await subirHolded.mutateAsync({ pedido_id: pedido.id, fecha, dry_run: true })
      if (!('dry_run' in res)) throw new Error('respuesta inesperada (no dry_run)')
      setModalHolded({ preview: res, cargando: false, error: null })
    } catch (e) {
      setModalHolded({ preview: null, cargando: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const subirDefinitivoHolded = async () => {
    try {
      const res = await subirHolded.mutateAsync({ pedido_id: pedido.id, fecha, dry_run: false })
      if ('holded_invoice_id' in res) {
        toast({
          title: 'Subido a Holded',
          description: res.holded_invoice_num
            ? `${cliente?.nombre ?? '—'} → ${res.holded_invoice_num}`
            : (cliente?.nombre ?? '—'),
        })
      }
      setModalHolded(null)
    } catch (e) {
      toast({
        title: 'Holded rechazó la subida',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      })
    }
  }

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

  const onAvanzar = async () => {
    if (!siguiente) return
    if (siguiente === 'confirmado') {
      // Pre-check: si hay líneas sin precio histórico, avisar antes
      try {
        const dr = await subirHolded.mutateAsync({ pedido_id: pedido.id, fecha, dry_run: true })
        if ('dry_run' in dr) {
          const sinPrecio = dr.summary.no_resueltas
          const total = dr.summary.total_lineas
          if (sinPrecio > 0) {
            const ok = await confirm({
              title: `${sinPrecio} de ${total} líneas sin precio histórico`,
              description: `Saldrán a 0€ en el borrador de Holded. Los chicos las editarán antes de emitir. ¿Confirmar igualmente?`,
              confirmLabel: 'Confirmar',
            })
            if (!ok) return
          }
        }
      } catch {
        // Si dry_run falla por validación cliente, dejamos que el confirm dispare igual y vea el error en logs
      }
      confirmar.mutate(
        { id: pedido.id, fecha },
        {
          onSuccess: () => toast({
            title: 'Confirmado',
            description: 'Generando borrador en Holded…',
            variant: 'success',
          }),
          onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
        },
      )
      return
    }
    actualizar.mutate(
      { id: pedido.id, fecha, patch: { estado: siguiente } },
      {
        onSuccess: () => toast({ title: `Marcado como ${ESTADO_LABEL[siguiente]}`, variant: 'success' }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const onReemitir = async () => {
    const ok = await confirm({
      title: '¿Re-emitir borrador?',
      description: `Borrará el doc Holded ${pedido.holded_invoice_num ?? ''} y dejará el pedido pendiente. Si Holded ya lo emitió no se podrá borrar desde aquí.`,
      confirmLabel: 'Re-emitir',
      variant: 'danger',
    })
    if (!ok) return
    reemitir.mutate(
      { pedido_id: pedido.id, fecha },
      {
        onSuccess: () => toast({ title: 'Borrador eliminado', description: 'Vuelve a "pendiente". Confírmalo de nuevo.', variant: 'success' }),
        onError: (e: Error) => toast({ title: 'No se pudo borrar', description: e.message, variant: 'error' }),
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
              disabled={actualizar.isPending || confirmar.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {ESTADO_LABEL[siguiente]}
            </Button>
          )}
          {yaSubido ? (
            <button
              type="button"
              onClick={onReemitir}
              disabled={reemitir.isPending}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              title={`Holded ${pedido.holded_invoice_id ?? ''}\nClic para re-emitir borrador (borra y vuelve a pendiente)`}
            >
              <CheckCircle2 className="h-3 w-3" />
              Holded {pedido.holded_invoice_num ?? '✓'}
            </button>
          ) : noEsHolded ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600"
              title={`tipo_factura=${pedido.cliente?.tipo_factura} — no se sube a Holded`}
            >
              {pedido.cliente?.tipo_factura ?? '—'}
            </span>
          ) : holdedFallo ? (
            <button
              type="button"
              onClick={abrirModalHolded}
              title={`Holded ${log?.status ?? ''}: ${log?.error_msg ?? 'error desconocido'}\n\nClic para reintentar`}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100"
              aria-label="Holded falló, reintentar"
            >
              ⚠ Holded {log?.status ?? '—'}
            </button>
          ) : (
            <button
              type="button"
              onClick={abrirModalHolded}
              disabled={!subirInfo.ok}
              title={subirInfo.ok ? 'Subir a Holded' : subirInfo.motivo}
              className={cn(
                'rounded-md p-1.5 disabled:cursor-not-allowed disabled:opacity-40',
                subirInfo.ok
                  ? 'text-emerald-700 hover:bg-emerald-50'
                  : 'text-[var(--color-ink-3)]',
              )}
              aria-label="Subir a Holded"
            >
              <CloudUpload className="h-4 w-4" />
            </button>
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

      {modalHolded && cliente && (
        <ModalSubirPedidoHolded
          pedido={pedido}
          cliente={cliente}
          preview={modalHolded.preview}
          cargando={modalHolded.cargando}
          error={modalHolded.error}
          subiendo={subirHolded.isPending}
          onCancelar={() => setModalHolded(null)}
          onConfirmar={subirDefinitivoHolded}
        />
      )}
    </li>
  )
}

function bloqueoSubir(pedido: Pedido): { ok: true } | { ok: false; motivo: string } {
  const c = pedido.cliente
  if (!c) return { ok: false, motivo: 'pedido sin cliente' }
  if (c.tipo_factura !== 'HOLDED') return { ok: false, motivo: `cliente factura por ${c.tipo_factura}, no Holded` }
  if (!c.holded_contact_id)        return { ok: false, motivo: 'vincula el cliente con un contacto Holded primero' }
  if (!c.holded_doc_type)          return { ok: false, motivo: 'elige factura o albarán en la ficha del cliente' }
  if ((pedido.lineas ?? []).length === 0) return { ok: false, motivo: 'pedido sin líneas' }
  return { ok: true }
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

// ─── Modal "Subir pedido a Holded" ───────────────────────────────────────────

function ModalSubirPedidoHolded({
  pedido,
  cliente,
  preview,
  cargando,
  error,
  subiendo,
  onCancelar,
  onConfirmar,
}: {
  pedido: Pedido
  cliente: ClientePedido
  preview: SubirPedidoDryRun | null
  cargando: boolean
  error: string | null
  subiendo: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const items = (preview?.body?.items ?? []) as Array<{
    name: string; desc?: string; units: number; price: number; tax: number
  }>
  const subtotal = items.reduce((s, it) => s + it.units * it.price, 0)
  const docTypeLabel = preview?.doc_type === 'waybill' ? 'Albarán' : 'Factura'
  const noResueltas = preview?.summary.no_resueltas ?? 0
  const lineasResueltas = preview?.lineas_resueltas ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar() }}
    >
      <div className="w-full max-w-3xl rounded-[var(--radius-md)] bg-[var(--color-surface)] shadow-lg">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-ink-2)]">
              <CloudUpload className="h-3.5 w-3.5" /> Subir a Holded · {docTypeLabel.toLowerCase()} en borrador
            </div>
            <div className="mt-1 truncate font-display text-base font-semibold">{cliente.nombre}</div>
            <div className="text-xs text-[var(--color-ink-2)]">
              {pedido.fecha} · {pedido.lineas?.length ?? 0} líneas
              {preview && (
                <> · resueltas {preview.summary.resueltas}/{preview.summary.total_lineas}</>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancelar} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Resolviendo precios desde manager_lineas…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">No se pudo construir el body</div>
                <div className="mt-0.5 break-all">{error}</div>
              </div>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
                <Kv k="contactId"   v={String(preview.body.contactId ?? '—')} />
                <Kv k="doc_type"    v={String(preview.doc_type)} />
                <Kv k="desc"        v={String(preview.body.desc ?? '—')} />
                <Kv k="date (unix)" v={String(preview.body.date ?? '—')} />
                {preview.body.notes ? (
                  <Kv k="notes" v={String(preview.body.notes).slice(0, 200)} className="col-span-2" />
                ) : null}
              </div>

              {noResueltas > 0 && (
                <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">{noResueltas} línea(s) sin precio histórico</div>
                    <div className="mt-0.5">
                      No se pueden subir hasta que todas las líneas tengan precio. Edita las líneas en el pedido o añade un precio histórico al cliente en Manager.
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-ink-2)]">
                    <tr>
                      <th className="px-2 py-1.5">producto</th>
                      <th className="w-20 px-2 py-1.5 text-right">units</th>
                      <th className="w-24 px-2 py-1.5 text-right">price</th>
                      <th className="w-12 px-2 py-1.5 text-right">tax</th>
                      <th className="w-24 px-2 py-1.5 text-right">subt.</th>
                      <th className="px-2 py-1.5">fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasResueltas.map((l) => (
                      <tr key={l.linea_id} className={cn(
                        'border-t border-[var(--color-border)]',
                        l.precio_fuente === 'no_resuelto' && 'bg-rose-50',
                        l.es_gratis && 'opacity-60',
                      )}>
                        <td className="px-2 py-1">
                          {l.producto_normalizado}
                          <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">
                            ({Number(l.cantidad)} {l.unidad})
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right">{Number(l.cantidad)}</td>
                        <td className="px-2 py-1 text-right">
                          {l.precio_resuelto != null ? Number(l.precio_resuelto).toFixed(4) : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">{Number(l.iva_pct)}%</td>
                        <td className="px-2 py-1 text-right">{euros(Number(l.total_estimado))}</td>
                        <td className="px-2 py-1 text-[10px] text-[var(--color-ink-3)]">
                          {l.precio_fuente === 'historico_cliente' && l.precio_fecha ? (
                            <>hist · {l.precio_fecha}</>
                          ) : l.precio_fuente === 'gratis' ? (
                            'gratis'
                          ) : (
                            <span className="text-rose-600 font-semibold">sin precio</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <td colSpan={4} className="px-2 py-1.5 text-right text-[var(--color-ink-2)]">
                        Subtotal sin IVA
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">{euros(subtotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <details className="rounded border border-[var(--color-border)] text-xs">
                <summary className="cursor-pointer select-none px-3 py-2 text-[var(--color-ink-2)]">
                  Ver JSON completo enviado a Holded
                </summary>
                <pre className="overflow-x-auto bg-[var(--color-surface-2)] p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(preview.body, null, 2)}
                </pre>
                <div className="border-t border-[var(--color-border)] px-3 py-1.5 text-[var(--color-ink-2)]">
                  POST → {preview.holded_endpoint}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="text-xs text-[var(--color-ink-2)]">
            Esto creará un {docTypeLabel.toLowerCase()} en Holded para {cliente.nombre}.
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancelar} disabled={subiendo}>
              Cancelar
            </Button>
            <Button onClick={onConfirmar} disabled={!preview || subiendo || noResueltas > 0}>
              {subiendo ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Subiendo…</>
              ) : (
                <><CloudUpload className="mr-1.5 h-4 w-4" /> Subir definitivamente</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kv({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-2)]">{k}</div>
      <div className="break-all font-mono text-xs">{v}</div>
    </div>
  )
}
