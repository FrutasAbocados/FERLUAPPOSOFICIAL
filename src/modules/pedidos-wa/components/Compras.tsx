import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  FileText,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { confirm } from '@/shared/lib/confirm'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  parsearFacturaProveedor,
  useComprasMes,
  useEliminarCompra,
  useGuardarCompra,
  useSubirCompraAHolded,
  type CompraConLineas,
  type SubirCompraDryRun,
} from '../lib/queries'
import {
  PROVEEDOR_HOLDED_ID,
  type CompraExtraccion,
  type CompraLineaExtraida,
  type ProveedorDetectado,
} from '../lib/types'

type Borrador = CompraExtraccion & {
  pdf_filename: string | null
  proveedor_holded_id: string | null
}

const UNIDADES = ['caja', 'kg', 'bolsa', 'saco', 'bandeja', 'manojo', 'bulto', 'unidad', 'lecho', 'carton'] as const

export function Compras() {
  const hoy = new Date()
  const [yyyymm, setYyyymm] = useState(format(hoy, 'yyyy-MM'))

  const compras = useComprasMes(yyyymm)
  const guardar = useGuardarCompra()
  const eliminar = useEliminarCompra()
  const subir    = useSubirCompraAHolded()

  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [parseando, setParseando] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [modalSubir, setModalSubir] = useState<{
    compra: CompraConLineas
    preview: SubirCompraDryRun | null
    cargandoPreview: boolean
    errorPreview: string | null
  } | null>(null)

  const abrirModalSubir = async (c: CompraConLineas) => {
    setModalSubir({ compra: c, preview: null, cargandoPreview: true, errorPreview: null })
    try {
      const res = await subir.mutateAsync({ compra_id: c.id, dry_run: true })
      if (!('dry_run' in res)) throw new Error('respuesta inesperada (no dry_run)')
      setModalSubir({ compra: c, preview: res, cargandoPreview: false, errorPreview: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setModalSubir({ compra: c, preview: null, cargandoPreview: false, errorPreview: msg })
    }
  }

  const subirDefinitivo = async () => {
    if (!modalSubir) return
    try {
      const res = await subir.mutateAsync({ compra_id: modalSubir.compra.id, dry_run: false })
      if ('holded_purchase_id' in res) {
        toast({
          title: 'Subido a Holded',
          description: res.holded_purchase_num
            ? `${modalSubir.compra.num_factura} → ${res.holded_purchase_num}`
            : modalSubir.compra.num_factura,
        })
      }
      setModalSubir(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Holded rechazó la subida', description: msg, variant: 'error' })
    }
  }

  const cambiarMes = (delta: number) => {
    const [y, m] = yyyymm.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setYyyymm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const totalMes = useMemo(
    () => (compras.data ?? []).reduce((s, c) => s + Number(c.total ?? 0), 0),
    [compras.data],
  )

  const procesarPdf = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Solo PDF', description: 'Suelta un archivo .pdf', variant: 'error' })
      return
    }
    setParseando(true)
    try {
      const extr = await parsearFacturaProveedor(file)
      const holdedId =
        extr.proveedor_detectado !== 'otro'
          ? PROVEEDOR_HOLDED_ID[extr.proveedor_detectado]
          : null
      setBorrador({ ...extr, pdf_filename: file.name, proveedor_holded_id: holdedId })
      toast({
        title: `Factura ${extr.num_factura} extraída`,
        description: `${extr.proveedor_nombre} · ${extr.lineas.length} líneas · ${euros(extr.total)}`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Error parseando PDF', description: msg, variant: 'error' })
    } finally {
      setParseando(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarPdf(file)
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarPdf(file)
    e.target.value = ''
  }

  const totalLineas = useMemo(
    () => (borrador?.lineas ?? []).reduce((s, l) => s + Number(l.importe ?? 0), 0),
    [borrador?.lineas],
  )
  const desviacion = borrador ? Math.abs(totalLineas - borrador.total_bruto) : 0

  const onGuardar = async () => {
    if (!borrador) return
    if (!borrador.proveedor_holded_id) {
      toast({
        title: 'Proveedor sin enlazar',
        description: 'No se reconoció el proveedor automáticamente. Edita la factura manualmente o avisa.',
        variant: 'error',
      })
      return
    }
    if (!borrador.num_factura.trim()) {
      toast({ title: 'Falta nº factura', variant: 'error' })
      return
    }
    if (desviacion > 0.05) {
      const ok = await confirm({
        title: '¿Guardar igualmente?',
        description: `La suma de líneas (${euros(totalLineas)}) no cuadra con el total bruto (${euros(borrador.total_bruto)}). Diferencia: ${euros(desviacion)}.`,
        confirmLabel: 'Guardar',
      })
      if (!ok) return
    }
    try {
      await guardar.mutateAsync({
        proveedor_holded_id: borrador.proveedor_holded_id,
        proveedor_nombre:    borrador.proveedor_nombre,
        num_factura:         borrador.num_factura.trim(),
        fecha:               borrador.fecha,
        total_bruto:         borrador.total_bruto,
        total_iva:           borrador.total_iva,
        total:               borrador.total,
        iva_desglose:        borrador.iva_desglose,
        pdf_filename:        borrador.pdf_filename,
        raw_extraction:      borrador,
        notas:               null,
        lineas:              borrador.lineas,
      })
      toast({ title: 'Compra guardada', description: borrador.num_factura })
      setBorrador(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const dup = msg.includes('duplicate key') || msg.includes('unique')
      toast({
        title: dup ? 'Factura duplicada' : 'Error guardando',
        description: dup ? 'Esta factura del mismo proveedor ya está registrada.' : msg,
        variant: 'error',
      })
    }
  }

  const editarLinea = (idx: number, patch: Partial<CompraLineaExtraida>) => {
    if (!borrador) return
    const lineas = borrador.lineas.slice()
    lineas[idx] = { ...lineas[idx], ...patch }
    // Si cambia cantidad o precio, recalcula importe automáticamente
    if (patch.cantidad !== undefined || patch.precio_unitario !== undefined) {
      const l = lineas[idx]
      lineas[idx] = { ...l, importe: Number((l.cantidad * l.precio_unitario).toFixed(2)) }
    }
    setBorrador({ ...borrador, lineas })
  }

  const eliminarLinea = (idx: number) => {
    if (!borrador) return
    const lineas = borrador.lineas.filter((_, i) => i !== idx).map((l, i) => ({ ...l, orden: i + 1 }))
    setBorrador({ ...borrador, lineas })
  }

  return (
    <div className="space-y-4">
      {/* Header mes */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center font-display text-lg font-semibold capitalize">
            {format(new Date(`${yyyymm}-01T00:00`), "MMMM yyyy", { locale: es })}
          </div>
          <Button variant="ghost" size="icon" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm text-[var(--color-ink-2)] tabular-nums">
          {compras.data?.length ?? 0} facturas · <span className="font-semibold text-[var(--color-ink)]">{euros(totalMes)}</span>
        </div>
      </div>

      {/* Drop zone (oculto si hay borrador para no estorbar) */}
      {!borrador && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed p-8 text-center transition-colors',
            dragActive
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]',
          )}
        >
          {parseando ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-[var(--color-primary)]" />
              <div className="text-sm font-medium">Extrayendo factura…</div>
              <div className="text-xs text-[var(--color-ink-2)]">Esto puede tardar 10-20s</div>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7 text-[var(--color-ink-2)]" />
              <div className="text-sm font-medium">Suelta aquí el PDF de la factura</div>
              <div className="text-xs text-[var(--color-ink-2)]">Alcalde · Abasthosur · otros</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      )}

      {/* Preview borrador */}
      {borrador && (
        <BorradorCard
          borrador={borrador}
          totalLineas={totalLineas}
          desviacion={desviacion}
          guardando={guardar.isPending}
          onCancelar={() => setBorrador(null)}
          onCambiar={(patch) => setBorrador({ ...borrador, ...patch })}
          onCambiarLinea={editarLinea}
          onEliminarLinea={eliminarLinea}
          onGuardar={onGuardar}
        />
      )}

      {/* Lista del mes */}
      <div className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-2)]">
          Compras del mes
        </h2>
        {compras.isLoading && <div className="text-sm text-[var(--color-ink-2)]">Cargando…</div>}
        {!compras.isLoading && (compras.data ?? []).length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-2)]">
            Sin facturas este mes.
          </div>
        )}
        {(compras.data ?? []).map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-[var(--color-ink-2)]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{c.proveedor_nombre}</span>
                <span className="text-[var(--color-ink-2)]">{c.num_factura}</span>
              </div>
              <div className="text-xs text-[var(--color-ink-2)]">
                {format(new Date(c.fecha + 'T00:00'), 'd MMM', { locale: es })} · {c.lineas.length} líneas
              </div>
            </div>
            <div className="text-right text-sm tabular-nums">
              <div className="font-semibold">{euros(Number(c.total))}</div>
              {c.holded_purchase_id ? (
                <div
                  className="flex items-center justify-end gap-1 text-[10px] uppercase text-emerald-600"
                  title={c.holded_purchase_num ?? c.holded_purchase_id}
                >
                  <CheckCircle2 className="h-3 w-3" /> Holded {c.holded_purchase_num ?? '✓'}
                </div>
              ) : (
                <div className="text-[10px] uppercase text-amber-600">Sin Holded</div>
              )}
            </div>
            {!c.holded_purchase_id && (
              <Button
                variant="ghost"
                size="icon"
                className="text-emerald-700 hover:bg-emerald-50"
                onClick={() => abrirModalSubir(c)}
                aria-label="Subir a Holded"
                title="Subir a Holded"
              >
                <CloudUpload className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-rose-600 hover:bg-rose-50"
              onClick={async () => {
                const ok = await confirm({
                  title: '¿Eliminar compra?',
                  description: `${c.proveedor_nombre} · ${c.num_factura}`,
                  confirmLabel: 'Eliminar',
                  variant: 'danger',
                })
                if (ok) eliminar.mutate(c.id)
              }}
              aria-label="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {modalSubir && (
        <ModalSubirHolded
          compra={modalSubir.compra}
          preview={modalSubir.preview}
          cargando={modalSubir.cargandoPreview}
          error={modalSubir.errorPreview}
          subiendo={subir.isPending}
          onCancelar={() => setModalSubir(null)}
          onConfirmar={subirDefinitivo}
        />
      )}
    </div>
  )
}

// ─── Borrador (preview editable) ─────────────────────────────────────────────

function BorradorCard({
  borrador,
  totalLineas,
  desviacion,
  guardando,
  onCancelar,
  onCambiar,
  onCambiarLinea,
  onEliminarLinea,
  onGuardar,
}: {
  borrador: Borrador
  totalLineas: number
  desviacion: number
  guardando: boolean
  onCancelar: () => void
  onCambiar: (patch: Partial<Borrador>) => void
  onCambiarLinea: (idx: number, patch: Partial<CompraLineaExtraida>) => void
  onEliminarLinea: (idx: number) => void
  onGuardar: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-[var(--color-ink-2)]">
            {detectadoLabel(borrador.proveedor_detectado)}
          </div>
          <input
            type="text"
            value={borrador.proveedor_nombre}
            onChange={(e) => onCambiar({ proveedor_nombre: e.target.value })}
            className="w-full bg-transparent font-display text-base font-semibold focus:outline-none"
          />
          {!borrador.proveedor_holded_id && (
            <div className="mt-1 flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle className="h-3 w-3" /> Proveedor no reconocido — no se podrá enlazar a Holded
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onCancelar} aria-label="Descartar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Cabecera campos */}
      <div className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] p-3 sm:grid-cols-4">
        <Field label="Nº factura">
          <input
            type="text"
            value={borrador.num_factura}
            onChange={(e) => onCambiar({ num_factura: e.target.value })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums"
          />
        </Field>
        <Field label="Fecha">
          <input
            type="date"
            value={borrador.fecha}
            onChange={(e) => onCambiar({ fecha: e.target.value })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm tabular-nums"
          />
        </Field>
        <Field label="Bruto">
          <input
            type="number"
            step="0.01"
            value={borrador.total_bruto}
            onChange={(e) => onCambiar({ total_bruto: Number(e.target.value) })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums"
          />
        </Field>
        <Field label="Total c/IVA">
          <input
            type="number"
            step="0.01"
            value={borrador.total}
            onChange={(e) => onCambiar({ total: Number(e.target.value) })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm font-semibold tabular-nums"
          />
        </Field>
      </div>

      {/* Tabla líneas */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-ink-2)]">
            <tr>
              <th className="w-8 px-2 py-1">#</th>
              <th className="px-2 py-1">Descripción</th>
              <th className="w-20 px-2 py-1 text-right">Cant.</th>
              <th className="w-24 px-2 py-1">Unidad</th>
              <th className="w-20 px-2 py-1 text-right">Precio</th>
              <th className="w-12 px-2 py-1 text-right">IVA</th>
              <th className="w-24 px-2 py-1 text-right">Importe</th>
              <th className="w-8 px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {borrador.lineas.map((l, idx) => (
              <tr key={idx} className="border-t border-[var(--color-border)] tabular-nums">
                <td className="px-2 py-1 text-[var(--color-ink-2)]">{l.orden}</td>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={l.descripcion}
                    onChange={(e) => onCambiarLinea(idx, { descripcion: e.target.value })}
                    className="w-full bg-transparent focus:outline-none"
                  />
                  {l.codigo_proveedor && (
                    <div className="text-[10px] text-[var(--color-ink-2)]">{l.codigo_proveedor}</div>
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    step="0.001"
                    value={l.cantidad}
                    onChange={(e) => onCambiarLinea(idx, { cantidad: Number(e.target.value) })}
                    className="w-full bg-transparent text-right focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={l.unidad}
                    onChange={(e) => onCambiarLinea(idx, { unidad: e.target.value })}
                    className="w-full bg-transparent focus:outline-none"
                  >
                    {UNIDADES.includes(l.unidad as (typeof UNIDADES)[number]) ? null : (
                      <option value={l.unidad}>{l.unidad}</option>
                    )}
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    step="0.0001"
                    value={l.precio_unitario}
                    onChange={(e) => onCambiarLinea(idx, { precio_unitario: Number(e.target.value) })}
                    className="w-full bg-transparent text-right focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    value={l.iva_pct}
                    onChange={(e) => onCambiarLinea(idx, { iva_pct: Number(e.target.value) })}
                    className="w-full bg-transparent text-right focus:outline-none"
                  />
                </td>
                <td className="px-2 py-1 text-right font-medium">{euros(Number(l.importe))}</td>
                <td className="px-2 py-1">
                  <button
                    onClick={() => onEliminarLinea(idx)}
                    className="text-rose-600 hover:text-rose-700"
                    aria-label="Eliminar línea"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)] tabular-nums">
              <td colSpan={6} className="px-2 py-1.5 text-right text-[var(--color-ink-2)]">
                Suma líneas
              </td>
              <td className={cn(
                'px-2 py-1.5 text-right font-semibold',
                desviacion > 0.05 && 'text-rose-600',
              )}>
                {euros(totalLineas)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {desviacion > 0.05 && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          La suma de líneas no cuadra con el total bruto. Diferencia: {euros(desviacion)}. Revisa antes de guardar.
        </div>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-2 border-t border-[var(--color-border)] p-3">
        <Button variant="ghost" onClick={onCancelar}>
          Descartar
        </Button>
        <Button onClick={onGuardar} disabled={guardando}>
          {guardando ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>Guardar compra</>
          )}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-2)]">{label}</span>
      {children}
    </label>
  )
}

function detectadoLabel(p: ProveedorDetectado): string {
  if (p === 'alcalde')    return 'Alcalde · auto-detectado'
  if (p === 'abasthosur') return 'Abasthosur · auto-detectado'
  return 'Proveedor no detectado'
}

// ─── Modal "Subir a Holded" — preview dry_run + confirmar ────────────────────

function ModalSubirHolded({
  compra,
  preview,
  cargando,
  error,
  subiendo,
  onCancelar,
  onConfirmar,
}: {
  compra: CompraConLineas
  preview: SubirCompraDryRun | null
  cargando: boolean
  error: string | null
  subiendo: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const items = (preview?.body?.items ?? []) as Array<{
    name: string; desc?: string; units: number; subtotal: number; tax: number; sku?: string
  }>
  const subtotal = items.reduce((s, it) => s + it.units * it.subtotal, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar() }}
    >
      <div className="w-full max-w-3xl rounded-[var(--radius-md)] bg-[var(--color-surface)] shadow-lg">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-ink-2)]">
              <CloudUpload className="h-3.5 w-3.5" /> Subir a Holded · vista previa
            </div>
            <div className="mt-1 truncate font-display text-base font-semibold">
              {compra.proveedor_nombre} · {compra.num_factura}
            </div>
            <div className="text-xs text-[var(--color-ink-2)]">
              {compra.fecha} · {compra.lineas.length} líneas · bruto {euros(Number(compra.total_bruto))} · total {euros(Number(compra.total))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancelar} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {cargando && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Resolviendo body Holded…
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
              {/* Cabecera del body Holded */}
              <div className="grid grid-cols-2 gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs">
                <Kv k="contactId"   v={String(preview.body.contactId ?? '—')} />
                <Kv k="contactName" v={String(preview.body.contactName ?? '—')} />
                <Kv k="docNumber"   v={String(preview.body.docNumber ?? '—')} />
                <Kv k="date (unix)" v={String(preview.body.date ?? '—')} />
                <Kv k="desc"        v={String(preview.body.desc ?? '—')} />
                <Kv k="currency"    v={`${preview.body.currency ?? '—'} (${preview.body.language ?? '—'})`} />
                {preview.body.notes ? (
                  <Kv k="notes" v={String(preview.body.notes)} className="col-span-2" />
                ) : null}
              </div>

              {/* Tabla items */}
              <div className="overflow-x-auto rounded border border-[var(--color-border)]">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-ink-2)]">
                    <tr>
                      <th className="px-2 py-1.5">name</th>
                      <th className="px-2 py-1.5">desc</th>
                      <th className="w-16 px-2 py-1.5 text-right">units</th>
                      <th className="w-20 px-2 py-1.5 text-right">subtotal u.</th>
                      <th className="w-12 px-2 py-1.5 text-right">tax</th>
                      <th className="w-20 px-2 py-1.5">sku</th>
                      <th className="w-24 px-2 py-1.5 text-right">subt.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-t border-[var(--color-border)]">
                        <td className="px-2 py-1">{it.name}</td>
                        <td className="px-2 py-1 text-[var(--color-ink-2)]">{it.desc ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{it.units}</td>
                        <td className="px-2 py-1 text-right">{it.subtotal.toFixed(4)}</td>
                        <td className="px-2 py-1 text-right">{it.tax}%</td>
                        <td className="px-2 py-1 text-[10px] text-[var(--color-ink-2)]">{it.sku ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{euros(it.units * it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <td colSpan={6} className="px-2 py-1.5 text-right text-[var(--color-ink-2)]">
                        Suma items (sin IVA)
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">{euros(subtotal)}</td>
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
            Esto creará una factura de compra REAL en Holded.
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancelar} disabled={subiendo}>
              Cancelar
            </Button>
            <Button onClick={onConfirmar} disabled={!preview || subiendo}>
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
