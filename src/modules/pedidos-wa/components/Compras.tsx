import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle,
  Ban,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudUpload,
  FileText,
  ImageIcon,
  Loader2,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { confirm } from '@/shared/lib/confirm'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { prepararFoto, type FotoPreparada } from '../lib/imagen'
import {
  buscarProveedorAlias,
  parsearFacturaProveedor,
  parsearFacturaProveedorFotos,
  useBuscarProveedores,
  useComprasMes,
  useEliminarCompra,
  useGuardarCompra,
  useProveedorAlias,
  useRecordarProveedorAlias,
  useSubirCompraAHolded,
  type CompraConLineas,
  type SubirCompraDryRun,
} from '../lib/queries'
import {
  PROVEEDOR_HOLDED_ID,
  type CompraExtraccion,
  type CompraLineaExtraida,
  type ContactoHolded,
  type OrigenCompra,
  type ProveedorDetectado,
} from '../lib/types'

type Borrador = CompraExtraccion & {
  pdf_filename: string | null
  proveedor_holded_id: string | null
  origen: OrigenCompra
  fotos: FotoPreparada[]
}

const UNIDADES = ['caja', 'kg', 'bolsa', 'saco', 'bandeja', 'manojo', 'bulto', 'unidad', 'lecho', 'carton'] as const

/** Tope de PDFs por tanda. Se procesan de uno en uno, no en paralelo. */
const MAX_COLA = 20
/** Diferencia máxima entre la suma de líneas y el bruto para subir sin revisión. */
const TOLERANCIA_DESVIACION = 0.05

type EstadoItem =
  | 'espera'
  | 'ocr'
  | 'guardando'
  | 'subiendo'
  | 'ok'        // guardada Y subida a Holded
  | 'revisar'   // guardada, pero NO subida: necesita ojo humano
  | 'error'     // no se pudo guardar/subir
  | 'cancelado'

type ItemCola = {
  id: string
  file: File
  nombre: string
  estado: EstadoItem
  detalle: string | null
  proveedor: string | null
  numFactura: string | null
  total: number | null
  holdedNum: string | null
}

const ITEM_TERMINADO: EstadoItem[] = ['ok', 'revisar', 'error', 'cancelado']

