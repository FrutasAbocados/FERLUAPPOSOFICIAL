import { useState } from 'react'
import { Download, Loader2, Search, X } from 'lucide-react'

import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { useRetirada } from './lib/queries'
import type { RetiradaFila, RetiradaFiltros } from './lib/types'

const CSV_CABECERA = [
  'lote', 'origen', 'proveedor', 'factura_compra', 'fecha_compra', 'producto_compra',
  'cliente', 'documento', 'fecha_venta', 'producto_venta', 'cantidad_vendida',
  'unidad', 'alcance', 'cantidad_imputada', 'unidad_imputada', 'confianza', 'metodo',
  'revision_cerrada',
]

function aCsv(filas: RetiradaFila[]): string {
  const escapar = (valor: unknown) => `"${String(valor ?? '').replace(/"/g, '""')}"`
  const lineas = filas.map((f) => [
    f.lote, f.origen, f.proveedor_nombre, f.num_factura, f.fecha_compra, f.descripcion_compra,
    f.cliente_comercial ?? f.cliente_nombre, `B-${f.numero_interno}`, f.fecha_operacion,
    f.descripcion_venta, f.cantidad_vendida, f.unidad_venta, f.alcance, f.cantidad_imputada,
    f.unidad_imputada, f.confianza, f.metodo, f.revision_cerrada ? 'si' : 'no',
  ].map(escapar).join(';'))
  return [CSV_CABECERA.join(';'), ...lineas].join('\n')
}

/**
 * Paso adelante del Reglamento 178/2002: de un lote o una factura de compra a
 * los clientes que lo recibieron. Es la consulta de una inspección o de una
 * alerta sanitaria, y hay que poder entregarla por escrito.
 */
export function RetiradaModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<RetiradaFiltros>({ lote: '', numFactura: '', proveedor: '', desde: '', hasta: '' })
  const [filtros, setFiltros] = useState<RetiradaFiltros | null>(null)
  const hayFiltro = Boolean(form.lote?.trim() || form.numFactura?.trim() || form.proveedor?.trim())
  const consulta = useRetirada(filtros ?? {}, filtros !== null)

  const filas = consulta.data ?? []
  const clientes = new Set(filas.map((f) => f.cliente_nombre)).size

  const descargar = () => {
    try {
      const blob = new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      const sello = new Date().toISOString().slice(0, 10)
      enlace.href = url
      enlace.download = `retirada-${filtros?.lote || filtros?.numFactura || 'trazabilidad'}-${sello}.csv`
      enlace.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast({ title: 'No se pudo descargar', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="3xl" ariaLabel="Retirada por lote">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">Retirada · a dónde fue un lote</h2>
          <div className="mt-0.5 text-[10px] text-[var(--ink-mute)]">
            Lote, factura de compra o proveedor → clientes, documentos y cantidades
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="rounded-md p-2 text-[var(--ink-mute)] hover:bg-white/[.04] hover:text-[var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input value={form.lote ?? ''} onChange={(e) => setForm({ ...form, lote: e.target.value })}
            placeholder="Lote exacto" className="h-8 text-xs" aria-label="Lote" />
          <Input value={form.numFactura ?? ''} onChange={(e) => setForm({ ...form, numFactura: e.target.value })}
            placeholder="Nº factura compra" className="h-8 text-xs" aria-label="Número de factura de compra" />
          <Input value={form.proveedor ?? ''} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
            placeholder="Proveedor" className="h-8 text-xs" aria-label="Proveedor" />
          <Input type="date" value={form.desde ?? ''} onChange={(e) => setForm({ ...form, desde: e.target.value })}
            className="h-8 text-xs" aria-label="Venta desde" />
          <Input type="date" value={form.hasta ?? ''} onChange={(e) => setForm({ ...form, hasta: e.target.value })}
            className="h-8 text-xs" aria-label="Venta hasta" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!hayFiltro || consulta.isFetching} onClick={() => setFiltros({ ...form })}>
            {consulta.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </Button>
          {filas.length > 0 && (
            <Button variant="outline" size="sm" onClick={descargar}>
              <Download className="h-3.5 w-3.5" /> Descargar CSV
            </Button>
          )}
          {filtros && !consulta.isFetching && (
            <span className="text-[10px] tabular-nums text-[var(--ink-mute)]">
              {filas.length} línea(s) · {clientes} cliente(s)
            </span>
          )}
          {!hayFiltro && (
            <span className="text-[10px] text-[var(--ink-mute)]">
              Indica al menos lote, factura o proveedor: un listado completo no es una retirada.
            </span>
          )}
        </div>

        {consulta.error && (
          <div className="text-xs text-[var(--coral)]">No se pudo consultar: {errorMessage(consulta.error)}</div>
        )}

        {filtros && !consulta.isFetching && filas.length === 0 && (
          <div className="py-6 text-center text-xs text-[var(--ink-mute)]">
            Ninguna venta trazada a ese lote. Ojo: solo aparecen las ventas con traza
            registrada, no las anteriores a que existiera la trazabilidad.
          </div>
        )}

        {filas.length > 0 && (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full min-w-[900px] text-[11px]">
              <thead className="sticky top-0 bg-[var(--panel)] text-left text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">
                <tr>
                  <th className="px-2 py-1.5">Lote / compra</th>
                  <th className="px-2 py-1.5">Cliente</th>
                  <th className="px-2 py-1.5">Documento</th>
                  <th className="px-2 py-1.5">Producto vendido</th>
                  <th className="px-2 py-1.5 text-right">Cantidad</th>
                  <th className="px-2 py-1.5">Traza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filas.map((fila) => (
                  <tr key={fila.traza_id} className="text-[var(--ink-dim)]">
                    <td className="px-2 py-1.5">
                      <div className="font-mono font-semibold text-[var(--ink)]">{fila.lote ?? 'sin lote'}</div>
                      <div className="text-[9px] text-[var(--ink-mute)]">
                        {fila.proveedor_nombre}{fila.num_factura ? ` · ${fila.num_factura}` : ''} · {fila.fecha_compra}
                        {fila.origen ? ` · ${fila.origen}` : ''}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-2 py-1.5">
                      <div className="truncate text-[var(--ink)]">{fila.cliente_comercial ?? fila.cliente_nombre}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-mono text-[var(--ink)]">B-{fila.numero_interno}</div>
                      <div className="text-[9px] tabular-nums text-[var(--ink-mute)]">{fila.fecha_operacion}</div>
                    </td>
                    <td className="max-w-[220px] px-2 py-1.5">
                      <div className="truncate">{fila.descripcion_venta}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink)]">
                      {fila.cantidad_vendida} {fila.unidad_venta}
                      {fila.alcance === 'cantidad' && (
                        <div className="text-[9px] text-[var(--ink-mute)]">
                          imputados {fila.cantidad_imputada} {fila.unidad_imputada}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn(
                        'text-[9px] font-semibold uppercase',
                        fila.alcance === 'cantidad' ? 'text-[var(--mint)]' : 'text-[var(--amber)]',
                      )}>
                        {fila.alcance === 'cantidad' ? 'con cantidad' : 'solo lote'}
                      </span>
                      <div className="text-[9px] text-[var(--ink-mute)]">
                        {fila.metodo === 'manual' ? 'manual' : 'auto'} · {fila.confianza}
                        {fila.revision_cerrada ? ' · cerrada' : ''}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}
