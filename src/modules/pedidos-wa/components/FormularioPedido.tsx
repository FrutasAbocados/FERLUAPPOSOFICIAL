import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Save, Sparkles, X } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { parsearPedido } from '../lib/parser'
import { useCrearPedido } from '../lib/queries'
import {
  REPARTIDOR_LABEL,
  UNIDAD_LABEL,
  type ClientePedido,
  type LineaParseada,
} from '../lib/types'
import { LineaEditor } from './LineaEditor'
import { SelectorCliente } from './SelectorCliente'

type Props = {
  fecha?: string
  onCreado?: (pedidoId: string) => void
}

export function FormularioPedido({ fecha, onCreado }: Props) {
  const fechaIso = fecha ?? format(new Date(), 'yyyy-MM-dd')

  const [cliente, setCliente] = useState<ClientePedido | null>(null)
  const [texto, setTexto] = useState('')
  const [parseando, setParseando] = useState(false)
  const [notasAdmin, setNotasAdmin] = useState<string | null>(null)
  const [lineas, setLineas] = useState<LineaParseada[]>([])
  const [faltas, setFaltas] = useState('')
  const [parsed, setParsed] = useState(false)

  const crear = useCrearPedido()

  const subsecciones = useMemo(() => {
    const set = new Set<string>()
    for (const l of lineas) if (l.subseccion) set.add(l.subseccion)
    return Array.from(set)
  }, [lineas])

  const reset = () => {
    setCliente(null)
    setTexto('')
    setNotasAdmin(null)
    setLineas([])
    setFaltas('')
    setParsed(false)
  }

  const onParsear = async () => {
    if (!cliente) {
      toast({ title: 'Selecciona un cliente', variant: 'error' })
      return
    }
    if (!texto.trim()) {
      toast({ title: 'Pega el mensaje de WhatsApp', variant: 'error' })
      return
    }
    setParseando(true)
    try {
      const r = await parsearPedido(texto, cliente.nombre)
      const conSubseccion = r.lineas.map(l => ({
        ...l,
        subseccion: l.subseccion ?? cliente.subseccion_default ?? null,
      }))
      setNotasAdmin(r.notasAdmin)
      setLineas(conSubseccion)
      setParsed(true)
      const conIA = conSubseccion.filter(l => l.metodo !== 'regex').length
      const total = conSubseccion.length
      toast({
        title: `Parseado: ${total} líneas`,
        description: conIA > 0
          ? `${total - conIA} via regex · ${conIA} via IA / manual`
          : 'Todas via regex',
        variant: 'success',
      })
    } catch (e) {
      toast({
        title: 'Error al parsear',
        description: e instanceof Error ? e.message : 'Inesperado',
        variant: 'error',
      })
    } finally {
      setParseando(false)
    }
  }

  const onAgregarLinea = () => {
    setLineas(prev => [
      ...prev,
      {
        orden: (prev.at(-1)?.orden ?? 0) + 1,
        cantidad: 1,
        unidad: 'unidad',
        producto: '',
        productoRaw: '',
        subseccion: null,
        notas: null,
        esGratis: false,
        metodo: 'manual',
      },
    ])
  }

  const onGuardar = async () => {
    if (!cliente) {
      toast({ title: 'Selecciona un cliente', variant: 'error' })
      return
    }
    const lineasValidas = lineas.filter(l => l.producto.trim())
    if (lineasValidas.length === 0) {
      toast({ title: 'Sin líneas que guardar', variant: 'error' })
      return
    }
    try {
      const r = await crear.mutateAsync({
        cliente_id: cliente.id,
        fecha: fechaIso,
        texto_original: texto,
        notas_admin: notasAdmin,
        faltas: faltas.trim() || null,
        lineas: lineasValidas.map((l, i) => ({ ...l, orden: i + 1 })),
      })
      toast({ title: 'Pedido guardado', variant: 'success' })
      reset()
      onCreado?.(r.pedido_id)
    } catch (e) {
      toast({
        title: 'No se pudo guardar',
        description: e instanceof Error ? e.message : 'Inesperado',
        variant: 'error',
      })
    }
  }

  const lineasOrdenadas = useMemo(() => {
    if (subsecciones.length === 0) return [{ nombre: null as string | null, items: lineas }]
    const grupos: { nombre: string | null; items: LineaParseada[] }[] = []
    const principales = lineas.filter(l => !l.subseccion)
    if (principales.length > 0) grupos.push({ nombre: null, items: principales })
    for (const sub of subsecciones) {
      grupos.push({ nombre: sub, items: lineas.filter(l => l.subseccion === sub) })
    }
    return grupos
  }, [lineas, subsecciones])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="space-y-2">
        <Label htmlFor="cliente-search">Cliente</Label>
        {cliente ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-primary-soft)] bg-[var(--color-primary-soft)]/40 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {cliente.nombre}
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--color-ink-3)]">
                {REPARTIDOR_LABEL[cliente.repartidor]}
                {cliente.horario && ` · ${cliente.horario}`}
                {cliente.tipo_factura !== 'HOLDED' && ` · ${cliente.tipo_factura}`}
                {cliente.subseccion_default && ` · subcontacto fijo: ${cliente.subseccion_default}`}
              </div>
              {cliente.notas && (
                <div className="mt-1 flex items-start gap-1.5 rounded-[var(--radius-md)] bg-red-50 p-1.5 text-[11px] text-red-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{cliente.notas}</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCliente(null)} aria-label="Cambiar cliente">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <SelectorCliente value={cliente} onChange={setCliente} />
        )}
      </section>

      <section className="space-y-2">
        <Label htmlFor="texto-wa">Mensaje de WhatsApp</Label>
        <textarea
          id="texto-wa"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: 5 iceberg / 1/2 c berenjena / 1/2 c limon / 5 kg cebolla"
          rows={6}
          className="block w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-ink-3)]">
            Pega el texto tal cual. El parser extrae cantidades, unidades y notas.
          </p>
          <Button
            type="button"
            onClick={onParsear}
            disabled={parseando || !texto.trim() || !cliente}
            variant="primary"
            size="sm"
          >
            {parseando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />
            }
            {parseando ? 'Parseando…' : 'Parsear pedido'}
          </Button>
        </div>
      </section>

      {parsed && notasAdmin && (
        <section className="rounded-[var(--radius-md)] border-2 border-red-300 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-red-700">
                Notas administrativas
              </div>
              <div className="mt-1 whitespace-pre-line text-sm font-medium text-red-800">
                {notasAdmin}
              </div>
            </div>
          </div>
        </section>
      )}

      {parsed && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
              Pedido parseado · {lineas.length} línea{lineas.length === 1 ? '' : 's'}
            </h3>
            <Button variant="outline" size="sm" onClick={onAgregarLinea}>
              <Plus className="h-3.5 w-3.5" />
              Añadir
            </Button>
          </div>

          <div className="space-y-3">
            {lineasOrdenadas.map((grupo) => (
              <div key={grupo.nombre ?? '__main__'} className="space-y-2">
                {grupo.nombre && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--color-primary-2)]">
                      {grupo.nombre}
                    </span>
                    <div className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>
                )}
                {grupo.items.map((linea) => (
                  <LineaEditor
                    key={linea.orden}
                    linea={linea}
                    onChange={(next) =>
                      setLineas(prev => prev.map(l => l.orden === linea.orden ? next : l))
                    }
                    onRemove={() =>
                      setLineas(prev => prev.filter(l => l.orden !== linea.orden))
                    }
                  />
                ))}
              </div>
            ))}
            {lineas.length === 0 && (
              <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-ink-3)]">
                Sin líneas. Añade una manualmente o vuelve a parsear.
              </div>
            )}
          </div>
        </section>
      )}

      {parsed && (
        <section className="space-y-2">
          <Label htmlFor="faltas">Faltas (opcional)</Label>
          <Input
            id="faltas"
            value={faltas}
            onChange={(e) => setFaltas(e.target.value)}
            placeholder="Ej: faltó cherry y rúcula"
          />
        </section>
      )}

      {parsed && (
        <div className={cn(
          'sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:-mx-6 sm:px-6',
        )}>
          <Button variant="ghost" onClick={reset}>Cancelar</Button>
          <Button
            onClick={onGuardar}
            disabled={crear.isPending}
          >
            {crear.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            Guardar pedido
          </Button>
        </div>
      )}
    </div>
  )
}

// Re-export para que el page pueda mostrar tabla de unidades en otro contexto
export { UNIDAD_LABEL }