export function Compras() {
  const hoy = new Date()
  const [yyyymm, setYyyymm] = useState(format(hoy, 'yyyy-MM'))

  const compras = useComprasMes(yyyymm)
  const guardar = useGuardarCompra()
  const eliminar = useEliminarCompra()
  const subir    = useSubirCompraAHolded()

  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [pdfOriginal, setPdfOriginal] = useState<File | null>(null)
  const [parseando, setParseando] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [cola, setCola] = useState<ItemCola[]>([])
  const [colaCorriendo, setColaCorriendo] = useState(false)
  const cancelarColaRef = useRef(false)
  const inputRef   = useRef<HTMLInputElement>(null)
  const camaraRef  = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)

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

  const avisarExtraccion = (extr: CompraExtraccion) => {
    if (extr.notas_globales) {
      toast({
        title: 'El OCR no está seguro',
        description: extr.notas_globales,
        variant: 'error',
      })
      return
    }
    toast({
      title: `Factura ${extr.num_factura} extraída`,
      description: `${extr.proveedor_nombre} · ${extr.lineas.length} líneas · ${euros(extr.total)}`,
    })
  }

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
      setBorrador({ ...extr, pdf_filename: file.name, proveedor_holded_id: holdedId, origen: 'pdf', fotos: [] })
      setPdfOriginal(file)
      avisarExtraccion(extr)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Error parseando PDF', description: msg, variant: 'error' })
    } finally {
      setParseando(false)
    }
  }

  /** Fotos: se convierten a JPEG (Claude no acepta el HEIC del iPhone) y se mandan juntas. */
  const procesarFotos = async (files: File[]) => {
    if (files.length === 0) return
    if (files.length > 8) {
      toast({ title: 'Máximo 8 fotos', description: 'Haz una foto por página.', variant: 'error' })
      return
    }
    setParseando(true)
    try {
      const fotos: FotoPreparada[] = []
      for (const f of files) fotos.push(await prepararFoto(f))

      const extr = await parsearFacturaProveedorFotos(fotos)
      const holdedId =
        extr.proveedor_detectado !== 'otro'
          ? PROVEEDOR_HOLDED_ID[extr.proveedor_detectado]
          : null
      setBorrador({
        ...extr,
        pdf_filename: fotos[0]?.nombre ?? null,
        proveedor_holded_id: holdedId,
        origen: 'foto',
        fotos,
      })
      setPdfOriginal(null)
      avisarExtraccion(extr)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: 'Error leyendo la foto', description: msg, variant: 'error' })
    } finally {
      setParseando(false)
    }
  }

  // ─── Cola de PDFs (tanda de hasta 20, uno por uno) ─────────────────────────

  const patchItem = (id: string, patch: Partial<ItemCola>) =>
    setCola((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  /**
   * Un PDF de principio a fin: OCR → resolver proveedor → guardar → subir a Holded.
   * Sube SOLO si la factura está limpia: proveedor enlazado, líneas que cuadran con
   * el bruto y sin avisos del OCR. Lo dudoso se guarda y se marca «revisar» — una
   * factura de compra en Holded no se deshace desde aquí.
   */
  const procesarItemCola = async (item: ItemCola): Promise<'ok' | 'revisar'> => {
    patchItem(item.id, { estado: 'ocr', detalle: 'Leyendo el PDF…' })
    const extr = await parsearFacturaProveedor(item.file)

    let holdedId: string | null =
      extr.proveedor_detectado !== 'otro' ? PROVEEDOR_HOLDED_ID[extr.proveedor_detectado] : null
    let proveedorNombre = extr.proveedor_nombre

    // Proveedor no autodetectado: probar el alias aprendido en facturas anteriores.
    if (!holdedId) {
      const alias = await buscarProveedorAlias(extr.proveedor_nombre).catch(() => null)
      if (alias) {
        holdedId = alias.holded_contact_id
        proveedorNombre = alias.holded_nombre
      }
    }

    const sumaLineas = extr.lineas.reduce((s, l) => s + Number(l.importe ?? 0), 0)
    const desv = Math.abs(sumaLineas - Number(extr.total_bruto ?? 0))

    patchItem(item.id, {
      estado: 'guardando',
      detalle: 'Guardando la compra…',
      proveedor: proveedorNombre,
      numFactura: extr.num_factura,
      total: Number(extr.total ?? 0),
    })

    const compra = await guardar.mutateAsync({
      proveedor_holded_id: holdedId,
      proveedor_nombre:    proveedorNombre,
      num_factura:         extr.num_factura.trim(),
      fecha:               extr.fecha,
      total_bruto:         extr.total_bruto,
      total_iva:           extr.total_iva,
      total:               extr.total,
      iva_desglose:        extr.iva_desglose,
      pdf_filename:        item.file.name,
      raw_extraction:      extr,
      notas:               extr.notas_globales ?? null,
      lineas:              extr.lineas,
      origen:              'pdf',
      pdf:                 item.file,
      fotos:               [],
    })

    const bloqueo = !holdedId
      ? 'Guardada sin proveedor Holded — enlázalo abajo y súbela a mano'
      : !extr.num_factura.trim()
      ? 'Guardada sin nº de factura — complétalo antes de subirla'
      : desv > TOLERANCIA_DESVIACION
      ? `Guardada, NO subida: las líneas (${euros(sumaLineas)}) no cuadran con el bruto (${euros(Number(extr.total_bruto ?? 0))}), dif. ${euros(desv)}`
      : extr.notas_globales
      ? `Guardada, NO subida: el OCR no se fía — ${extr.notas_globales}`
      : null

    if (bloqueo) {
      patchItem(item.id, { estado: 'revisar', detalle: bloqueo })
      return 'revisar'
    }

    patchItem(item.id, { estado: 'subiendo', detalle: 'Subiendo a Holded…' })
    const res = await subir.mutateAsync({ compra_id: compra.id, dry_run: false })
    if (!('holded_purchase_id' in res)) throw new Error('respuesta inesperada de compra-a-holded')
    patchItem(item.id, {
      estado: 'ok',
      detalle: null,
      holdedNum: res.holded_purchase_num ?? '✓',
    })
    return 'ok'
  }

  const correrCola = async (items: ItemCola[]) => {
    cancelarColaRef.current = false
    setColaCorriendo(true)
    let subidas = 0
    let revisar = 0
    let fallos = 0
    try {
      for (const item of items) {
        if (cancelarColaRef.current) {
          patchItem(item.id, { estado: 'cancelado', detalle: 'Cancelada antes de empezar' })
          continue
        }
        try {
          const fin = await procesarItemCola(item)
          if (fin === 'ok') subidas++
          else revisar++
        } catch (e) {
          fallos++
          const msg = e instanceof Error ? e.message : String(e)
          const dup = msg.includes('duplicate key') || msg.includes('unique')
          patchItem(item.id, {
            estado: 'error',
            detalle: dup ? 'Esta factura ya estaba registrada' : msg,
          })
        }
      }
    } finally {
      setColaCorriendo(false)
    }
    toast({
      title: cancelarColaRef.current ? 'Tanda cancelada' : 'Tanda terminada',
      description: [
        `${subidas} subidas a Holded`,
        revisar > 0 ? `${revisar} para revisar` : null,
        fallos  > 0 ? `${fallos} con error` : null,
      ].filter(Boolean).join(' · '),
      variant: fallos > 0 ? 'error' : undefined,
    })
  }

  const arrancarCola = (pdfs: File[]) => {
    const lote = pdfs.slice(0, MAX_COLA)
    if (pdfs.length > MAX_COLA) {
      toast({
        title: `Máximo ${MAX_COLA} PDFs por tanda`,
        description: `Se procesan los ${MAX_COLA} primeros; suelta el resto después.`,
        variant: 'error',
      })
    }
    const items: ItemCola[] = lote.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      nombre: f.name,
      estado: 'espera',
      detalle: null,
      proveedor: null,
      numFactura: null,
      total: null,
      holdedNum: null,
    }))
    setCola(items)
    void correrCola(items)
  }

  const reintentarFallidas = () => {
    const fallidas = cola.filter((it) => it.estado === 'error' || it.estado === 'cancelado')
    if (fallidas.length === 0) return
    const reset: ItemCola[] = fallidas.map((it) => ({
      ...it,
      estado: 'espera',
      detalle: null,
      holdedNum: null,
    }))
    setCola((prev) => prev.map((it) => reset.find((r) => r.id === it.id) ?? it))
    void correrCola(reset)
  }

  const procesarArchivos = (files: File[]) => {
    if (files.length === 0) return
    const imagenes = files.filter((f) => f.type.startsWith('image/'))
    if (imagenes.length > 0) {
      // Las fotos siguen siendo UNA factura (una por página), no una tanda.
      void procesarFotos(imagenes)
      return
    }
    const pdfs = files.filter((f) => f.type === 'application/pdf')
    if (pdfs.length === 0) {
      toast({ title: 'Solo PDF o fotos', description: 'Suelta archivos .pdf', variant: 'error' })
      return
    }
    // Un solo PDF mantiene el flujo de siempre: borrador editable antes de guardar.
    if (pdfs.length === 1) void procesarPdf(pdfs[0])
    else arrancarCola(pdfs)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    procesarArchivos(Array.from(e.dataTransfer.files))
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    procesarArchivos(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const onPickFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) procesarFotos(files)
    e.target.value = ''
  }

  const totalLineas = useMemo(
    () => (borrador?.lineas ?? []).reduce((s, l) => s + Number(l.importe ?? 0), 0),
    [borrador?.lineas],
  )
  const desviacion = borrador ? Math.abs(totalLineas - borrador.total_bruto) : 0

  const onGuardar = async () => {
    if (!borrador) return
    if (!borrador.num_factura.trim()) {
      toast({ title: 'Falta nº factura', variant: 'error' })
      return
    }
    // Sin proveedor Holded la compra se archiva, pero NO llega a manager_lineas
    // (solo holded-sync escribe ahí) y por tanto no afecta al coste ni al margen.
    if (!borrador.proveedor_holded_id) {
      const ok = await confirm({
        title: '¿Guardar sin enlazar a Holded?',
        description:
          'La factura quedará archivada con su foto, pero NO se podrá subir a Holded y no contará para el coste ni para el margen. Puedes enlazarla ahora eligiendo el proveedor.',
        confirmLabel: 'Guardar sin enlazar',
      })
      if (!ok) return
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
        notas:               borrador.notas_globales ?? null,
        lineas:              borrador.lineas,
        origen:              borrador.origen,
        pdf:                 pdfOriginal,
        fotos:               borrador.fotos,
      })
      toast({
        title: 'Compra guardada',
        description: borrador.proveedor_holded_id
          ? `${borrador.num_factura} · archivo físico guardado · súbela a Holded para que cuente en el coste`
          : `${borrador.num_factura} · archivo físico guardado · no cuenta para el coste`,
        variant: 'success',
      })
      setBorrador(null)
      setPdfOriginal(null)
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

      {/* Cola de tanda: mientras hay tanda, la zona de soltar se oculta */}
      {cola.length > 0 && (
        <ColaPanel
          cola={cola}
          corriendo={colaCorriendo}
          onCancelar={() => { cancelarColaRef.current = true }}
          onReintentar={reintentarFallidas}
          onLimpiar={() => setCola([])}
        />
      )}

      {/* Drop zone (oculto si hay borrador o tanda en curso para no estorbar) */}
      {!borrador && cola.length === 0 && (
        <div className="space-y-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => !parseando && inputRef.current?.click()}
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
                <div className="text-sm font-medium">
                  Suelta aquí los PDFs de las facturas (hasta {MAX_COLA})
                </div>
                <div className="text-xs text-[var(--color-ink-2)]">Alcalde · Abasthosur · Agroejido</div>
                <div className="text-[11px] text-[var(--color-ink-2)]">
                  1 PDF → lo revisas antes de guardar · varios → se procesan solos y se suben a Holded
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={onPickFile}
            />
          </div>

          {/* Otros proveedores — foto/cámara */}
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">Otros proveedores</div>
                <div className="text-xs text-[var(--color-ink-2)]">
                  Factura en papel de un proveedor poco habitual: échale una foto
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={parseando}
                onClick={() => camaraRef.current?.click()}
              >
                <Camera className="mr-1.5 h-4 w-4" /> Foto / Cámara
              </Button>
              <Button
                variant="ghost"
                disabled={parseando}
                onClick={() => galeriaRef.current?.click()}
              >
                <ImageIcon className="mr-1.5 h-4 w-4" /> Elegir imágenes
              </Button>
            </div>
            <div className="mt-2 text-[11px] text-[var(--color-ink-2)]">
              Hasta 8 fotos (una por página). Se convierten a JPEG antes de enviarlas.
            </div>

            {/* capture abre la cámara trasera directamente en el móvil */}
            <input
              ref={camaraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickFotos}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPickFotos}
            />
          </div>
        </div>
      )}

      {/* Preview borrador */}
      {borrador && (
        <BorradorCard
          borrador={borrador}
          totalLineas={totalLineas}
          desviacion={desviacion}
          guardando={guardar.isPending}
          onCancelar={() => {
            setBorrador(null)
            setPdfOriginal(null)
          }}
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
            {c.origen === 'foto'
              ? <Camera className="h-4 w-4 shrink-0 text-[var(--color-ink-2)]" />
              : <FileText className="h-4 w-4 shrink-0 text-[var(--color-ink-2)]" />}
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
                  className="flex items-center justify-end gap-1 text-[10px] uppercase text-[var(--mint)]"
                  title={c.holded_purchase_num ?? c.holded_purchase_id}
                >
                  <CheckCircle2 className="h-3 w-3" /> Holded {c.holded_purchase_num ?? '✓'}
                </div>
              ) : c.proveedor_holded_id ? (
                <div className="text-[10px] uppercase text-[var(--color-primary)]">Sin Holded</div>
              ) : (
                <div
                  className="text-[10px] uppercase text-[var(--color-ink-2)]"
                  title="Sin proveedor Holded: archivada, no cuenta para el coste ni el margen"
                >
                  Solo archivada
                </div>
              )}
            </div>
            {/* Sin proveedor_holded_id, compra-a-holded no puede construir el documento */}
            {!c.holded_purchase_id && c.proveedor_holded_id && (
              <Button
                variant="ghost"
                size="icon"
                className="text-[var(--mint)] hover:bg-[var(--mint-glow)]"
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
              className="text-[var(--coral)] hover:bg-[oklch(30%_.12_25_/_0.18)]"
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

// ─── Cola de tanda: hasta 20 PDFs, uno por uno, con subida a Holded ──────────

function ColaPanel({
  cola,
  corriendo,
  onCancelar,
  onReintentar,
  onLimpiar,
}: {
  cola: ItemCola[]
  corriendo: boolean
  onCancelar: () => void
  onReintentar: () => void
  onLimpiar: () => void
}) {
  const hechas    = cola.filter((it) => ITEM_TERMINADO.includes(it.estado)).length
  const subidas   = cola.filter((it) => it.estado === 'ok').length
  const revisar   = cola.filter((it) => it.estado === 'revisar').length
  const fallidas  = cola.filter((it) => it.estado === 'error' || it.estado === 'cancelado').length
  const pct       = cola.length > 0 ? Math.round((hechas / cola.length) * 100) : 0

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-display text-sm font-semibold">
            {corriendo && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
            Tanda de facturas · {hechas}/{cola.length}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-[var(--color-ink-2)]">
            {subidas} subidas a Holded
            {revisar  > 0 && <> · <span className="text-[var(--color-primary)]">{revisar} para revisar</span></>}
            {fallidas > 0 && <> · <span className="text-[var(--coral)]">{fallidas} con error</span></>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {corriendo && (
            <Button variant="ghost" onClick={onCancelar}>
              <Ban className="mr-1.5 h-4 w-4" /> Cancelar tanda
            </Button>
          )}
          {!corriendo && fallidas > 0 && (
            <Button variant="secondary" onClick={onReintentar}>
              <RotateCw className="mr-1.5 h-4 w-4" /> Reintentar {fallidas}
            </Button>
          )}
          {!corriendo && (
            <Button variant="ghost" onClick={onLimpiar}>
              <X className="mr-1.5 h-4 w-4" /> Cerrar
            </Button>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="h-1 w-full bg-[var(--color-surface-2)]">
        <div
          className="h-full bg-[var(--color-primary)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="divide-y divide-[var(--color-border)]">
        {cola.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <IconoEstado estado={it.estado} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="truncate font-medium">
                  {it.proveedor ?? it.nombre}
                </span>
                {it.numFactura && (
                  <span className="text-xs tabular-nums text-[var(--color-ink-2)]">{it.numFactura}</span>
                )}
              </div>
              <div
                className={cn(
                  'text-xs',
                  it.estado === 'error'   && 'text-[var(--coral)]',
                  it.estado === 'revisar' && 'text-[var(--color-primary)]',
                  it.estado !== 'error' && it.estado !== 'revisar' && 'text-[var(--color-ink-2)]',
                )}
              >
                {it.detalle ?? etiquetaEstado(it.estado, it.holdedNum)}
              </div>
              {it.proveedor && (
                <div className="truncate text-[10px] text-[var(--color-ink-2)]">{it.nombre}</div>
              )}
            </div>
            {it.total !== null && (
              <div className="text-right text-sm font-semibold tabular-nums">{euros(it.total)}</div>
            )}
          </li>
        ))}
      </ul>

      {!corriendo && revisar > 0 && (
        <div className="flex items-start gap-2 border-t border-[var(--color-border)] bg-[oklch(92%_.08_82_/_0.85)] px-3 py-2 text-xs text-[oklch(39%_.11_72)] dark:bg-[oklch(28%_.08_72_/_0.42)] dark:text-[var(--color-primary)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Las marcadas «revisar» están guardadas pero NO en Holded. Corrígelas en la lista de abajo
          y súbelas con el botón <CloudUpload className="mx-0.5 inline h-3 w-3" /> de cada fila.
        </div>
      )}
    </div>
  )
}

function IconoEstado({ estado }: { estado: EstadoItem }) {
  if (estado === 'espera')    return <Clock className="h-4 w-4 shrink-0 text-[var(--color-ink-2)]" />
  if (estado === 'ok')        return <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--mint)]" />
  if (estado === 'revisar')   return <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
  if (estado === 'error')     return <AlertCircle className="h-4 w-4 shrink-0 text-[var(--coral)]" />
  if (estado === 'cancelado') return <Ban className="h-4 w-4 shrink-0 text-[var(--color-ink-2)]" />
  return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
}

function etiquetaEstado(estado: EstadoItem, holdedNum: string | null): string {
  if (estado === 'espera')    return 'En cola'
  if (estado === 'ocr')       return 'Leyendo el PDF…'
  if (estado === 'guardando') return 'Guardando la compra…'
  if (estado === 'subiendo')  return 'Subiendo a Holded…'
  if (estado === 'ok')        return `Subida a Holded ${holdedNum ?? ''}`.trim()
  if (estado === 'cancelado') return 'Cancelada'
  return ''
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[var(--color-ink-2)]">
            {borrador.origen === 'foto' && <Camera className="h-3 w-3" />}
            {detectadoLabel(borrador.proveedor_detectado)}
          </div>
          <input
            type="text"
            value={borrador.proveedor_nombre}
            onChange={(e) => onCambiar({ proveedor_nombre: e.target.value })}
            className="w-full bg-transparent font-display text-base font-semibold focus:outline-none"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onCancelar} aria-label="Descartar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* El OCR avisa cuando no se fía de lo que ha leído */}
      {borrador.notas_globales && (
        <div className="flex items-start gap-2 border-b border-[oklch(72%_.16_25_/_0.35)] bg-[oklch(30%_.12_25_/_0.12)] px-3 py-2 text-xs text-[var(--coral)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">El OCR no se fía de esta foto</div>
            <div className="mt-0.5">{borrador.notas_globales}</div>
          </div>
        </div>
      )}

      {/* Proveedor no autodetectado: enlazar a Holded es opcional pero decide si cuenta el coste */}
      {!borrador.proveedor_holded_id && (
        <SelectorProveedor
          nombreDetectado={borrador.proveedor_nombre}
          onElegir={(c) => onCambiar({ proveedor_holded_id: c.id, proveedor_nombre: c.nombre })}
        />
      )}

      {borrador.fotos.length > 0 && <TiraFotos fotos={borrador.fotos} />}

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
                    className="text-[var(--coral)] hover:text-[var(--coral-strong)]"
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
                desviacion > 0.05 && 'text-[var(--coral)]',
              )}>
                {euros(totalLineas)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {desviacion > 0.05 && (
        <div className="flex items-center gap-2 border-t border-[oklch(78%_.12_72_/_0.35)] bg-[oklch(92%_.08_82_/_0.85)] px-3 py-2 text-xs text-[oklch(39%_.11_72)] dark:bg-[oklch(28%_.08_72_/_0.42)] dark:text-[var(--color-primary)]">
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

// ─── Selector de proveedor Holded (solo cuando el OCR no lo reconoce) ────────

function SelectorProveedor({
  nombreDetectado,
  onElegir,
}: {
  nombreDetectado: string
  onElegir: (c: ContactoHolded) => void
}) {
  const [q, setQ] = useState('')
  const [recordar, setRecordar] = useState(true)
  const resultados = useBuscarProveedores(q)
  const alias = useProveedorAlias(nombreDetectado)
  const recordarAlias = useRecordarProveedorAlias()

  // Si este proveedor ya se enlazó una vez, se aplica solo: la 2ª factura es 0 clicks.
  const yaAplicado = useRef(false)
  useEffect(() => {
    const a = alias.data
    if (a && !yaAplicado.current) {
      yaAplicado.current = true
      onElegir({ id: a.holded_contact_id, nombre: a.holded_nombre, nif: null })
      toast({ title: 'Proveedor recordado', description: a.holded_nombre })
    }
  }, [alias.data, onElegir])

  const elegir = async (c: ContactoHolded) => {
    onElegir(c)
    if (recordar && nombreDetectado.trim()) {
      try {
        await recordarAlias.mutateAsync({ nombre_detectado: nombreDetectado, contacto: c })
      } catch {
        // Que no se recuerde no debe impedir guardar la factura.
      }
    }
  }

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-1.5 flex items-start gap-2 text-xs text-[var(--color-ink-2)]">
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
        <div>
          <span className="font-semibold text-[var(--color-ink)]">Proveedor no reconocido.</span>{' '}
          Enlázalo a Holded para que esta compra cuente en el coste y el margen. Si lo dejas en
          blanco, la factura se archiva pero no afecta a los números.
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-2)]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proveedor en Holded…"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-7 pr-2 text-sm"
        />
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded border border-[var(--color-border)]">
          {resultados.isLoading && (
            <div className="px-2 py-1.5 text-xs text-[var(--color-ink-2)]">Buscando…</div>
          )}
          {!resultados.isLoading && (resultados.data ?? []).length === 0 && (
            <div className="px-2 py-1.5 text-xs text-[var(--color-ink-2)]">
              Sin resultados. Créalo antes en Holded.
            </div>
          )}
          {(resultados.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => elegir(c)}
              className="flex w-full items-baseline justify-between gap-2 border-b border-[var(--color-border)] px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-[var(--color-surface-2)]"
            >
              <span className="truncate font-medium">{c.nombre}</span>
              {c.nif && <span className="shrink-0 text-[10px] text-[var(--color-ink-2)]">{c.nif}</span>}
            </button>
          ))}
        </div>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-ink-2)]">
        <input
          type="checkbox"
          checked={recordar}
          onChange={(e) => setRecordar(e.target.checked)}
          className="accent-[var(--color-primary)]"
        />
        Recordar para las próximas facturas de «{nombreDetectado || 'este proveedor'}»
      </label>
    </div>
  )
}

