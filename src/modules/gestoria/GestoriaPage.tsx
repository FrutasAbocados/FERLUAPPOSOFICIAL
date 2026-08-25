import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Eye,
  Image,
  Info,
  Search,
} from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { exportGestoriaExcel, exportGestoriaPdf, formatGestoriaValue } from './lib/exportar'
import { createGestoriaDocumentUrl, useGestoriaDatos } from './lib/queries'
import {
  DOCUMENT_COLUMNS,
  LINE_COLUMNS,
  columnsForLevel,
  type GestoriaColumn,
  type GestoriaFiltros,
  type GestoriaNivel,
  type GestoriaTipo,
} from './lib/types'

const today = new Date()
const DEFAULT_FILTERS: GestoriaFiltros = {
  desde: format(startOfMonth(today), 'yyyy-MM-dd'),
  hasta: format(endOfMonth(today), 'yyyy-MM-dd'),
  tipo: 'AMBAS',
  nivel: 'documentos',
}

const DEFAULT_SELECTED: Record<GestoriaNivel, Set<string>> = {
  documentos: new Set(DOCUMENT_COLUMNS.map((column) => column.key)),
  lineas: new Set(LINE_COLUMNS.map((column) => column.key)),
}

const selectClass = cn(
  'h-10 w-full rounded-[var(--radius)] border border-[var(--line)]',
  'bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none',
  'focus:border-[var(--mint)] focus:shadow-[0_0_0_4px_var(--mint-glow)]',
)

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ao-panel px-4 py-3">
      <div className="micro-caps text-[var(--ink-mute)]">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular-nums', accent ? 'text-[var(--mint)]' : 'text-[var(--ink)]')}>
        {value}
      </div>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="micro-caps block text-[var(--ink-mute)]">{label}</span>
      {children}
    </label>
  )
}

