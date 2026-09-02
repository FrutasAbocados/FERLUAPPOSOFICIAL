import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Eraser,
  List,
  Plus,
  GraduationCap,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { UNIDAD_LABEL, type UnidadLimpia } from '../lib/limpiar-pedido/diccionario'
import {
  deducirAprendizaje,
  useDiccionarioAprendido,
  useGuardarAprendizaje,
} from '../lib/limpiar-pedido/aprendizaje'
import {
  formatCantidadNumero,
  formatForExcel,
  formatForList,
  procesarPedido,
  type LineaLimpia,
} from '../lib/limpiar-pedido/engine'

const UNIDADES = Object.keys(UNIDAD_LABEL) as UnidadLimpia[]

const EJEMPLO = `1 c banana amarilla
1 bolsa zanahoria / 2 c naranja / 1 c piña / 2 c melon / 1 hierbabuena / 1 perejil
10 c aguacate / 10 ajo pelado / 3 canonigos / 1 cebollino / 3 mezclum
COBRAR FACTURA SABADO`

type Copiado = 'excel' | 'lista' | null

/** Fila de la tabla. El id es local: sobrevive a borrados y reordenaciones. */
type Fila = LineaLimpia & { _id: string }

let contadorFilas = 0
const nuevaFila = (l: LineaLimpia): Fila => ({ ...l, _id: `f${++contadorFilas}` })

/**
 * Herramienta "Limpiar pedido para Excel".
 *
 * Pegar texto bruto → procesar → revisar/editar → copiar TSV a Excel.
 * Toda la lógica vive en `lib/limpiar-pedido/engine.ts`; aquí sólo hay UI.
 */
export function LimpiarPedidoExcel() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        <Table2 className="h-3.5 w-3.5" />
        Limpiar pedido para Excel
      </Button>
      {abierto && <LimpiarPedidoModal onClose={() => setAbierto(false)} />}
    </>
  )
}