// ─── Tira de fotos del borrador ─────────────────────────────────────────────

function TiraFotos({ fotos }: { fotos: FotoPreparada[] }) {
  const urls = useMemo(() => fotos.map((f) => URL.createObjectURL(f.blob)), [fotos])
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls])

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      {urls.map((u, i) => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 overflow-hidden rounded border border-[var(--color-border)]"
          title={`Foto ${i + 1} — abrir`}
        >
          <img src={u} alt={`Factura foto ${i + 1}`} className="h-20 w-auto object-cover" />
        </a>
      ))}
    </div>
  )
}

function detectadoLabel(p: ProveedorDetectado): string {
  if (p === 'alcalde')    return 'Alcalde · auto-detectado'
  if (p === 'abasthosur') return 'Abasthosur · auto-detectado'
  if (p === 'agroejido')  return 'Agroejido · auto-detectado'
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
    <Modal onClose={onCancelar} size="2xl">
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
            <div className="flex items-start gap-2 rounded border border-[oklch(72%_.16_25_/_0.35)] bg-[oklch(30%_.12_25_/_0.12)] p-3 text-xs text-[var(--coral)]">
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
                        <td className="px-2 py-1 text-right">{(it.subtotal ?? 0).toFixed(4)}</td>
                        <td className="px-2 py-1 text-right">{it.tax}%</td>
                        <td className="px-2 py-1 text-[10px] text-[var(--color-ink-2)]">{it.sku ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{euros(it.units * (it.subtotal ?? 0))}</td>
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
    </Modal>
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
