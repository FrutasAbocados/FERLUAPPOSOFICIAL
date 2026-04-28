import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileJson, Loader2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { useClientes, useImportarExcel, useMovimientos } from '../lib/queries'
import { FORMA_PAGO_LABEL } from '../lib/types'
import { importePendiente } from '../lib/utils'

export function ExportPanel() {
  const clientes = useClientes()
  const movs = useMovimientos()
  const importar = useImportarExcel()
  const [restoring, setRestoring] = useState(false)

  const exportXLSX = () => {
    if (!clientes.data || !movs.data) return
    const wb = XLSX.utils.book_new()

    // Hoja Clientes
    const clientesRows = clientes.data.map((c) => ({
      Cliente: c.nombre,
      'Forma de Pago': FORMA_PAGO_LABEL[c.forma_pago],
      'Método Cobro Preferido': c.metodo_cobro_preferido ?? '',
      Notas: c.notas ?? '',
      Activo: c.activo ? 'Sí' : 'No',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientesRows), 'Clientes')

    // Hoja Facturas (pendientes + cobradas no archivadas)
    const nombrePorId = new Map(clientes.data.map((c) => [c.id, c.nombre]))
    const formaPorId = new Map(clientes.data.map((c) => [c.id, c.forma_pago]))
    const facturasRows = movs.data
      .filter((m) => m.tipo === 'Factura' && !m.pagado)
      .map((m) => ({
        Cliente: nombrePorId.get(m.cliente_id) ?? '',
        'Nº Factura': m.numero_factura ?? '',
        'Fecha Factura': m.fecha_factura,
        Importe: Number(m.importe),
        'Pagado (Sí/No)': m.pagado ? 'Pagado' : 'No',
        'Fecha Cobro': m.fecha_cobro ?? '',
        'Importe Cobrado': m.importe_cobrado ?? '',
        'Método Cobro': m.metodo_cobro ?? '',
        'Forma de Pago': FORMA_PAGO_LABEL[formaPorId.get(m.cliente_id) ?? 'Contado'],
        'Fecha Vencimiento': m.fecha_vencimiento,
        'Importe Pendiente': importePendiente(m),
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facturasRows), 'Facturas')

    // Hoja Pizarra (deudas no factura)
    const pizarraRows = movs.data
      .filter((m) => m.tipo === 'Pizarra')
      .map((m) => ({
        Cliente: nombrePorId.get(m.cliente_id) ?? '',
        'Fecha': m.fecha_factura,
        Concepto: m.concepto ?? '',
        Importe: Number(m.importe),
        Pagado: m.pagado ? 'Sí' : 'No',
        'Fecha Cobro': m.fecha_cobro ?? '',
        'Importe Cobrado': m.importe_cobrado ?? '',
        'Método Cobro': m.metodo_cobro ?? '',
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pizarraRows), 'Pizarra')

    // Hoja Archivados (facturas pagadas)
    const archivadosRows = movs.data
      .filter((m) => m.tipo === 'Factura' && m.pagado)
      .map((m) => ({
        Cliente: nombrePorId.get(m.cliente_id) ?? '',
        'Nº Factura': m.numero_factura ?? '',
        'Fecha Factura': m.fecha_factura,
        Importe: Number(m.importe),
        'Pagado (Sí/No)': 'Pagado',
        'Fecha Cobro': m.fecha_cobro ?? '',
        'Importe Cobrado': m.importe_cobrado ?? '',
        'Método Cobro': m.metodo_cobro ?? '',
      }))
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(archivadosRows),
      'Archivados Cobrados Antiguos',
    )

    const fname = `ControlDeudaAbocados_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, fname)
  }

  const exportJSON = () => {
    if (!clientes.data || !movs.data) return
    const payload = {
      generated_at: new Date().toISOString(),
      clientes: clientes.data,
      movimientos: movs.data,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ControlDeudaAbocados_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const restoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (
      !confirm(
        'Restaurar desde JSON añadirá todos los registros del archivo. Los duplicados se ignoran. ¿Continuar?',
      )
    ) {
      e.target.value = ''
      return
    }
    setRestoring(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as {
        clientes: Array<{ nombre: string; forma_pago: string; metodo_cobro_preferido: string | null; notas: string | null; activo: boolean }>
        movimientos: Array<{
          cliente_id: string
          tipo: string
          numero_factura: string | null
          fecha_factura: string
          importe: number
          pagado: boolean
          fecha_cobro: string | null
          importe_cobrado: number | null
          metodo_cobro: string | null
          fecha_vencimiento: string
          concepto: string | null
        }>
      }
      // Mapeamos cliente_id -> nombre desde el snapshot para el importador
      // (que resuelve por nombre).
      const idToName = new Map<string, string>()
      for (const c of data.clientes) {
        idToName.set((c as unknown as { id: string }).id, c.nombre)
      }
      await importar.mutateAsync({
        clientes: data.clientes.map((c) => ({
          nombre: c.nombre,
          forma_pago: c.forma_pago as never,
          metodo_cobro_preferido: c.metodo_cobro_preferido as never,
          notas: c.notas,
          activo: c.activo,
        })),
        movimientos: data.movimientos.map((m) => ({
          _cliente_nombre: idToName.get(m.cliente_id) ?? '',
          cliente_id: '',
          tipo: m.tipo as never,
          forma_pago_cliente: 'Contado',
          numero_factura: m.numero_factura,
          fecha_factura: m.fecha_factura,
          importe: m.importe,
          pagado: m.pagado,
          fecha_cobro: m.fecha_cobro,
          importe_cobrado: m.importe_cobrado,
          metodo_cobro: m.metodo_cobro as never,
          fecha_vencimiento: m.fecha_vencimiento,
          concepto: m.concepto,
        })),
      })
      alert('Restauración completada')
    } catch (err) {
      console.error(err)
      alert(`Error restaurando: ${(err as Error).message}`)
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exportar / backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-[var(--color-ink-2)]">
          Descarga la base de datos para guardarla en local o subirla a otro entorno.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportXLSX} disabled={!clientes.data || !movs.data}>
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button variant="outline" onClick={exportJSON} disabled={!clientes.data || !movs.data}>
            <FileJson className="h-4 w-4" /> Backup JSON
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={restoreJSON}
              disabled={restoring}
            />
            <span
              role="button"
              tabIndex={0}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-transparent px-4 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
            >
              {restoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Restaurar JSON
            </span>
          </label>
        </div>
        <p className="text-[11px] text-[var(--color-ink-3)]">
          La restauración usa <code>upsert</code> con clave <em>(cliente, nº factura)</em>: los
          registros existentes no se duplican.
        </p>
      </CardContent>
    </Card>
  )
}