function LimpiarPedidoModal({ onClose }: { onClose: () => void }) {
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  // Cómo salió cada fila del parser, para saber qué ha cambiado a mano.
  const [originales, setOriginales] = useState<Map<string, LineaLimpia>>(new Map())
  const [aprendido, setAprendido] = useState<string | null>(null)
  const [notas, setNotas] = useState<string[]>([])
  const [noReconocidos, setNoReconocidos] = useState<string[]>([])
  const [encabezados, setEncabezados] = useState(false)
  const [copiado, setCopiado] = useState<Copiado>(null)

  const { data: diccionario } = useDiccionarioAprendido()
  const guardarAprendizaje = useGuardarAprendizaje()

  useEffect(() => {
    if (!copiado) return
    const id = setTimeout(() => setCopiado(null), 2200)
    return () => clearTimeout(id)
  }, [copiado])

  useEffect(() => {
    if (!aprendido) return
    const id = setTimeout(() => setAprendido(null), 3200)
    return () => clearTimeout(id)
  }, [aprendido])

  const aRevisar = useMemo(() => filas?.filter(f => f.revisar).length ?? 0, [filas])

  const procesar = () => {
    const t = texto.trim()
    if (!t) {
      toast({ title: 'Pega primero el pedido', variant: 'error' })
      return
    }
    const r = procesarPedido(t, diccionario)
    const conId = r.lineas.map(nuevaFila)
    setFilas(conId)
    setOriginales(new Map(conId.map(f => [f._id, { ...f }])))
    setNotas(r.notas)
    setNoReconocidos(r.noReconocidos)
    if (r.lineas.length === 0) {
      toast({
        title: 'No se detectó ningún producto',
        description: 'Cada producto necesita una cantidad delante. Revisa el texto.',
        variant: 'error',
      })
    }
  }

  const limpiar = () => {
    setTexto('')
    setFilas(null)
    setOriginales(new Map())
    setNotas([])
    setNoReconocidos([])
  }

  const editar = (id: string, patch: Partial<LineaLimpia>) => {
    setFilas(prev => prev && prev.map(f => (f._id === id ? { ...f, ...patch } : f)))
  }

  const eliminarFila = (id: string) => {
    setFilas(prev => prev && prev.filter(f => f._id !== id))
  }

  const anadirFila = () => {
    setFilas(prev => [
      ...(prev ?? []),
      nuevaFila({
        producto: '', cantidad: 1, unidad: 'caja', revisar: true,
        origen: 'manual', clavesRaw: [], unidadExplicita: true,
      }),
    ])
  }

  /**
   * Se llama al confirmar una edición (blur del nombre, cambio de formato).
   * Compara con cómo salió del parser y graba lo que se pueda aprender, para
   * que el próximo pedido ya salga bien sin tocar nada.
   */
  const aprender = (id: string, fila: Fila) => {
    const original = originales.get(id)
    if (!original) return

    const a = deducirAprendizaje(original, fila)
    if (a.aliases.length === 0 && a.unidades.length === 0) return

    guardarAprendizaje.mutate(a, {
      onSuccess: () => {
        // El original pasa a ser lo corregido: no se reaprende lo mismo.
        setOriginales(prev => new Map(prev).set(id, { ...fila }))
        setFilas(prev => prev && prev.map(f => (f._id === id ? { ...f, revisar: false } : f)))
        const que = a.aliases.length > 0
          ? `${a.aliases.map(x => x.alias).join(', ')} → ${fila.producto}`
          : `${fila.producto} → ${UNIDAD_LABEL[fila.unidad].uno}`
        setAprendido(que)
      },
      onError: (e: Error) => toast({
        title: 'No se pudo guardar el aprendizaje',
        description: e.message,
        variant: 'error',
      }),
    })
  }

  const copiar = async (modo: Exclude<Copiado, null>) => {
    const listas = (filas ?? []).filter(f => f.producto.trim())
    if (listas.length === 0) {
      toast({ title: 'No hay filas que copiar', variant: 'error' })
      return
    }
    const txt = modo === 'excel' ? formatForExcel(listas, encabezados) : formatForList(listas)
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(modo)
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Selecciona el texto y cópialo manualmente.',
        variant: 'error',
      })
    }
  }

  return (
    <Modal onClose={onClose} size="3xl" ariaLabel="Limpiar pedido para Excel">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
            <Table2 className="h-4 w-4 text-[var(--mint)]" />
            Limpiar pedido para Excel
          </h2>
          <p className="mono mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            Pegar · procesar · revisar · copiar
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--ink-mute)] hover:bg-[rgba(255,255,255,.06)] hover:text-[var(--ink)]"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 p-4">
        {/* 1 · Entrada */}
        <section>
          <label
            htmlFor="limpiar-pedido-bruto"
            className="mono mb-1 block text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]"
          >
            Pega aquí el pedido bruto
          </label>
          <textarea
            id="limpiar-pedido-bruto"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                procesar()
              }
            }}
            rows={7}
            spellCheck={false}
            placeholder={EJEMPLO}
            className="block w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,255,255,.02)] p-2 font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--ink-mute)]">
              Acepta “/”, saltos de línea, tabulaciones, tablas y texto de WhatsApp. ⌘/Ctrl + Enter procesa.
            </span>
            <div className="flex gap-1.5">
              {texto && (
                <Button size="sm" variant="ghost" onClick={limpiar}>
                  <Eraser className="h-3.5 w-3.5" /> Vaciar
                </Button>
              )}
              <Button size="sm" onClick={procesar} disabled={!texto.trim()}>
                <Sparkles className="h-3.5 w-3.5" /> Procesar pedido
              </Button>
            </div>
          </div>
        </section>

        {/* 2 · Resultado editable */}
        {filas && (
          <section className="space-y-2">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink)]">
                <List className="h-4 w-4 text-[var(--mint)]" />
                Lista unificada
                <span className="mono tabular-nums text-[11px] text-[var(--ink-mute)]">
                  {filas.length} {filas.length === 1 ? 'producto' : 'productos'}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                {aprendido && (
                  <span className="mono inline-flex max-w-[22rem] items-center gap-1 truncate rounded-full border border-[var(--mint-glow)] bg-[var(--mint-glow)] px-2 py-0.5 text-[10px] text-[var(--mint)]" title={aprendido}>
                    <GraduationCap className="h-3 w-3 shrink-0" />
                    Aprendido: {aprendido}
                  </span>
                )}
                {aRevisar > 0 && (
                  <span className="mono inline-flex items-center gap-1 rounded-full border border-[oklch(75%_.15_75_/_0.35)] bg-[oklch(35%_.10_75_/_0.22)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--amber)]">
                    <AlertTriangle className="h-3 w-3" />
                    {aRevisar} por revisar
                  </span>
                )}
              </div>
            </header>

            <p className="text-[11px] text-[var(--ink-mute)]">
              Corrige aquí lo que esté mal: el nombre y el formato se guardan y se aplican solos
              en los próximos pedidos. El formato sólo se aprende cuando el pedido no lo escribía —
              si el texto decía “2 c melón”, la “c” seguirá mandando.
            </p>

            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[rgba(255,255,255,.025)]">
                    <Th className="w-[45%]">Producto</Th>
                    <Th className="w-[18%]">Cantidad</Th>
                    <Th className="w-[27%]">Formato</Th>
                    <Th className="w-[10%]" />
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-[var(--ink-mute)]">
                        Sin productos. Añade una fila manualmente si hace falta.
                      </td>
                    </tr>
                  )}
                  {filas.map((f, i) => (
                    <tr
                      key={f._id}
                      className={cn(
                        'border-b border-[var(--line)] last:border-0',
                        f.revisar && 'bg-[oklch(35%_.10_75_/_0.12)]',
                      )}
                    >
                      <td className="px-1 py-0.5">
                        <CellInput
                          value={f.producto}
                          onChange={v => editar(f._id, { producto: v })}
                          onBlur={() => aprender(f._id, f)}
                          placeholder="Producto"
                          aria-label={`Producto fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <CellInput
                          value={formatCantidadNumero(f.cantidad)}
                          onChange={v => {
                            const n = Number.parseFloat(v.replace(',', '.'))
                            editar(f._id, { cantidad: Number.isFinite(n) && n > 0 ? n : 0 })
                          }}
                          className="tabular-nums"
                          inputMode="decimal"
                          aria-label={`Cantidad fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <select
                          value={f.unidad}
                          onChange={e => {
                            const unidad = e.target.value as UnidadLimpia
                            editar(f._id, { unidad })
                            // No se puede leer del estado aquí: React todavía no
                            // ha re-renderizado. Se pasa la fila ya actualizada.
                            aprender(f._id, { ...f, unidad })
                          }}
                          aria-label={`Formato fila ${i + 1}`}
                          className="w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-sm text-[var(--ink)] hover:border-[var(--line)] focus-visible:border-[var(--mint)] focus-visible:outline-none"
                        >
                          {UNIDADES.map(u => (
                            <option key={u} value={u} className="bg-[var(--panel)] text-[var(--ink)]">
                              {f.cantidad === 1 ? UNIDAD_LABEL[u].uno : UNIDAD_LABEL[u].varios}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-0.5 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarFila(f._id)}
                          className="rounded-md p-1 text-[var(--ink-mute)] hover:bg-[oklch(30%_.12_25_/_0.18)] hover:text-[var(--coral)]"
                          aria-label={`Eliminar ${f.producto || `fila ${i + 1}`}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button size="sm" variant="ghost" onClick={anadirFila}>
              <Plus className="h-3.5 w-3.5" /> Añadir fila
            </Button>

            {/* 3 · Lo que el parser NO metió en la lista */}
            {(notas.length > 0 || noReconocidos.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {notas.length > 0 && (
                  <Descartes
                    titulo="Notas ignoradas"
                    detalle="No son producto. No entran en la lista."
                    items={notas}
                  />
                )}
                {noReconocidos.length > 0 && (
                  <Descartes
                    titulo="Sin cantidad"
                    detalle="No se inventa la cantidad. Añádelos a mano si hacen falta."
                    items={noReconocidos}
                  />
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* 4 · Copiar */}
      {filas && (
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--ink-dim)]">
            <input
              type="checkbox"
              checked={encabezados}
              onChange={e => setEncabezados(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--mint)]"
            />
            Incluir encabezados
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => copiar('lista')}>
              {copiado === 'lista' ? <Check className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              {copiado === 'lista' ? '✓ Copiado' : 'Copiar lista'}
            </Button>
            <Button size="sm" onClick={() => copiar('excel')}>
              {copiado === 'excel' ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copiado === 'excel' ? '✓ Copiado para Excel' : 'Copiar para Excel'}
            </Button>
          </div>
        </footer>
      )}
    </Modal>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'mono px-2 py-1.5 text-left text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--ink-mute)]',
        className,
      )}
    >
      {children}
    </th>
  )
}

function CellInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-sm text-[var(--ink)] hover:border-[var(--line)] focus-visible:border-[var(--mint)] focus-visible:outline-none',
        className,
      )}
    />
  )
}

function Descartes({ titulo, detalle, items }: { titulo: string; detalle: string; items: string[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] p-2">
      <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">
        {titulo} · <span className="tabular-nums">{items.length}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">{detalle}</p>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((n, i) => (
          <li key={`${n}-${i}`} className="truncate font-mono text-[11px] text-[var(--ink-dim)]" title={n}>
            {n}
          </li>
        ))}
      </ul>
    </div>
  )
}
