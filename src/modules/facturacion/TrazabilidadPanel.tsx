import { useMemo, useState } from 'react'
import { Link2, Loader2, Search, Sparkles, Undo2, X } from 'lucide-react'

import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  useAnularTraza,
  useAsignarTrazaManual,
  useComprasCandidatas,
  useTrazarBorrador,
  useTrazasBorrador,
} from './lib/queries'
import type {
  BorradorResumen,
  CompraCandidata,
  EstadoTraza,
  Traza,
  TrazaLineaEstado,
} from './lib/types'

const ESTADO: Record<EstadoTraza, [string, string]> = {
  completa: ['TRAZADA', 'border-[var(--mint)]/40 bg-[var(--mint-glow)] text-[var(--mint)]'],
  lote_sin_cantidad: ['SOLO LOTE', 'ao-chip-amber'],
  parcial: ['PARCIAL', 'ao-chip-amber'],
  sin_traza: ['SIN TRAZA', 'border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[var(--coral)]'],
}

function EstadoTrazaBadge({ estado }: { estado: EstadoTraza }) {
  const [texto, clase] = ESTADO[estado]
  return (
    <span className={cn('inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold', clase)}>
      {texto}
    </span>
  )
}

function fechaCorta(value: string): string {
  const [y, m, d] = value.split('-')
  return d ? `${d}/${m}/${y.slice(2)}` : value
}

/** Una traza: lo que se enseñaría a un inspector. */
function TrazaFila({
  traza,
  bloqueado,
  onAnular,
}: {
  traza: Traza
  bloqueado: boolean
  onAnular: (traza: Traza) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-[var(--line)]/60 px-2 py-1 text-[10px]">
      <span className="font-mono font-semibold text-[var(--ink)]">{traza.lote ?? 'sin lote'}</span>
      <span className="text-[var(--ink-mute)]">
        {traza.proveedor_nombre}
        {traza.num_factura ? ` · ${traza.num_factura}` : ''} · {fechaCorta(traza.fecha_compra)}
      </span>
      {traza.origen && <span className="text-[var(--ink-mute)]">· {traza.origen}</span>}
      <span className="tabular-nums text-[var(--ink)]">
        {traza.alcance === 'cantidad'
          ? `${traza.cantidad_imputada} ${traza.unidad}`
          : 'sin cantidad'}
      </span>
      <span className={cn(
        'uppercase',
        traza.confianza === 'alta' ? 'text-[var(--mint)]' : 'text-[var(--amber)]',
      )}>
        {traza.metodo === 'manual' ? 'manual' : 'auto'} · {traza.confianza}
      </span>
      {!bloqueado && (
        <button
          type="button"
          onClick={() => onAnular(traza)}
          className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-[var(--ink-mute)] hover:bg-white/[.04] hover:text-[var(--coral)]"
        >
          <Undo2 className="h-3 w-3" /> Anular
        </button>
      )}
    </div>
  )
}

