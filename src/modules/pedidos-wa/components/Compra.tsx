import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { cn, getBusinessDate } from '@/shared/lib/utils'
import { exportarCompra } from '../lib/exportacion/excel'
import { UnificacionProductos } from './UnificacionProductos'
import { parsearPedido } from '../lib/parser'
import {
  useCotejoDelDia,
  useEliminarFactorKgCaja,
  useEliminarInventario,
  useFactoresKgCaja,
  useGuardarInventario,
  useInventarioDelDia,
  usePedidosDelDia,
  useUpsertFactorKgCaja,
  type CotejoFila,
  type KgPorCajaRow,
} from '../lib/queries'

export function Compra() {
  const fechaIso = format(getBusinessDate(), 'yyyy-MM-dd')
  const titulo = format(getBusinessDate(), "EEEE d 'de' MMMM", { locale: es })

  const inv = useInventarioDelDia(fechaIso)
  const cotejo = useCotejoDelDia(fechaIso)
  const pedidos = usePedidosDelDia(fechaIso)
  const guardar = useGuardarInventario()
  const eliminar = useEliminarInventario()

  const [texto, setTexto] = useState('')
  const [parseando, setParseando] = useState(false)

  // Sincroniza el textarea con el inventario guardado (solo cuando cambia el id del inventario).
  useEffect(() => {
    setTexto(inv.data?.texto_original ?? '')
  }, [inv.data?.fecha])

  const totalPedidos   = pedidos.data?.length ?? 0
  const tieneInventario = !!inv.data
  const filas = cotejo.data ?? []

  const aComprar = filas.filter(f => f.a_comprar > 0)
  const sobra    = filas.filter(f => f.sobra > 0 && f.a_comprar === 0)
  const justas   = filas.filter(f => f.a_comprar === 0 && f.sobra === 0 && f.pedido_total > 0)

  const onProcesar = async () => {
    const t = texto.trim()
    if (!t) {
      toast({ title: 'Pega el inventario primero', variant: 'error' })
      return
    }
    setParseando(true)
    try {
      const r = await parsearPedido(t, 'INVENTARIO')
      if (r.lineas.length === 0) {
        toast({ title: 'No se detectó nada', description: 'Revisa el formato del texto.', variant: 'error' })
        return
      }
      await guardar.mutateAsync({
        fecha: fechaIso,
        texto: t,
        lineas: r.lineas.map(l => ({
          orden:                l.orden,
          cantidad:             l.cantidad,
          unidad:               l.unidad,
          producto_normalizado: l.producto,
          notas:                l.notas,
        })),
      })
      toast({ title: `Inventario guardado · ${r.lineas.length} líneas`, variant: 'success' })
    } catch (e) {
      toast({
        title: 'Error procesando inventario',
        description: e instanceof Error ? e.message : 'Inesperado',
        variant: 'error',
      })
    } finally {
      setParseando(false)
    }
  }

  const onEliminar = async () => {
    const ok = await confirm({
      title: '¿Eliminar el inventario de hoy?',
      description: 'El cotejo volverá a mostrar todo como falta.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    eliminar.mutate(
      { fecha: fechaIso },
      {
        onSuccess: () => {
          toast({ title: 'Inventario eliminado', variant: 'success' })
          setTexto('')
        },
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  const copiarLista = async () => {
    if (aComprar.length === 0) {
      toast({ title: 'Nada que comprar', variant: 'success' })
      return
    }
    const lineas = aComprar.map(f => formateaLineaCompra(f))
    const txt = lineas.join('\n')
    try {
      await navigator.clipboard.writeText(txt)
      toast({ title: `${aComprar.length} líneas copiadas`, variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Selecciona y copia manualmente.', variant: 'error' })
    }
  }

  const exportarExcel = () => {
    if (aComprar.length === 0) {
      toast({ title: 'Nada que exportar', variant: 'success' })
      return
    }
    try {
      exportarCompra(aComprar, fechaIso)
      toast({ title: 'Excel descargado', variant: 'success' })
    } catch (e) {
      toast({
        title: 'Error exportando',
        description: e instanceof Error ? e.message : 'Inesperado',
        variant: 'error',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-ink)] capitalize">
            <ShoppingCart className="h-4 w-4" />
            Compra · {titulo}
          </h2>
          <p className="text-xs text-[var(--color-ink-3)]">
            {totalPedidos} {totalPedidos === 1 ? 'pedido' : 'pedidos'} · {tieneInventario ? 'inventario cargado' : 'sin inventario aún'}
          </p>
        </div>
      </div>

      {/* Sección 1: Inventario */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <header className="mb-2 flex items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
            <Boxes className="h-4 w-4 text-[var(--color-primary)]" />
            Inventario del día
          </h3>
          {tieneInventario && (
            <button
              type="button"
              onClick={onEliminar}
              disabled={eliminar.isPending}
              className="inline-flex items-center gap-1 rounded-md p-1 text-xs text-[var(--color-ink-3)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              title="Eliminar inventario de hoy"
            >
              <Trash2 className="h-3 w-3" /> Borrar
            </button>
          )}
        </header>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={'Pega tu inventario. Una línea por producto, ejemplo:\n10 cajas tomate daniela\n5 kg perejil\n3 sacos patata'}
          className="block w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--color-ink-3)]">
            {tieneInventario && inv.data && `Última carga: ${format(new Date(inv.data.updated_at), "HH:mm 'h'")} · ${inv.data.lineas?.length ?? 0} líneas`}
          </span>
          <Button
            size="sm"
            onClick={onProcesar}
            disabled={parseando || guardar.isPending || !texto.trim()}
          >
            {(parseando || guardar.isPending)
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : tieneInventario ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {tieneInventario ? 'Reprocesar' : 'Procesar inventario'}
          </Button>
        </div>
      </section>

      {/* Sección 2: Cotejo */}
      {totalPedidos === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          No hay pedidos para hoy todavía. Pasa por la pestaña Captura para añadirlos.
        </div>
      ) : cotejo.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cotejando…
        </div>
      ) : cotejo.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {(cotejo.error as Error).message}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <KpiBlock
              label="A comprar"
              value={aComprar.length}
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              tone="warning"
            />
            <KpiBlock
              label="Cubiertos"
              value={justas.length}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              tone="ok"
            />
            <KpiBlock
              label="Sobra"
              value={sobra.length}
              icon={<Boxes className="h-3.5 w-3.5" />}
              tone="info"
            />
          </div>

          {/* Lista de compra */}
          {aComprar.length > 0 && (
            <Bloque
              titulo="A comprar"
              icon={<ShoppingCart className="h-4 w-4" />}
              accent="bg-amber-500"
              count={aComprar.length}
              accion={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={exportarExcel} title="Exportar a Excel">
                    <Download className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button size="sm" variant="secondary" onClick={copiarLista}>
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Copiar
                  </Button>
                </div>
              }
            >
              <Tabla filas={aComprar} columna="a_comprar" />
            </Bloque>
          )}

          {/* Cubiertos */}
          {justas.length > 0 && (
            <Bloque
              titulo="Cubiertos exactos"
              icon={<CheckCircle2 className="h-4 w-4" />}
              accent="bg-emerald-500"
              count={justas.length}
              colapsadoInicial
            >
              <Tabla filas={justas} columna="pedido" />
            </Bloque>
          )}

          {/* Sobra */}
          {sobra.length > 0 && (
            <Bloque
              titulo="Sobra inventario"
              icon={<Boxes className="h-4 w-4" />}
              accent="bg-sky-500"
              count={sobra.length}
              colapsadoInicial
            >
              <Tabla filas={sobra} columna="sobra" />
            </Bloque>
          )}

          {!tieneInventario && totalPedidos > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              Sin inventario, todo lo que pidan es lo que hay que comprar.
              Pega tu inventario arriba para ajustar la lista.
            </div>
          )}
        </>
      )}

      <ConversionesEditor />
      <UnificacionProductos />
    </div>
  )
}

function KpiBlock({
  label, value, icon, tone,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: 'ok' | 'warning' | 'info'
}) {
  const styles = {
    ok:      'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200   bg-amber-50   text-amber-700',
    info:    'border-sky-200     bg-sky-50     text-sky-700',
  }[tone]
  return (
    <div className={cn('flex items-center justify-between rounded-[var(--radius-lg)] border p-2.5', styles)}>
      <div className="inline-flex items-center gap-1 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <span className="tabular-nums text-lg font-bold">{value}</span>
    </div>
  )
}

function Bloque({
  titulo, icon, accent, count, accion, colapsadoInicial = false, children,
}: {
  titulo: string
  icon: React.ReactNode
  accent: string
  count: number
  accion?: React.ReactNode
  colapsadoInicial?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!colapsadoInicial)
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"
        >
          <span className={cn('h-2 w-2 rounded-full', accent)} />
          {icon}
          <span>{titulo}</span>
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-ink-3)]">
            {count}
          </span>
        </button>
        {accion}
      </header>
      {open && children}
    </section>
  )
}

function Tabla({
  filas, columna,
}: {
  filas: CotejoFila[]
  columna: 'a_comprar' | 'sobra' | 'pedido'
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Producto</th>
            <th className="px-3 py-2 text-right font-medium">Pedido</th>
            <th className="px-3 py-2 text-right font-medium">Inventario</th>
            <th className="px-3 py-2 text-right font-medium">
              {columna === 'a_comprar' ? 'A comprar'
                : columna === 'sobra'  ? 'Sobra'
                : 'Cubre'}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {filas.map((f, i) => (
            <FilaRow key={`${f.producto}|${f.unidad}|${i}`} fila={f} columna={columna} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaRow({ fila, columna }: { fila: CotejoFila; columna: 'a_comprar' | 'sobra' | 'pedido' }) {
  const valorPrincipal =
    columna === 'a_comprar' ? fila.a_comprar
    : columna === 'sobra'   ? fila.sobra
    : fila.pedido_total
  const cajasPrincipal =
    columna === 'a_comprar' ? fila.a_comprar_cajas
    : columna === 'sobra'   ? secondaryCajas(fila, 'sobra')
    : fila.pedido_cajas

  return (
    <tr className="hover:bg-[var(--color-surface-2)]">
      <td className="px-3 py-2">
        <div className="font-medium text-[var(--color-ink)]">{fila.producto}</div>
        {fila.kg_por_caja != null && fila.kg_por_caja !== 10 && (
          <div className="text-[10px] text-[var(--color-ink-3)]">
            (1 caja = {formatNum(fila.kg_por_caja)} kg)
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">
        {formatCantidad(fila.pedido_total, fila.unidad, fila.pedido_cajas)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-ink-2)]">
        {formatCantidad(fila.inventario, fila.unidad, fila.inventario_cajas)}
      </td>
      <td className={cn(
        'px-3 py-2 text-right font-bold tabular-nums',
        columna === 'a_comprar' && 'text-amber-700',
        columna === 'sobra'     && 'text-sky-700',
        columna === 'pedido'    && 'text-emerald-700',
      )}>
        {formatCantidad(valorPrincipal, fila.unidad, cajasPrincipal)}
      </td>
    </tr>
  )
}

function secondaryCajas(f: CotejoFila, kind: 'sobra'): number | null {
  if (kind === 'sobra' && f.unidad === 'kg' && f.kg_por_caja) {
    return Math.round((f.sobra / f.kg_por_caja) * 100) / 100
  }
  return null
}

function formatCantidad(n: number, unidad: string, cajas: number | null): string {
  const principal = `${formatNum(n)} ${unidad}`
  if (cajas != null && cajas > 0) {
    return `${principal} · ${formatNum(cajas)} cajas`
  }
  return principal
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}

function formateaLineaCompra(f: CotejoFila): string {
  if (f.unidad === 'kg' && f.a_comprar_cajas != null) {
    return `${formatNum(f.a_comprar_cajas)} cajas (${formatNum(f.a_comprar)} kg) · ${f.producto}`
  }
  return `${formatNum(f.a_comprar)} ${f.unidad} · ${f.producto}`
}

// ===== Editor de factores kg/caja =====
function ConversionesEditor() {
  const [open, setOpen] = useState(false)
  const factores = useFactoresKgCaja()
  const upsert = useUpsertFactorKgCaja()
  const eliminar = useEliminarFactorKgCaja()

  const [agregando, setAgregando] = useState(false)
  const [nuevoProducto, setNuevoProducto] = useState('')
  const [nuevoFactor, setNuevoFactor] = useState<number | ''>('')
  const [nuevoUds, setNuevoUds] = useState<number | ''>('')

  const onCrear = async () => {
    const prod = nuevoProducto.trim()
    if (!prod) {
      toast({ title: 'Producto vacío', variant: 'error' })
      return
    }
    const kg  = nuevoFactor !== '' ? Number(nuevoFactor) : null
    const uds = nuevoUds    !== '' ? Number(nuevoUds)    : null
    try {
      await upsert.mutateAsync({ producto_normalizado: prod, kg_por_caja: kg, unidades_por_kg: uds })
      setNuevoProducto('')
      setNuevoFactor('')
      setNuevoUds('')
      setAgregando(false)
      toast({ title: 'Factor guardado', variant: 'success' })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Inesperado',
        variant: 'error',
      })
    }
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Conversiones (kg / caja)
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-ink-3)]">
            {factores.data?.length ?? 0}
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">
          {open ? 'Ocultar' : 'Editar'}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-[var(--color-border)] p-3">
          <p className="text-[11px] text-[var(--color-ink-3)]">
            Por defecto 1 caja = <strong>10 kg</strong>. Aquí defines excepciones por producto.
            El cotejo y la lista de compra usan estos factores.
          </p>

          {factores.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
            </div>
          ) : factores.data && factores.data.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)]">
              {factores.data.map(f => (
                <FactorRow
                  key={f.producto_normalizado}
                  fila={f}
                  onSave={async (kg, uds) => {
                    await upsert.mutateAsync({
                      producto_normalizado: f.producto_normalizado,
                      kg_por_caja:     kg,
                      unidades_por_kg: uds,
                    })
                  }}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: `¿Eliminar factor de "${f.producto_normalizado}"?`,
                      description: 'Volverá a usarse el default 10 kg/caja.',
                      confirmLabel: 'Eliminar',
                      variant: 'danger',
                    })
                    if (!ok) return
                    await eliminar.mutateAsync({ producto_normalizado: f.producto_normalizado })
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-[var(--color-ink-3)]">
              Sin excepciones definidas — todo va con default 10 kg/caja.
            </p>
          )}

          {agregando ? (
            <div className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 p-2">
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="text"
                  value={nuevoProducto}
                  onChange={(e) => setNuevoProducto(e.target.value)}
                  className="col-span-12 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="producto (ej: saco patata)"
                  autoFocus
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={nuevoFactor}
                  onChange={(e) => setNuevoFactor(e.target.value === '' ? '' : Number(e.target.value))}
                  className="col-span-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="kg"
                />
                <span className="col-span-2 inline-flex items-center text-xs text-[var(--color-ink-3)]">
                  kg/caja
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={nuevoUds}
                  onChange={(e) => setNuevoUds(e.target.value === '' ? '' : Number(e.target.value))}
                  className="col-span-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="N"
                />
                <span className="col-span-2 inline-flex items-center text-xs text-[var(--color-ink-3)]">
                  ud/kg
                </span>
              </div>
              <div className="mt-1.5 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => { setAgregando(false); setNuevoProducto(''); setNuevoFactor('') }}
                  className="rounded-md px-2 py-1 text-xs text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onCrear}
                  disabled={upsert.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
            >
              <Plus className="h-3 w-3" /> Añadir excepción
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function FactorRow({
  fila, onSave, onDelete,
}: {
  fila: KgPorCajaRow
  onSave: (kg: number | null, uds: number | null) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [kg,  setKg]  = useState<number | ''>(fila.kg_por_caja  ?? '')
  const [uds, setUds] = useState<number | ''>(fila.unidades_por_kg ?? '')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setKg(fila.kg_por_caja      ?? '')
    setUds(fila.unidades_por_kg ?? '')
  }, [fila.kg_por_caja, fila.unidades_por_kg])

  const cancelar = () => {
    setKg(fila.kg_por_caja      ?? '')
    setUds(fila.unidades_por_kg ?? '')
    setEditando(false)
  }

  const guardar = async () => {
    const kgVal  = kg  !== '' ? Number(kg)  : null
    const udsVal = uds !== '' ? Number(uds) : null
    setPending(true)
    try {
      await onSave(kgVal, udsVal)
      setEditando(false)
      toast({ title: 'Factor actualizado', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : '', variant: 'error' })
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="group/row flex items-center gap-2 bg-[var(--color-surface)] px-2 py-1.5 hover:bg-[var(--color-surface-2)]">
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink)]">
        {fila.producto_normalizado}
      </span>
      {editando ? (
        <>
          <input
            type="number"
            step="0.1"
            min="0.01"
            value={kg}
            onChange={(e) => setKg(e.target.value === '' ? '' : Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
            autoFocus
            className="w-14 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder="kg"
            title="kg por caja"
          />
          <span className="text-[10px] text-[var(--color-ink-3)]">kg/caja</span>
          <input
            type="number"
            step="1"
            min="1"
            value={uds}
            onChange={(e) => setUds(e.target.value === '' ? '' : Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
            className="w-14 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            placeholder="N"
            title="unidades por kg"
          />
          <span className="text-[10px] text-[var(--color-ink-3)]">ud/kg</span>
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="rounded p-1 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
            title="Guardar"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={cancelar}
            className="rounded p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]"
            title="Cancelar"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm tabular-nums text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
            title="Editar"
          >
            {fila.kg_por_caja != null && (
              <span>
                <strong>{formatNum(fila.kg_por_caja)}</strong>
                <span className="text-xs text-[var(--color-ink-3)]"> kg/caja</span>
              </span>
            )}
            {fila.kg_por_caja != null && fila.unidades_por_kg != null && (
              <span className="text-xs text-[var(--color-ink-3)]">·</span>
            )}
            {fila.unidades_por_kg != null && (
              <span>
                <strong>{formatNum(fila.unidades_por_kg)}</strong>
                <span className="text-xs text-[var(--color-ink-3)]"> ud/kg</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-[var(--color-ink-3)] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 group-hover/row:opacity-100"
            title="Eliminar"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </li>
  )
}
