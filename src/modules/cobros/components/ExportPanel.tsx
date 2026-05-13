import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { CloudDownload, Cloud, Download, FileJson, Loader2, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import {
  descargarBackup,
  useBackupsList,
  useClientes,
  useGenerarBackupAhora,
  useMovimientos,
  useRestaurarBackup,
} from '../lib/queries'
import type { BackupCliente, BackupMovimiento } from '../lib/queries'
import { FORMA_PAGO_LABEL } from '../lib/types'
import { importePendiente } from '../lib/utils'

function formatBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-[var(--mint)]" />
            Exportar / backup
          </CardTitle>
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

      <BackupsAutomaticosPanel />
    </div>
  )
}

function BackupsAutomaticosPanel() {
  const list = useBackupsList(30)
  const generar = useGenerarBackupAhora()
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleGenerar = async () => {
    try {
      const r = await generar.mutateAsync()
      if (r?.ok) {
        toast({ title: 'Backup creado', description: r.storage_path ?? '', variant: 'success' })
      } else {
        toast({ title: 'Error', description: r?.error ?? 'falló', variant: 'error' })
      }
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'error' })
    }
  }

  const handleDescargar = async (path: string) => {
    setDownloading(path)
    try { await descargarBackup(path) }
    catch (e) { toast({ title: 'No se pudo descargar', description: (e as Error).message, variant: 'error' }) }
    finally { setDownloading(null) }
  }

  return (
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-[var(--sky)]" />
          Backups automáticos diarios
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-[var(--color-ink-2)]">
          Cada noche (02:15 UTC) se guarda un snapshot JSON en Supabase Storage. Conserva los últimos
          30 días. Puedes generar uno manual ahora o descargar cualquiera del histórico.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleGenerar} disabled={generar.isPending}>
            {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            Generar backup ahora
          </Button>
          <Button variant="outline" onClick={() => list.refetch()} disabled={list.isFetching}>
            <RefreshCw className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refrescar
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[rgba(255,255,255,.015)]">
          {list.isLoading && <p className="px-4 py-3 text-[var(--color-ink-3)]">Cargando…</p>}
          {!list.isLoading && (list.data ?? []).length === 0 && (
            <p className="px-4 py-3 text-[var(--color-ink-3)]">Sin backups todavía. Genera uno manual.</p>
          )}
          {!list.isLoading && (list.data ?? []).length > 0 && (
            <ul className="divide-y divide-[var(--color-border)]">
              {(list.data ?? []).map((b) => (
                <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate font-medium tabular-nums text-[var(--color-ink)]">
                      {format(parseISO(b.created_at), "d LLL yyyy 'a las' HH:mm", { locale: es })}
                      <span className={
                        'rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ' +
                        (b.trigger_source === 'cron'
                          ? 'ao-chip-mint'
                          : '')
                      }>
                        {b.trigger_source}
                      </span>
                      {!b.ok && <span className="ao-chip ao-chip-coral px-1.5 py-0.5 text-[10px]">error</span>}
                    </div>
                    <div className="text-xs text-[var(--color-ink-3)] tabular-nums">
                      {b.ok
                        ? `${b.num_clientes ?? 0} clientes · ${b.num_movimientos ?? 0} movs · ${formatBytes(b.size_bytes)}`
                        : (b.error_msg ?? 'Error sin detalle')}
                    </div>
                  </div>
                  {b.ok && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDescargar(b.storage_path)}
                      disabled={downloading === b.storage_path}
                    >
                      {downloading === b.storage_path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
                      Descargar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