/** Buscador de líneas de compra para asignar un lote a mano. */
function AsignarLoteModal({
  linea,
  borradorId,
  fechaOperacion,
  onClose,
}: {
  linea: TrazaLineaEstado
  borradorId: string
  fechaOperacion: string
  onClose: () => void
}) {
  const [texto, setTexto] = useState(linea.descripcion.split(' ')[0] ?? '')
  const candidatas = useComprasCandidatas(texto, fechaOperacion)
  const asignar = useAsignarTrazaManual()
  const pendiente = Math.max(linea.cantidad - linea.cantidad_trazada, 0)

  const asignarCompra = async (compra: CompraCandidata) => {
    try {
      const resultado = await asignar.mutateAsync({
        borradorId,
        borradorLineaId: linea.borrador_linea_id,
        unidadVenta: linea.unidad,
        cantidadPendiente: pendiente,
        compra,
      })
      toast({
        title: 'Lote asignado',
        description: resultado.imputaCantidad
          ? `${resultado.cantidad} ${compra.unidad} imputados al lote ${compra.lote ?? 'sin lote'}.`
          : `Unidades distintas (${compra.unidad} comprada, ${linea.unidad} vendida): enlazado al lote sin cantidad.`,
        variant: 'success',
      })
      onClose()
    } catch (error) {
      toast({ title: 'No se pudo asignar', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="2xl" ariaLabel="Asignar lote">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Asignar lote · {linea.descripcion}</h3>
          <div className="mt-0.5 text-[10px] text-[var(--ink-mute)]">
            {linea.cantidad} {linea.unidad} vendidos · pendiente de imputar {pendiente} {linea.unidad}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="rounded-md p-2 text-[var(--ink-mute)] hover:bg-white/[.04] hover:text-[var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ink-mute)]" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar en las compras (mínimo 3 letras)"
            className="h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-[var(--ink-mute)]">
          Compras de los 30 días anteriores a la operación. Se busca por el texto del
          proveedor, no por producto: si el automático falló suele ser porque ese
          nombre no cuadra con ningún alias.
        </p>

        {candidatas.isLoading && (
          <div className="flex items-center gap-2 py-4 text-xs text-[var(--ink-mute)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
          </div>
        )}
        {candidatas.data?.length === 0 && (
          <div className="py-4 text-xs text-[var(--ink-mute)]">
            Ninguna línea de compra coincide. Prueba con otra palabra o revisa que la
            factura de compra esté subida.
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto">
          {(candidatas.data ?? []).map((compra) => {
            const mismaUnidad = compra.unidad === linea.unidad
            return (
              <button
                key={compra.compra_linea_id}
                type="button"
                disabled={asignar.isPending}
                onClick={() => void asignarCompra(compra)}
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-[var(--line)] px-2 py-1.5 text-left text-[11px] hover:bg-white/[.04] disabled:opacity-50"
              >
                <span className="font-semibold text-[var(--ink)]">{compra.descripcion}</span>
                <span className="font-mono text-[10px] text-[var(--ink)]">{compra.lote ?? 'sin lote'}</span>
                <span className="text-[10px] text-[var(--ink-mute)]">
                  {compra.proveedor_nombre}
                  {compra.num_factura ? ` · ${compra.num_factura}` : ''} · {fechaCorta(compra.fecha_compra)}
                </span>
                <span className={cn(
                  'ml-auto shrink-0 tabular-nums text-[10px]',
                  mismaUnidad ? 'text-[var(--mint)]' : 'text-[var(--amber)]',
                )}>
                  {mismaUnidad
                    ? `${compra.cantidad_disponible} ${compra.unidad} libres`
                    : `${compra.unidad} ≠ ${linea.unidad} · solo lote`}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export function TrazabilidadPanel({
  row,
  bloqueado,
}: {
  row: BorradorResumen
  bloqueado: boolean
}) {
  const trazasQuery = useTrazasBorrador(row.borrador_id)
  const trazar = useTrazarBorrador()
  const anular = useAnularTraza()
  const [asignando, setAsignando] = useState<TrazaLineaEstado | null>(null)
  const [anulando, setAnulando] = useState<Traza | null>(null)
  const [motivo, setMotivo] = useState('')

  const estados = useMemo(
    () => (trazasQuery.data?.estados ?? []).slice().sort((a, b) => a.descripcion.localeCompare(b.descripcion)),
    [trazasQuery.data],
  )
  const porLinea = useMemo(() => {
    const mapa = new Map<string, Traza[]>()
    for (const traza of trazasQuery.data?.trazas ?? []) {
      const actuales = mapa.get(traza.borrador_linea_id) ?? []
      actuales.push(traza)
      mapa.set(traza.borrador_linea_id, actuales)
    }
    return mapa
  }, [trazasQuery.data])

  const sinTraza = estados.filter((e) => e.estado_traza === 'sin_traza').length
  const soloLote = estados.filter((e) => e.estado_traza === 'lote_sin_cantidad').length
  const completas = estados.filter((e) => e.estado_traza === 'completa').length

  const lanzarAuto = async () => {
    try {
      const resultado = await trazar.mutateAsync({ borradorId: row.borrador_id })
      toast({
        title: `Trazabilidad resuelta · ${resultado.creadas} traza(s)`,
        description: resultado.sinTraza > 0
          ? `Quedan ${resultado.sinTraza} línea(s) sin traza: asígnalas a mano.`
          : 'Todas las líneas tienen trazabilidad.',
        variant: resultado.sinTraza > 0 ? 'error' : 'success',
      })
    } catch (error) {
      toast({ title: 'No se pudo trazar', description: errorMessage(error), variant: 'error' })
    }
  }

  const confirmarAnulacion = async () => {
    if (!anulando || motivo.trim().length < 3) return
    try {
      await anular.mutateAsync({ borradorId: row.borrador_id, traza: anulando, motivo })
      toast({ title: 'Traza anulada', description: 'Queda registrada junto a la anulación.', variant: 'success' })
      setAnulando(null)
      setMotivo('')
    } catch (error) {
      toast({ title: 'No se pudo anular', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="ao-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-[var(--ink-mute)]" />
          <span className="text-xs font-semibold text-[var(--ink)]">Trazabilidad</span>
          <span className="text-[10px] tabular-nums text-[var(--ink-mute)]">
            {completas} trazadas · {soloLote} solo lote ·{' '}
            <span className={sinTraza ? 'font-semibold text-[var(--coral)]' : ''}>{sinTraza} sin traza</span>
          </span>
        </div>
        {!bloqueado && (
          <Button variant="outline" size="sm" disabled={trazar.isPending} onClick={() => void lanzarAuto()}>
            {trazar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Trazar automático
          </Button>
        )}
      </div>

      {sinTraza > 0 && (
        <div className="border-b border-[var(--line)] bg-[var(--coral)]/10 px-3 py-1.5 text-[10px] text-[var(--coral)]">
          La revisión no se puede cerrar mientras haya líneas sin traza.
        </div>
      )}

      <div className="divide-y divide-[var(--line)]">
        {estados.map((linea) => {
          const trazas = porLinea.get(linea.borrador_linea_id) ?? []
          return (
            <div key={linea.borrador_linea_id} className="px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <EstadoTrazaBadge estado={linea.estado_traza} />
                <span className="text-xs text-[var(--ink)]">{linea.descripcion}</span>
                <span className="text-[10px] tabular-nums text-[var(--ink-mute)]">
                  {linea.cantidad} {linea.unidad}
                  {linea.estado_traza === 'parcial'
                    ? ` · trazados ${linea.cantidad_trazada}`
                    : ''}
                </span>
                {!bloqueado && (
                  <button
                    type="button"
                    onClick={() => setAsignando(linea)}
                    className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-[var(--ink-mute)] hover:bg-white/[.04] hover:text-[var(--ink)]"
                  >
                    Asignar lote
                  </button>
                )}
              </div>
              {trazas.map((traza) => (
                <TrazaFila
                  key={traza.id}
                  traza={traza}
                  bloqueado={bloqueado}
                  onAnular={(t) => { setAnulando(t); setMotivo('') }}
                />
              ))}
            </div>
          )
        })}
        {trazasQuery.isLoading && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--ink-mute)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando trazabilidad…
          </div>
        )}
      </div>

      {anulando && (
        <div className="space-y-1.5 border-t border-[var(--line)] px-3 py-2">
          <div className="text-[10px] text-[var(--ink-mute)]">
            Anular el lote {anulando.lote ?? 'sin lote'} de {anulando.proveedor_nombre}. La traza no se
            borra: queda con su anulación y el motivo.
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (obligatorio)"
              className="h-8 text-xs"
            />
            <Button size="sm" disabled={motivo.trim().length < 3 || anular.isPending} onClick={() => void confirmarAnulacion()}>
              {anular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirmar
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAnulando(null); setMotivo('') }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {asignando && (
        <AsignarLoteModal
          linea={asignando}
          borradorId={row.borrador_id}
          fechaOperacion={row.fecha_operacion}
          onClose={() => setAsignando(null)}
        />
      )}
    </div>
  )
}
