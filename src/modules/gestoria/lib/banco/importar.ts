import type { ExtractoBanco } from './bbva.ts'

export type PayloadImportacion = {
  p_extracto: Record<string, string | number>
  p_movimientos: Record<string, string | number | string[]>[]
}

/** Prepara la llamada a banco_importar_extracto (importes en céntimos). */
export function payloadImportacion(e: ExtractoBanco, archivoNombre: string, sha256: string): PayloadImportacion {
  return {
    p_extracto: {
      banco: e.banco,
      iban: e.iban,
      desde: e.desde,
      hasta: e.hasta,
      saldo_inicial_cent: e.saldoInicialCent,
      saldo_final_cent: e.saldoFinalCent,
      archivo_nombre: archivoNombre,
      archivo_sha256: sha256,
    },
    p_movimientos: e.movimientos.map((m) => ({
      orden: m.orden,
      fecha: m.fecha,
      fecha_valor: m.fechaValor,
      codigo: m.codigo,
      concepto: m.concepto,
      detalle: m.detalle,
      importe_cent: m.importeCent,
      saldo_cent: m.saldoCent,
      categoria: m.categoria,
      facturas: m.facturas,
    })),
  }
}

export async function sha256Hex(datos: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
