import { useState } from 'react'
import { Loader2, Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { toast } from '@/shared/lib/toast'
import { parseExcel, type ParseResult } from '../lib/excelParser'
import { useImportarExcel, type ImportResult } from '../lib/queries'

export function Importador() {
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const importar = useImportarExcel()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const data = parseExcel(buf)
      setParsed(data)
    } catch (err) {
      console.error(err)
      toast({
        variant: 'error',
        title: 'Error leyendo el Excel',
        description: (err as Error).message,
      })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const confirmar = async () => {
    if (!parsed) return
    try {
      const r = await importar.mutateAsync({
        clientes: parsed.clientes,
        movimientos: parsed.movimientos,
      })
      setResult(r)
      toast({
        variant: 'success',
        title: 'Importación completada',
        description: `${r.clientesUpserted} clientes · ${r.movimientosNuevos} nuevos · ${r.movimientosDuplicados} duplicados`,
      })
    } catch (err) {
      console.error(err)
      toast({
        variant: 'error',
        title: 'Error al importar',
        description: (err as Error).message,
      })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--color-ink-2)]">
            Carga el archivo <code>Control Deuda Clientes.xlsx</code>. La importación es
            idempotente: si ya existe una factura con el mismo número y cliente, se ignora.
          </p>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFile}
              disabled={busy}
            />
            <span
              role="button"
              tabIndex={0}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Seleccionar archivo
            </span>
          </label>
        </CardContent>
      </Card>

      {parsed && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Previsualización</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Stat label="Clientes" value={parsed.resumen.clientes} />
              <Stat
                label="Facturas pendientes"
                value={parsed.resumen.facturasPendientes}
              />
              <Stat
                label="Facturas cobradas (archivo)"
                value={parsed.resumen.facturasCobradas}
              />
            </ul>
            {parsed.errores.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  {parsed.errores.length} avisos al parsear
                </div>
                <ul className="max-h-40 list-disc overflow-auto pl-5">
                  {parsed.errores.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      [{e.hoja}:{e.fila}] {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={confirmar} disabled={importar.isPending}>
                {importar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirmar e importar
              </Button>
              <Button
                variant="outline"
                onClick={() => setParsed(null)}
                disabled={importar.isPending}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Clientes upsert" value={result.clientesUpserted} />
              <Stat label="Movimientos nuevos" value={result.movimientosNuevos} />
              <Stat label="Duplicados ignorados" value={result.movimientosDuplicados} />
            </ul>
            {result.errores.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                <div className="mb-1 font-semibold">Errores</div>
                <ul className="max-h-40 list-disc overflow-auto pl-5">
                  {result.errores.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              onClick={() => {
                setParsed(null)
                setResult(null)
              }}
            >
              Listo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[var(--color-ink)]">{value}</div>
    </li>
  )
}
