import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Landmark, Loader2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { leerExtractoBbva, type ExtractoBanco } from './lib/banco/bbva'
import { payloadImportacion, sha256Hex } from './lib/banco/importar'
import { lineasDePdf } from './lib/banco/pdfLineas'
import { importarExtracto, useBancoConciliacion, type EstadoConciliacion, type FilaConciliacion } from './lib/banco/queries'

const ESTADOS: { key: EstadoConciliacion; label: string; color: string }[] = [
  { key: 'cuadra', label: 'Cuadra', color: 'var(--mint)' },
  { key: 'importe distinto', label: 'Importe distinto', color: 'var(--amber)' },
  { key: 'factura no encontrada', label: 'Factura no encontrada', color: 'var(--red, #e5484d)' },
  { key: 'sin referencia', label: 'Sin referencia', color: 'var(--ink-mute)' },
]

type Preparado = { extracto: ExtractoBanco; nombre: string; sha256: string }

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

async function exportarConciliacion(filas: FilaConciliacion[], desde: string, hasta: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transferencias recibidas', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Importe', key: 'importe', width: 12 },
    { header: 'Ordenante / concepto', key: 'concepto', width: 40 },
    { header: 'Referencia', key: 'detalle', width: 30 },
    { header: 'Facturas citadas', key: 'citadas', width: 20 },
    { header: 'Cliente (Holded)', key: 'cliente', width: 28 },
    { header: 'Total facturas', key: 'total', width: 14 },
    { header: 'Diferencia', key: 'dif', width: 12 },
    { header: 'Estado', key: 'estado', width: 20 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const f of filas) {
    ws.addRow({
      fecha: f.fecha,
      importe: f.importe,
      concepto: f.concepto,
      detalle: f.detalle,
      citadas: f.facturas_citadas.join(', '),
      cliente: [...new Set(f.facturas.map((x) => x.cliente).filter(Boolean))].join(', '),
      total: f.total_facturas,
      dif: f.diferencia,
      estado: f.estado,
    })
  }
  for (const k of ['importe', 'total', 'dif']) ws.getColumn(k).numFmt = '#,##0.00 €'
  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `banco-transferencias-${desde}_${hasta}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export function BancoPanel({ desde, hasta }: { desde: string; hasta: string }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [preparado, setPreparado] = useState<Preparado | null>(null)
  const [filtro, setFiltro] = useState<EstadoConciliacion | 'todas'>('todas')
  const query = useBancoConciliacion(desde, hasta, true)

  const resumen = useMemo(() => {
    const r = new Map<EstadoConciliacion, { n: number; total: number }>()
    for (const f of query.data ?? []) {
      const x = r.get(f.estado) ?? { n: 0, total: 0 }
      x.n += 1
      x.total += f.importe
      r.set(f.estado, x)
    }
    return r
  }, [query.data])
  const filas = (query.data ?? []).filter((f) => filtro === 'todas' || f.estado === filtro)

  const elegir = async (archivo: File | undefined) => {
    if (!archivo) return
    setLeyendo(true)
    try {
      const datos = await archivo.arrayBuffer()
      const [lineas, sha256] = await Promise.all([lineasDePdf(datos.slice(0)), sha256Hex(datos)])
      setPreparado({ extracto: leerExtractoBbva(lineas), nombre: archivo.name, sha256 })
    } catch (error) {
      toast({ title: 'No se pudo leer el extracto', description: errorMessage(error), variant: 'error' })
    } finally {
      setLeyendo(false)
      if (input.current) input.current.value = ''
    }
  }

  const importar = async () => {
    if (!preparado) return
    setImportando(true)
    try {
      const r = await importarExtracto(payloadImportacion(preparado.extracto, preparado.nombre, preparado.sha256))
      toast({ title: 'Extracto importado', description: `${r.nuevos} movimientos nuevos · ${r.repetidos} ya estaban`, variant: 'success' })
      setPreparado(null)
      await qc.invalidateQueries({ queryKey: ['gestoria', 'banco'] })
    } catch (error) {
      toast({ title: 'No se importó el extracto', description: errorMessage(error), variant: 'error' })
    } finally {
      setImportando(false)
    }
  }

  return (
    <section className="ao-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[var(--mint)]" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Banco · transferencias recibidas</h2>
          <span className="text-xs text-[var(--ink-mute)]">{fechaCorta(desde)} – {fechaCorta(hasta)}</span>
        </div>
        <div className="flex gap-2">
          <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => void elegir(e.target.files?.[0])} />
          <Button size="sm" variant="outline" disabled={leyendo || importando} onClick={() => input.current?.click()}>
            {leyendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            Importar extracto BBVA (PDF)
          </Button>
          <Button size="sm" variant="outline" disabled={!filas.length} onClick={() => void exportarConciliacion(filas, desde, hasta)}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {preparado && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel-2,var(--panel))] px-3 py-2 text-xs text-[var(--ink-dim)]">
          <span className="font-medium text-[var(--ink)]">{preparado.extracto.banco} …{preparado.extracto.iban.slice(-4)}</span>
          <span>{fechaCorta(preparado.extracto.desde)} – {fechaCorta(preparado.extracto.hasta)}</span>
          <span className="tabular-nums">{preparado.extracto.movimientos.length} movimientos</span>
          <span className="tabular-nums">Saldo {euros(preparado.extracto.saldoInicialCent / 100)} → {euros(preparado.extracto.saldoFinalCent / 100)}</span>
          <span className="text-[var(--mint)]">Saldos encadenados al céntimo</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={importando} onClick={() => setPreparado(null)}>Cancelar</Button>
            <Button size="sm" disabled={importando} onClick={() => void importar()}>
              {importando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Importar
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ESTADOS.map((e) => {
          const r = resumen.get(e.key)
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => setFiltro(filtro === e.key ? 'todas' : e.key)}
              className={cn('rounded-[var(--radius)] border px-3 py-2 text-left transition-colors', filtro === e.key ? 'border-[var(--mint)]' : 'border-[var(--line)]')}
            >
              <div className="micro-caps" style={{ color: e.color }}>{e.label}</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--ink)]">{r?.n ?? 0} · {euros(r?.total ?? 0)}</div>
            </button>
          )
        })}
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-[var(--ink-mute)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando movimientos…</div>
      ) : query.error ? (
        <div className="py-4 text-xs text-[var(--amber)]">{errorMessage(query.error)}</div>
      ) : filas.length === 0 ? (
        <div className="py-4 text-xs text-[var(--ink-mute)]">No hay transferencias recibidas en el periodo. Importa el extracto del banco.</div>
      ) : (
        <div className="max-h-[480px] overflow-auto rounded-[var(--radius)] border border-[var(--line)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--panel)] text-left text-[var(--ink-mute)]">
              <tr>
                <th className="px-2 py-1.5">Fecha</th>
                <th className="px-2 py-1.5 text-right">Importe</th>
                <th className="px-2 py-1.5">Ordenante · referencia</th>
                <th className="px-2 py-1.5">Facturas</th>
                <th className="px-2 py-1.5 text-right">Total facturas</th>
                <th className="px-2 py-1.5 text-right">Diferencia</th>
                <th className="px-2 py-1.5">En Cobros</th>
                <th className="px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const est = ESTADOS.find((e) => e.key === f.estado)
                const enCobros = f.facturas.filter((x) => !x.no_encontrada)
                return (
                  <tr key={f.movimiento_id} className="border-t border-[var(--line)] text-[var(--ink-dim)]">
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums">{fechaCorta(f.fecha)}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums text-[var(--ink)]">{euros(f.importe)}</td>
                    <td className="px-2 py-1">
                      <div className="text-[var(--ink)]">{f.concepto.replace(/^TRANSFERENCIAS\s*\|\s*/, '')}</div>
                      <div className="text-[var(--ink-mute)]">{f.detalle}</div>
                    </td>
                    <td className="px-2 py-1">
                      {f.facturas.length === 0 ? '—' : f.facturas.map((x) => (
                        <div key={x.numero} className={x.no_encontrada ? 'text-[var(--amber)]' : ''}>
                          {x.numero}{x.cliente ? ` · ${x.cliente}` : ''}{x.no_encontrada ? ' · no está en Holded' : ''}
                        </div>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{f.total_facturas == null ? '—' : euros(f.total_facturas)}</td>
                    <td className={cn('whitespace-nowrap px-2 py-1 text-right tabular-nums', f.diferencia && Math.abs(f.diferencia) >= 0.005 ? 'text-[var(--amber)]' : '')}>
                      {f.diferencia == null ? '—' : euros(f.diferencia)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {enCobros.length === 0 ? '—' : enCobros.every((x) => x.cobrada_en_cobros) ? 'Cobrada' : enCobros.some((x) => x.en_cobros) ? 'Pendiente' : 'No está'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1" style={{ color: est?.color }}>{est?.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