export function GestoriaPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(DEFAULT_SELECTED)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [openingFile, setOpeningFile] = useState<string | null>(null)
  const query = useGestoriaDatos(filters)

  const availableColumns = columnsForLevel(filters.nivel)
  const selectedKeys = selected[filters.nivel]
  const selectedColumns = availableColumns.filter((column) => selectedKeys.has(column.key))

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('es')
    if (!needle) return query.data ?? []
    return (query.data ?? []).filter((row) => (
      row.tercero.toLocaleLowerCase('es').includes(needle)
      || row.numero.toLocaleLowerCase('es').includes(needle)
      || row.descripcion.toLocaleLowerCase('es').includes(needle)
      || row.sku.toLocaleLowerCase('es').includes(needle)
    ))
  }, [query.data, search])

  const totals = useMemo(() => {
    if (filters.nivel === 'documentos') {
      return {
        base: filteredRows.reduce((sum, row) => sum + Number(row.base_imponible ?? 0), 0),
        iva: filteredRows.reduce((sum, row) => sum + Number(row.iva ?? 0), 0),
        total: filteredRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
      }
    }
    return {
      base: filteredRows.reduce((sum, row) => sum + Number(row.importe ?? 0), 0),
      iva: 0,
      total: filteredRows.reduce((sum, row) => sum + Number(row.importe ?? 0), 0),
    }
  }, [filteredRows, filters.nivel])

  const updateFilter = <K extends keyof GestoriaFiltros>(key: K, value: GestoriaFiltros[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const toggleColumn = (column: GestoriaColumn) => {
    setSelected((current) => {
      const next = new Set(current[filters.nivel])
      if (next.has(column.key)) next.delete(column.key)
      else next.add(column.key)
      return { ...current, [filters.nivel]: next }
    })
  }

  const selectAllColumns = (all: boolean) => {
    setSelected((current) => ({
      ...current,
      [filters.nivel]: new Set(all ? availableColumns.map((column) => column.key) : []),
    }))
  }

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (filteredRows.length === 0 || selectedColumns.length === 0) return
    setExporting(kind)
    try {
      const input = { rows: filteredRows, columns: selectedColumns, filtros: filters }
      if (kind === 'excel') await exportGestoriaExcel(input)
      else await exportGestoriaPdf(input)
      toast({
        title: `${kind === 'excel' ? 'Excel' : 'PDF'} generado`,
        description: `${filteredRows.length} filas · ${selectedColumns.length} columnas`,
        variant: 'success',
      })
    } catch (error) {
      toast({ title: 'No se pudo generar la exportación', description: errorMessage(error), variant: 'error' })
    } finally {
      setExporting(null)
    }
  }

  const previewRows = filteredRows.slice(0, 200)
  const invalidDates = filters.desde > filters.hasta

  const handleDocument = async (path: string, fileName: string, downloadFile: boolean) => {
    const operation = `${path}:${downloadFile ? 'download' : 'view'}`
    setOpeningFile(operation)
    try {
      const signedUrl = await createGestoriaDocumentUrl(path, downloadFile ? fileName : undefined)
      if (downloadFile) {
        const anchor = document.createElement('a')
        anchor.href = signedUrl
        anchor.download = fileName
        anchor.rel = 'noopener'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } else {
        window.open(signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast({ title: 'No se pudo abrir el documento', description: errorMessage(error), variant: 'error' })
    } finally {
      setOpeningFile(null)
    }
  }

  return (
    <div>
      <PageTopbar
        breadcrumb="Gedofu"
        title="Portal de gestoría"
        subtitle="Consulta contable y exportaciones personalizadas de compras y ventas"
      />

      <div className="ao-page space-y-4">
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--amber)]/35 bg-[color:var(--amber)]/10 px-4 py-3 text-sm text-[var(--ink-dim)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
          <div>
            <div className="font-medium text-[var(--ink)]">Acceso contable y documental de solo lectura</div>
            <p className="mt-0.5 text-xs leading-5">
              Puedes consultar y descargar los PDFs o fotos originales cuando estén archivados, además de generar
              informes nuevos con las columnas elegidas. No puedes subir, editar ni borrar documentos.
            </p>
          </div>
        </div>

        <section className="ao-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--mint)]" />
            <h2 className="text-sm font-semibold text-[var(--ink)]">Datos que entran en el informe</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterField label="Desde">
              <Input type="date" value={filters.desde} onChange={(event) => updateFilter('desde', event.target.value)} />
            </FilterField>
            <FilterField label="Hasta">
              <Input type="date" value={filters.hasta} onChange={(event) => updateFilter('hasta', event.target.value)} />
            </FilterField>
            <FilterField label="Operaciones">
              <select
                className={selectClass}
                value={filters.tipo}
                onChange={(event) => updateFilter('tipo', event.target.value as GestoriaTipo)}
              >
                <option value="AMBAS">Compras y ventas</option>
                <option value="COMPRA">Solo compras</option>
                <option value="VENTA">Solo ventas</option>
              </select>
            </FilterField>
            <FilterField label="Nivel de detalle">
              <select
                className={selectClass}
                value={filters.nivel}
                onChange={(event) => updateFilter('nivel', event.target.value as GestoriaNivel)}
              >
                <option value="documentos">Resumen por documento</option>
                <option value="lineas">Detalle por líneas</option>
              </select>
            </FilterField>
            <FilterField label="Buscar en resultados">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--ink-mute)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Número, tercero, concepto…"
                  className="pl-9"
                />
              </div>
            </FilterField>
          </div>

          {invalidDates && <p className="mt-2 text-xs text-[var(--coral)]">La fecha final no puede ser anterior a la inicial.</p>}
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={filters.nivel === 'documentos' ? 'Documentos' : 'Líneas'} value={String(filteredRows.length)} />
          <Kpi label={filters.nivel === 'documentos' ? 'Base imponible' : 'Importe líneas'} value={euros(totals.base)} />
          <Kpi label="IVA documentos" value={filters.nivel === 'documentos' ? euros(totals.iva) : 'Según documento'} />
          <Kpi label="Total seleccionado" value={euros(totals.total)} accent />
        </div>

        <section className="ao-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Columnas de la exportación</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
                El Excel y el PDF conservarán este orden y solo incluirán las columnas marcadas.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => selectAllColumns(true)}>Todas</Button>
              <Button variant="ghost" size="sm" onClick={() => selectAllColumns(false)}>Ninguna</Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {availableColumns.map((column) => {
              const active = selectedKeys.has(column.key)
              return (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => toggleColumn(column)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-xs transition-colors',
                    active
                      ? 'border-[var(--mint)]/50 bg-[var(--mint-glow)] text-[var(--mint)]'
                      : 'border-[var(--line)] bg-white/[.015] text-[var(--ink-mute)] hover:text-[var(--ink)]',
                  )}
                >
                  <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-sm border', active ? 'border-[var(--mint)] bg-[var(--mint)] text-[#0a1310]' : 'border-[var(--line-2)]')}>
                    {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  {column.label}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <div className="text-xs text-[var(--ink-mute)]">
              {filteredRows.length} filas · {selectedColumns.length} columnas seleccionadas
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void runExport('excel')}
                disabled={query.isLoading || filteredRows.length === 0 || selectedColumns.length === 0 || exporting !== null}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exporting === 'excel' ? 'Generando…' : 'Descargar Excel'}
              </Button>
              <Button
                onClick={() => void runExport('pdf')}
                disabled={query.isLoading || filteredRows.length === 0 || selectedColumns.length === 0 || exporting !== null}
              >
                <FileText className="h-4 w-4" />
                {exporting === 'pdf' ? 'Generando…' : 'Descargar PDF'}
              </Button>
            </div>
          </div>
        </section>

        <section className="ao-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Vista previa</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
                {filteredRows.length > 200 ? `Mostrando 200 de ${filteredRows.length}; la descarga incluirá todas.` : `${filteredRows.length} filas.`}
              </p>
            </div>
            {query.isFetching && <span className="text-xs text-[var(--mint)]">Actualizando…</span>}
          </div>

          {query.isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--ink-mute)]">Cargando datos contables…</div>
          ) : query.error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[var(--coral)]">{errorMessage(query.error)}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : selectedColumns.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--ink-mute)]">Selecciona al menos una columna.</div>
          ) : previewRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--ink-mute)]">No hay datos para estos filtros.</div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--panel)]">
                  <tr>
                    {selectedColumns.map((column) => (
                      <th key={column.key} className="whitespace-nowrap border-b border-[var(--line-2)] px-3 py-2 text-left font-semibold text-[var(--ink-dim)]">
                        {column.label}
                      </th>
                    ))}
                    {filters.nivel === 'documentos' && (
                      <th className="whitespace-nowrap border-b border-[var(--line-2)] px-3 py-2 text-left font-semibold text-[var(--ink-dim)]">
                        Archivos
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.fecha}-${row.numero}-${row.sku}-${index}`} className="odd:bg-white/[.012] hover:bg-white/[.025]">
                      {selectedColumns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'max-w-72 border-b border-[var(--line)] px-3 py-2 text-[var(--ink-dim)]',
                            (column.kind === 'money' || column.kind === 'number' || column.kind === 'percent') && 'text-right tabular-nums',
                          )}
                        >
                          <span className="line-clamp-2">{formatGestoriaValue(row, column)}</span>
                        </td>
                      ))}
                      {filters.nivel === 'documentos' && (
                        <td className="whitespace-nowrap border-b border-[var(--line)] px-3 py-2">
                          {row.pdf_path == null && row.foto_paths.length === 0 ? (
                            <span className="text-[var(--ink-mute)]">No guardado</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {row.pdf_path && (
                                <>
                                  <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] px-2 text-[var(--mint)] hover:bg-[var(--mint-glow)]"
                                    onClick={() => void handleDocument(row.pdf_path!, `Factura-${row.numero || 'sin-numero'}.pdf`, false)}
                                    disabled={openingFile !== null}
                                    title="Abrir PDF"
                                  >
                                    <FileText className="h-3.5 w-3.5" /> PDF
                                  </button>
                                  <button
                                    type="button"
                                    className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] border border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--mint)]"
                                    onClick={() => void handleDocument(row.pdf_path!, `Factura-${row.numero || 'sin-numero'}.pdf`, true)}
                                    disabled={openingFile !== null}
                                    aria-label="Descargar PDF"
                                    title="Descargar PDF"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {row.foto_paths.map((path, photoIndex) => (
                                <span key={path} className="inline-flex">
                                  <button
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1 rounded-l-[var(--radius-sm)] border border-[var(--line)] px-2 text-[var(--mint)] hover:bg-[var(--mint-glow)]"
                                    onClick={() => void handleDocument(path, `Factura-${row.numero || 'sin-numero'}-foto-${photoIndex + 1}.jpg`, false)}
                                    disabled={openingFile !== null}
                                    title={`Abrir foto ${photoIndex + 1}`}
                                  >
                                    {photoIndex === 0 ? <Image className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    {photoIndex + 1}
                                  </button>
                                  <button
                                    type="button"
                                    className="grid h-7 w-7 place-items-center rounded-r-[var(--radius-sm)] border border-l-0 border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--mint)]"
                                    onClick={() => void handleDocument(path, `Factura-${row.numero || 'sin-numero'}-foto-${photoIndex + 1}.jpg`, true)}
                                    disabled={openingFile !== null}
                                    aria-label={`Descargar foto ${photoIndex + 1}`}
                                    title={`Descargar foto ${photoIndex + 1}`}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 pb-2 text-xs text-[var(--ink-mute)]">
          <Download className="h-3.5 w-3.5" />
          Las exportaciones se generan en este dispositivo; AbocadosOS no guarda copias.
        </div>
      </div>
    </div>
  )
}
