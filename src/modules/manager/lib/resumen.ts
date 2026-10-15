import type { ResumenComparativo, SerieDiariaPunto, TopClienteMargen, TopProductoMargen } from './types.ts'

export interface ManagerResumen {
  resumen: ResumenComparativo
  serie: SerieDiariaPunto[]
  topClientes: TopClienteMargen[]
  topProductos: TopProductoMargen[]
}

type Row = Record<string, unknown>
const nullableNumber = (value: unknown) => value == null ? null : Number(value)

// PostgREST puede devolver numeric como string: normalizar antes de pintar/sumar.
export function parseManagerResumen(data: unknown): ManagerResumen {
  const payload = data as Record<string, unknown> | null
  if (!payload?.resumen || !Array.isArray(payload.serie)
    || !Array.isArray(payload.top_clientes) || !Array.isArray(payload.top_productos)) {
    throw new Error('No se pudo cargar el resumen de Manager')
  }
  const r = payload.resumen as Row
  const importes = (row: Row) => ({
    unidades: Number(row.unidades ?? 0),
    ventas: Number(row.ventas ?? 0),
    ventas_subtotal: Number(row.ventas_subtotal ?? 0),
    cogs: Number(row.cogs ?? 0),
    margen: Number(row.margen ?? 0),
    margen_pct: nullableNumber(row.margen_pct),
  })
  return {
    resumen: {
      ventas: Number(r.ventas ?? 0),
      ventas_ant: Number(r.ventas_ant ?? 0),
      ventas_delta_pct: nullableNumber(r.ventas_delta_pct),
      compras: Number(r.compras ?? 0),
      compras_ant: Number(r.compras_ant ?? 0),
      compras_delta_pct: nullableNumber(r.compras_delta_pct),
      margen: Number(r.margen ?? 0),
      margen_ant: Number(r.margen_ant ?? 0),
      margen_delta_pct: nullableNumber(r.margen_delta_pct),
      pendiente_cobro: Number(r.pendiente_cobro ?? 0),
      docs: Number(r.docs ?? 0),
      cogs: Number(r.cogs ?? 0),
      margen_pct: nullableNumber(r.margen_pct),
      comp_from: r.comp_from == null ? null : String(r.comp_from),
      comp_to: r.comp_to == null ? null : String(r.comp_to),
    },
    serie: payload.serie.map((s: Row) => ({
      fecha: String(s.fecha), ventas: Number(s.ventas ?? 0),
      compras: Number(s.compras ?? 0), margen: Number(s.margen ?? 0),
    })),
    topClientes: payload.top_clientes.map((c: Row) => ({
      contact_name_canon: String(c.contact_name_canon ?? '(sin contacto)'),
      docs: Number(c.docs ?? 0), ...importes(c),
    })),
    topProductos: payload.top_productos.map((p: Row) => ({
      nombre: String(p.nombre ?? '(sin nombre)'),
      product_id: p.product_id == null ? null : String(p.product_id), ...importes(p),
    })),
  }
}
