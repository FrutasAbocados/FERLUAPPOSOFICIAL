import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileJson, Loader2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { useClientes, useMovimientos, useRestaurarBackup } from '../lib/queries'
import type { BackupCliente, BackupMovimiento } from '../lib/queries'
import { FORMA_PAGO_LABEL } from '../lib/types'
import { importePendiente } from '../lib/utils'

export function ExportPanel() {
  const clientes = useClientes()
  const movs = useMovimientos()
  const restaurar = useRestaurarBackup()
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
    const ok = await confirm({
      title: '¿Restaurar desde JSON?',
      description: 'Añade los registros nuevos del archivo. Los movimientos ya presentes (mismo id) se ignoran.',
      confirmLabel: 'Restaurar',
    })
    if (!ok) {
      e.target.value = ''
      return
    }
    setRestoring(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as {
        clientes: BackupCliente[]
        movimientos: BackupMovimiento[]
      }
      const r = await restaurar.mutateAsync(data)
      const desc = [
        `${r.clientesUpserted} clientes`,
        `${r.movimientosNuevos} movimientos nuevos`,
        `${r.movimientosDuplicados} ya existían`,
        r.movimientosHuerfanos > 0 ? `${r.movimientosHuerfanos} huérfanos` : null,
      ].filter(Boolean).join(' · ')
      toast({
        title: r.errores.length === 0 ? 'Restauración completada' : 'Restaurado con avisos',
        description: desc,
        variant: r.errores.length === 0 ? 'success' : 'error',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Error restaurando',
        description: (err as Error).message,
        variant: 'error',
      })
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
          La restauración preserva el <code>id</code> de cada movimiento: re-importar el mismo
          backup no duplica nada (los ids ya presentes se ignoran).
        </p>
      </CardContent>
    </Card>
  )
}
