// Cálculos puros de Pedidos Tarde (sin Supabase) para poder testearlos.

export type MetodoCobroTarde = 'tarjeta' | 'efectivo'

/** Repartidores con Pedidos Tarde habilitado (espejo de es_repartidor_pedidos_tarde()). */
export const REPARTIDORES_PEDIDOS_TARDE = ['raulpedper@gmail.com', 'alexpowerplay@gmail.com'] as const

export const esRepartidorPedidosTarde = (email: string | null | undefined): boolean =>
  !!email && (REPARTIDORES_PEDIDOS_TARDE as readonly string[]).includes(email.trim().toLowerCase())

export interface PedidoTardeFactura {
  id: string
  manager_factura_id: string
  numero_factura: string
  cliente: string
  fecha: string
  subtotal: number
  importe_total: number
  coste: number
  beneficio: number
  metodo_cobro: MetodoCobroTarde
  cobrada_cliente: boolean
  cobrada_at: string | null
  liquidada_empresa: boolean
  liquidada_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  pct_repartidor: number
  pct_luis: number
  pct_alvaro: number
  pct_impuesto: number
  pct_empresa: number
}

export interface PedidosTardeKpis {
  generado: number
  beneficio: number
  beneficioRepartidor: number
  beneficioLuis: number
  beneficioAlvaro: number
  impuesto: number
  /** Participación empresa sin desglosar (reparto anterior a noviembre 2026). */
  beneficioEmpresa: number
  pendienteRepartidorEmpresa: number
  pendienteEmpresaRepartidor: number
  balance: number
}

/** Mismo criterio que el trigger trabajadores_pedidos_tarde_fijar_reparto. */
export const INICIO_REPARTO_NOVIEMBRE_2026 = '2026-11-01'
export const pctRepartidorPorFecha = (fecha: string) => (fecha >= INICIO_REPARTO_NOVIEMBRE_2026 ? 50 : 80)

const parte = (factura: PedidoTardeFactura, pct: number) => factura.beneficio * pct / 100

export const parteRepartidor = (factura: PedidoTardeFactura) => parte(factura, factura.pct_repartidor)

/** Positivo: la empresa debe al repartidor. Negativo: el repartidor debe a la empresa. */
export const saldoEmpresaARepartidor = (factura: PedidoTardeFactura) =>
  factura.metodo_cobro === 'tarjeta'
    ? parteRepartidor(factura)
    : parteRepartidor(factura) - factura.importe_total

export function calcularPedidosTardeKpis(facturas: PedidoTardeFactura[]): PedidosTardeKpis {
  const kpis = facturas.reduce<PedidosTardeKpis>((acc, factura) => {
    acc.generado += factura.importe_total
    acc.beneficio += factura.beneficio
    acc.beneficioRepartidor += parteRepartidor(factura)
    acc.beneficioLuis += parte(factura, factura.pct_luis)
    acc.beneficioAlvaro += parte(factura, factura.pct_alvaro)
    acc.impuesto += parte(factura, factura.pct_impuesto)
    acc.beneficioEmpresa += parte(factura, factura.pct_empresa)

    if (factura.cobrada_cliente && !factura.liquidada_empresa) {
      const saldo = saldoEmpresaARepartidor(factura)
      if (saldo >= 0) acc.pendienteEmpresaRepartidor += saldo
      else acc.pendienteRepartidorEmpresa += Math.abs(saldo)
    }
    return acc
  }, {
    generado: 0,
    beneficio: 0,
    beneficioRepartidor: 0,
    beneficioLuis: 0,
    beneficioAlvaro: 0,
    impuesto: 0,
    beneficioEmpresa: 0,
    pendienteRepartidorEmpresa: 0,
    pendienteEmpresaRepartidor: 0,
    balance: 0,
  })
  kpis.balance = kpis.pendienteEmpresaRepartidor - kpis.pendienteRepartidorEmpresa
  return kpis
}
